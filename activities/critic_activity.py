"""
Critic activity — reviews all collected claims, identifies contradictions and
low-confidence findings, and recommends which claims need verification.
All LLM I/O must happen in activities, not workflows. (I1)
"""
from __future__ import annotations

import json
import structlog
from temporalio import activity

import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

logger = structlog.get_logger(__name__)


@activity.defn(name="run_critic")
async def run_critic(original_query: str, claims: list[dict]) -> dict:
    """
    Review all claims from analyst agents. Identify:
    - Contradictions between sources
    - Claims with only one source (unverified)
    - Claims that are critical to the answer but low-confidence

    Returns:
        {
            "verdict": str,          # overall assessment
            "contradictions": [...], # list of {claim_a, claim_b, reason}
            "spawn_requests": [...], # list of {url, claim, reason} to verify
            "flagged_claims": [...]  # claim indices that are contested/weak
        }
    Falls back to {"verdict": "ok", "contradictions": [], "spawn_requests": [], "flagged_claims": []}
    on failure.
    """
    log = logger.bind(query=original_query[:80], claim_count=len(claims))

    if not claims:
        return {"verdict": "no claims", "contradictions": [], "spawn_requests": [], "flagged_claims": []}

    # Build claim summary for the LLM
    claim_lines = []
    for i, c in enumerate(claims):
        conf = c.get("confidence", "medium")
        claim_text = c.get("claim", "")
        url = c.get("url", "")
        claim_lines.append(f"[{i}] [{conf}] {claim_text} (source: {url})")

    claims_block = "\n".join(claim_lines)
    if len(claims_block) > 40000:
        claims_block = claims_block[:40000] + "\n[claims truncated]"

    system = (
        "You are a research critic. You receive a list of claims extracted from web sources. "
        "Your job is to identify quality issues:\n\n"
        "1. Contradictions: claims that directly contradict each other across sources.\n"
        "2. Spawn requests: the 1-3 most critical claims that need verification because they are "
        "   contested, highly impactful, or only supported by a single source.\n"
        "3. Flagged claims: indices of claims that are weak, unverified, or suspicious.\n\n"
        "Be conservative — only flag genuine issues. Do NOT flag claims that are simply uncertain "
        "by nature (future predictions, opinions). Focus on factual contradictions.\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "verdict": "string — one sentence overall assessment",\n'
        '  "contradictions": [{"claim_a": "...", "claim_b": "...", "reason": "..."}],\n'
        '  "spawn_requests": [{"url": "url to re-check", "claim": "the claim to verify", "reason": "why verify this"}],\n'
        '  "flagged_claims": [0, 3, 7]\n'
        "}\n"
        "No explanation. No markdown fences. Pure JSON."
    )

    user = (
        f"Research question: {original_query}\n\n"
        f"Claims to review:\n{claims_block}"
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    log.info("critic_call", claims=len(claims))

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    raw = response.content[0].text.strip() if response.content else ""
    log.info("critic_response", raw=raw[:300])

    try:
        result = json.loads(raw)
        log.info(
            "critic_ok",
            contradictions=len(result.get("contradictions", [])),
            spawn_requests=len(result.get("spawn_requests", [])),
        )
        return result
    except (json.JSONDecodeError, ValueError) as e:
        log.warning("critic_parse_failed", error=str(e))
        return {"verdict": "parse error", "contradictions": [], "spawn_requests": [], "flagged_claims": []}
