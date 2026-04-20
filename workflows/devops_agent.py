"""
DevOpsAgent — GitSkill.
Handles branching, staging, committing, pushing, and PR creation.
Returns a DevOpsResult JSON.
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
    from project.devops_tools import DEVOPS_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_DEVOPS_TURNS = 16

PLANNER_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}
IO_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=30),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}


@workflow.defn(name="DevOpsAgent")
class DevOpsAgent:
    """
    Handles all git operations and returns a DevOpsResult JSON.
    """

    @workflow.run
    async def run(
        self,
        goal: str,
        repo_path: str,
        branch_name: str,
        parent_task_id: str,
        build_summary: str = "",
    ) -> str:
        log = logger.bind(parent_task_id=parent_task_id, branch=branch_name)
        log.info("devops_started")

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content=f"[DevOps] Staging changes on branch '{branch_name}'...",
            ),
        )

        task_prompt = (
            f"You are the DevOps agent. Your goal:\n{goal}\n\n"
            f"Repository root: {repo_path}\n"
            f"Target branch: {branch_name}\n"
            f"Build summary: {build_summary}\n\n"
            "Instructions:\n"
            "1. Run git_status to see what changed.\n"
            "2. Create the branch with git_create_branch.\n"
            "3. Stage all changes with git_add (use paths=['.']).\n"
            "4. Commit with a descriptive conventional commit message.\n"
            "5. Push the branch with git_push.\n"
            "6. Optionally create a pull request with create_pull_request.\n"
            "7. Call report_devops with the branch, commit SHA, PR URL, and summary."
        )

        context: list[dict] = []

        for turn in range(MAX_DEVOPS_TURNS):
            raw = await workflow.execute_activity(
                "plan_devops_step",
                args=[task_prompt, context],
                **PLANNER_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "devops":
                devops_data = raw["devops_data"]
                tool_use_id = raw["tool_use_id"]
                context = context + [{
                    "role": "user",
                    "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "DevOps recorded."}],
                }]
                log.info("devops_done", branch=devops_data.get("branch"), pr=devops_data.get("pr_url"))
                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content=(
                            f"[DevOps] ✓ Branch '{devops_data.get('branch')}' pushed. "
                            + (f"PR: {devops_data.get('pr_url')}" if devops_data.get("pr_url") else "")
                        ),
                    ),
                )
                return json.dumps(devops_data)

            if raw["type"] == "final":
                log.warning("devops_no_report_tool", turn=turn)
                return json.dumps({"branch": branch_name, "success": True, "summary": raw["answer"]})

            if raw["type"] == "error":
                log.warning("devops_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in DEVOPS_VALID_TOOL_NAMES:
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
                    content=f"[DevOps] {tool_name}",
                ),
            )

            tool_result = await self._dispatch(tool_name, tool_input)

            context = context + [{
                "role": "user",
                "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": str(tool_result)}],
            }]

        log.warning("devops_max_turns")
        return json.dumps({"branch": branch_name, "success": False, "summary": "DevOps hit max turns."})

    async def _dispatch(self, tool_name: str, tool_input: dict) -> str:
        cwd = tool_input.get("cwd")
        if tool_name == "git_status":
            return await workflow.execute_activity(
                "swarm_git_status", args=[cwd], **IO_OPTIONS
            )
        if tool_name == "git_create_branch":
            return await workflow.execute_activity(
                "swarm_git_create_branch",
                args=[tool_input.get("branch_name", ""), cwd],
                **IO_OPTIONS,
            )
        if tool_name == "git_add":
            return await workflow.execute_activity(
                "swarm_git_add",
                args=[tool_input.get("paths", ["."]), cwd],
                **IO_OPTIONS,
            )
        if tool_name == "git_commit":
            return await workflow.execute_activity(
                "swarm_git_commit",
                args=[tool_input.get("message", "chore: swarm commit"), cwd],
                **IO_OPTIONS,
            )
        if tool_name == "git_push":
            return await workflow.execute_activity(
                "swarm_git_push",
                args=[tool_input.get("branch_name", ""), cwd],
                **IO_OPTIONS,
            )
        if tool_name == "create_pull_request":
            return await workflow.execute_activity(
                "swarm_create_pull_request",
                args=[
                    tool_input.get("title", ""),
                    tool_input.get("body", ""),
                    tool_input.get("head_branch", ""),
                    tool_input.get("base_branch", "main"),
                    cwd,
                ],
                **IO_OPTIONS,
            )
        return f"Error: tool '{tool_name}' not dispatched."
