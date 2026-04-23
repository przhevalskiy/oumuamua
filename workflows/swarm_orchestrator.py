"""
SwarmOrchestrator — the Foreman (L5 OrchestratorSkill).

Durable Multi-Dimensional Software Engineering Factory:
  1. Architect  → maps the repo, decomposes goal into parallel tracks
  2. Builders   → N agents execute tracks simultaneously (asyncio.gather)
  3. Inspector  → merges all edits, runs QA; triggers self-healing if failed
  4. Security   → scans for secrets/CVEs; blocks PR if critical findings
  5. DevOps     → branches, commits, pushes, opens PR

Self-healing loop (per build cycle):
  - Builder failure on cycle 0 → Architect re-plans with failure context (item 4)
  - Inspector failure → heal Builder re-invoked up to MAX_HEAL_CYCLES times
  - Heal cycles exhausted → Architect re-plans with Inspector findings (item 5)
  - Architect re-plan also fails → HITL checkpoint asks user to proceed or abort

State is fully snapshotted by Temporal — closing the IDE does NOT stop the swarm.
"""
from __future__ import annotations

import asyncio
import json
import re
import structlog
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.workflow import ParentClosePolicy

from agentex.lib import adk
from agentex.lib.types.acp import CreateTaskParams, SendEventParams
from agentex.lib.core.temporal.workflows.workflow import BaseWorkflow
from agentex.lib.core.temporal.types.workflow import SignalName
from agentex.lib.environment_variables import EnvironmentVariables
from agentex.types.text_content import TextContent

with workflow.unsafe.imports_passed_through():
    from project.planner import _extract_task_prompt
    from project.complexity import classify_tier, params_for_tier, TIER_LABELS
    from project.child_workflow import ApprovalWorkflow, ClarificationWorkflow
    from workflows.pm_agent import PMAgent
    from workflows.architect_agent import ArchitectAgent
    from workflows.builder_agent import BuilderAgent
    from workflows.inspector_agent import InspectorAgent
    from workflows.security_agent import SecurityAgent
    from workflows.devops_agent import DevOpsAgent

environment_variables = EnvironmentVariables.refresh()
logger = structlog.get_logger(__name__)

PM_TIMEOUT        = timedelta(hours=50)   # 48 h clarification window + buffer
ARCHITECT_TIMEOUT = timedelta(minutes=10)
BUILDER_TIMEOUT   = timedelta(minutes=30)
INSPECTOR_TIMEOUT = timedelta(minutes=15)
SECURITY_TIMEOUT  = timedelta(minutes=10)
DEVOPS_TIMEOUT    = timedelta(minutes=10)

MAX_HEAL_CYCLES = 2
MAX_PARALLEL_TRACKS = 4


def _branch_name(task_id: str, prefix: str = "swarm") -> str:
    safe = re.sub(r"[^a-zA-Z0-9\-]", "-", task_id)[:40]
    return f"{prefix}/{safe}"


def _model_for_tier(tier: int) -> str:
    """Route to Haiku for simple tasks, Sonnet for complex ones."""
    from project.config import CLAUDE_HAIKU_MODEL, CLAUDE_SONNET_MODEL
    return CLAUDE_HAIKU_MODEL if tier <= 1 else CLAUDE_SONNET_MODEL


def _extract_tracks(architect_plan: dict, max_parallel_tracks: int = MAX_PARALLEL_TRACKS) -> list[dict]:
    """
    Extract parallel tracks from an architect plan.
    Falls back to a single 'main' track using the flat implementation_steps list
    if the Architect didn't produce structured tracks.
    """
    tracks = architect_plan.get("tracks", [])
    if tracks:
        return tracks[:max_parallel_tracks]
    # Backward compat: flat implementation_steps → single track
    steps = architect_plan.get("implementation_steps", [])
    return [{"label": "main", "implementation_steps": steps, "key_files": architect_plan.get("key_files", [])}]


def _order_tracks_by_deps(tracks: list[dict]) -> list[list[dict]]:
    """
    Topological sort of tracks by depends_on field.
    Returns a list of waves — each wave is a list of tracks that can run in parallel.
    Tracks with no dependencies are in wave 0. Tracks that depend on wave 0 are in wave 1, etc.
    Circular dependencies are broken by ignoring the offending edge (logged as a warning).

    Example:
      backend (no deps) → wave 0
      frontend (depends_on=['backend']) → wave 1
      tests (depends_on=['backend', 'frontend']) → wave 2
    """
    label_to_track = {t.get("label", f"track-{i}"): t for i, t in enumerate(tracks)}
    all_labels = set(label_to_track)

    # Build adjacency: label → set of labels it depends on (filtered to known labels)
    deps: dict[str, set[str]] = {}
    for label, track in label_to_track.items():
        raw_deps = set(track.get("depends_on", []))
        deps[label] = raw_deps & all_labels  # ignore deps on unknown tracks

    waves: list[list[dict]] = []
    remaining = set(all_labels)
    completed: set[str] = set()

    while remaining:
        # Find all tracks whose dependencies are all completed
        wave_labels = {
            label for label in remaining
            if deps[label].issubset(completed)
        }
        if not wave_labels:
            # Circular dependency — break by taking all remaining tracks
            wave_labels = remaining
        wave = [label_to_track[label] for label in sorted(wave_labels)]
        waves.append(wave)
        completed |= wave_labels
        remaining -= wave_labels

    return waves


