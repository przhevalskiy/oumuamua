"""
ExecutionOrchestrator — the "task-executor" workflow entry point.

Pipeline:
  1. Scout: find the correct URL or API endpoint for the task
  2. Analyst: read the page structure / API shape
  3. TaskPlanner: single LLM call → TaskPlan
  4. Executor: carry out the plan step by step
  5. Verifier: confirm the action succeeded

Registered as "task-executor" on the same worker as the research pipeline.
Same infrastructure, broader output.
"""
from __future__ import annotations

import json
import structlog
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from agentex.lib import adk
from agentex.lib.types.acp import CreateTaskParams, SendEventParams
from agentex.lib.core.temporal.workflows.workflow import BaseWorkflow
from agentex.lib.core.temporal.types.workflow import SignalName
from agentex.lib.environment_variables import EnvironmentVariables
from agentex.types.text_content import TextContent

with workflow.unsafe.imports_passed_through():
    from project.planner import _extract_task_prompt
    from workflows.scout_agent import ScoutAgent
    from workflows.analyst_agent import AnalystAgent
    from workflows.executor_agent import ExecutorAgent
    from workflows.verifier_agent import VerifierAgent

environment_variables = EnvironmentVariables.refresh()

logger = structlog.get_logger(__name__)

STRATEGIST_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
PLANNER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
VERIFIER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=90),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}

SCOUT_TIMEOUT = timedelta(minutes=2)
ANALYST_TIMEOUT = timedelta(minutes=5)
EXECUTOR_TIMEOUT = timedelta(minutes=8)
VERIFIER_TIMEOUT = timedelta(minutes=3)


@workflow.defn(name="task-executor")
class ExecutionOrchestrator(BaseWorkflow):
    """
    Orchestrates the full execution pipeline for action-oriented tasks.
    """

    def __init__(self):
        super().__init__(display_name="task-executor")

    @workflow.signal(name=SignalName.RECEIVE_EVENT)
    async def on_task_event_send(self, params: SendEventParams) -> None:
        logger.info("received_event", task_id=params.task.id)
        await adk.messages.create(
            task_id=params.task.id,
            content=TextContent(author="agent", content="Task execution is in progress. Please wait."),
        )

    @workflow.run
    async def on_task_create(self, params: CreateTaskParams) -> str:
        task_id = params.task.id
        task = _extract_task_prompt(params.params)
        log = logger.bind(task_id=task_id)

        log.info("execution_orchestrator_started", task=task[:80])

        task_queue = environment_variables.WORKFLOW_TASK_QUEUE or "web_scout_queue"

        # ── Step 1: Scout — find the right target ────────────────────────────
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content="Scouting for target URL or API endpoint..."),
        )

        # Derive scout queries from the task
        scout_queries_raw: dict = await workflow.execute_activity(
            "plan_research_strategy",
            args=[f"Find the correct URL or API endpoint to accomplish this task: {task}"],
            **STRATEGIST_OPTIONS,
        )
        scout_queries: list[str] = scout_queries_raw.get("scout_queries", [task])[:4]

        scout_result: str = await workflow.execute_child_workflow(
            ScoutAgent.run,
            args=[scout_queries, task, task_id],
            id=f"{task_id}-exec-scout",
            task_queue=task_queue,
            execution_timeout=SCOUT_TIMEOUT,
        )

        try:
            raw_sources = json.loads(scout_result)
            target_urls = [s["url"] for s in raw_sources if isinstance(s, dict) and s.get("url")][:3]
        except (json.JSONDecodeError, ValueError):
            target_urls = []

        if not target_urls:
            msg = "Could not find a target URL for this task. Please provide a more specific task description."
            await adk.messages.create(task_id=task_id, content=TextContent(author="agent", content=msg))
            return json.dumps({"success": False, "summary": msg})

        primary_url = target_urls[0]
        log.info("scout_complete", target_url=primary_url)

        # ── Step 2: Analyst — understand the target structure ────────────────
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=f"Reading target: {primary_url}"),
        )

        analyst_result: str = await workflow.execute_child_workflow(
            AnalystAgent.run,
            args=[[primary_url], task, task_id, 0],
            id=f"{task_id}-exec-analyst",
            task_queue=task_queue,
            execution_timeout=ANALYST_TIMEOUT,
        )

        # Extract page structure context from analyst claims
        analyst_context = _extract_analyst_context(analyst_result, primary_url, task)

        # ── Step 3: TaskPlanner — produce execution plan ──────────────────────
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content="Planning execution steps..."),
        )

        plan: dict = await workflow.execute_activity(
            "plan_task",
            args=[task, analyst_context],
            **PLANNER_OPTIONS,
        )

        steps_count = len(plan.get("steps", []))
        requires_approval = plan.get("requires_approval", False)

        log.info("task_plan_ready", steps=steps_count, requires_approval=requires_approval)

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=f"Plan ready: {plan.get('goal', task)} ({steps_count} steps)",
            ),
        )

        # ── Step 4: Executor — carry out the plan ────────────────────────────
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content="Executing plan..."),
        )

        executor_result: str = await workflow.execute_child_workflow(
            ExecutorAgent.run,
            args=[plan, task_id, 0],
            id=f"{task_id}-executor-0",
            task_queue=task_queue,
            execution_timeout=EXECUTOR_TIMEOUT,
        )

        try:
            execution_summary = json.loads(executor_result)
        except (json.JSONDecodeError, ValueError):
            execution_summary = {"success": False, "summary": executor_result, "goal": task}

        log.info(
            "executor_complete",
            success=execution_summary.get("success"),
            summary=str(execution_summary.get("summary", ""))[:80],
        )

        # ── Step 5: Verifier — confirm success ───────────────────────────────
        if execution_summary.get("success"):
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(author="agent", content="Verifying result..."),
            )

            verifier_result: str = await workflow.execute_child_workflow(
                VerifierAgent.run,
                args=[
                    plan.get("goal", task),
                    primary_url,
                    "Confirm that the task was completed successfully.",
                    task,
                    task_id,
                    0,
                ],
                id=f"{task_id}-exec-verifier",
                task_queue=task_queue,
                execution_timeout=VERIFIER_TIMEOUT,
            )

            try:
                verdict = json.loads(verifier_result)
                execution_summary["verification"] = verdict.get("verdict", "unverifiable")
                execution_summary["verification_note"] = verdict.get("explanation", "")
            except (json.JSONDecodeError, ValueError):
                pass

        # ── Final answer ──────────────────────────────────────────────────────
        final = _format_execution_result(execution_summary, task)

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=final),
        )

        return final


