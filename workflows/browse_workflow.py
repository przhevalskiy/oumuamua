"""
BrowseWorkflow — Temporal Workflow definition.
This file ONLY handles Temporal orchestration. No business logic. No LLM calls. (I1)
"""
from __future__ import annotations

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
    from project.config import MAX_AGENT_TURNS, MAX_PAGES_PER_TASK
    from project.planner import _extract_task_prompt
    from project.tools import VALID_TOOL_NAMES

environment_variables = EnvironmentVariables.refresh()

logger = structlog.get_logger(__name__)

# Activity options for I/O activities — retryable (I8)
IO_ACTIVITY_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=3),
}

# LLM planning activity — longer timeout, retryable
PLANNER_ACTIVITY_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=120),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}

# Activity name constants
ACTIVITY_PLAN_NEXT_STEP = "plan_next_step"
ACTIVITY_NAVIGATE = "navigate"
ACTIVITY_SEARCH_WEB = "search_web"
ACTIVITY_EXTRACT_PAGE_CONTENT = "extract_page_content"
ACTIVITY_CLICK_ELEMENT = "click_element"
ACTIVITY_CLOSE_BROWSER = "close_browser"


@workflow.defn(name="web-scout")
class BrowseWorkflow(BaseWorkflow):
    """
    Agentic browser workflow.
    on_task_create drives the full planner → activity loop.
    on_task_event_send handles follow-up user messages (acknowledged only for now).
    """

    def __init__(self):
        super().__init__(display_name="web-scout")

    @workflow.signal(name=SignalName.RECEIVE_EVENT)
    async def on_task_event_send(self, params: SendEventParams) -> None:
        logger.info("received_event", task_id=params.task.id)
        await adk.messages.create(
            task_id=params.task.id,
            content=TextContent(
                author="agent",
                content="I'm currently working on your task. Please wait for the result.",
            ),
        )

    @workflow.run
    async def on_task_create(self, params: CreateTaskParams) -> str:
        task_id = params.task.id
        task_prompt = _extract_task_prompt(params.params)
        log = logger.bind(task_id=task_id)

        log.info("task_started", prompt_length=len(task_prompt))

        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content="Planning your task..."),
        )

        context: list[dict] = []
        pages_visited = 0
        visited_urls: list[str] = []
        searched: bool = False

        for turn in range(MAX_AGENT_TURNS):
            if pages_visited >= MAX_PAGES_PER_TASK:
                log.warning("page_cap_reached", pages=pages_visited)
                visited_list = "\n".join(f"- {u}" for u in visited_urls)
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(
                        author="agent",
                        content="Reached the maximum number of pages. Synthesizing from gathered information...",
                    ),
                )
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "text",
                        "text": (
                            f"You have reached the maximum number of pages. "
                            f"You visited these sources:\n{visited_list}\n\n"
                            "Call finish() now with a structured answer citing these URLs."
                        ),
                    }],
                }]

            # LLM planning happens in an activity — never directly in the workflow (I1)
            raw = await workflow.execute_activity(
                ACTIVITY_PLAN_NEXT_STEP,
                args=[task_prompt, context],
                **PLANNER_ACTIVITY_OPTIONS,
            )

            context = raw["context"]

            if raw["type"] == "final":
                answer = raw["answer"]
                log.info("task_finished", turn=turn, answer_length=len(answer))
                await workflow.execute_activity(
                    ACTIVITY_CLOSE_BROWSER,
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
                await adk.messages.create(
                    task_id=task_id,
                    content=TextContent(author="agent", content=answer),
                )
                return answer

            if raw["type"] == "error":
                log.warning("planner_error", message=raw.get("message"))
                break

            # raw["type"] == "step"
            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in VALID_TOOL_NAMES:
                log.warning("unknown_tool", tool=tool_name)
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": f"Unknown tool '{tool_name}'. Use one of: {', '.join(sorted(VALID_TOOL_NAMES))}",
                    }],
                }]
                continue

            await adk.messages.create(
                task_id=task_id,
                content=TextContent(
                    author="agent",
                    content=f"Using tool: {tool_name}...",
                ),
            )

            log.info("dispatching_activity", tool=tool_name, turn=turn)

            # Enforce search before navigate — blocks cold navigation without context
            if tool_name == "navigate" and not searched:
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": "Use search_web first to find relevant sources, then navigate to the most promising ones.",
                    }],
                }]
                log.warning("navigate_blocked_before_search")
                continue

            if tool_name == "search_web":
                searched = True

            tool_result = await self._dispatch_activity(tool_name, tool_use_id, tool_input)

            if tool_name in ("navigate", "click_element"):
                pages_visited += 1

            if tool_name == "navigate":
                url = tool_input.get("url", "")
                if url and url not in visited_urls:
                    visited_urls.append(url)

            context = context + [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": str(tool_result),
                }],
            }]

        log.warning("max_turns_exceeded", max_turns=MAX_AGENT_TURNS)
        fallback = "Reached the maximum number of reasoning steps. Here is what I gathered so far."
        await workflow.execute_activity(
            ACTIVITY_CLOSE_BROWSER,
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        await adk.messages.create(
            task_id=task_id,
            content=TextContent(author="agent", content=fallback),
        )
        return fallback

    async def _dispatch_activity(self, tool_name: str, tool_use_id: str, tool_input: dict) -> str:
        if tool_name == "navigate":
            html = await workflow.execute_activity(
                ACTIVITY_NAVIGATE,
                tool_input.get("url", ""),
                **IO_ACTIVITY_OPTIONS,
            )
            # Pipe raw HTML through extract_page_content before returning to Claude (I7)
            return await workflow.execute_activity(
                ACTIVITY_EXTRACT_PAGE_CONTENT,
                html,
                start_to_close_timeout=timedelta(seconds=30),
            )

        if tool_name == "search_web":
            return await workflow.execute_activity(
                ACTIVITY_SEARCH_WEB,
                args=[
                    tool_input.get("query", ""),
                    tool_input.get("max_results", 5),
                ],
                **IO_ACTIVITY_OPTIONS,
            )

        if tool_name == "extract_page_content":
            return await workflow.execute_activity(
                ACTIVITY_EXTRACT_PAGE_CONTENT,
                tool_input.get("html", ""),
                start_to_close_timeout=timedelta(seconds=30),
            )

        if tool_name == "click_element":
            return await workflow.execute_activity(
                ACTIVITY_CLICK_ELEMENT,
                tool_input.get("selector", ""),
                **IO_ACTIVITY_OPTIONS,
            )

        logger.warning("dispatch_unknown_tool", tool=tool_name)
        return f"Error: tool '{tool_name}' has no registered activity."
