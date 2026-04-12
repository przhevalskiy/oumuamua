"""
VerifierAgent — spawned by the Critic to confirm or deny a specific contested claim.
Runs targeted searches + navigation to find corroborating or contradicting evidence.
Returns a verdict with supporting URLs.
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
    from project.verifier_tools import VERIFIER_VALID_TOOL_NAMES

logger = structlog.get_logger(__name__)

MAX_VERIFIER_TURNS = 10

IO_ACTIVITY_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=60),
    "retry_policy": RetryPolicy(maximum_attempts=3),
}

PLANNER_ACTIVITY_OPTIONS = {
    "start_to_close_timeout": timedelta(seconds=90),
    "retry_policy": RetryPolicy(maximum_attempts=2),
}


@workflow.defn(name="VerifierAgent")
class VerifierAgent:
    """
    Targeted claim verification agent. Searches for corroborating or contradicting
    evidence for one specific claim, then reports a verdict.
    Returns JSON: {verdict, explanation, supporting_urls, original_claim}.
    """

    @workflow.run
    async def run(
        self,
        claim_to_verify: str,
        source_url: str,
        reason: str,
        original_query: str,
        parent_task_id: str,
        verifier_index: int,
    ) -> str:
        log = logger.bind(
            parent_task_id=parent_task_id,
            verifier_index=verifier_index,
            claim=claim_to_verify[:60],
        )
        log.info("verifier_started")

        tag = f"[Verifier {verifier_index}]"

        await adk.messages.create(
            task_id=parent_task_id,
            content=TextContent(
                author="agent",
                content=f"{tag} Verifying: {claim_to_verify[:100]}",
            ),
        )

        task_prompt = (
            f"You are a Verifier agent. Your mission: determine if this specific claim is accurate.\n\n"
            f"Claim to verify: {claim_to_verify}\n"
            f"Original source: {source_url}\n"
            f"Why we're verifying this: {reason}\n"
            f"Research context: {original_query}\n\n"
            "Instructions:\n"
            "- Search for 2-3 independent sources that either confirm or contradict this claim\n"
            "- Navigate to the most relevant sources\n"
            "- After gathering evidence, call report_verdict with your finding\n"
            "- Be objective — report what you find, even if it contradicts the original claim"
        )

        context: list[dict] = []

        for turn in range(MAX_VERIFIER_TURNS):
            raw = await workflow.execute_activity(
                "plan_verifier_step",
                args=[task_prompt, context],
                **PLANNER_ACTIVITY_OPTIONS,
            )
            context = raw["context"]

            if raw["type"] == "final":
                verdict_json = raw["answer"]
                log.info("verifier_finished", turn=turn)
                try:
                    verdict = json.loads(verdict_json)
                    verdict["original_claim"] = claim_to_verify
                    verdict["source_url"] = source_url
                    result_text = (
                        f"{tag} Verdict: {verdict.get('verdict', '?')} — "
                        f"{verdict.get('explanation', '')[:120]}"
                    )
                except (json.JSONDecodeError, ValueError):
                    verdict = {"verdict": "unverifiable", "explanation": verdict_json, "original_claim": claim_to_verify}
                    result_text = f"{tag} Verification complete."

                await adk.messages.create(
                    task_id=parent_task_id,
                    content=TextContent(author="agent", content=result_text),
                )
                await workflow.execute_activity(
                    "close_browser",
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
                return json.dumps(verdict)

            if raw["type"] == "error":
                log.warning("verifier_planner_error", message=raw.get("message"))
                break

            tool_name = raw["tool_name"]
            tool_use_id = raw["tool_use_id"]
            tool_input = raw["tool_input"]

            if tool_name not in VERIFIER_VALID_TOOL_NAMES:
                context = context + [{
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": f"Unknown tool '{tool_name}'. Use: search_web, navigate, report_verdict.",
                    }],
                }]
                continue

            await adk.messages.create(
                task_id=parent_task_id,
                content=TextContent(
                    author="agent",
                    content=f"{tag} {tool_name}: {tool_input.get('url') or tool_input.get('query', '')[:80]}",
                ),
            )

            tool_result = await self._dispatch(tool_name, tool_use_id, tool_input)

            context = context + [{
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": str(tool_result),
                }],
            }]

        log.warning("verifier_max_turns", turns=MAX_VERIFIER_TURNS)
        await workflow.execute_activity(
            "close_browser",
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        return json.dumps({
            "verdict": "unverifiable",
            "explanation": "Reached turn limit without conclusive evidence.",
            "original_claim": claim_to_verify,
            "source_url": source_url,
        })

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
                args=[tool_input.get("query", ""), tool_input.get("max_results", 5)],
                **IO_ACTIVITY_OPTIONS,
            )

        return f"Error: tool '{tool_name}' not dispatched."
