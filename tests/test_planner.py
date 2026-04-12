"""
Tests for project/planner.py.
Uses mocked Anthropic client — zero real API calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from project.planner import next_step, plan, PlannerStep, FinalAnswer


def _make_response(stop_reason: str, blocks: list) -> MagicMock:
    response = MagicMock()
    response.stop_reason = stop_reason
    response.content = blocks
    response.usage.input_tokens = 100
    response.usage.output_tokens = 50
    return response


def _tool_use_block(name: str, tool_id: str, input_data: dict) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.name = name
    block.id = tool_id
    block.input = input_data
    block.model_dump.return_value = {"type": "tool_use", "name": name, "id": tool_id, "input": input_data}
    return block


def _text_block(text: str) -> MagicMock:
    block = MagicMock()
    block.type = "text"
    block.text = text
    block.model_dump.return_value = {"type": "text", "text": text}
    return block


@pytest.fixture
def mock_anthropic():
    with patch("project.planner.anthropic.AsyncAnthropic") as mock_class:
        client = AsyncMock()
        mock_class.return_value = client
        yield client


@pytest.mark.asyncio
async def test_next_step_returns_planner_step_on_tool_use(mock_anthropic):
    tool_block = _tool_use_block("search_web", "tu_001", {"query": "Scale AI"})
    mock_anthropic.messages.create = AsyncMock(
        return_value=_make_response("tool_use", [tool_block])
    )

    result, new_context = await next_step("Find info about Scale AI", [])

    assert isinstance(result, PlannerStep)
    assert result.tool_name == "search_web"
    assert result.tool_use_id == "tu_001"
    assert result.tool_input == {"query": "Scale AI"}
    assert len(new_context) == 2  # user + assistant


@pytest.mark.asyncio
async def test_next_step_returns_final_answer_on_finish_tool(mock_anthropic):
    finish_block = _tool_use_block("finish", "tu_002", {"answer": "The answer is 42."})
    mock_anthropic.messages.create = AsyncMock(
        return_value=_make_response("tool_use", [finish_block])
    )

    result, _ = await next_step("What is the answer?", [])

    assert isinstance(result, FinalAnswer)
    assert result.answer == "The answer is 42."


@pytest.mark.asyncio
async def test_next_step_returns_final_answer_on_end_turn(mock_anthropic):
    text_block = _text_block("Here is the result.")
    mock_anthropic.messages.create = AsyncMock(
        return_value=_make_response("end_turn", [text_block])
    )

    result, _ = await next_step("Summarize this.", [])

    assert isinstance(result, FinalAnswer)
    assert "result" in result.answer


@pytest.mark.asyncio
async def test_context_immutability(mock_anthropic):
    tool_block = _tool_use_block("navigate", "tu_003", {"url": "https://example.com"})
    mock_anthropic.messages.create = AsyncMock(
        return_value=_make_response("tool_use", [tool_block])
    )

    original_context: list = []
    _, new_context = await next_step("Browse a page", original_context)

    assert original_context == []  # must not be mutated (I3)
    assert len(new_context) == 2


@pytest.mark.asyncio
async def test_plan_terminates_on_max_turns(mock_anthropic):
    tool_block = _tool_use_block("search_web", "tu_004", {"query": "something"})
    mock_anthropic.messages.create = AsyncMock(
        return_value=_make_response("tool_use", [tool_block])
    )

    with patch("project.planner.MAX_AGENT_TURNS", 3):
        steps, _ = await plan("Keep searching forever", [])

    # Should have 3 PlannerSteps + 1 FinalAnswer (the graceful fallback)
    assert isinstance(steps[-1], FinalAnswer)
    assert len(steps) == 4  # 3 steps + 1 fallback


@pytest.mark.asyncio
async def test_plan_terminates_early_on_finish(mock_anthropic):
    finish_block = _tool_use_block("finish", "tu_005", {"answer": "Done!"})
    mock_anthropic.messages.create = AsyncMock(
        return_value=_make_response("tool_use", [finish_block])
    )

    steps, _ = await plan("Quick task", [])

    assert len(steps) == 1
    assert isinstance(steps[0], FinalAnswer)
    assert steps[0].answer == "Done!"
