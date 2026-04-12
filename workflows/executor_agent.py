"""
ExecutorAgent — carries out a TaskPlan step by step.
No LLM in the execution loop. Pure deterministic dispatch.
Each step maps to a Temporal activity call.
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
    from project.task_schema import TaskPlan, TaskStep, TaskResult, ExecutionSummary

logger = structlog.get_logger(__name__)

IO_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=3),
}

HTTP_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=45),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}

# Tools that dispatch to browser activities
_BROWSER_TOOLS = {"navigate", "fill_input", "submit_form", "click_element",
                  "wait_for_element", "get_page_structure"}

# Tools that dispatch to http_request activity
_HTTP_TOOLS = {"http_request"}


@workflow.defn(name="ExecutorAgent")
class ExecutorAgent:
    """
    Executes a TaskPlan produced by the TaskPlanner.
    Returns JSON ExecutionSummary: {success, goal, completed_steps, failed_steps, summary}.
    """

    @workflow.run
    async def run(
        self,
        plan: dict,
        parent_task_id: str,
        executor_index: int,
    ) -> str:
        task_plan = TaskPlan(**plan)
        tag = f"[Executor {executor_index}]"
        log = logger.bind(parent_task_id=parent_task_id, executor_index=executor_index, steps=len(task_plan.steps))
        log.info("executor_started", goal=task_plan.goal[:80])

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content=f"{tag} Starting: {task_plan.goal}",
            ),
        )

        completed: list[TaskResult] = []
        failed: list[TaskResult] = []
        step_outputs: dict[int, str] = {}  # step_index → output string

        for i, step in enumerate(task_plan.steps):
            # Resolve depends_on — skip if a dependency failed
            dep_failed = any(
                any(f.step_index == dep for f in failed)
                for dep in step.depends_on
            )
            if dep_failed:
                result = TaskResult(
                    step_index=i,
                    tool=step.tool,
                    description=step.description,
                    success=False,
                    output="",
                    error="Skipped — dependency failed.",
                )
                failed.append(result)
                continue

            await adk.messages.create(
                task_id=parent_task_id,
                content=TextContent(
                    author="agent",
                    content=f"{tag} Step {i+1}/{len(task_plan.steps)}: {step.description}",
                ),
            )

            output, error = await self._execute_step(step, i)

            result = TaskResult(
                step_index=i,
                tool=step.tool,
                description=step.description,
                success=not bool(error),
                output=output,
                error=error,
            )

            if error:
                log.warning("step_failed", step=i, tool=step.tool, error=error[:80])
                failed.append(result)
            else:
                log.info("step_ok", step=i, tool=step.tool)
                completed.append(result)
                step_outputs[i] = output

        overall_success = len(failed) == 0
        summary_lines = [f"Goal: {task_plan.goal}", f"Completed {len(completed)}/{len(task_plan.steps)} steps."]
        if failed:
            summary_lines.append(f"Failed steps: {', '.join(str(f.step_index) for f in failed)}")

        summary = ExecutionSummary(
            success=overall_success,
            goal=task_plan.goal,
            completed_steps=completed,
            failed_steps=failed,
            summary=" ".join(summary_lines),
        )

        status = "done" if overall_success else f"partial ({len(failed)} failed)"
        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content=f"{tag} {status} — {summary.summary}",
            ),
        )

        return summary.model_dump_json()

    async def _execute_step(self, step: TaskStep, index: int) -> tuple[str, str]:
        """Dispatch a TaskStep to the correct Temporal activity. Returns (output, error)."""
        tool = step.tool
        args = step.args

        try:
            if tool == "navigate":
                result = await workflow.execute_activity(
                    "navigate",
                    args.get("url", ""),
                    **IO_OPTIONS,
                )
                # Run extract to get clean text
                output = await workflow.execute_activity(
                    "extract_page_content",
                    result,
                    start_to_close_timeout=timedelta(seconds=30),
                )
                return str(output)[:2000], ""

            if tool == "fill_input":
                result = await workflow.execute_activity(
                    "fill_input",
                    args=[args.get("selector", ""), args.get("value", "")],
                    **IO_OPTIONS,
                )
                return str(result), "" if "Error" not in str(result) else str(result)

            if tool == "submit_form":
                result = await workflow.execute_activity(
                    "submit_form",
                    args.get("selector", "form"),
                    **IO_OPTIONS,
                )
                return str(result), "" if "Error" not in str(result) else str(result)

            if tool == "click_element":
                result = await workflow.execute_activity(
                    "click_element",
                    args.get("selector", ""),
                    **IO_OPTIONS,
                )
                return f"Clicked: {result}", "" if result else "Element not found."

            if tool == "get_page_structure":
                result = await workflow.execute_activity(
                    "get_page_structure",
                    start_to_close_timeout=timedelta(seconds=30),
                )
                return str(result), ""

            if tool == "wait_for_element":
                result = await workflow.execute_activity(
                    "wait_for_element",
                    args=[args.get("selector", ""), args.get("timeout_ms", 5000)],
                    **IO_OPTIONS,
                )
                return ("Element found." if result else "Element not found (timeout)."), ""

            if tool == "http_request":
                result = await workflow.execute_activity(
                    "http_request",
                    args=[
                        args.get("method", "GET"),
                        args.get("url", ""),
                        args.get("headers"),
                        args.get("body"),
                    ],
                    **HTTP_OPTIONS,
                )
                if isinstance(result, dict):
                    ok = result.get("ok", False)
                    body = result.get("body", "")[:1000]
                    status = result.get("status", 0)
                    if ok:
                        return f"HTTP {status}: {body}", ""
                    else:
                        return "", f"HTTP {status}: {body}"
                return str(result), ""

            return "", f"Unknown tool '{tool}'."

        except Exception as e:
            return "", f"Activity error: {e}"
