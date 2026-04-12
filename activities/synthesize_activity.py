"""
Synthesis activities — wraps final LLM synthesis calls as Temporal activities.
All LLM I/O must happen in activities, not workflows. (I1)
"""
from temporalio import activity

from project.synthesizer import synthesize, synthesize_claims


@activity.defn(name="synthesize_from_claims")
async def synthesize_from_claims(original_query: str, claims: list[dict]) -> str:
    """
    Synthesize a final report from structured claims (Phase 1+ architecture).

    Args:
        original_query: The user's original question.
        claims: Flat list of Claim dicts from all Analyst agents.

    Returns:
        Structured markdown report.
    """
    return await synthesize_claims(original_query, claims)


@activity.defn(name="synthesize_chunks")
async def synthesize_chunks(
    original_query: str,
    sub_queries: list[str],
    chunks: list[str],
) -> str:
    """
    Merge raw research chunks from parallel sub-agents into a structured final report.

    Args:
        original_query: The user's original question.
        sub_queries: Sub-query string for each chunk (for labeling threads in the prompt).
        chunks: Raw findings string from each BrowseSubAgent.

    Returns:
        Structured markdown report: Summary, Key Findings, Contradictions, Sources.
    """
    return await synthesize(original_query, sub_queries, chunks)