def _extract_tracks(architect_plan: dict, max_parallel_tracks: int = MAX_PARALLEL_TRACKS) -> list[dict]:
    """Extract all tracks from an architect plan (flat list, order preserved)."""
    tracks = architect_plan.get("tracks", [])
    if tracks:
        # Allow up to max_parallel_tracks * 2 total tracks when using wave execution
        return tracks[:max_parallel_tracks * 2]
    steps = architect_plan.get("implementation_steps", [])
    return [{"label": "main", "implementation_steps": steps, "key_files": architect_plan.get("key_files", [])}]


def _track_plan(architect_plan: dict, track: dict) -> dict:
    """Build a per-track plan dict for the Builder."""
    return {
        **architect_plan,
        "implementation_steps": track.get("implementation_steps", []),
        "key_files": track.get("key_files", architect_plan.get("key_files", [])),
    }


def _merge_build_results(builder_jsons: tuple[str, ...]) -> dict:
    """Merge edits and success flags from parallel Builder results."""
    all_edits: list[dict] = []
    summaries: list[str] = []
    success = True
    for bj in builder_jsons:
        try:
            bd = json.loads(bj)
        except (json.JSONDecodeError, ValueError):
            bd = {"success": False, "edits": [], "summary": str(bj)}
        if not bd.get("success"):
            success = False
        all_edits.extend(bd.get("edits", []))
        if bd.get("summary"):
            summaries.append(bd["summary"])
    return {
        "success": success,
        "edits": all_edits,
        "summary": " | ".join(summaries) if summaries else "Build complete.",
    }


