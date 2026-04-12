"""
TaskPlanner activity — single LLM call that produces a full execution plan.
Receives task description + page/API context, outputs a TaskPlan JSON.
One call. No loop. All LLM I/O must happen in activities, not workflows. (I1)
"""
from __future__ import annotations

import json
import structlog
from temporalio import activity

import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from project.task_schema import TaskPlan, TaskStep

logger = structlog.get_logger(__name__)

# Describes every tool the ExecutorAgent can call.
# The TaskPlanner uses this to produce valid step.tool values.
_EXECUTOR_TOOLS = """
Available execution tools (use exact tool names in your plan):

BROWSER TOOLS (use when interacting with a web page):
  navigate(url)
    — Load a URL. Always the first step before any form interaction.
  get_page_structure()
    — Returns forms, inputs, buttons on the current page. Call after navigate if you need to verify selectors.
  fill_input(selector, value)
    — Fill a form field. selector = CSS selector, input name, or id (e.g. "#email", "input[name='q']").
  click_element(selector)
    — Click any element (links, buttons, checkboxes). selector = CSS or visible text.
  submit_form(selector)
    — Submit a form. selector = the submit button CSS selector, or "form" to submit directly.
  wait_for_element(selector, timeout_ms)
    — Wait for dynamic content to appear before interacting.

API TOOLS (use when the target has a known REST API — cheaper and more reliable than browser):
  http_request(method, url, headers, body)
    — Direct HTTP call. method = GET/POST/PUT/PATCH/DELETE.
      headers = dict (include Authorization, Content-Type).
      body = dict (sent as JSON) or str (sent as text). Omit if not needed.
"""


@activity.defn(name="plan_task")
async def plan_task(task: str, context: str) -> dict:
    """
    Produce a TaskPlan for the given task using the provided context
    (page structure, API docs, or research findings).

    Args:
        task: What needs to be accomplished (e.g. "Fill out the contact form and submit it").
        context: Page structure from get_page_structure(), API documentation, or research output.

    Returns:
        TaskPlan dict: {goal, steps: [{tool, args, description, reversible, depends_on}], requires_approval}
    Falls back to a minimal single-step plan on parse failure.
    """
    log = logger.bind(task=task[:80])

    system = (
        "You are a task execution planner. Given a task description and context about "
        "the target page or API, produce a minimal, correct execution plan.\n\n"
        f"{_EXECUTOR_TOOLS}\n\n"
        "Rules:\n"
        "1. Use the minimum number of steps to accomplish the task.\n"
        "2. Always navigate to the page before filling forms.\n"
        "3. Mark steps as reversible=false if they send data, submit forms, delete things, "
        "   or make POST/PUT/DELETE API calls.\n"
        "4. Use depends_on to express ordering — parallel steps have empty depends_on.\n"
        "5. Use API tools (http_request) over browser tools when possible — faster and cheaper.\n"
        "6. Use exact selectors from the provided context. Do not guess.\n\n"
        "Return ONLY valid JSON matching this schema:\n"
        "{\n"
        '  "goal": "one sentence describing what this plan achieves",\n'
        '  "steps": [\n'
        '    {\n'
        '      "tool": "tool_name",\n'
        '      "args": {"arg1": "value1"},\n'
        '      "description": "what this step does",\n'
        '      "reversible": true,\n'
        '      "depends_on": []\n'
        "    }\n"
        "  ],\n"
        '  "requires_approval": false\n'
        "}\n"
        "No explanation. No markdown fences. Pure JSON."
    )

    user = (
        f"Task: {task}\n\n"
        f"Context:\n{context}"
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    log.info("task_planner_call")

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    raw = response.content[0].text.strip() if response.content else ""
    log.info("task_planner_response", raw=raw[:300])

    try:
        data = json.loads(raw)
        steps = [TaskStep(**s) for s in data.get("steps", [])]
        plan = TaskPlan(
            goal=data.get("goal", task),
            steps=steps,
            requires_approval=data.get("requires_approval", any(not s.reversible for s in steps)),
        )
        log.info("task_planner_ok", steps=len(plan.steps), requires_approval=plan.requires_approval)
        return plan.model_dump()
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        log.warning("task_planner_parse_failed", error=str(e), raw=raw[:300])
        # Fallback: single navigate step
        fallback = TaskPlan(
            goal=task,
            steps=[TaskStep(tool="navigate", args={"url": ""}, description="Navigate to target (fallback — planner failed)", reversible=True)],
            requires_approval=False,
        )
        return fallback.model_dump()
