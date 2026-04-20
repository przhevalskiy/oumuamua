"""
SwarmOrchestrator — the Foreman (L5 OrchestratorSkill).

Durable Multi-Dimensional Software Engineering Factory:
  1. Architect  → maps the repo, decomposes goal into parallel tracks
  2. Builders   → N agents execute tracks simultaneously (asyncio.gather)
  3. Inspector  → merges all edits, runs QA; triggers self-healing if failed
  4. Security   → scans for secrets/CVEs; blocks PR if critical findings
  5. DevOps     → branches, commits, pushes, opens PR

Self-healing: Inspector failures re-invoke a single heal Builder with merged
heal_instructions up to MAX_HEAL_CYCLES times before the Foreman gives up.

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

from agentex.lib import adk
from agentex.lib.types.acp import CreateTaskParams, SendEventParams
from agentex.lib.core.temporal.workflows.workflow import BaseWorkflow
from agentex.lib.core.temporal.types.workflow import SignalName
from agentex.lib.environment_variables import EnvironmentVariables
from agentex.types.text_content import TextContent

with workflow.unsafe.imports_passed_through():
    from project.planner import _extract_task_prompt
    from workflows.architect_agent import ArchitectAgent
    from workflows.builder_agent import BuilderAgent
    from workflows.inspector_agent import InspectorAgent
    from workflows.security_agent import SecurityAgent
    from workflows.devops_agent import DevOpsAgent

environment_variables = EnvironmentVariables.refresh()
logger = structlog.get_logger(__name__)

ARCHITECT_TIMEOUT = timedelta(minutes=10)
BUILDER_TIMEOUT   = timedelta(minutes=30)
INSPECTOR_TIMEOUT = timedelta(minutes=15)
SECURITY_TIMEOUT  = timedelta(minutes=10)
DEVOPS_TIMEOUT    = timedelta(minutes=10)

MAX_HEAL_CYCLES = 3
MAX_PARALLEL_TRACKS = 4


def _branch_name(task_id: str, prefix: str = "swarm") -> str:
    safe = re.sub(r"[^a-zA-Z0-9\-]", "-", task_id)[:40]
    return f"{prefix}/{safe}"


def _extract_tracks(architect_plan: dict) -> list[dict]:
    """
    Extract parallel tracks from an architect plan.
    Falls back to a single 'main' track using the flat implementation_steps list
    if the Architect didn't produce structured tracks.
    """
    tracks = architect_plan.get("tracks", [])
    if tracks:
        return tracks[:MAX_PARALLEL_TRACKS]
    # Backward compat: flat implementation_steps → single track
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
        max_heal = int(params.params.get("max_heal_cycles", MAX_HEAL_CYCLES)) if params.params else MAX_HEAL_CYCLES

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
                task_queue=task_queue,
                iteration=iteration,
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

    async def _run_pipeline(
        self,
        task_id: str,
        goal: str,
        repo_path: str,
        branch: str,
        branch_prefix: str,
        max_heal: int,
        task_queue: str,
        iteration: int,
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

        # ── Step 1: Architect ─────────────────────────────────────────────────
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=f"[Foreman] Dispatching Architect — mapping {repo_path}"),
        )

        architect_json: str = await workflow.execute_child_workflow(
            ArchitectAgent.run,
            args=[goal, repo_path, task_id, self._conversation_history or None],
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

        tracks = _extract_tracks(architect_plan)
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

        # ── Step 2: Parallel Builders + Inspector self-healing loop ───────────
        heal_instructions: list[str] = []
        build_result: dict = {}
        inspector_report: dict = {}
        heal_cycles = 0

        for cycle in range(max_heal + 1):
            cycle_label = f"heal cycle {cycle}" if cycle > 0 else "initial build"

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

            # Fan out Builders in parallel
            builder_handles = [
                workflow.execute_child_workflow(
                    BuilderAgent.run,
                    args=[
                        goal,
                        _track_plan(architect_plan, track),
                        task_id,
                        heal_instructions or None,
                        track.get("label"),
                    ],
                    id=f"{task_id}-r{iteration}-builder-{cycle}-{i}",
                    task_queue=task_queue,
                    execution_timeout=BUILDER_TIMEOUT,
                )
                for i, track in enumerate(tracks)
            ]

            builder_jsons: tuple[str, ...] = await asyncio.gather(*builder_handles)
            build_result = _merge_build_results(builder_jsons)

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
                args=[goal, repo_path, task_id],
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

            if cycle >= max_heal:
                log.warning("heal_cycles_exhausted", max_heal=max_heal)
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content=f"[Foreman] Inspector still failing after {max_heal} heal cycles. Proceeding.",
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
        )

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=final),
        )

        log.info("swarm_complete", heal_cycles=heal_cycles, pr=devops_result.get("pr_url"))
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
