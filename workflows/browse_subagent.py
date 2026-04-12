"""
BrowseSubAgent — a child workflow that researches one focused sub-query.
Spawned in parallel by ResearchOrchestrator. Returns raw findings as a string.

This is a pure Temporal workflow (not BaseWorkflow) — it does not handle
Agentex task creation signals. It is called directly via execute_child_workflow.
"""
from __future__ import annotations

import structlog
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from agentex.lib import adk
from agentex.types.text_content import TextContent

with workflow.unsafe.imports_passed_through():
    from project.subagent_tools import SUBAGENT_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_SUBAGENT_TURNS = 12
MAX_SUBAGENT_PAGES = 4

IO_ACTIVITY_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=3),
}

PLANNER_ACTIVITY_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}

# Message prefix the UI uses to route messages to per-agent tabs
def _tag(agent_index: int, text: str) -> str:
    return f"[Agent {agent_index}] {text}"


@workflow.defn(name="BrowseSubAgent")
class BrowseSubAgent:
    """
    Focused research worker. Searches + navigates for a single sub-query angle,
    then calls report_chunk() to return raw findings to the orchestrator.
    Posts [Agent N] prefixed messages so the UI can show per-agent activity.
    """

    @workflow.run
    async def run(self, sub_query: str, parent_task_id: str, agent_index: int) -> str:
        log = logger.bind(
            parent_task_id=parent_task_id,
            agent_index=agent_index,
            sub_query=sub_query[:60],
        )
        log.info("subagent_started")

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content=_tag(agent_index, f"Starting: {sub_query}"),
            ),
        )

        task_prompt = (
            f"Research this specific angle: {sub_query}\n\n"
            "Instructions:\n"
            "- Use search_web to find relevant sources for this specific angle\n"
            "- Navigate to at least 2 of the best sources\n"
            "- Gather all key facts, data points, and quotes\n"
            "- Include exact source URLs in your findings\n"
            "- Call report_chunk() with comprehensive findings when done"
        )

        context: list[dict] = []
        pages_visited = 0
        searched = False

        for turn in range(MAX_SUBAGENT_TURNS):
            if pages_visited >= MAX_SUBAGENT_PAGES:
                log.info("subagent_page_cap", pages=pages_visited)
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": "You have visited enough pages. Call report_chunk() now with all findings gathered so far.",
                    }],
                }]

            raw = await workflow.execute_activity(
                "plan_subagent_step",
                args=[task_prompt, context],
                **PLANNER_ACTIVITY_OPTIONS,
            )

            context = raw["context"]

            if raw["type"] == "final":
                log.info("subagent_finished", turn=turn, answer_len=len(raw["answer"]))
                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(
                        author="agent",
                        content=_tag(agent_index, "done"),
                    ),
                )
                await workflow.execute_activity(
                    "close_browser",
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
                return raw["answer"]

            if raw["type"] == "error":
                log.warning("subagent_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in SUBAGENT_VALID_TOOL_NAMES:
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": f"Unknown tool '{tool_name}'. Use: search_web, navigate, click_element, report_chunk.",
                    }],
                }]
                continue

            if tool_name == "navigate" and not searched:
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": "Use search_web first to identify relevant sources.",
                    }],
                }]
                log.warning("subagent_navigate_blocked_before_search")
                continue

            if tool_name == "search_web":
                searched = True

            # Post tagged activity message so the UI can show it per-agent tab
            await self._post_tool_message(parent_task_id, agent_index, tool_name, tool_input)

            tool_result = await self._dispatch(tool_name, tool_use_id, tool_input)

            if tool_name in ("navigate", "click_element"):
                pages_visited += 1

            context = context + [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": str(tool_result),
                }],
            }]

        log.warning("subagent_max_turns", turns=MAX_SUBAGENT_TURNS)
        await workflow.execute_activity(
            "close_browser",
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        return f"Sub-query '{sub_query}': reached turn limit without completing. Partial context gathered."

    async def _post_tool_message(
        self,
        task_id: str,
        agent_index: int,
        tool_name: str,
        tool_input: dict,
    ) -> None:
        if tool_name == "search_web":
            detail = f'search: "{tool_input.get("query", "")}"'
        elif tool_name == "navigate":
            detail = f'navigate: {tool_input.get("url", "")}'
        elif tool_name == "click_element":
            detail = f'click: {tool_input.get("selector", "")}'
        else:
            detail = tool_name

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(
                author="agent",
                content=_tag(agent_index, detail),
            ),
        )

    async def _dispatch(self, tool_name: str, tool_use_id: str, tool_input: dict) -> str:
        if tool_name == "navigate":
            html = await workflow.execute_activity(
                "navigate",
                tool_input.get("url", ""),
                **IO_ACTIVITY_OPTIONS,
            )
            return await workflow.execute_activity(
                "extract_page_content",
                html,
                start_to_close_timeout=timedelta(seconds=30),
            )

        if tool_name == "search_web":
            return await workflow.execute_activity(
                "search_web",
                args=[
                    tool_input.get("query", ""),
                    tool_input.get("max_results", 5),
                ],
                **IO_ACTIVITY_OPTIONS,
            )

        if tool_name == "click_element":
            return await workflow.execute_activity(
                "click_element",
                tool_input.get("selector", ""),
                **IO_ACTIVITY_OPTIONS,
            )

        return f"Error: tool '{tool_name}' not dispatched."
