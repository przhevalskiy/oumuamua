"""
BuilderAgent — CodeWriterSkill.
Receives an ArchitectPlan and executes it by writing, patching, and deleting files.
Returns a BuildResult JSON.
"""
from __future__ import annotations

import json
import structlog
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from agentex.lib import adk
from agentex.types.text_content import TextContent

with workflow.unsafe.imports_passed_through():
    from project.builder_tools import BUILDER_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_BUILDER_TURNS = 40

PLANNER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
IO_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=3),
}
CMD_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=30),  # Builder commands are mkdir/touch only
    "retry_policy": RetryPolicy(maximum_attempts=1),
}


@workflow.defn(name="BuilderAgent")
class BuilderAgent:
    """
    Executes the ArchitectPlan by writing code. Returns BuildResult JSON.
    Can be re-invoked with heal_instructions from the Inspector.
    """

    @workflow.run
    async def run(
        self,
        goal: str,
        architect_plan: dict,
        parent_task_id: str,
        heal_instructions: list[str] | None = None,
        track_label: str | None = None,
    ) -> str:
        tag = f"Builder ({track_label})" if track_label else "Builder"
        log = logger.bind(parent_task_id=parent_task_id, track=track_label)
        log.info("builder_started", heal_cycle=bool(heal_instructions))

        heal_section = ""
        if heal_instructions:
            heal_section = (
                "\n\nHEAL INSTRUCTIONS from Inspector (fix these before finishing):\n"
                + "\n".join(f"  - {h}" for h in heal_instructions)
            )

        steps_text = "\n".join(
            f"  {i+1}. {s}" for i, s in enumerate(architect_plan.get("implementation_steps", []))
        )
        key_files = architect_plan.get("key_files", [])
        if key_files and isinstance(key_files[0], dict):
            key_files_text = "\n".join(
                f"  - {f.get('path', '')} ({f.get('language', '')}): {f.get('summary', '')}"
                for f in key_files
            )
        else:
            key_files_text = "\n".join(f"  - {f}" for f in key_files)

        _steps = heal_instructions if heal_instructions else architect_plan.get("implementation_steps", [])
        _header = "Healing" if heal_instructions else "Starting"
        _numbered = "\n".join(f"{i+1}. {s}" for i, s in enumerate(_steps[:8]))
        if len(_steps) > 8:
            _numbered += f"\n… +{len(_steps) - 8} more"
        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content=f"[{tag}] {_header}:\n{_numbered}",
            ),
        )

        task_prompt = (
            f"You are the Builder agent{f' working on the {track_label} track' if track_label else ''}. "
            f"Your goal:\n{goal}\n\n"
            f"Tech stack: {', '.join(architect_plan.get('tech_stack', []))}\n"
            f"Repo root: {architect_plan.get('repo_root', '.')}\n\n"
            f"Key files:\n{key_files_text}\n\n"
            f"Implementation steps:\n{steps_text}"
            f"{heal_section}\n\n"
            "RULES — read carefully before starting:\n"
            "- Use read_file to read files. NEVER use run_command to cat or read files.\n"
            "- NEVER run npm install, yarn, pip install, vite build, tsc, or any package/build command.\n"
            "- Use write_file for new files, patch_file for edits to existing files.\n"
            "- Call finish_build when all steps are done."
        )

        context: list[dict] = []
        edits: list[dict] = []

        for turn in range(MAX_BUILDER_TURNS):
            raw = await workflow.execute_activity(
                "plan_builder_step",
                args=[task_prompt, context],
                **PLANNER_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "finish":
                build_data = raw["build_data"]
                tool_use_id = raw["tool_use_id"]
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "Build complete."}],
                }]
                all_edits = edits + build_data.get("edits", [])
                log.info("builder_finished", turn=turn, edits=len(all_edits))
                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content=f"[{tag}] Done — {len(all_edits)} file(s) modified.",
                    ),
                )
                return json.dumps({
                    "success": True,
                    "edits": all_edits,
                    "summary": build_data.get("summary", "Build complete."),
                    "errors": [],
                })

            if raw["type"] == "final":
                log.warning("builder_no_finish_tool", turn=turn)
                return json.dumps({"success": True, "edits": edits, "summary": raw["answer"], "errors": []})

            if raw["type"] == "error":
                log.warning("builder_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in BUILDER_VALID_TOOL_NAMES:
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id,
                                 "content": f"Unknown tool '{tool_name}'."}],
                }]
                continue

            await adk.messages.create(
                task_id=parent_task_id,
                content=TextContent(
                    author="agent",
                    content=f"[{tag}] {tool_name}: {tool_input.get('path', tool_input.get('command', ''))}",
                ),
            )

            tool_result = await self._dispatch(tool_name, tool_input)

            # Track edits for the final report
            if tool_name in ("write_file", "patch_file", "delete_file"):
                op = "create" if tool_name == "write_file" else ("delete" if tool_name == "delete_file" else "modify")
                edits.append({
                    "path": tool_input.get("path", ""),
                    "operation": op,
                    "description": tool_input.get("description", ""),
                })

            context = context + [{
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": str(tool_result)}],
            }]

        log.warning("builder_max_turns")
        return json.dumps({"success": False, "edits": edits, "summary": "Builder hit max turns.", "errors": ["max_turns"]})

    async def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "read_file":
            return await workflow.execute_activity(
                "swarm_read_file", args=[tool_input.get("path", "")], **IO_OPTIONS
            )
        if tool_name == "write_file":
            return await workflow.execute_activity(
                "swarm_write_file",
                args=[tool_input.get("path", ""), tool_input.get("content", "")],
                **IO_OPTIONS,
            )
        if tool_name == "patch_file":
            return await workflow.execute_activity(
                "swarm_patch_file",
                args=[tool_input.get("path", ""), tool_input.get("old_str", ""), tool_input.get("new_str", "")],
                **IO_OPTIONS,
            )
        if tool_name == "delete_file":
            return await workflow.execute_activity(
                "swarm_delete_file", args=[tool_input.get("path", "")], **IO_OPTIONS
            )
        if tool_name == "run_command":
            return await workflow.execute_activity(
                "swarm_run_command",
                args=[tool_input.get("command", ""), tool_input.get("cwd")],
                **CMD_OPTIONS,
            )
        return f"Error: tool '{tool_name}' not dispatched."
