"""LLM planning layer — Claude tool-use loop for swarm agents."""
from __future__ import annotations

import asyncio
import json
import structlog
from dataclasses import dataclass
from typing import Any

import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from project.rate_limit_config import (
    get_rate_config, get_rate_tracker, log_rate_limit_warning, 
    log_rate_limit_hit, log_rate_limit_recovery
)

logger = structlog.get_logger(__name__)

_DEFAULT_SYSTEM = (
    "You are a specialist agent in a durable software engineering swarm. "
    "Use the tools available to complete your assigned task. "
    "Call exactly ONE tool per response."
)


@dataclass
class PlannerStep:
    tool_name: str
    tool_use_id: str
    tool_input: dict[str, Any]


@dataclass
class FinalAnswer:
    answer: str


class PlannerError(Exception):
    """Raised when the planner cannot complete a step (rate limit exhausted, API error, etc.)."""
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


PlannerResult = PlannerStep | FinalAnswer | PlannerError

# Global semaphore — cap concurrent Claude calls across all activities in this worker
_LLM_SEMAPHORE = asyncio.Semaphore(4)


def _extract_task_prompt(params: dict | None) -> str:
    """Extract the user's goal string from task params."""
    if not params:
        return "No task prompt provided."
    return (
        params.get("prompt")
        or params.get("content")
        or params.get("query")
        or str(params)
    )
_PROMPT_CACHE_BETA = "prompt-caching-2024-07-31"
_MAX_CONTEXT_CHARS = 200000
_MAX_CONTEXT_TURNS = 10
_RECENT_TURNS_TO_KEEP = 5
_TOOL_RESULT_MAX_CHARS = 4000


def _estimate_chars(value: Any) -> int:
    if isinstance(value, str):
        return len(value)
    try:
        return len(json.dumps(value, ensure_ascii=False))
    except Exception:
        return len(str(value))


def _truncate_text(text: str, limit: int, suffix: str) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + suffix


def _trim_block(block: dict[str, Any], limit: int = _TOOL_RESULT_MAX_CHARS) -> dict[str, Any]:
    block_type = block.get("type")
    if block_type == "tool_result":
        trimmed = dict(block)
        content = trimmed.get("content")
        if isinstance(content, str):
            trimmed["content"] = _truncate_text(
                content,
                limit,
                "\n\n[Older tool output truncated to reduce token usage.]",
            )
        elif isinstance(content, list):
            new_content: list[Any] = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    new_item = dict(item)
                    new_item["text"] = _truncate_text(
                        item["text"],
                        limit,
                        "\n\n[Older tool output truncated to reduce token usage.]",
                    )
                    new_content.append(new_item)
                elif isinstance(item, str):
                    new_content.append(_truncate_text(
                        item,
                        limit,
                        "\n\n[Older tool output truncated to reduce token usage.]",
                    ))
                else:
                    new_content.append(item)
            trimmed["content"] = new_content
        return trimmed
    if block_type == "text" and isinstance(block.get("text"), str):
        trimmed = dict(block)
        trimmed["text"] = _truncate_text(
            block["text"],
            limit,
            "\n\n[Older planner context truncated to reduce token usage.]",
        )
        return trimmed
    return block


def _trim_message(message: dict[str, Any], preserve_full: bool) -> dict[str, Any]:
    if preserve_full:
        return message
    trimmed_message = dict(message)
    content = trimmed_message.get("content")
    if isinstance(content, str):
        trimmed_message["content"] = _truncate_text(
            content,
            _TOOL_RESULT_MAX_CHARS,
            "\n\n[Older planner context truncated to reduce token usage.]",
        )
        return trimmed_message
    if isinstance(content, list):
        trimmed_message["content"] = [
            _trim_block(block) if isinstance(block, dict) else block
            for block in content
        ]
    return trimmed_message


def _trim_context(messages: list[dict[str, Any]], task_prompt: str) -> list[dict[str, Any]]:
    if not messages:
        return [{"role": "user", "content": task_prompt}]

    working = list(messages)
    if not working or working[0].get("role") != "user":
        working = [{"role": "user", "content": task_prompt}] + working

    if len(working) <= _MAX_CONTEXT_TURNS:
        recent_context = working
    else:
        preserved_head = working[:1]
        recent_tail = working[-(_RECENT_TURNS_TO_KEEP * 2):]
        middle = working[1: len(working) - len(recent_tail)]
        trimmed_middle = [_trim_message(message, preserve_full=False) for message in middle]
        recent_context = preserved_head + trimmed_middle + recent_tail

    while _estimate_chars(recent_context) > _MAX_CONTEXT_CHARS and len(recent_context) > 1:
        if len(recent_context) > 1 + (_RECENT_TURNS_TO_KEEP * 2):
            del recent_context[1]
            continue
        candidate_index = 1
        candidate = recent_context[candidate_index]
        recent_context[candidate_index] = _trim_message(candidate, preserve_full=False)
        if _estimate_chars(recent_context[candidate_index]) >= _estimate_chars(candidate):
            break

    return recent_context


