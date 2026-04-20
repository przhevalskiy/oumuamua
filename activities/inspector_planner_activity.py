"""
Inspector planner activity — one LLM step for the Inspector workflow.
Uses INSPECTOR_TOOLS (run_tests, run_lint, run_type_check, read_file, report_inspection).
"""
from temporalio import activity

from project.config import CLAUDE_SONNET_MODEL
from project.planner import next_step, PlannerStep, FinalAnswer, PlannerError
from project.inspector_tools import INSPECTOR_TOOLS

_INSPECTOR_SYSTEM = (
    "You are the Inspector agent in a software engineering swarm. "
    "Your job is to run tests, linting, and type checks on the modified code and report findings. "
    "RULES:\n"
    "1. Run the test suite first, then lint, then type checks.\n"
    "2. Read failing test files to understand what needs to be fixed.\n"
    "3. Produce specific, actionable heal_instructions for the Builder.\n"
    "4. Call report_inspection with passed=true only if ALL checks pass.\n"
    "IMPORTANT: Call exactly ONE tool per response."
)


@activity.defn(name="plan_inspector_step")
async def plan_inspector_step(task_prompt: str, context: list[dict]) -> dict:
    """Execute one Claude planning step for the Inspector agent."""
    try:
        result, new_context = await next_step(
            task_prompt,
            context,
            tools=INSPECTOR_TOOLS,
            system_prompt=_INSPECTOR_SYSTEM,
            model=CLAUDE_SONNET_MODEL,
        )
    except PlannerError as e:
        return {"type": "error", "message": str(e), "context": context}

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_inspection":
            return {
                "type": "report",
                "report_data": result.tool_input,
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
