"""
Data models for structured research output — used across Phase 1 architecture.
Zero Temporal code. Zero Agentex SDK imports. (I1)
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class SourceResult(BaseModel):
    """A URL discovered by the Scout agent during broad search."""
    url: str
    relevance_note: str = ""
    source_type: str = "web"


class Claim(BaseModel):
    """Structured research claim extracted by an Analyst agent from a source page."""
    claim: str
    url: str
    verbatim_quote: str = ""
    confidence: Literal["high", "medium", "low"] = "medium"
    agent_index: int = 0


class ResearchPlan(BaseModel):
    """Strategic research plan produced by the Strategist."""
    scout_queries: list[str]   # search queries for the Scout to run
    agent_count: int           # how many Analyst agents to spawn (2–8)
    angles: list[str]          # high-level research angles / sub-questions
