"""
Data models for task execution — used across Phase 3 architecture.
Zero Temporal code. Zero Agentex SDK imports. (I1)
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class TaskStep(BaseModel):
    """A single executable step in a TaskPlan."""
    tool: str                    # activity name: navigate, fill_input, http_request, etc.
    args: dict[str, Any]         # arguments passed to the activity
    description: str             # human-readable explanation of what this step does
    reversible: bool = True      # False = destructive (submit, delete, send) — gate on approval
    depends_on: list[int] = []   # indices of steps that must complete before this one


class TaskPlan(BaseModel):
    """A complete ordered execution plan produced by the TaskPlanner."""
    goal: str                    # one-sentence statement of what the plan achieves
    steps: list[TaskStep]
    requires_approval: bool = False  # True if any step is irreversible


class TaskResult(BaseModel):
    """Result of executing a single TaskStep."""
    step_index: int
    tool: str
    description: str
    success: bool
    output: str
    error: str = ""


class ExecutionSummary(BaseModel):
    """Final output from an ExecutorAgent run."""
    success: bool
    goal: str
    completed_steps: list[TaskResult]
    failed_steps: list[TaskResult]
    summary: str                 # one paragraph describing what was accomplished
