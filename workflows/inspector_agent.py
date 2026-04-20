"""
InspectorAgent — QASkill.
Runs tests, lints, and type checks. Produces an InspectorReport.
If checks fail, provides heal_instructions for the Builder's next cycle.
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
    from project.inspector_tools import INSPECTOR_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_INSPECTOR_TURNS = 16

PLANNER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
IO_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
CMD_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=300),
    "retry_policy": RetryPolicy(maximum_attempts=1),
}


@workflow.defn(name="InspectorAgent")
class InspectorAgent:
    """
    Runs QA checks and returns an InspectorReport JSON.
    """

    @workflow.run
    async def run(
        self,
        goal: str,
        repo_path: str,
        parent_task_id: str,
        pre_existing_tests: list[str] | None = None,
    ) -> str:
        log = logger.bind(parent_task_id=parent_task_id)
        log.info("inspector_started", pre_existing_tests=len(pre_existing_tests or []))

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content="[Inspector] Running tests, lint, and type checks...",
            ),
        )

        regression_note = ""
        if pre_existing_tests:
            tests_str = "\n".join(f"  - {t}" for t in pre_existing_tests[:20])
            regression_note = (
                f"\n\nPre-existing test files (regression check — these MUST still pass):\n{tests_str}\n"
                "If any of these tests now fail, that is a regression — list it as a HIGH priority heal instruction."
            )

        task_prompt = (
            f"You are the Inspector agent. Your goal:\n{goal}\n\n"
            f"Repository root: {repo_path}\n"
            f"{regression_note}\n"
            "Instructions:\n"
            "1. Run the test suite first (e.g. 'pytest --tb=short -q' or 'npm test -- --run').\n"
            "2. Run the linter (e.g. 'ruff check .' or 'eslint src/').\n"
            "3. Run type checking if applicable (e.g. 'mypy .' or 'tsc --noEmit').\n"
            "4. Read failing files if you need context to write heal_instructions.\n"
            "5. Call report_inspection with a full summary and concrete heal_instructions if anything failed."
        )

        context: list[dict] = []

        for turn in range(MAX_INSPECTOR_TURNS):
            raw = await workflow.execute_activity(
                "plan_inspector_step",
                args=[task_prompt, context],
                **PLANNER_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "report":
                report_data = raw["report_data"]
                tool_use_id = raw["tool_use_id"]
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "Report recorded."}],
                }]
                passed = report_data.get("passed", False)
                log.info("inspector_done", passed=passed)
                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[Inspector] {'✓ All checks passed' if passed else '✗ Checks failed'} — "
                            f"{report_data.get('summary', '')}"
                        ),
                    ),
                )
                return json.dumps(report_data)

            if raw["type"] == "final":
                log.warning("inspector_no_report_tool", turn=turn)
                return json.dumps({"passed": False, "summary": raw["answer"], "heal_instructions": []})

            if raw["type"] == "error":
                log.warning("inspector_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in INSPECTOR_VALID_TOOL_NAMES:
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
                    content=f"[Inspector] {tool_name}: {tool_input.get('command', tool_input.get('path', ''))}",
                ),
            )

            tool_result = await self._dispatch(tool_name, tool_input)

            context = context + [{
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": str(tool_result)}],
            }]

        log.warning("inspector_max_turns")
        return json.dumps({"passed": False, "summary": "Inspector hit max turns.", "heal_instructions": []})

    async def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        if tool_name == "read_file":
            return await workflow.execute_activity(
                "swarm_read_file", args=[tool_input.get("path", "")], **IO_OPTIONS
            )
        if tool_name in ("run_tests", "run_lint", "run_type_check"):
            return await workflow.execute_activity(
                "swarm_run_command",
                args=[tool_input.get("command", ""), tool_input.get("cwd")],
                **CMD_OPTIONS,
            )
        return f"Error: tool '{tool_name}' not dispatched."
