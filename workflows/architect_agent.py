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
        failure_context: dict | None = None,
    ) -> str:
        """
        Map the repository and produce a multi-track ArchitectPlan.

        failure_context (optional): passed when the Foreman is re-planning after a
        build failure or exhausted heal cycles. Shape:
          {
            "reason": "builder_failure" | "heal_exhausted",
            "failed_tracks": [{"label": str, "summary": str}],
            "heal_instructions": [str],   # Inspector's accumulated fixes
          }
        The Architect uses this to produce a revised plan that avoids the same mistakes.
        """
        log = logger.bind(parent_task_id=parent_task_id, repo_path=repo_path)
        is_replan = bool(failure_context)
        log.info("architect_started", followup=bool(conversation_history), replan=is_replan)

        status_msg = (
            "[Architect] Re-planning after build failure — revising track decomposition..."
            if is_replan
            else "[Architect] Mapping repository and decomposing into parallel tracks..."
        )
        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(author="agent", content=status_msg),
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

        failure_block = ""
        if failure_context:
            reason = failure_context.get("reason", "unknown")
            failed_tracks = failure_context.get("failed_tracks", [])
            heal_instructions = failure_context.get("heal_instructions", [])

            failure_lines = [
                f"\n\nRE-PLANNING CONTEXT — previous attempt failed ({reason}):",
                "You MUST produce a different decomposition that avoids the same mistakes.",
                "",
            ]
            if failed_tracks:
                failure_lines.append("Failed tracks from previous attempt:")
                for ft in failed_tracks:
                    failure_lines.append(f"  - [{ft.get('label', '?')}]: {ft.get('summary', '')[:200]}")
            if heal_instructions:
                failure_lines.append("\nInspector's unresolved issues (your new plan must address these):")
                for h in heal_instructions[:8]:
                    failure_lines.append(f"  - {h}")
            failure_lines += [
                "",
                "RULES for re-planning:",
                "1. Read the files that failed — understand WHY they failed before re-decomposing.",
                "2. Consider merging tracks that had cross-track dependency issues.",
                "3. Consider splitting a track that was too large for one builder.",
                "4. Add explicit steps to fix the Inspector's unresolved issues.",
                "5. Do NOT repeat the same track structure that already failed.",
            ]
            failure_block = "\n".join(failure_lines)

        task_prompt = (
            f"You are the Architect agent. Your goal:\n{goal}\n\n"
            f"Repository root: {repo_path}\n"
            f"IMPORTANT: ALL tool calls (list_directory, read_file) MUST use absolute paths "
            f"starting with {repo_path}. NEVER use relative paths like '.' or 'src/'.\n"
            f"{history_block}"
            f"{failure_block}\n"
            "Instructions:\n"
            f"1. Start with query_index(repo_path='{repo_path}', query='') to check if a symbol index exists.\n"
            f"   If not, list the root directory: list_directory(path='{repo_path}').\n"
            "2. Read key config files (pyproject.toml, package.json, README, etc.) using absolute paths.\n"
            "3. Read the main entry points and core modules relevant to the goal.\n"
            "4. Identify the tech stack, key files, and dependencies.\n"
            "   IMPORTANT: If the repo is EMPTY (no source files), this is a GREENFIELD build.\n"
            "   For greenfield builds:\n"
            "   - Infer the tech stack from the goal description and any PM notes in memory.\n"
            "   - Call memory_read to check if the PM stored tech stack decisions.\n"
            "   - Create a complete scaffold plan: project setup, core files, features, tests.\n"
            "   - Do NOT produce 0 implementation steps — a greenfield build needs at minimum:\n"
            "     scaffold, core feature implementation, basic tests.\n"
            "5. Decompose the goal into parallel tracks:\n"
            "   - Each track should touch distinct, non-overlapping files.\n"
            "   - Use 1 track for simple tasks, 2-4 for larger ones.\n"
            "   - Example tracks: 'backend', 'frontend', 'tests', 'infra', 'docs'.\n"
            "   - WAVE RULES — critical for parallelism:\n"
            "     * Only use depends_on when a track CANNOT START AT ALL without files from another track.\n"
            "     * The ONLY valid reason for depends_on is: 'I need to import a file that doesn't exist yet.'\n"
            "     * Shared config files (package.json, tsconfig, tailwind.config) are NOT a reason for depends_on\n"
            "       — builders can write config files independently.\n"
            "     * For greenfield apps: ONLY a 'scaffold' track (package.json, tsconfig, vite.config) should\n"
            "       be wave 1. ALL other tracks (data-layer, components, pages, hooks, tests) run in wave 2\n"
            "       SIMULTANEOUSLY — they do NOT depend on each other.\n"
            "     * NEVER create more than 2 waves. If you find yourself making wave 3 or 4, merge those\n"
            "       tracks into wave 2 instead.\n"
            "     * Tracks WITHOUT depends_on run SIMULTANEOUSLY. Tracks WITH depends_on wait.\n"
            "     * WRONG: pages depends_on components depends_on data-layer (3 waves)\n"
            "     * RIGHT: scaffold (wave 1), then data-layer + components + pages all in wave 2\n"
            "   - Write implementation_steps that specify HOW, not just WHAT. Include the edit strategy:\n"
            "     * For changes touching ONE small location: 'In <file>, str_replace <function> to add X'\n"
            "     * For changes touching MULTIPLE locations or large files (>100 lines):\n"
            "       'Read <file> in full, then rewrite it with write_file adding X at each Y'\n"
            "     Bad step: 'Add logging to builder_agent.py'\n"
            "     Good step: 'Read workflows/builder_agent.py in full, then rewrite it with write_file,\n"
            "       adding log.info(tool_name=tool_name, turn=turn, success=not failed) after each\n"
            "       tool dispatch in the main loop'\n"
            f"6. Call report_plan with repo_root='{repo_path}' and the tracks array when ready.\n\n"
            "Additional tools available:\n"
            "- query_index: look up symbol definitions by name (faster than search_files)\n"
            "- search_files: find files by glob or content regex instead of listing directories\n"
            "- check_secrets: verify required env vars are present before planning\n"
            f"- memory_read: read PM notes and prior decisions. Always use repo_path='{repo_path}'.\n"
            f"- memory_write: store key findings for Builder agents. Always use repo_path='{repo_path}'."
        )

        context: list[dict] = []
        files_read: set[str] = set()  # track files already read to detect re-read loops
        exploration_turns = 0  # count non-plan turns to enforce early commit on greenfield

        from project.config import CLAUDE_SONNET_MODEL, CLAUDE_HAIKU_MODEL

        def _architect_model(turn: int, tool_name: str | None = None) -> str:
            """
            Hybrid routing for the Architect.
            - Exploration turns (list, read, search, memory): Haiku — fast and cheap
            - Planning turn (report_plan decision): Sonnet — needs strong reasoning
            - First turn: Sonnet — sets the overall strategy
            """
            if turn == 0:
                return CLAUDE_SONNET_MODEL  # first turn: understand the goal fully
            if tool_name == "report_plan":
                return CLAUDE_SONNET_MODEL  # final plan: needs Sonnet quality
            # After enough exploration, switch to Sonnet to force a good plan
            if exploration_turns >= 5:
                return CLAUDE_SONNET_MODEL
            return CLAUDE_HAIKU_MODEL  # exploration: Haiku is fast enough

        for turn in range(MAX_ARCHITECT_TURNS):
            raw = await workflow.execute_activity(
                "plan_architect_step",
                args=[task_prompt, context, _architect_model(turn)],
                **PLANNER_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "plan":
                plan_data = raw["plan_data"]
                tool_use_id = raw["tool_use_id"]

                # Guard: reject a plan with 0 total implementation steps — force the
                # Architect to keep planning. This catches the case where it calls
                # report_plan immediately after listing an empty directory.
                total_steps = sum(
                    len(t.get("implementation_steps", []))
                    for t in plan_data.get("tracks", [])
                )
                if total_steps == 0:
                    log.warning("architect_zero_steps_rejected")
                    context = context + [{
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": (
                                "ERROR: implementation_steps is empty. "
                                "Call report_plan again RIGHT NOW with concrete steps. "
                                "Do NOT read more files. Write specific steps like: "
                                "'In <file>, add <exact change> at <location>'. "
                                f"Goal: {goal[:300]}"
                            ),
                        }],
                    }]
                    continue  # force another planning turn

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

            # Turn warning — force report_plan when budget is nearly exhausted
            turns_left = MAX_ARCHITECT_TURNS - turn
            if turns_left <= 4 and raw["type"] == "tool":
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id,
                                 "content": (
                                     f"⚠ WARNING: {turns_left} turns remaining. "
                                     "Stop exploring. Call report_plan NOW with your best plan. "
                                     "You have enough context — commit to a plan immediately."
                                 )}],
                }]
                continue

            if tool_name not in ARCHITECT_VALID_TOOL_NAMES:
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id,
                                 "content": f"Unknown tool '{tool_name}'."}],
                }]
                continue

            # Count exploration turns and nudge toward planning after threshold
            exploration_turns += 1
            if exploration_turns == 4:
                # Inject a soft nudge — don't block, just remind
                pass  # nudge is handled via tool_result suffix below

            # Re-read guard — if the same file has been read before, block and push to plan
            if tool_name == "read_file":
                file_path = tool_input.get("path", "")
                if file_path in files_read:
                    context = context + [{
                        "role": "user",
                        "content": [{"type": "tool_result", "tool_use_id": tool_use_id,
                                     "content": (
                                         f"You already read '{file_path}'. "
                                         "Do not re-read the same file. "
                                         "You have enough context — call report_plan now."
                                     )}],
                    }]
                    continue
                files_read.add(file_path)

            tool_result = await self._dispatch(tool_name, tool_input)

            await adk.messages.create(
                task_id=parent_task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Architect] {tool_name}: {tool_input.get('path', '')}",
                ),
            )

            tool_result_str = str(tool_result)

            # After 4 exploration turns, append a commit nudge to every result
            if exploration_turns >= 4:
                tool_result_str += (
                    "\n\n⚡ You have explored enough. Call report_plan NOW with your best plan. "
                    "Do not read more files or search further — commit to a decomposition."
                )

            context = context + [{
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": tool_result_str}],
            }]

        log.warning("architect_max_turns")
        return json.dumps({
            "tracks": [{"label": "main", "implementation_steps": [], "key_files": []}],
            "tech_stack": [],
            "repo_root": repo_path,
            "notes": "Architect hit max turns without completing plan.",
        })

    async def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "query_index":
            return await workflow.execute_activity(
                "swarm_query_repo_index",
                args=[tool_input.get("repo_path", "."), tool_input.get("query", ""), tool_input.get("top_k", 20)],
                **IO_OPTIONS,
            )
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
        if tool_name == "search_files":
            return await workflow.execute_activity(
                "swarm_search_filesystem",
                args=[tool_input.get("pattern", ""), tool_input.get("path", "."), tool_input.get("type", "name")],
                **IO_OPTIONS,
            )
        if tool_name == "check_secrets":
            return await workflow.execute_activity(
                "swarm_check_secrets",
                args=[tool_input.get("names", [])],
                **IO_OPTIONS,
            )
        if tool_name == "memory_write":
            return await workflow.execute_activity(
                "swarm_memory_write",
                args=[tool_input.get("key", ""), tool_input.get("value", ""), tool_input.get("repo_path", "."), "architect"],
                **IO_OPTIONS,
            )
        if tool_name == "memory_read":
            return await workflow.execute_activity(
                "swarm_memory_read",
                args=[tool_input.get("repo_path", "."), tool_input.get("keys")],
                **IO_OPTIONS,
            )
        if tool_name == "memory_search_episodes":
            return await workflow.execute_activity(
                "memory_search_episodes",
                args=[tool_input.get("repo_path", "."), tool_input.get("query", ""), tool_input.get("top_k", 5)],
                **IO_OPTIONS,
            )
        return f"Error: tool '{tool_name}' not dispatched."
