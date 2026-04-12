"""
Verifier planner activity — one LLM step for the Verifier workflow.
Uses VERIFIER_TOOLS (search_web + navigate + report_verdict).
All LLM I/O must happen in activities, not workflows. (I1)
"""
from temporalio import activity

from project.planner import next_step, PlannerStep, FinalAnswer
from project.verifier_tools import VERIFIER_TOOLS


@activity.defn(name="plan_verifier_step")
async def plan_verifier_step(task_prompt: str, context: list[dict]) -> dict:
    """
    Execute one Claude planning step for a Verifier agent.

    report_verdict → type "final" with answer = JSON verdict dict
    search_web/navigate → type "step" (workflow dispatches activity)
    """
    result, new_context = await next_step(task_prompt, context, tools=VERIFIER_TOOLS)

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_verdict":
            import json
            return {
                "type": "final",
                "answer": json.dumps(result.tool_input),
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
