"""
DevOps planner activity — one LLM step for the DevOps workflow.
Uses DEVOPS_TOOLS (git_status, git_create_branch, git_add, git_commit, git_push,
create_pull_request, report_devops).
"""
from temporalio import activity

from project.config import CLAUDE_HAIKU_MODEL
from project.planner import next_step, PlannerStep, FinalAnswer, PlannerError
from project.devops_tools import DEVOPS_TOOLS

_DEVOPS_SYSTEM = (
    "You are the DevOps agent in a software engineering swarm. "
    "Your job is to commit all changes, push the branch, and open a pull request. "
    "RULES:\n"
    "1. Always run git_status first to see what changed.\n"
    "2. Stage all modified files with git_add.\n"
    "3. Write a clear, descriptive commit message summarizing the change.\n"
    "4. Push the branch, then create the pull request.\n"
    "5. Call report_devops with the PR URL when done.\n"
    "IMPORTANT: Call exactly ONE tool per response."
)


@activity.defn(name="plan_devops_step")
async def plan_devops_step(task_prompt: str, context: list[dict]) -> dict:
    """Execute one Claude planning step for the DevOps agent."""
    try:
        result, new_context = await next_step(
            task_prompt,
            context,
            tools=DEVOPS_TOOLS,
            system_prompt=_DEVOPS_SYSTEM,
            model=CLAUDE_HAIKU_MODEL,
        )
    except PlannerError as e:
        return {"type": "error", "message": str(e), "context": context}

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "report_devops":
            return {
                "type": "devops",
                "devops_data": result.tool_input,
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
