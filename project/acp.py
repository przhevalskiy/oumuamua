"""
Agentex ACP entrypoint.
This file ONLY sets up the FastACP server. Zero Playwright. Zero LLM calls. (I1)
Task routing to BrowseWorkflow is handled automatically by the Temporal ACP integration.
"""
import os
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import Response
from agentex.lib.sdk.fastacp.fastacp import FastACP
from agentex.lib.types.fastacp import TemporalACPConfig

acp = FastACP.create(
    acp_type="agentic",
    config=TemporalACPConfig(
        type="temporal",
        temporal_address=os.getenv("TEMPORAL_ADDRESS", "localhost:7233"),
    ),
)

_SCREENSHOT_DIR = Path("/tmp/oumuamua_screenshots")


@acp.get("/screenshot/{task_id}")
async def get_screenshot(task_id: str) -> Response:
    """Return the latest Playwright screenshot for a running task."""
    path = _SCREENSHOT_DIR / f"{task_id}.png"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No screenshot yet")
    return Response(content=path.read_bytes(), media_type="image/png")
