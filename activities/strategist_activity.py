"""
Strategist activity — determines research angles, scout queries, and agent count.
Replaces the hardcoded decomposer with dynamic research planning.
All LLM I/O must happen in activities, not workflows. (I1)
"""
from __future__ import annotations

import json
import structlog
from temporalio import activity

import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from project.claim_schema import ResearchPlan

logger = structlog.get_logger(__name__)


@activity.defn(name="plan_research_strategy")
async def plan_research_strategy(query: str) -> dict:
    """
    Use Claude to produce a ResearchPlan for the given query:
    - scout_queries: search queries for the Scout to run (4–8)
    - agent_count: how many Analyst agents to spawn (2–8, based on complexity)
    - angles: high-level research angles

    Returns a dict matching ResearchPlan fields.
    Falls back to a minimal plan if parsing fails.
    """
    log = logger.bind(query=query[:80])

    system = (
        "You are a research and task strategist. Given a question or task, produce a structured plan.\n\n"
        "1. mode: Classify as 'research' (answering a question, finding information), "
        "'execute' (taking an action on a website or API — booking, submitting, posting, updating), "
        "or 'both' (research first, then act on findings).\n\n"
        "2. scout_queries: A list of 4–8 distinct web search queries covering all important angles. "
        "For execute mode, focus queries on finding the correct URL/API endpoint.\n\n"
        "3. agent_count: An integer 2–8. Use 2–3 for simple tasks, 4–5 for moderate, 6–8 for complex.\n\n"
        "4. angles: A list of 2–8 high-level research angles or task sub-goals.\n\n"
        "Return ONLY valid JSON:\n"
        '{"mode": "research|execute|both", "scout_queries": ["...", ...], "agent_count": N, "angles": ["...", ...]}\n'
        "No explanation. No markdown fences. Pure JSON only."
    )

    user = f"Question or task: {query}"

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    raw = response.content[0].text.strip() if response.content else ""
    log.info("strategist_response", raw=raw[:300])

    try:
        data = json.loads(raw)
        plan = ResearchPlan(
            scout_queries=data.get("scout_queries", [query]),
            agent_count=max(2, min(8, int(data.get("agent_count", 3)))),
            angles=data.get("angles", [query]),
        )
        result = plan.model_dump()
        result["mode"] = data.get("mode", "research")
        log.info(
            "strategist_ok",
            mode=result["mode"],
            scout_queries=len(plan.scout_queries),
            agent_count=plan.agent_count,
        )
        return result
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        log.warning("strategist_parse_failed", error=str(e), raw=raw[:200])
        # Fallback: minimal plan
        fallback = ResearchPlan(
            scout_queries=[query, f"{query} latest research", f"{query} overview", f"{query} analysis"],
            agent_count=3,
            angles=[query],
        )
        return fallback.model_dump()
