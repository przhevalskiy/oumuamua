"""
ArchitectAgent — RepoMapSkill.
Maps the repository and decomposes the goal into independent parallel tracks
(frontend, backend, tests, infra, etc.) for simultaneous Builder execution.
Returns an ArchitectPlan JSON.
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
    from project.architect_tools import ARCHITECT_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_ARCHITECT_TURNS = 24

PLANNER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
IO_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(maximum_attempts=3),
}


@workflow.defn(name="ArchitectAgent")
class ArchitectAgent:
    """
    Maps the repository and produces a multi-track ArchitectPlan for parallel Builders.
    Returns JSON string of ArchitectPlan.
    """

    @workflow.run
    async def run(
        self,
        goal: str,
        repo_path: str,
        parent_task_id: str,
        conversation_history: list[dict] | None = None,
    ) -> str:
        log = logger.bind(parent_task_id=parent_task_id, repo_path=repo_path)
        log.info("architect_started", followup=bool(conversation_history))

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content="[Architect] Mapping repository and decomposing into parallel tracks...",
            ),
        )

        history_block = ""
        if conversation_history:
            history_lines = []
            for entry in conversation_history[-3:]:  # last 3 iterations max
                history_lines.append(
                    f"Iteration {entry['iteration']}: Goal was '{entry['goal'][:120]}'\n"
                    f"Result summary: {entry['summary'][:300]}"
                )
            history_block = (
                "\n\nPREVIOUS WORK CONTEXT (this is a follow-up build on the same repo):\n"
                + "\n---\n".join(history_lines)
                + "\n\nIMPORTANT: The repo already has code from previous iterations. "
                "Read existing files before planning. Build ON TOP of what exists — "
                "do not recreate files that are already correct. Focus only on what the new goal requires.\n"
            )

        task_prompt = (
            f"You are the Architect agent. Your goal:\n{goal}\n\n"
            f"Repository root: {repo_path}\n"
            f"{history_block}\n"
            "Instructions:\n"
            "1. Start by listing the root directory to understand the project layout.\n"
            "2. Read key config files (pyproject.toml, package.json, README, etc.).\n"
            "3. Read the main entry points and core modules relevant to the goal.\n"
            "4. Identify the tech stack, key files, and dependencies.\n"
            "5. Decompose the goal into INDEPENDENT parallel tracks:\n"
            "   - Each track should touch distinct, non-overlapping files.\n"
            "   - Use 1 track for simple tasks, 2-4 for larger ones.\n"
            "   - Example tracks: 'backend', 'frontend', 'tests', 'infra', 'docs'.\n"
            "   - Tracks run SIMULTANEOUSLY — they must not depend on each other.\n"
            "6. Call report_plan with the tracks array when ready."
        )

        context: list[dict] = []

        for turn in range(MAX_ARCHITECT_TURNS):
            raw = await workflow.execute_activity(
                "plan_architect_step",
                args=[task_prompt, context],
                **PLANNER_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "plan":
                plan_data = raw["plan_data"]
                tool_use_id = raw["tool_use_id"]
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "Plan recorded."}],
                }]

                tracks = plan_data.get("tracks", [])
                track_labels = [t.get("label", f"track-{i}") for i, t in enumerate(tracks)]
                log.info("architect_plan_ready", tracks=len(tracks), labels=track_labels)

                stack = ", ".join(plan_data.get("tech_stack", [])) or "unknown"
                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[Architect] Plan ready — {len(tracks)} parallel track(s): "
                            f"{', '.join(track_labels)} · stack: {stack}"
                        ),
                    ),
                )

                # Emit per-track reasoning so the feed shows what each builder will do
                track_lines = []
                for track in tracks:
                    label = track.get("label", "?")
                    steps = track.get("implementation_steps", [])
                    numbered = "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps[:6]))
                    if len(steps) > 6:
                        numbered += f"\n… +{len(steps) - 6} more"
                    track_lines.append(f"{label}:\n{numbered}")

                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content="[Architect] Track breakdown:\n" + "\n\n".join(track_lines),
                    ),
                )
                return json.dumps(plan_data)

            if raw["type"] == "final":
                log.warning("architect_no_plan_tool", turn=turn)
                return json.dumps({
                    "tracks": [{"label": "main", "implementation_steps": [raw["answer"]], "key_files": []}],
                    "tech_stack": [],
                    "repo_root": repo_path,
                })

            if raw["type"] == "error":
                log.warning("architect_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in ARCHITECT_VALID_TOOL_NAMES:
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id,
                                 "content": f"Unknown tool '{tool_name}'."}],
                }]
                continue

            tool_result = await self._dispatch(tool_name, tool_input)

            await adk.messages.create(
                task_id=parent_task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Architect] {tool_name}: {tool_input.get('path', '')}",
                ),
            )

            context = context + [{
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": str(tool_result)}],
            }]

        log.warning("architect_max_turns")
        return json.dumps({
            "tracks": [{"label": "main", "implementation_steps": [], "key_files": []}],
            "tech_stack": [],
            "repo_root": repo_path,
            "notes": "Architect hit max turns without completing plan.",
        })

    async def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "list_directory":
            return await workflow.execute_activity(
                "swarm_list_directory",
                args=[tool_input.get("path", "."), tool_input.get("max_depth", 2)],
                **IO_OPTIONS,
            )
        if tool_name == "read_file":
            return await workflow.execute_activity(
                "swarm_read_file",
                args=[tool_input.get("path", "")],
                **IO_OPTIONS,
            )
        return f"Error: tool '{tool_name}' not dispatched."
