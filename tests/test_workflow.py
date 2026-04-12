"""
Tests for workflows/browse_workflow.py.
Mocks all activities and the planner's next_step function.
Does NOT use Temporal's WorkflowEnvironment (requires Java server binary).
Instead tests the workflow logic directly by calling on_task_create with mocked dependencies.
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from agentex.lib.types.acp import CreateTaskParams
from agentex.types.task import Task
from agentex.types.agent import Agent


def _make_agent() -> Agent:
    now = datetime(2026, 1, 1)
    return Agent(
        id="agent-001",
        acp_type="agentic",
        created_at=now,
        updated_at=now,
        description="web-scout test agent",
        name="web-scout",
    )


def _make_create_params(prompt: str = "Search for Scale AI news") -> CreateTaskParams:
    task = Task(id="task-001", params={"prompt": prompt})
    return CreateTaskParams(
        agent=_make_agent(),
        task=task,
        params={"prompt": prompt},
    )


@pytest.fixture
def mock_adk_messages():
    with patch("workflows.browse_workflow.adk.messages.create", new_callable=AsyncMock) as mock:
        yield mock


@pytest.fixture
def mock_next_step():
    with patch("workflows.browse_workflow.next_step", new_callable=AsyncMock) as mock:
        yield mock


@pytest.fixture
def mock_execute_activity():
    with patch("workflows.browse_workflow.workflow.execute_activity", new_callable=AsyncMock) as mock:
        yield mock


@pytest.mark.asyncio
async def test_workflow_completes_on_final_answer(mock_adk_messages, mock_next_step, mock_execute_activity):
    from project.planner import FinalAnswer
    from workflows.browse_workflow import BrowseWorkflow

    mock_next_step.return_value = (FinalAnswer(answer="Here is the answer."), [])

    wf = BrowseWorkflow()
    result = await wf.on_task_create(_make_create_params())

    assert result == "Here is the answer."
    mock_adk_messages.assert_called()


@pytest.mark.asyncio
async def test_workflow_dispatches_search_then_finishes(mock_adk_messages, mock_next_step, mock_execute_activity):
    from project.planner import PlannerStep, FinalAnswer
    from workflows.browse_workflow import BrowseWorkflow

    search_step = PlannerStep(
        tool_name="search_web",
        tool_use_id="tu_001",
        tool_input={"query": "Scale AI", "max_results": 5},
    )
    final = FinalAnswer(answer="Scale AI is a data company.")

    mock_execute_activity.return_value = '[{"title": "Scale AI", "url": "https://scale.com", "snippet": "AI company"}]'
    mock_next_step.side_effect = [
        (search_step, [{"role": "user", "content": "Search for Scale AI news"}]),
        (final, [{"role": "user", "content": "Search for Scale AI news"}, {"role": "assistant", "content": []}]),
    ]

    wf = BrowseWorkflow()
    result = await wf.on_task_create(_make_create_params())

    assert result == "Scale AI is a data company."
    mock_execute_activity.assert_called_once()


@pytest.mark.asyncio
async def test_workflow_skips_unknown_tool(mock_adk_messages, mock_next_step, mock_execute_activity):
    from project.planner import PlannerStep, FinalAnswer
    from workflows.browse_workflow import BrowseWorkflow

    bad_step = PlannerStep(
        tool_name="invalid_tool",
        tool_use_id="tu_bad",
        tool_input={},
    )
    final = FinalAnswer(answer="Done despite bad tool.")

    mock_next_step.side_effect = [
        (bad_step, []),
        (final, []),
    ]

    wf = BrowseWorkflow()
    result = await wf.on_task_create(_make_create_params())

    # Should complete without crashing — unknown tool is skipped (G3)
    assert result == "Done despite bad tool."
    mock_execute_activity.assert_not_called()


@pytest.mark.asyncio
async def test_workflow_respects_max_agent_turns(mock_adk_messages, mock_next_step, mock_execute_activity):
    from project.planner import PlannerStep
    from workflows.browse_workflow import BrowseWorkflow

    nav_step = PlannerStep(
        tool_name="navigate",
        tool_use_id="tu_nav",
        tool_input={"url": "https://example.com"},
    )
    mock_execute_activity.return_value = "<html><body>content</body></html>"
    mock_next_step.return_value = (nav_step, [])

    with patch("workflows.browse_workflow.MAX_AGENT_TURNS", 3):
        wf = BrowseWorkflow()
        result = await wf.on_task_create(_make_create_params())

    # Should return fallback message, not raise
    assert isinstance(result, str)
    assert len(result) > 0


@pytest.mark.asyncio
async def test_workflow_respects_max_pages_per_task(mock_adk_messages, mock_next_step, mock_execute_activity):
    from project.planner import PlannerStep, FinalAnswer
    from workflows.browse_workflow import BrowseWorkflow

    nav_step = PlannerStep(
        tool_name="navigate",
        tool_use_id="tu_nav",
        tool_input={"url": "https://example.com"},
    )
    final = FinalAnswer(answer="Synthesized from gathered pages.")

    mock_execute_activity.return_value = "<html><body>page content</body></html>"

    call_count = 0

    async def side_effect(prompt, context):
        nonlocal call_count
        call_count += 1
        if call_count > 2:
            return final, context
        return nav_step, context

    mock_next_step.side_effect = side_effect

    with patch("workflows.browse_workflow.MAX_PAGES_PER_TASK", 1):
        wf = BrowseWorkflow()
        result = await wf.on_task_create(_make_create_params())

    assert isinstance(result, str)
