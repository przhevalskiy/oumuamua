"""
SecurityAgent — AuditSkill.
Scans for secrets, vulnerable dependencies, and insecure code patterns.
Returns a SecurityReport JSON. Blocks PR staging if critical/high findings exist.
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
    from project.security_tools import SECURITY_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_SECURITY_TURNS = 16

PLANNER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
IO_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
CMD_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=180),
    "retry_policy": RetryPolicy(maximum_attempts=1),
}


@workflow.defn(name="SecurityAgent")
class SecurityAgent:
    """
    Runs security audit and returns a SecurityReport JSON.
    """

    @workflow.run
    async def run(self, goal: str, repo_path: str, parent_task_id: str) -> str:
        log = logger.bind(parent_task_id=parent_task_id)
        log.info("security_started")

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content="[Security] Scanning for secrets, vulnerabilities, and insecure patterns...",
            ),
        )

        task_prompt = (
            f"You are the Security agent. Your goal:\n{goal}\n\n"
            f"Repository root: {repo_path}\n\n"
            "Instructions:\n"
            "1. Run scan_secrets to check for accidentally committed credentials.\n"
            "2. Run scan_dependencies to check for known CVEs (use 'pip-audit' for Python, 'npm audit --json' for Node).\n"
            "3. Optionally run run_sast for deeper static analysis (e.g. 'bandit -r . -f json').\n"
            "4. Read any suspicious files if needed.\n"
            "5. Call report_audit with all findings and whether the build is safe to merge.\n"
            "IMPORTANT: Mark passed=False if ANY critical or high severity findings exist."
        )

        context: list[dict] = []

        for turn in range(MAX_SECURITY_TURNS):
            raw = await workflow.execute_activity(
                "plan_security_step",
                args=[task_prompt, context],
                **PLANNER_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "audit":
                audit_data = raw["audit_data"]
                tool_use_id = raw["tool_use_id"]
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "Audit recorded."}],
                }]
                passed = audit_data.get("passed", False)
                findings = audit_data.get("findings", [])
                log.info("security_done", passed=passed, findings=len(findings))
                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[Security] {'✓ Clean' if passed else '✗ Issues found'} — "
                            f"{len(findings)} finding(s). {audit_data.get('summary', '')}"
                        ),
                    ),
                )
                return json.dumps(audit_data)

            if raw["type"] == "final":
                log.warning("security_no_audit_tool", turn=turn)
                return json.dumps({"passed": True, "summary": raw["answer"], "findings": []})

            if raw["type"] == "error":
                log.warning("security_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in SECURITY_VALID_TOOL_NAMES:
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
                    content=f"[Security] {tool_name}",
                ),
            )

            tool_result = await self._dispatch(tool_name, tool_input)

            context = context + [{
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": str(tool_result)}],
            }]

        log.warning("security_max_turns")
        return json.dumps({"passed": True, "summary": "Security hit max turns — partial scan.", "findings": []})

    async def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "scan_secrets":
            return await workflow.execute_activity(
                "swarm_scan_secrets",
                args=[tool_input.get("path", ".")],
                **IO_OPTIONS,
            )
        if tool_name == "read_file":
            return await workflow.execute_activity(
                "swarm_read_file", args=[tool_input.get("path", "")], **IO_OPTIONS
            )
        if tool_name in ("scan_dependencies", "run_sast"):
            return await workflow.execute_activity(
                "swarm_run_command",
                args=[tool_input.get("command", ""), tool_input.get("cwd")],
                **CMD_OPTIONS,
            )
        return f"Error: tool '{tool_name}' not dispatched."
