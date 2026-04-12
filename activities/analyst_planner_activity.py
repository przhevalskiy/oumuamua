"""
Analyst planner activity — one LLM step for the Analyst workflow.
Uses ANALYST_TOOLS (navigate + report_claim + finish_reading only).
All LLM I/O must happen in activities, not workflows. (I1)
"""
import json
from temporalio import activity

from project.planner import next_step, PlannerStep, FinalAnswer
from project.analyst_tools import ANALYST_TOOLS


@activity.defn(name="plan_analyst_step")
async def plan_analyst_step(task_prompt: str, context: list[dict]) -> dict:
    """
    Execute one Claude planning step for an Analyst agent.
    Analyst can call navigate, click_element, report_claim, or finish_reading.

    report_claim  → type "claim"  (accumulated by the workflow, loop continues)
    finish_reading → type "final" (loop terminates)
    navigate/click → type "step"  (workflow dispatches the activity)
    """
    result, new_context = await next_step(task_prompt, context, tools=ANALYST_TOOLS)

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_claim":
            return {
                "type": "claim",
                "claim_data": result.tool_input,
                "tool_use_id": result.tool_use_id,
                "context": new_context,
            }

        if result.tool_name == "request_spawn":
            return {
                "type": "spawn_request",
                "spawn_data": result.tool_input,
                "tool_use_id": result.tool_use_id,
                "context": new_context,
            }

        if result.tool_name == "finish_reading":
            summary = result.tool_input.get("summary", "Reading complete.")
            return {"type": "final", "answer": summary, "context": new_context}

        return {
            "type": "step",
            "tool_name": result.tool_name,
            "tool_use_id": result.tool_use_id,
            "tool_input": result.tool_input,
            "context": new_context,
        }

    return {"type": "error", "message": getattr(result, "message", "Unknown error"), "context": new_context}
