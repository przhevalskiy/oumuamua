"""
Architect planner activity — one LLM step for the Architect workflow.
Uses ARCHITECT_TOOLS (list_directory, read_file, report_plan).
"""
import json

from temporalio import activity

from project.config import CLAUDE_SONNET_MODEL
from project.planner import next_step, PlannerStep, FinalAnswer, PlannerError
from project.architect_tools import ARCHITECT_TOOLS

_ARCHITECT_SYSTEM = (
    "You are the Architect agent in a software engineering swarm. "
    "Your job is to deeply understand the repository structure and produce a concrete "
    "implementation plan for the Builder agent. "
    "RULES:\n"
    "1. Always start by listing the root directory to understand the project layout.\n"
    "2. Read key files (package.json, pyproject.toml, README, main entry points) before planning.\n"
    "3. Identify the tech stack, entry points, and files the Builder will need to touch.\n"
    "4. Produce implementation_steps as a concrete, ordered list of actions.\n"
    "5. Call report_plan only after you have read enough to produce a confident plan.\n"
    "IMPORTANT: Call exactly ONE tool per response."
)


@activity.defn(name="plan_architect_step")
async def plan_architect_step(task_prompt: str, context: list[dict]) -> dict:
    """Execute one Claude planning step for the Architect agent."""
    try:
        result, new_context = await next_step(
            task_prompt,
            context,
            tools=ARCHITECT_TOOLS,
            system_prompt=_ARCHITECT_SYSTEM,
            model=CLAUDE_SONNET_MODEL,
        )
    except PlannerError as e:
        return {"type": "error", "message": str(e), "context": context}

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_plan":
            return {
                "type": "plan",
                "plan_data": result.tool_input,
                "tool_use_id": result.tool_use_id,
                "context": new_context,
            }
        return {
            "type": "step",
            "tool_name": result.tool_name,
            "tool_use_id": result.tool_use_id,
            "tool_input": result.tool_input,
            "context": new_context,
        }

    return {"type": "error", "message": "Unknown planner result", "context": new_context}