def _cacheable_task_prompt(task_prompt: str) -> list[dict[str, Any]]:
    return [{
        "type": "text",
        "text": task_prompt,
        "cache_control": {"type": "ephemeral"},
    }]


async def _make_claude_request(client, kwargs: dict[str, Any]) -> Any:
    """Make Claude API request with concurrency cap, token tracking, and exponential backoff."""
    config = get_rate_config()
    tracker = get_rate_tracker()

    if tracker.is_near_limit(config):
        log_rate_limit_warning()

    retry_count = 0
    delay = config.initial_retry_delay

    async with _LLM_SEMAPHORE:
        while retry_count <= config.max_retries:
            try:
                response = await client.messages.create(
                    extra_headers={"anthropic-beta": _PROMPT_CACHE_BETA},
                    **kwargs,
                )

                if hasattr(response, 'usage'):
                    tracker.add_tokens(
                        response.usage.input_tokens,
                        response.usage.output_tokens,
                    )
                if retry_count > 0:
                    log_rate_limit_recovery()
                return response

            except anthropic.RateLimitError as e:
                retry_count += 1
                if retry_count > config.max_retries:
                    logger.error("rate_limit_max_retries_exceeded", retries=retry_count, error=str(e))
                    raise PlannerError(f"Rate limit exhausted after {retry_count} retries: {e}")
                log_rate_limit_hit(retry_count, delay, str(e))
                await asyncio.sleep(delay)
                delay = min(delay * 2, config.max_retry_delay)

            except anthropic.APIError as e:
                logger.error("claude_api_error", error=str(e), type=type(e).__name__)
                raise PlannerError(f"Claude API error: {e}")

            except Exception as e:
                logger.error("unexpected_planner_error", error=str(e), type=type(e).__name__)
                raise PlannerError(f"Unexpected error: {e}")

    raise PlannerError(f"Failed after {config.max_retries} retries")


async def next_step(
    task_prompt: str,
    context: list[dict],
    tools: list[dict] | None = None,
    system_prompt: str | None = None,
    model: str = CLAUDE_MODEL,
) -> tuple[PlannerResult, list[dict]]:
    """
    Make one Claude API call and return the next step plus the updated context.
    Context is never mutated in place — a new list is always returned.
    """
    if not context:
        messages: list[dict] = [{"role": "user", "content": _cacheable_task_prompt(task_prompt)}]
    else:
        messages = _trim_context(context, task_prompt)

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    system = system_prompt or _DEFAULT_SYSTEM
    system_payload: list[dict[str, Any]] = [{
        "type": "text",
        "text": system,
        "cache_control": {"type": "ephemeral"},
    }]

    log = logger.bind(turn=len([m for m in messages if m["role"] == "assistant"]) + 1)
    log.info("planner_call", model=model, message_count=len(messages))

    kwargs: dict[str, Any] = dict(
        model=model,
        max_tokens=8192,
        system=system_payload,
        messages=messages,
    )
    if tools:
        kwargs["tools"] = tools

    response = await _make_claude_request(client, kwargs)

    log.info(
        "planner_response",
        stop_reason=response.stop_reason,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    def _serialize(b) -> dict:
        if b.type == "text":
            return {"type": "text", "text": b.text}
        if b.type == "tool_use":
            return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
        return b.model_dump(exclude_none=True)

    assistant_msg = {"role": "assistant", "content": [_serialize(b) for b in response.content]}
    new_context = messages + [assistant_msg]

    if response.stop_reason == "end_turn":
        text_parts = [b.text for b in response.content if hasattr(b, "text")]
        return FinalAnswer(answer=" ".join(text_parts) or "Task complete."), new_context

    if response.stop_reason == "tool_use":
        tool_blocks = [b for b in response.content if b.type == "tool_use"]
        first = tool_blocks[0] if tool_blocks else None

        # Stub out any extra parallel tool calls so context stays valid
        if len(tool_blocks) > 1:
            stubs = [
                {"type": "tool_result", "tool_use_id": b.id,
                 "content": "Skipped: only one tool call per turn is supported."}
                for b in tool_blocks[1:]
            ]
            new_context = new_context + [{"role": "user", "content": stubs}]

        if first:
            if first.name == "finish":
                return FinalAnswer(answer=first.input.get("answer", "Task complete.")), new_context
            return PlannerStep(
                tool_name=first.name,
                tool_use_id=first.id,
                tool_input=first.input,
            ), new_context

    return FinalAnswer(answer="Task complete (unexpected stop reason)."), new_context
