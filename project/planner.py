"""
LLM planning layer — Claude tool-use loop.
Zero Playwright code. Zero Temporal code. Zero Agentex SDK imports. (I1)
"""
from __future__ import annotations

import structlog
from dataclasses import dataclass
from typing import Any

import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, MAX_AGENT_TURNS
from project.tools import TOOLS

logger = structlog.get_logger(__name__)


@dataclass
class PlannerStep:
    """A single tool call the planner wants to execute."""
    tool_name: str
    tool_use_id: str
    tool_input: dict[str, Any]


@dataclass
class FinalAnswer:
    """The planner has finished and produced a synthesized answer."""
    answer: str


@dataclass
class PlannerError:
    """The planner hit MAX_AGENT_TURNS without resolving."""
    message: str


PlannerResult = PlannerStep | FinalAnswer | PlannerError


def _build_system_prompt() -> str:
    return (
        "You are a thorough web research agent. Given a task, you use the available tools to "
        "browse the web, search for information, and synthesize a comprehensive final answer. "
        "RESEARCH RULES:\n"
        "1. Always search before navigating. Use search_web first to find relevant sources.\n"
        "2. Visit at least 3 distinct sources before calling finish().\n"
        "3. Search from multiple angles — try different query phrasings to find more sources.\n"
        "4. When sources contradict each other, note the contradiction and seek a third source.\n"
        "5. Never call finish() before visiting at least 3 pages.\n"
        "6. Never pass raw HTML to your reasoning — only work with extracted text.\n"
        "IMPORTANT: Call exactly ONE tool per response. Never call multiple tools simultaneously."
    )


def _extract_task_prompt(params: dict | None) -> str:
    """Extract the user's query string from task params."""
    if not params:
        return "No task prompt provided."
    return (
        params.get("prompt")
        or params.get("content")
        or params.get("query")
        or str(params)
    )


async def next_step(
    task_prompt: str,
    context: list[dict],
    tools: list[dict] | None = None,
) -> tuple[PlannerResult, list[dict]]:
    """
    Make one Claude API call and return the next step plus the updated context.

    Args:
        task_prompt: The user's original task prompt.
        context: The current message history (immutable — a new list is returned).

    Returns:
        (result, new_context) where result is PlannerStep, FinalAnswer, or PlannerError.

    Invariant I3: context is never mutated in place.
    Invariant I8: No retry logic here — if the Claude call raises, let it propagate.
    """
    # Build messages list — first call has only the user message
    if not context:
        research_guidance = (
            f"{task_prompt}\n\n"
            "Research instructions:\n"
            "- Begin with search_web to find multiple relevant sources\n"
            "- Visit at least 3 distinct sources before synthesizing\n"
            "- Try different search queries to get multiple perspectives\n"
            "- Cite specific URLs in your final answer"
        )
        messages: list[dict] = [{"role": "user", "content": research_guidance}]
    else:
        messages = context

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    log = logger.bind(turn=len([m for m in messages if m["role"] == "assistant"]) + 1)
    log.info("planner_call", model=CLAUDE_MODEL, message_count=len(messages))

    active_tools = tools if tools is not None else TOOLS
    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=8192,
        system=_build_system_prompt(),
        tools=active_tools,
        messages=messages,
    )

    log.info(
        "planner_response",
        stop_reason=response.stop_reason,
        content_blocks=len(response.content),
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    # Append assistant message to context (I3: new list, no mutation)
    # Build content blocks explicitly — model_dump() includes SDK-internal fields
    # (citations, caller) that Anthropic rejects when sent back in messages.
    def _serialize_block(b) -> dict:
        if b.type == "text":
            return {"type": "text", "text": b.text}
        if b.type == "tool_use":
            return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
        return b.model_dump(exclude_none=True)

    assistant_message = {
        "role": "assistant",
        "content": [_serialize_block(b) for b in response.content],
    }
    new_context = messages + [assistant_message]

    if response.stop_reason == "end_turn":
        # Extract text from response
        text_parts = [b.text for b in response.content if hasattr(b, "text")]
        answer = " ".join(text_parts) if text_parts else "Task complete."
        return FinalAnswer(answer=answer), new_context

    if response.stop_reason == "tool_use":
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

        # If Claude batched multiple tool calls despite instructions, add stub tool_results
        # for all but the first so the context stays valid for the next API call.
        first_block = tool_use_blocks[0] if tool_use_blocks else None
        extra_blocks = tool_use_blocks[1:]

        if extra_blocks:
            log.warning("parallel_tool_calls_detected", count=len(tool_use_blocks))
            stub_results = [
                {"type": "tool_result", "tool_use_id": b.id, "content": "Skipped: only one tool call per turn is supported."}
                for b in extra_blocks
            ]
            # Append a user message with stub results so context is valid
            new_context = new_context + [{"role": "user", "content": stub_results}]

        if first_block:
            if first_block.name == "finish":
                answer = first_block.input.get("answer", "Task complete.")
                log.info("planner_finish", answer_length=len(answer))
                return FinalAnswer(answer=answer), new_context
            return PlannerStep(
                tool_name=first_block.name,
                tool_use_id=first_block.id,
                tool_input=first_block.input,
            ), new_context

    # Unexpected stop reason
    return FinalAnswer(answer="Task complete (unexpected stop reason)."), new_context


async def plan(
    task_prompt: str,
    initial_context: list[dict] | None = None,
) -> tuple[list[PlannerStep | FinalAnswer], list[dict]]:
    """
    Run the full planner loop, yielding each step for the caller to execute.
    Hard-stops after MAX_AGENT_TURNS.

    This function is used only in tests and standalone contexts.
    In production, the workflow drives the loop step-by-step via next_step().
    """
    context: list[dict] = list(initial_context) if initial_context else []
    steps: list[PlannerStep | FinalAnswer] = []

    for turn in range(MAX_AGENT_TURNS):
        result, context = await next_step(task_prompt, context)
        steps.append(result)

        if isinstance(result, FinalAnswer):
            return steps, context

        logger.info("planner_step", turn=turn, tool=result.tool_name)

    # Exceeded MAX_AGENT_TURNS — return what we have
    logger.warning("planner_max_turns_exceeded", max_turns=MAX_AGENT_TURNS)
    steps.append(FinalAnswer(answer="Reached maximum turns without a final answer."))
    return steps, context
