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
_TOOL_RESULT_MAX_CHARS = 800    # hard cap on any single tool result
_SUMMARIZE_AFTER_TURNS = 6      # compress history every N assistant turns
_KEEP_RECENT_TURNS = 3          # always keep last N turn-pairs fresh


# ── 1. Tool result truncation ─────────────────────────────────────────────────

def _truncate_text(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "\n[truncated]"


def _cap_tool_result(block: dict[str, Any]) -> dict[str, Any]:
    if block.get("type") != "tool_result":
        return block
    content = block.get("content", "")
    if isinstance(content, str):
        return {**block, "content": _truncate_text(content, _TOOL_RESULT_MAX_CHARS)}
    if isinstance(content, list):
        capped = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                capped.append({**item, "text": _truncate_text(item["text"], _TOOL_RESULT_MAX_CHARS)})
            else:
                capped.append(item)
        return {**block, "content": capped}
    return block


def _cap_all_tool_results(context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for msg in context:
        if msg.get("role") != "user" or not isinstance(msg.get("content"), list):
            result.append(msg)
            continue
        result.append({**msg, "content": [
            _cap_tool_result(b) if isinstance(b, dict) else b
            for b in msg["content"]
        ]})
    return result


# ── 2. Consume already-processed read_file results ────────────────────────────

def _consume_read_results(context: list[dict[str, Any]], keep_last: int = 1) -> list[dict[str, Any]]:
    """Replace old read_file results with a consumed marker — keep only the last `keep_last`."""
    read_ids: list[str] = []
    for msg in context:
        if msg.get("role") != "assistant":
            continue
        for block in (msg.get("content") or []):
            if isinstance(block, dict) and block.get("type") == "tool_use" and block.get("name") == "read_file":
                read_ids.append(block["id"])

    consume = set(read_ids[:-keep_last] if keep_last > 0 else read_ids)
    if not consume:
        return context

    result = []
    for msg in context:
        if msg.get("role") != "user" or not isinstance(msg.get("content"), list):
            result.append(msg)
            continue
        new_blocks = []
        for block in msg["content"]:
            if isinstance(block, dict) and block.get("type") == "tool_result" and block.get("tool_use_id") in consume:
                new_blocks.append({
                    "type": "tool_result",
                    "tool_use_id": block["tool_use_id"],
                    "content": "[file content consumed]",
                })
            else:
                new_blocks.append(block)
        result.append({**msg, "content": new_blocks})
    return result


# ── 3. Periodic summarization ─────────────────────────────────────────────────

def _extract_tool_actions(context: list[dict[str, Any]]) -> dict[str, list[str]]:
    written: list[str] = []
    read: list[str] = []
    run: list[str] = []
    for msg in context:
        if msg.get("role") != "assistant":
            continue
        for block in (msg.get("content") or []):
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            name = block.get("name", "")
            path = block.get("input", {}).get("path") or block.get("input", {}).get("command", "")
            if name in ("write_file", "patch_file"):
                written.append(path)
            elif name == "read_file":
                read.append(path)
            elif name == "run_command":
                run.append(path)
    return {"written": written, "read": read, "run": run}


def _compress_context(context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """After SUMMARIZE_AFTER_TURNS turns, collapse middle history into a compact summary."""
    assistant_turns = sum(1 for m in context if m.get("role") == "assistant")
    if assistant_turns < _SUMMARIZE_AFTER_TURNS:
        return context

    actions = _extract_tool_actions(context)
    parts = []
    if actions["written"]:
        # dedupe preserving order
        seen: dict[str, None] = {}
        for p in actions["written"]:
            seen[p] = None
        parts.append("Written/patched: " + ", ".join(seen))
    if actions["read"]:
        seen2: dict[str, None] = {}
        for p in actions["read"]:
            seen2[p] = None
        parts.append("Read: " + ", ".join(seen2))
    if actions["run"]:
        parts.append("Commands: " + ", ".join(actions["run"]))

    summary = "[Progress — " + ". ".join(parts) + ".]" if parts else "[No file operations yet.]"

    tail = context[-(_KEEP_RECENT_TURNS * 2):]
    return [context[0], {"role": "user", "content": summary}] + tail


# ── Cacheable task prompt ─────────────────────────────────────────────────────

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
        ctx = _consume_read_results(context)
        ctx = _compress_context(ctx)
        ctx = _cap_all_tool_results(ctx)
        messages = ctx

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
