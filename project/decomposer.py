"""
Query decomposer — breaks a broad research query into N focused sub-queries,
one per parallel research thread.
Zero Temporal code. Zero Agentex SDK imports. (I1)
"""
from __future__ import annotations

import json
import structlog

import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

logger = structlog.get_logger(__name__)

_N_SUBAGENTS = 3


async def decompose(query: str, n: int = _N_SUBAGENTS) -> list[str]:
    """
    Use Claude to split a research query into n focused sub-queries.
    Each sub-query targets a distinct angle so the parallel agents don't overlap.

    Falls back to [query] * n if parsing fails (safe degradation).
    """
    system = (
        "You are a research strategist. Given a research question, decompose it into "
        f"{n} distinct, focused sub-queries that together cover the full topic. "
        "Each sub-query should target a different angle — e.g., technical depth, "
        "comparisons, current state, history, practical implications. "
        "Return ONLY a JSON array of strings — no explanation, no markdown fences."
    )

    user = (
        f"Research question: {query}\n\n"
        f"Return exactly {n} sub-queries as a JSON array. Example format:\n"
        '["sub-query 1", "sub-query 2", "sub-query 3"]'
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    raw = response.content[0].text.strip() if response.content else ""
    logger.info("decomposer_response", raw=raw[:200])

    try:
        sub_queries = json.loads(raw)
        if isinstance(sub_queries, list) and all(isinstance(q, str) for q in sub_queries):
            # Pad or trim to exactly n
            if len(sub_queries) < n:
                sub_queries += [query] * (n - len(sub_queries))
            return sub_queries[:n]
    except (json.JSONDecodeError, ValueError):
        logger.warning("decomposer_parse_failed", raw=raw[:200])

    # Fallback: same query repeated (sub-agents will still find different sources)
    return [query] * n
