"""
Temporal worker bootstrap — full Oumuamua ecosystem.

Research pipeline:  ResearchOrchestrator → Scout → Analysts → Critic → Verifiers → Synthesizer
Execution pipeline: ExecutionOrchestrator → Scout → Analyst → TaskPlanner → Executor → Verifier

Same worker. Same queue. Same Agentex stack.
"""
import asyncio
import os

from agentex.lib.core.temporal.activities import get_all_activities
from agentex.lib.core.temporal.workers.worker import AgentexWorker
from agentex.lib.utils.logging import make_logger
from agentex.lib.environment_variables import EnvironmentVariables

# Workflows — research pipeline
from workflows.research_orchestrator import ResearchOrchestrator
from workflows.scout_agent import ScoutAgent
from workflows.analyst_agent import AnalystAgent
from workflows.verifier_agent import VerifierAgent

# Workflows — execution pipeline
from workflows.execution_orchestrator import ExecutionOrchestrator
from workflows.executor_agent import ExecutorAgent

# Workflows — legacy
from workflows.browse_subagent import BrowseSubAgent

# Activities — core browser + search
from activities.browser import navigate, click_element, close_browser
from activities.search import search_web
from activities.extract import extract_page_content, summarize_results
from activities.planner_activity import plan_next_step

# Activities — Phase 1 (Scout + Analyst)
from activities.strategist_activity import plan_research_strategy
from activities.scout_planner_activity import plan_scout_step
from activities.analyst_planner_activity import plan_analyst_step
from activities.synthesize_activity import synthesize_from_claims, synthesize_chunks

# Activities — Phase 2 (Critic + Verifier)
from activities.critic_activity import run_critic
from activities.verifier_planner_activity import plan_verifier_step

# Activities — Phase 3 (Execution)
from activities.browser_actions import fill_input, submit_form, get_page_structure, wait_for_element
from activities.http_request_activity import http_request
from activities.task_planner_activity import plan_task

# Activities — legacy
from activities.decomposer_activity import decompose_query
from activities.subagent_planner_activity import plan_subagent_step

logger = make_logger(__name__)


async def main():
    env = EnvironmentVariables.refresh()

    task_queue = env.WORKFLOW_TASK_QUEUE or os.getenv("WORKFLOW_TASK_QUEUE", "web_scout_queue")

    custom_activities = [
        # Core browser + search
        plan_next_step,
        navigate,
        click_element,
        close_browser,
        search_web,
        extract_page_content,
        summarize_results,
        # Phase 1: Scout + Analyst
        plan_research_strategy,
        plan_scout_step,
        plan_analyst_step,
        synthesize_from_claims,
        # Phase 2: Critic + Verifier
        run_critic,
        plan_verifier_step,
        # Phase 3: Execution
        fill_input,
        submit_form,
        get_page_structure,
        wait_for_element,
        http_request,
        plan_task,
        # Legacy
        decompose_query,
        plan_subagent_step,
        synthesize_chunks,
    ]

    all_activities = get_all_activities() + custom_activities

    # Concurrency: research (8 analysts + 3 verifiers) + execution (executors + planners) + overhead
    worker = AgentexWorker(
        task_queue=task_queue,
        max_workers=80,
        max_concurrent_activities=80,
    )

    logger.info(f"starting_worker task_queue={task_queue}")
    await worker.run(
        activities=all_activities,
        workflows=[
            # Research pipeline
            ResearchOrchestrator,
            ScoutAgent,
            AnalystAgent,
            VerifierAgent,
            # Execution pipeline
            ExecutionOrchestrator,
            ExecutorAgent,
            # Legacy
            BrowseSubAgent,
        ],
    )


if __name__ == "__main__":
    asyncio.run(main())
