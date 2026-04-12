"""
Synthesizer — takes raw research chunks from parallel sub-agents and produces
a single structured final answer.
Also supports synthesizing from structured Claim lists (Phase 1+).
Zero Temporal code. Zero Agentex SDK imports. (I1)
"""
from __future__ import annotations

import json
import structlog
import anthropic

from project.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

logger = structlog.get_logger(__name__)


async def synthesize_claims(original_query: str, claims: list[dict]) -> str:
    """
    Synthesize a final report from structured claims extracted by Analyst agents.

    Args:
        original_query: The user's original question.
        claims: List of Claim dicts from all Analyst agents.

    Returns:
        Structured markdown report.
    """
    log = logger.bind(query=original_query[:80], claim_count=len(claims))

    # Group claims by URL for deduplication awareness
    by_url: dict[str, list[dict]] = {}
    for c in claims:
        url = c.get("url", "unknown")
        by_url.setdefault(url, []).append(c)

    # Build claim context for the LLM — include verdicts and flags
    claim_blocks = []
    for url, url_claims in by_url.items():
        block_lines = [f"Source: {url}"]
        for c in url_claims:
            conf = c.get("confidence", "medium")
            claim_text = c.get("claim", "")
            quote = c.get("verbatim_quote", "")

            # Enrich with verification status
            status_tags = []
            if c.get("verified"):
                verdict = c.get("verdict", "unverifiable")
                status_tags.append(f"VERIFIED:{verdict.upper()}")
            if c.get("critic_flag"):
                status_tags.append("CRITIC-FLAGGED")
            status = f" [{', '.join(status_tags)}]" if status_tags else ""

            block_lines.append(f"  [{conf}]{status} {claim_text}")
            if quote:
                block_lines.append(f'    Quote: "{quote}"')
            if c.get("verdict_explanation"):
                block_lines.append(f'    Verification: {c["verdict_explanation"]}')
        claim_blocks.append("\n".join(block_lines))

    combined = "\n\n---\n\n".join(claim_blocks)
    if len(combined) > 60000:
        combined = combined[:60000] + "\n[claims truncated]"

    system = (
        "You are a research editor. You receive structured claims extracted by analyst agents. "
        "Some claims have been independently verified (marked VERIFIED:CONFIRMED or VERIFIED:DENIED) "
        "and some have been flagged by a critic (marked CRITIC-FLAGGED).\n\n"
        "Synthesis rules:\n"
        "- Prioritize VERIFIED:CONFIRMED claims as the most reliable findings\n"
        "- Treat VERIFIED:DENIED claims as false — note them in the Contradictions section\n"
        "- Note CRITIC-FLAGGED claims with appropriate uncertainty\n"
        "- Claims without verification tags are unverified but still valid\n\n"
        "Required output structure:\n"
        "## Summary\n"
        "[3-5 sentence overview directly answering the original question]\n\n"
        "## Key Findings\n"
        "- [Finding]: [Detailed explanation] (source: URL)\n"
        "(minimum 5 findings, drawn from the claims)\n\n"
        "## Contradictions or Disagreements\n"
        "[Note conflicting claims, denied verifications, or 'Sources were broadly consistent.']\n\n"
        "## Sources Consulted\n"
        "- [Title or domain](URL)\n"
        "(list every source URL from the claims)\n\n"
        "Be thorough. Minimum 300 words. Only cite URLs that appear in the provided claims."
    )

    user = (
        f"Original research question: {original_query}\n\n"
        f"Structured claims from analyst agents:\n\n{combined}\n\n"
        "Synthesize all claims into a structured research report."
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    log.info("synthesizer_claims_call", sources=len(by_url), total_chars=len(combined))

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=8192,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    answer = response.content[0].text.strip() if response.content else "Synthesis failed."

    log.info(
        "synthesizer_claims_ok",
        answer_chars=len(answer),
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    return answer


async def synthesize(original_query: str, sub_queries: list[str], chunks: list[str]) -> str:
    """
    Combine parallel research chunks into one structured report.

    Args:
        original_query: The user's original question.
        sub_queries: The focused sub-query each chunk corresponds to.
        chunks: Raw findings strings from each sub-agent.

    Returns:
        A structured markdown report with Summary, Key Findings,
        Contradictions, and Sources Consulted.
    """
    system = (
        "You are a research editor. You receive raw research findings from multiple "
        "parallel research threads and synthesize them into a single cohesive, "
        "structured report. Your output must be comprehensive, well-organized, "
        "and cite every source mentioned across all threads.\n\n"
        "Required output structure:\n"
        "## Summary\n"
        "[3-5 sentence overview directly answering the original question]\n\n"
        "## Key Findings\n"
        "- [Finding]: [Detailed explanation] (source: URL)\n"
        "(minimum 5 findings, drawn from across all research threads)\n\n"
        "## Contradictions or Disagreements\n"
        "[Note conflicting claims across sources, or 'Sources were broadly consistent.']\n\n"
        "## Sources Consulted\n"
        "- [Title or domain](URL)\n"
        "(list every URL mentioned across all research threads)\n\n"
        "Be thorough. Minimum 300 words. Do not invent sources — only cite URLs "
        "that appear explicitly in the provided claims."
    )

    # Build the combined research context
    thread_blocks = []
    for i, (sq, chunk) in enumerate(zip(sub_queries, chunks), 1):
        thread_blocks.append(
            f"## Research Thread {i}: {sq}\n\n{chunk}"
        )
    combined = "\n\n---\n\n".join(thread_blocks)

    # Safety cap — synthesis context shouldn't exceed ~60K chars
    if len(combined) > 60000:
        combined = combined[:60000] + "\n[combined context truncated]"

    user = (
        f"Original research question: {original_query}\n\n"
        f"{combined}\n\n"
        "Synthesize all of the above research threads into a single structured report "
        "following the required format."
    )

    client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

    logger.info(
        "synthesizer_call",
        query=original_query[:80],
        thread_count=len(chunks),
        context_chars=len(combined),
    )

    response = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=8192,
        system=system,
        messages=[{"role": "user", "content": user}],
    )

    answer = response.content[0].text.strip() if response.content else "Synthesis failed."

    logger.info(
        "synthesizer_ok",
        answer_chars=len(answer),
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    return answer
