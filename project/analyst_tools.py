"""
Tool schemas for Analyst agents.
Analysts do deep reading only — navigate + report_claim + finish_reading.
No searching. Pure extraction from assigned URLs.
"""

ANALYST_TOOLS: list[dict] = [
    {
        "name": "navigate",
        "description": (
            "Navigate to a URL and return the clean, readable text content of the page. "
            "The page is fully rendered (JavaScript executed) before extraction. "
            "Use this to read the full content of each assigned URL."
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
            "Click an element on the current page identified by a CSS selector or visible text. "
            "Use sparingly — only when critical content is behind a button or tab."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "selector": {
                    "type": "string",
                    "description": "CSS selector or visible text to click.",
                }
            },
            "required": ["selector"],
        },
    },
    {
        "name": "report_claim",
        "description": (
            "Report a single structured claim extracted from the current page. "
            "Call this once per distinct claim — you may call it multiple times per page. "
            "Include the exact quote that supports the claim."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "claim": {
                    "type": "string",
                    "description": "The specific factual claim or finding.",
                },
                "url": {
                    "type": "string",
                    "description": "The source URL this claim comes from.",
                },
                "verbatim_quote": {
                    "type": "string",
                    "description": "Exact quote from the page that supports this claim.",
                },
                "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                    "description": (
                        "Your confidence: high = direct statement, medium = implied, "
                        "low = inferred or indirect."
                    ),
                },
            },
            "required": ["claim", "url", "confidence"],
        },
    },
    {
        "name": "request_spawn",
        "description": (
            "Request that a new specialist agent investigate a specific URL or angle more deeply. "
            "Use this when you discover a critical source that clearly needs deeper investigation "
            "beyond your current assignment — e.g., a primary source document, a key study, "
            "or a page that's too long to read fully. Use sparingly — maximum 2 spawn requests."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL that needs deeper investigation.",
                },
                "reason": {
                    "type": "string",
                    "description": "Why this URL warrants a dedicated follow-up agent.",
                },
            },
            "required": ["url", "reason"],
        },
    },
    {
        "name": "finish_reading",
        "description": (
            "Call this when you have read all assigned URLs and extracted all claims. "
            "All claims you reported via report_claim will be collected automatically. "
            "Provide a brief summary of what you found."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Brief summary (2-3 sentences) of the key findings from your assigned sources.",
                }
            },
            "required": ["summary"],
        },
    },
]

ANALYST_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in ANALYST_TOOLS)
