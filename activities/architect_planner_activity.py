"""
Architect planner activity — one LLM step for the Architect workflow.
Uses ARCHITECT_TOOLS (list_directory, read_file, report_plan).
"""
import json

from temporalio import activity

from project.config import CLAUDE_SONNET_MODEL, CLAUDE_HAIKU_MODEL
from project.planner import next_step, PlannerStep, FinalAnswer, PlannerError
from project.architect_tools import ARCHITECT_TOOLS

_ARCHITECT_SYSTEM = (
    "You are the Architect agent in a software engineering swarm. "
    "Your job is to map the repository and produce a concrete implementation plan. "
    "RULES:\n"
    "1. Be fast — explore only what you need. 3-4 tool calls maximum before calling report_plan.\n"
    "2. For GREENFIELD repos (empty directory): call memory_read once, then report_plan immediately.\n"
    "   Do NOT list directories, read files, or web_search on an empty repo — there is nothing to read.\n"
    "3. For EXISTING repos: list root, read 1-2 key files (package.json or pyproject.toml), then plan.\n"
    "4. Produce implementation_steps as a concrete, ordered list of actions.\n"
    "5. Call report_plan as soon as you have enough context — do not over-explore.\n"
    "IMPORTANT: Call exactly ONE tool per response."
)


@activity.defn(name="plan_architect_step")
async def plan_architect_step(
    task_prompt: str,
    context: list[dict],
    model: str = CLAUDE_SONNET_MODEL,
) -> dict:
    """Execute one Claude planning step for the Architect agent."""
    try:
        result, new_context = await next_step(
            task_prompt,
            context,
            tools=ARCHITECT_TOOLS,
            system_prompt=_ARCHITECT_SYSTEM,
            model=model,
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