@workflow.defn(name="swarm-factory")
class SwarmOrchestrator(BaseWorkflow):
    """
    Durable Multi-Dimensional Software Engineering Factory.
    Orchestrates: Architect → Builders (parallel) → Inspector (heal loop) → Security → DevOps.
    Persistent: after each build the foreman waits up to 24h for follow-up prompts.
    """

    def __init__(self):
        super().__init__(display_name="swarm-factory")
        self._pending_followup: str | None = None
        self._conversation_history: list[dict] = []
        self._manifest: dict = {"version": 1, "tracks": [], "completed_edits": []}

    @workflow.signal(name=SignalName.RECEIVE_EVENT)
    async def on_task_event_send(self, params: SendEventParams) -> None:
        content = params.event.content
        if content and getattr(content, "type", None) == "text":
            text = (getattr(content, "content", None) or "").strip()
            if text:
                logger.info("followup_received", task_id=params.task.id, preview=text[:60])
                self._pending_followup = text
                return
        logger.info("received_event", task_id=params.task.id)

    @workflow.run
    async def on_task_create(self, params: CreateTaskParams) -> str:
        task_id = params.task.id
        goal = _extract_task_prompt(params.params)
        log = logger.bind(task_id=task_id)
        log.info("swarm_started", goal=goal[:80])

        task_queue = environment_variables.WORKFLOW_TASK_QUEUE or "web_scout_queue"
        repo_path = params.params.get("repo_path", ".") if params.params else "."
        branch_prefix = params.params.get("branch_prefix", "swarm") if params.params else "swarm"

        # ── GitHub clone step ─────────────────────────────────────────────────
        # If the caller passes a github_url, clone the repo before doing anything else.
        # The per-task github_token takes precedence over the global GH_TOKEN env var.
        github_url: str = params.params.get("github_url", "") if params.params else ""
        github_token: str = params.params.get("github_token", "") if params.params else ""

        if github_url:
            from project.config import GH_TOKEN
            effective_token = github_token or GH_TOKEN

            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Foreman] Cloning repository: {github_url}",
                ),
            )

            clone_result_json: str = await workflow.execute_activity(
                "swarm_git_clone",
                args=[github_url, repo_path, effective_token or None],
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
            try:
                clone_result = json.loads(clone_result_json)
            except Exception:
                clone_result = {"ok": False, "message": clone_result_json}

            if not clone_result.get("ok"):
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=f"[Foreman] ✗ Clone failed: {clone_result.get('message', 'unknown error')}",
                    ),
                )
                return f"[Foreman] Clone failed: {clone_result.get('message', 'unknown error')}"

            # Configure remote with token auth so DevOps can push without interactive auth
            if effective_token:
                await workflow.execute_activity(
                    "swarm_git_configure_remote",
                    args=[repo_path, effective_token, github_url],
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )

            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Foreman] ✓ Repository ready at {repo_path}",
                ),
            )

        # Classify complexity tier — LLM-based for accuracy, regex fallback on failure.
        # Runs as an activity so it's durable and doesn't block the workflow thread.
        explicit_tier = int(params.params.get("tier", -1)) if params.params else -1
        if explicit_tier >= 0:
            tier = explicit_tier
            tier_meta: dict = {"tier": tier, "estimated_files": 0, "estimated_minutes": 0, "risk_flags": [], "reasoning": "explicit override", "source": "user"}
        else:
            try:
                tier_meta = await workflow.execute_activity(
                    "classify_tier_llm",
                    args=[goal],
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                tier = tier_meta["tier"]
            except Exception:
                tier = classify_tier(goal)
                tier_meta = {"tier": tier, "estimated_files": 0, "estimated_minutes": 0, "risk_flags": [], "reasoning": "activity failed, used regex", "source": "regex_fallback"}
        tp = params_for_tier(tier)

        lightweight_mode = bool(params.params.get("lightweight_mode", tp["lightweight_mode"])) if params.params else tp["lightweight_mode"]
        max_heal = int(params.params.get("max_heal_cycles", tp["max_heal_cycles"])) if params.params else tp["max_heal_cycles"]
        max_parallel_tracks = int(params.params.get("max_parallel_tracks", tp["max_parallel_tracks"])) if params.params else tp["max_parallel_tracks"]

        tier_label = TIER_LABELS.get(tier, f"Tier {tier}")
        # Build tier announcement with LLM estimates when available
        tier_details = []
        if tier_meta.get("estimated_files"):
            tier_details.append(f"~{tier_meta['estimated_files']} files")
        if tier_meta.get("estimated_minutes"):
            tier_details.append(f"~{tier_meta['estimated_minutes']} min")
        if tier_meta.get("risk_flags"):
            tier_details.append("risks: " + ", ".join(tier_meta["risk_flags"][:3]))
        detail_str = f" ({', '.join(tier_details)})" if tier_details else ""
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=(
                    f"[Foreman] Complexity tier: {tier_label} (Tier {tier}){detail_str} — "
                    f"{'lightweight, ' if lightweight_mode else ''}"
                    f"{max_parallel_tracks} track(s), {max_heal} heal cycle(s)"
                ),
            ),
        )

        last_result = ""
        iteration = 0

        while True:
            branch = _branch_name(f"{task_id}-r{iteration}", branch_prefix)
            last_result = await self._run_pipeline(
                task_id=task_id,
                goal=goal,
                repo_path=repo_path,
                branch=branch,
                branch_prefix=branch_prefix,
                max_heal=max_heal,
                lightweight_mode=lightweight_mode,
                max_parallel_tracks=max_parallel_tracks,
                task_queue=task_queue,
                iteration=iteration,
                tier=tier,
                log=log,
            )

            # Update conversation history so the next architect has context
            self._conversation_history.append({
                "iteration": iteration,
                "goal": goal,
                "summary": last_result[:400],
            })

            # Wait up to 24h for a follow-up prompt
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content="[Foreman] Build complete. Waiting for follow-up instructions (24h idle timeout).",
                ),
            )

            self._pending_followup = None
            try:
                await workflow.wait_condition(
                    lambda: self._pending_followup is not None,
                    timeout=timedelta(hours=24),
                )
            except asyncio.TimeoutError:
                log.info("followup_timeout", iteration=iteration)
                break

            goal = self._pending_followup  # type: ignore[assignment]
            self._pending_followup = None
            iteration += 1
            log.info("followup_accepted", iteration=iteration, goal=goal[:60])

            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Foreman] Follow-up #{iteration} received: {goal[:120]}\nRestarting swarm on existing repo.",
                ),
            )

        return last_result

    async def _hitl_checkpoint(
        self,
        task_id: str,
        task_queue: str,
        checkpoint: str,
        action: str,
        iteration: int,
    ) -> bool:
        """Emit an approval_request message then block until the user signals approve/reject."""
        approval_wf_id = f"{task_id}-r{iteration}-approval-{checkpoint}"
        payload = json.dumps({
            "checkpoint": checkpoint,
            "action": action,
            "workflow_id": approval_wf_id,
        })
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=f"__approval_request__{payload}",
            ),
        )

        result: str = await workflow.execute_child_workflow(
            ApprovalWorkflow.run,
            args=[action],
            id=approval_wf_id,
            task_queue=task_queue,
            execution_timeout=timedelta(hours=72),
            parent_close_policy=ParentClosePolicy.TERMINATE,
        )

        approved = result == "Approved"
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=f"__approval_resolved__{json.dumps({'checkpoint': checkpoint, 'approved': approved, 'workflow_id': approval_wf_id})}",
            ),
        )
        return approved

    async def _run_pipeline(
        self,
        task_id: str,
        goal: str,
        repo_path: str,
        branch: str,
        branch_prefix: str,
        max_heal: int,
        lightweight_mode: bool,
        max_parallel_tracks: int,
        task_queue: str,
        iteration: int,
        tier: int,
        log,
    ) -> str:
        branch = _branch_name(f"{task_id}-r{iteration}", branch_prefix)

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=(
                    f"Swarm Factory {'activated' if iteration == 0 else f're-activated (follow-up #{iteration})'}.\n"
                    f"Goal: {goal[:120]}\n"
                    f"Repo: {repo_path} | Branch: {branch}"
                ),
            ),
        )

        # ── Step 0: PM Agent (tier >= 1 — skip on Auto) ──────────────────────
        if tier >= 1:
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Foreman] Dispatching PM — scanning repo and checking for ambiguities",
                ),
            )
            pm_json: str = await workflow.execute_child_workflow(
                PMAgent.run,
                args=[goal, repo_path, task_id, task_queue, tier, _model_for_tier(tier)],
                id=f"{task_id}-r{iteration}-pm",
                task_queue=task_queue,
                execution_timeout=PM_TIMEOUT,
            )
            try:
                pm_result = json.loads(pm_json)
                enriched = pm_result.get("enriched_goal", "").strip()
                if enriched and enriched != goal:
                    goal = enriched
                    log.info("pm_enriched_goal", length=len(goal))
            except (json.JSONDecodeError, ValueError):
                pass  # use original goal if PM fails

        # ── Step 1: Architect ─────────────────────────────────────────────────
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=f"[Foreman] Dispatching Architect — mapping {repo_path}"),
        )

        architect_json: str = await workflow.execute_child_workflow(
            ArchitectAgent.run,
            args=[goal, repo_path, task_id, self._conversation_history or None, None],
            id=f"{task_id}-r{iteration}-architect",
            task_queue=task_queue,
            execution_timeout=ARCHITECT_TIMEOUT,
        )

        try:
            architect_plan = json.loads(architect_json)
        except (json.JSONDecodeError, ValueError):
            architect_plan = {
                "tracks": [{"label": "main", "implementation_steps": [goal], "key_files": []}],
                "tech_stack": [],
                "repo_root": repo_path,
            }
        # Always overwrite repo_root with the user-supplied path — the architect LLM
        # may omit or invent it, which causes builders to write to the wrong directory.
        architect_plan["repo_root"] = repo_path

        tracks = _extract_tracks(architect_plan, max_parallel_tracks=max_parallel_tracks)
        stack = ", ".join(architect_plan.get("tech_stack", [])[:4]) or "unknown stack"
        log.info("architect_complete", tracks=len(tracks))

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=(
                    f"[Architect] ✓ done — {len(tracks)} track(s) planned, "
                    f"stack: {stack}, "
                    f"{sum(len(t.get('implementation_steps', [])) for t in tracks)} steps total"
                ),
            ),
        )

        # Build initial repo index so the architect's query_index calls work on re-plans
        # and builders can look up existing symbols from the first turn.
        try:
            await workflow.execute_activity(
                "swarm_build_repo_index",
                args=[repo_path],
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
        except Exception:
            pass  # non-critical

        # Build shared manifest in workflow state — gives every Builder visibility into
        # sibling tracks' file ownership and exports, preventing collision and enabling
        # correct imports. Stored on self so it's durable in Temporal event history
        # and works correctly across distributed workers (no filesystem dependency).
        self._manifest = {
            "version": 1,
            "tracks": [
                {
                    "label": t.get("label", "unknown"),
                    "key_files": t.get("key_files", []),
                    "exports": t.get("exports", []),
                    "goal_summary": (t.get("implementation_steps") or [""])[0][:120],
                }
                for t in tracks
            ],
            "completed_edits": [],
        }

        # ── HITL checkpoint 1: architect plan review (Standard / Full Crew) ─────
        if tier >= 2:
            action = (
                f"Architect plan ready: {len(tracks)} track(s), stack: {stack}, "
                f"{sum(len(t.get('implementation_steps', [])) for t in tracks)} steps. "
                f"Approve to launch builders?"
            )
            approved = await self._hitl_checkpoint(
                task_id=task_id,
                task_queue=task_queue,
                checkpoint="architect_plan",
                action=action,
                iteration=iteration,
            )
            if not approved:
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(author="agent", content="[Foreman] Build rejected at architect review. Stopping."),
                )
                return "[Foreman] Task rejected by user at architect plan checkpoint."

        # Snapshot pre-existing tests so Inspector can detect regressions
        try:
            pre_existing_tests: list[str] = await workflow.execute_activity(
                "swarm_find_test_files",
                args=[repo_path],
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
        except Exception:
            pre_existing_tests = []

        # ── Step 2: Parallel Builders + Inspector self-healing loop ───────────
        heal_instructions: list[str] = []
        build_result: dict = {}
        inspector_report: dict = {}
        heal_cycles = 0
        _builder_model = _model_for_tier(tier)
        _inspector_model = _model_for_tier(tier)

        # Collect all test specs from tracks for the Inspector's TDD verification
        all_test_specs: list[str] = []
        for t in tracks:
            all_test_specs.extend(t.get("test_spec", []))

        for cycle in range(max_heal + 1):
            cycle_label = f"heal cycle {cycle}" if cycle > 0 else "initial build"

            # ── #6: Git snapshot before each cycle ───────────────────────────
            # Save a restore point so a bad heal can't corrupt a good previous state.
            snapshot_ref = f"{task_id}-r{iteration}-c{cycle}"
            try:
                snapshot_json: str = await workflow.execute_activity(
                    "swarm_git_snapshot_save",
                    args=[repo_path, snapshot_ref],
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except Exception:
                snapshot_json = "{}"  # non-critical — proceed without snapshot

            # Announce parallel launch
            track_names = " + ".join(t.get("label", f"track-{i}") for i, t in enumerate(tracks))
            if len(tracks) > 1:
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[Foreman] Launching {len(tracks)} parallel builders "
                            f"({cycle_label}): {track_names}"
                        ),
                    ),
                )
            else:
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=f"[Foreman] Dispatching Builder ({cycle_label})...",
                    ),
                )

            # ── #11: Wave-based execution respecting track dependencies ─────
            # Tracks with depends_on wait for their dependencies to complete.
            # Independent tracks run in parallel within the same wave.
            track_waves = _order_tracks_by_deps(tracks)
            all_builder_jsons: list[str] = []

            for wave_idx, wave_tracks in enumerate(track_waves):
                wave_tracks_capped = wave_tracks[:max_parallel_tracks]
                wave_label = f"wave {wave_idx + 1}/{len(track_waves)}"
                if len(track_waves) > 1:
                    wave_names = " + ".join(t.get("label", "?") for t in wave_tracks_capped)
                    await adk.messages.create(
                        task_id=task_id,
                        content=TextContent(
                            author="agent",
                            content=f"[Foreman] {wave_label}: launching {len(wave_tracks_capped)} builder(s) — {wave_names}",
                        ),
                    )

                # Update manifest snapshot for this wave — previous waves' edits are now visible
                manifest_snapshot = json.dumps(self._manifest)

                wave_handles = [
                    workflow.execute_child_workflow(
                        BuilderAgent.run,
                        args=[
                            goal,
                            _track_plan(architect_plan, track),
                            task_id,
                            heal_instructions or None,
                            track.get("label"),
                            manifest_snapshot or None,
                            _builder_model,
                        ],
                        id=f"{task_id}-r{iteration}-builder-{cycle}-w{wave_idx}-{i}",
                        task_queue=task_queue,
                        execution_timeout=BUILDER_TIMEOUT,
                    )
                    for i, track in enumerate(wave_tracks_capped)
                ]

                wave_jsons: tuple[str, ...] = await asyncio.gather(*wave_handles)
                all_builder_jsons.extend(wave_jsons)

                # Update manifest after each wave so the next wave sees completed edits
                for i, (bj, track) in enumerate(zip(wave_jsons, wave_tracks_capped)):
                    try:
                        bd = json.loads(bj)
                        for edit in bd.get("edits", []):
                            self._manifest["completed_edits"].append({
                                "track": track.get("label", f"w{wave_idx}-{i}"),
                                "path": edit.get("path", ""),
                                "operation": edit.get("operation", ""),
                            })
                    except Exception:
                        pass

            builder_jsons = tuple(all_builder_jsons)
            build_result = _merge_build_results(builder_jsons)

            # ── #10: Build repo index after each build cycle ─────────────────
            # Keeps the symbol index current so subsequent agents (heal builders,
            # follow-up architects) can query it instead of exploring blind.
            try:
                await workflow.execute_activity(
                    "swarm_build_repo_index",
                    args=[repo_path],
                    start_to_close_timeout=timedelta(seconds=60),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except Exception:
                pass  # non-critical — index is advisory

            # ── Item 4: Architect feedback on builder failure ─────────────────
            # If any track failed on the INITIAL build (cycle 0), re-invoke the
            # Architect with the failure context before attempting Inspector/heal.
            # This catches bad decompositions early rather than burning heal cycles
            # on a structurally broken plan.
            if not build_result.get("success") and cycle == 0:
                failed_tracks = []
                for bj, track in zip(builder_jsons, tracks):
                    try:
                        bd = json.loads(bj)
                        if not bd.get("success"):
                            failed_tracks.append({
                                "label": track.get("label", "unknown"),
                                "summary": bd.get("summary", "Builder failed without summary")[:300],
                                "errors": bd.get("errors", [])[:3],
                            })
                    except Exception:
                        failed_tracks.append({"label": track.get("label", "unknown"), "summary": str(bj)[:200], "errors": []})

                log.warning("builder_failure_triggering_replan", failed_tracks=len(failed_tracks))
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[Foreman] {len(failed_tracks)} track(s) failed — re-invoking Architect "
                            f"to revise the plan before attempting heal cycles."
                        ),
                    ),
                )

                failure_context = {
                    "reason": "builder_failure",
                    "failed_tracks": failed_tracks,
                    "heal_instructions": [],
                }
                replan_json: str = await workflow.execute_child_workflow(
                    ArchitectAgent.run,
                    args=[goal, repo_path, task_id, self._conversation_history or None, failure_context],
                    id=f"{task_id}-r{iteration}-architect-replan-{cycle}",
                    task_queue=task_queue,
                    execution_timeout=ARCHITECT_TIMEOUT,
                )
                try:
                    replan = json.loads(replan_json)
                    replan["repo_root"] = repo_path
                    architect_plan = replan
                    tracks = _extract_tracks(architect_plan, max_parallel_tracks=max_parallel_tracks)
                    # Rebuild manifest for the revised track set
                    self._manifest = {
                        "version": 1,
                        "tracks": [
                            {
                                "label": t.get("label", "unknown"),
                                "key_files": t.get("key_files", []),
                                "exports": t.get("exports", []),
                                "goal_summary": (t.get("implementation_steps") or [""])[0][:120],
                            }
                            for t in tracks
                        ],
                        "completed_edits": self._manifest.get("completed_edits", []),
                    }
                    log.info("architect_replan_accepted", new_tracks=len(tracks))
                    await adk.messages.create(
                        task_id=task_id,
                        content=TextContent(
                            author="agent",
                            content=(
                                f"[Architect] Revised plan — {len(tracks)} track(s): "
                                + " + ".join(t.get("label", "?") for t in tracks)
                            ),
                        ),
                    )
                    # Continue to next cycle with the revised plan (don't break)
                    continue
                except Exception as e:
                    log.warning("architect_replan_failed", error=str(e))
                    # Replan failed — fall through to normal failure handling
                break  # original build failed and replan also failed

            if not build_result.get("success"):
                log.warning("builder_failed", cycle=cycle)
                break

            # Inspector
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Foreman] Dispatching Inspector ({cycle_label}) — running tests, lint, types",
                ),
            )

            inspector_json: str = await workflow.execute_child_workflow(
                InspectorAgent.run,
                args=[goal, repo_path, task_id, pre_existing_tests or None, _inspector_model, all_test_specs or None],
                id=f"{task_id}-r{iteration}-inspector-{cycle}",
                task_queue=task_queue,
                execution_timeout=INSPECTOR_TIMEOUT,
            )

            try:
                inspector_report = json.loads(inspector_json)
            except (json.JSONDecodeError, ValueError):
                inspector_report = {"passed": False, "summary": inspector_json, "heal_instructions": []}

            if inspector_report.get("passed"):
                log.info("inspector_passed", cycle=cycle)
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=f"[Inspector] ✓ done — {inspector_report.get('summary', 'all checks passed')}",
                    ),
                )
                break

            heal_instructions = inspector_report.get("heal_instructions", [])
            heal_cycles += 1

            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"[Inspector] ✗ failed — {inspector_report.get('summary', 'checks failed')}",
                ),
            )

            # ── #6: Restore snapshot before next heal cycle ──────────────────
            # If the heal cycle makes things worse, we want to start from the
            # known-good state at the beginning of this cycle, not a broken one.
            if snapshot_json and snapshot_json != "{}":
                try:
                    await workflow.execute_activity(
                        "swarm_git_snapshot_restore",
                        args=[repo_path, snapshot_json],
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )
                except Exception:
                    pass  # non-critical — proceed without restore

            if cycle >= max_heal:
                log.warning("heal_cycles_exhausted", max_heal=max_heal)

                # ── Item 5: Re-decompose before escalating to HITL ───────────
                # Before asking the user, give the Architect one more shot with
                # the full set of Inspector heal_instructions. This catches cases
                # where the original decomposition was structurally wrong and no
                # amount of builder patching can fix it.
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[Foreman] Heal cycles exhausted — re-invoking Architect "
                            f"with Inspector findings before escalating to user."
                        ),
                    ),
                )
                failure_context_heal = {
                    "reason": "heal_exhausted",
                    "failed_tracks": [],
                    "heal_instructions": heal_instructions,
                }
                try:
                    replan_json2: str = await workflow.execute_child_workflow(
                        ArchitectAgent.run,
                        args=[goal, repo_path, task_id, self._conversation_history or None, failure_context_heal],
                        id=f"{task_id}-r{iteration}-architect-replan-heal-{cycle}",
                        task_queue=task_queue,
                        execution_timeout=ARCHITECT_TIMEOUT,
                    )
                    replan2 = json.loads(replan_json2)
                    replan2["repo_root"] = repo_path
                    architect_plan = replan2
                    tracks = _extract_tracks(architect_plan, max_parallel_tracks=max_parallel_tracks)
                    self._manifest = {
                        "version": 1,
                        "tracks": [
                            {
                                "label": t.get("label", "unknown"),
                                "key_files": t.get("key_files", []),
                                "exports": t.get("exports", []),
                                "goal_summary": (t.get("implementation_steps") or [""])[0][:120],
                            }
                            for t in tracks
                        ],
                        "completed_edits": self._manifest.get("completed_edits", []),
                    }
                    # Reset heal budget for the re-decomposed plan
                    heal_instructions = []
                    heal_cycles_before_replan = heal_cycles
                    log.info("architect_heal_replan_accepted", new_tracks=len(tracks))
                    await adk.messages.create(
                        task_id=task_id,
                        content=TextContent(
                            author="agent",
                            content=(
                                f"[Architect] Structural re-plan after {heal_cycles_before_replan} heal cycle(s) — "
                                f"{len(tracks)} revised track(s): "
                                + " + ".join(t.get("label", "?") for t in tracks)
                            ),
                        ),
                    )
                    # Continue with the revised plan — don't escalate to HITL yet
                    continue
                except Exception as e:
                    log.warning("architect_heal_replan_failed", error=str(e))
                    # Re-plan failed — fall through to HITL

                action = (
                    f"Inspector still failing after {max_heal} heal cycle(s) and an Architect re-plan. "
                    f"Last issue: {inspector_report.get('summary', 'checks failed')[:200]}. "
                    f"Proceed anyway (code may be broken)?"
                )
                approved = await self._hitl_checkpoint(
                    task_id=task_id,
                    task_queue=task_queue,
                    checkpoint="max_heals",
                    action=action,
                    iteration=iteration,
                )
                if not approved:
                    await adk.messages.create(
                        task_id=task_id,
                        content=TextContent(author="agent", content="[Foreman] Stopping after heal exhaustion — rejected by user."),
                    )
                    return "[Foreman] Task rejected by user after max heal cycles."
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content="[Foreman] Proceeding past failed inspector — approved by user.",
                    ),
                )
                break

            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=(
                        f"[Foreman] Dispatching Builder (heal cycle {cycle + 1}/{max_heal}) — "
                        + "; ".join(heal_instructions[:3])
                    ),
                ),
            )
            tracks = [{"label": "heal", "implementation_steps": heal_instructions, "key_files": []}]

        # ── Step 3: Security ──────────────────────────────────────────────────
        if lightweight_mode:
            security_report = {
                "passed": True,
                "summary": "Security skipped in lightweight mode.",
                "findings": [],
            }
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(author="agent", content="[Foreman] Lightweight mode — skipping Security"),
            )
        else:
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(author="agent", content="[Foreman] Dispatching Security — scanning secrets, deps, SAST"),
            )

            security_json: str = await workflow.execute_child_workflow(
                SecurityAgent.run,
                args=[goal, repo_path, task_id],
                id=f"{task_id}-r{iteration}-security",
                task_queue=task_queue,
                execution_timeout=SECURITY_TIMEOUT,
            )

            try:
                security_report = json.loads(security_json)
            except (json.JSONDecodeError, ValueError):
                security_report = {"passed": True, "summary": security_json, "findings": []}

        if not security_report.get("passed"):
            critical = [
                f for f in security_report.get("findings", [])
                if f.get("severity") in ("critical", "high")
            ]
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=(
                        f"[Security] ✗ failed — {len(critical)} critical/high finding(s): "
                        + "; ".join(f.get('description', '')[:60] for f in critical[:3])
                    ),
                ),
            )
            return _build_final_report(
                goal=goal,
                tracks=tracks,
                build_result=build_result,
                inspector_report=inspector_report,
                security_report=security_report,
                devops_result=None,
                heal_cycles=heal_cycles,
                blocked_by="security",
            )

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=f"[Security] ✓ done — {security_report.get('summary', 'no critical findings')}",
            ),
        )

        # ── Step 4: DevOps ────────────────────────────────────────────────────
        # HITL checkpoint 3: deployment approval (Full Crew only)
        if tier >= 3:
            action = (
                f"Build and QA complete. Approve creating branch '{branch}' "
                f"and opening a pull request?"
            )
            approved = await self._hitl_checkpoint(
                task_id=task_id,
                task_queue=task_queue,
                checkpoint="devops",
                action=action,
                iteration=iteration,
            )
            if not approved:
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(author="agent", content="[Foreman] Deployment rejected by user. Build artifacts remain on disk."),
                )
                return _build_final_report(
                    goal=goal,
                    tracks=tracks,
                    build_result=build_result,
                    inspector_report=inspector_report,
                    security_report=security_report,
                    devops_result=None,
                    heal_cycles=heal_cycles,
                    blocked_by="user rejected deployment",
                )

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=f"[Foreman] Dispatching DevOps — branch: {branch}"),
        )

        devops_json: str = await workflow.execute_child_workflow(
            DevOpsAgent.run,
            args=[goal, repo_path, branch, task_id, build_result.get("summary", "")],
            id=f"{task_id}-r{iteration}-devops",
            task_queue=task_queue,
            execution_timeout=DEVOPS_TIMEOUT,
        )

        try:
            devops_result = json.loads(devops_json)
        except (json.JSONDecodeError, ValueError):
            devops_result = {"branch": branch, "success": False, "summary": devops_json}

        pr_url = devops_result.get("pr_url", "")
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=(
                    f"[DevOps] ✓ done — branch '{devops_result.get('branch', branch)}' pushed"
                    + (f", PR: {pr_url}" if pr_url else "")
                ),
            ),
        )

        # ── Final report ──────────────────────────────────────────────────────
        final = _build_final_report(
            goal=goal,
            tracks=tracks,
            build_result=build_result,
            inspector_report=inspector_report,
            security_report=security_report,
            devops_result=devops_result,
            heal_cycles=heal_cycles,
            quality_score=quality_score,
        )

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=final),
        )

        log.info("swarm_complete", heal_cycles=heal_cycles, pr=devops_result.get("pr_url"))

        # ── Quality scoring — Phase 5 (#15) ──────────────────────────────────
        # Run a lightweight Haiku eval after DevOps to score the build 0–10.
        # Score is stored in the episode record for future Architect context.
        quality_score: dict = {"score": 5.0, "reasoning": "not scored"}
        try:
            edited_paths = [e.get("path", "") for e in build_result.get("edits", [])]
            quality_score = await workflow.execute_activity(
                "score_build_quality",
                args=[
                    goal,
                    repo_path,
                    edited_paths,
                    inspector_report.get("passed", False),
                    heal_cycles,
                    len(edited_paths),
                ],
                start_to_close_timeout=timedelta(seconds=45),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
            score = quality_score.get("score", 5.0)
            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=(
                        f"[Foreman] Build quality score: {score}/10 — "
                        f"{quality_score.get('reasoning', '')}"
                    ),
                ),
            )
        except Exception:
            pass  # non-critical

        # ── Episodic memory: record this build for future agent context ────────
        try:
            from project.complexity import TIER_LABELS
            episode = {
                "goal": goal[:300],
                "tier": tier,
                "tier_label": TIER_LABELS.get(tier, str(tier)),
                "outcome": "success" if not inspector_report.get("blocked_by") else "blocked",
                "inspector_passed": inspector_report.get("passed", False),
                "security_passed": security_report.get("passed", False),
                "heal_cycles": heal_cycles,
                "tracks": [t.get("label") for t in tracks],
                "files_modified": len(build_result.get("edits", [])),
                "pr_url": devops_result.get("pr_url", "") if devops_result else "",
                "quality_score": quality_score.get("score", 5.0),
                "quality_reasoning": quality_score.get("reasoning", ""),
                "key_decisions": [
                    f"tracks={[t.get('label') for t in tracks]}",
                    f"tech_stack={architect_plan.get('tech_stack', [])}",
                ],
            }
            await workflow.execute_activity(
                "memory_append_episode",
                args=[repo_path, episode],
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
        except Exception:
            pass  # episode write is non-critical

        return final


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_final_report(
    goal: str,
    tracks: list[dict],
    build_result: dict,
    inspector_report: dict,
    security_report: dict,
    devops_result: dict | None,
    heal_cycles: int,
    blocked_by: str | None = None,
    quality_score: dict | None = None,
) -> str:
    edits = build_result.get("edits", [])
    findings = security_report.get("findings", [])
    pr_url = devops_result.get("pr_url", "") if devops_result else ""
    branch = devops_result.get("branch", "") if devops_result else ""

    status = "✓ Complete" if not blocked_by else f"⚠ Blocked by {blocked_by}"
    qa_status = "✓ Passed" if inspector_report.get("passed") else "✗ Failed"
    sec_status = "✓ Clean" if security_report.get("passed") else "✗ Issues found"

    track_labels = [t.get("label", "?") for t in tracks if t.get("label") != "heal"]
    tracks_str = ", ".join(track_labels) if track_labels else "main"

    lines = [
        "## Swarm Factory Report",
        f"**Status:** {status}",
        f"**Goal:** {goal[:200]}",
        "",
        "### Results",
        f"- Architect: {len(tracks)} parallel track(s) — {tracks_str}",
        f"- Builders: {len(edits)} file(s) modified (heal cycles: {heal_cycles})",
        f"- Inspector: {qa_status}",
        f"- Security: {sec_status} ({len(findings)} finding(s))",
    ]

    if quality_score and quality_score.get("score") is not None:
        score = quality_score["score"]
        lines.append(f"- Quality: {score}/10 — {quality_score.get('reasoning', '')}")

    if pr_url:
        lines.append(f"- DevOps: PR opened → {pr_url}")
    elif branch:
        lines.append(f"- DevOps: Branch '{branch}' pushed")

    if not inspector_report.get("passed"):
        issues = inspector_report.get("heal_instructions", [])[:3]
        if issues:
            lines += ["", "### Remaining QA Issues"] + [f"- {i}" for i in issues]

    if not security_report.get("passed"):
        critical = [f for f in findings if f.get("severity") in ("critical", "high")][:3]
        if critical:
            lines += ["", "### Security Findings (blocking)"] + [
                f"- [{f.get('severity')}] {f.get('description', '')}" for f in critical
            ]

    return "\n".join(lines)
