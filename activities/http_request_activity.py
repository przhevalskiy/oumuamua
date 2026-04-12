"""
HTTP request Temporal Activity — direct API calls without browser overhead.
Use this instead of navigate() when the target has a known API endpoint.
Zero LLM calls. Zero Agentex SDK imports. (I1)
"""
from __future__ import annotations

import structlog
import httpx
from temporalio import activity

logger = structlog.get_logger(__name__)

# Cap response body to avoid flooding the context
_MAX_RESPONSE_CHARS = 10000


@activity.defn(name="http_request")
async def http_request(
    method: str,
    url: str,
    headers: dict | None = None,
    body: dict | str | None = None,
    timeout_seconds: int = 30,
) -> dict:
    """
    Make a direct HTTP request to any URL or API endpoint.

    Args:
        method: HTTP method — GET, POST, PUT, PATCH, DELETE
        url: Full URL including https://
        headers: Request headers dict (use for auth, content-type, etc.)
        body: Request body — dict is sent as JSON, str is sent as raw text
        timeout_seconds: Request timeout

    Returns:
        {
            "status": int,
            "body": str (truncated to 10000 chars),
            "headers": dict,
            "ok": bool (True if 2xx)
        }
    """
    log = logger.bind(method=method.upper(), url=url[:80])

    headers = headers or {}
    log.info("http_request_start")

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(timeout=timeout_seconds),
            follow_redirects=True,
        ) as client:
            if isinstance(body, dict):
                response = await client.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                    json=body,
                )
            elif isinstance(body, str):
                response = await client.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                    content=body,
                )
            else:
                response = await client.request(
                    method=method.upper(),
                    url=url,
                    headers=headers,
                )

        response_body = response.text
        if len(response_body) > _MAX_RESPONSE_CHARS:
            response_body = response_body[:_MAX_RESPONSE_CHARS] + "\n[response truncated]"

        log.info(
            "http_request_ok",
            status=response.status_code,
            body_chars=len(response_body),
        )

        return {
            "status": response.status_code,
            "body": response_body,
            "headers": dict(response.headers),
            "ok": 200 <= response.status_code < 300,
        }

    except httpx.TimeoutException:
        log.warning("http_request_timeout")
        return {"status": 0, "body": "Request timed out.", "headers": {}, "ok": False}
    except Exception as e:
        log.warning("http_request_error", error=str(e))
        return {"status": 0, "body": f"Request error: {e}", "headers": {}, "ok": False}
