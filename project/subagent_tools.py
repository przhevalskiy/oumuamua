"""
Tool schemas for sub-agent workers.
Sub-agents use report_chunk instead of finish — they return raw findings
that the orchestrator will synthesize into a final structured answer.
"""

SUBAGENT_TOOLS: list[dict] = [
    {
        "name": "search_web",
        "description": (
            "Search the web using Tavily. Returns a list of results with title, URL, "
            "and snippet. Use this to find relevant URLs before navigating to them."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default 5, max 10).",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "navigate",
        "description": (
            "Navigate to a URL and return the clean, readable text content of the page. "
            "The page is fully rendered (JavaScript executed) before extraction. "
            "Use this to read the full content of a specific URL."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The full URL to navigate to (must include https://).",
                }
            },
            "required": ["url"],
        },
    },
    {
        "name": "click_element",
        "description": (
            "Click an element on the current page identified by a CSS selector or "
            "visible text. Returns true if the click succeeded, false if not found."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "selector": {
                    "type": "string",
                    "description": (
                        "CSS selector (e.g. '#submit-btn') or visible text to click "
                        "(e.g. 'Read more')."
                    ),
                }
            },
            "required": ["selector"],
        },
    },
    {
        "name": "report_chunk",
        "description": (
            "Call this when you have gathered sufficient findings for your assigned sub-query. "
            "Call ONLY after visiting at least 2 distinct sources. "
            "Your findings will be combined with other parallel research threads and synthesized "
            "into a final report — so be thorough, include all key facts, data points, quotes, "
            "and the exact URLs of every source you consulted."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "findings": {
                    "type": "string",
                    "description": (
                        "All findings from your research. Include: key facts and claims, "
                        "relevant data points or quotes, any contradictions or nuances observed, "
                        "and the full URL of each source consulted. Minimum 150 words."
                    ),
                }
            },
            "required": ["findings"],
        },
    },
]

SUBAGENT_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in SUBAGENT_TOOLS)