def _extract_analyst_context(analyst_result_json: str, url: str, task: str) -> str:
    """
    Convert analyst claims into a context string for the TaskPlanner.
    Falls back to a minimal context if parsing fails.
    """
    try:
        parsed = json.loads(analyst_result_json)
        claims = parsed.get("claims", []) if isinstance(parsed, dict) else parsed
        if claims:
            claim_lines = [f"- {c.get('claim', '')} (from {c.get('url', url)})" for c in claims[:20]]
            return f"Target URL: {url}\n\nPage findings:\n" + "\n".join(claim_lines)
    except (json.JSONDecodeError, ValueError):
        pass
    return f"Target URL: {url}\n\nTask: {task}\n\nNo detailed page structure available — use navigate + get_page_structure as first steps."


def _format_execution_result(summary: dict, task: str) -> str:
    """Format execution summary as a readable final answer."""
    success = summary.get("success", False)
    goal = summary.get("goal", task)
    exec_summary = summary.get("summary", "")
    verification = summary.get("verification", "")
    verification_note = summary.get("verification_note", "")

    completed = summary.get("completed_steps", [])
    failed = summary.get("failed_steps", [])

    lines = [
        f"## {'Task Complete' if success else 'Task Partially Complete'}",
        f"**Goal:** {goal}",
        "",
        f"**Result:** {exec_summary}",
    ]

    if verification:
        lines.append(f"**Verification:** {verification.upper()} — {verification_note}")

    if completed:
        lines.append("")
        lines.append("**Steps completed:**")
        for s in completed:
            lines.append(f"- {s.get('description', s.get('tool', ''))}")

    if failed:
        lines.append("")
        lines.append("**Steps failed:**")
        for s in failed:
            lines.append(f"- {s.get('description', '')} — {s.get('error', '')}")

    return "\n".join(lines)
