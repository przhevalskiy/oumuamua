"""
Builder planner activity — one LLM step for the Builder workflow.
Uses BUILDER_TOOLS (read_file, write_file, patch_file, delete_file, run_command, finish_build).
"""
import json

from temporalio import activity

from project.config import CLAUDE_SONNET_MODEL
from project.planner import next_step, PlannerStep, FinalAnswer, PlannerError
from project.builder_tools import BUILDER_TOOLS

_BUILDER_SYSTEM = (
    "You are the Builder agent in a software engineering swarm. "
    "You receive an implementation plan from the Architect and execute it by writing code.\n\n"
    "STRICT RULES:\n"
    "1. NEVER use run_command to read files. Use read_file instead.\n"
    "2. NEVER run npm install, yarn install, pip install, or any build command (vite build, tsc, etc.). "
    "These are handled outside the swarm. Your job is to write source files only.\n"
    "3. Use read_file before modifying any existing file.\n"
    "4. Use patch_file for targeted edits, write_file only for new files or full rewrites.\n"
    "5. run_command is ONLY for: mkdir, touch, or other filesystem setup — never for installs or builds.\n"
    "6. Follow the implementation_steps from the plan in order.\n"
    "7. Call finish_build when all steps are complete.\n"
    "IMPORTANT: Call exactly ONE tool per response."
)


@activity.defn(name="plan_builder_step")
async def plan_builder_step(task_prompt: str, context: list[dict]) -> dict:
    """Execute one Claude planning step for the Builder agent."""
    try:
        result, new_context = await next_step(
            task_prompt,
            context,
            tools=BUILDER_TOOLS,
            system_prompt=_BUILDER_SYSTEM,
            model=CLAUDE_SONNET_MODEL,
        )
    except PlannerError as e:
        return {"type": "error", "message": str(e), "context": context}

    if isinstance(result, FinalAnswer):
        return {"type": "final", "answer": result.answer, "context": new_context}

    if isinstance(result, PlannerStep):
        if result.tool_name == "finish_build":
            return {
                "type": "finish",
                "build_data": result.tool_input,
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
