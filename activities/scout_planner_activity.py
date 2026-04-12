"""
Scout planner activity — one LLM step for the Scout workflow.
Uses SCOUT_TOOLS (search_web + report_sources only).
All LLM I/O must happen in activities, not workflows. (I1)
"""
from temporalio import activity

from project.planner import next_step, PlannerStep, FinalAnswer
from project.scout_tools import SCOUT_TOOLS


@activity.defn(name="plan_scout_step")
async def plan_scout_step(task_prompt: str, context: list[dict]) -> dict:
    """
    Execute one Claude planning step for the Scout agent.
    Scout can only call search_web or report_sources.

    report_sources is surfaced as type "final" with answer = JSON of source list.
    """
    result, new_context = await next_step(task_prompt, context, tools=SCOUT_TOOLS)

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_sources":
            import json
            sources = result.tool_input.get("sources", [])
            return {
                "type": "final",
                "answer": json.dumps(sources),
                "context": new_context,
            }
        return {
            "type": "step",
            "tool_name": result.tool_name,
            "tool_use_id": result.tool_use_id,
            "tool_input": result.tool_input,
            "context": new_context,
        }

    return {"type": "error", "message": getattr(result, "message", "Unknown error"), "context": new_context}
