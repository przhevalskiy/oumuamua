"""
Security planner activity — one LLM step for the Security workflow.
Uses SECURITY_TOOLS (scan_secrets, scan_dependencies, read_file, run_sast, report_audit).
"""
from temporalio import activity

from project.config import CLAUDE_HAIKU_MODEL
from project.planner import next_step, PlannerStep, FinalAnswer, PlannerError
from project.security_tools import SECURITY_TOOLS

_SECURITY_SYSTEM = (
    "You are the Security agent in a software engineering swarm. "
    "Your job is to audit the codebase for secrets, CVEs, and vulnerabilities. "
    "RULES:\n"
    "1. Always run scan_secrets first.\n"
    "2. Check dependency files for known CVEs.\n"
    "3. Read suspicious files to confirm findings before reporting.\n"
    "4. Rate severity as: critical (blocks PR), high (blocks PR), medium, low.\n"
    "5. Call report_audit with passed=false if ANY critical or high findings exist.\n"
    "IMPORTANT: Call exactly ONE tool per response."
)


@activity.defn(name="plan_security_step")
async def plan_security_step(task_prompt: str, context: list[dict]) -> dict:
    """Execute one Claude planning step for the Security agent."""
    try:
        result, new_context = await next_step(
            task_prompt,
            context,
            tools=SECURITY_TOOLS,
            system_prompt=_SECURITY_SYSTEM,
            model=CLAUDE_HAIKU_MODEL,
        )
    except PlannerError as e:
        return {"type": "error", "message": str(e), "context": context}

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_audit":
            return {
                "type": "audit",
                "audit_data": result.tool_input,
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
