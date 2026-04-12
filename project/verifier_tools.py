"""
Tool schemas for Verifier agents.
Verifiers are spawned by the Critic to confirm or deny specific contested claims.
Tools: search_web + navigate + report_verdict.
"""

VERIFIER_TOOLS: list[dict] = [
    {
        "name": "search_web",
        "description": (
            "Search the web to find corroborating or contradicting sources for the claim "
            "you are verifying. Run multiple searches from different angles."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query."},
                "max_results": {
                    "type": "integer",
                    "description": "Maximum results to return (default 5).",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "navigate",
        "description": (
            "Navigate to a URL and return the page text. Use this to read sources "
            "that may confirm or deny the claim you are verifying."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The full URL to navigate to (must include https://)."}
            },
            "required": ["url"],
        },
    },
    {
        "name": "report_verdict",
        "description": (
            "Call this after you have gathered enough evidence to reach a verdict on the claim. "
            "Report whether the claim is confirmed, denied, or only partially supported."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "verdict": {
                    "type": "string",
                    "enum": ["confirmed", "denied", "partial", "unverifiable"],
                    "description": "Your verdict on the claim.",
                },
                "explanation": {
                    "type": "string",
                    "description": "2-3 sentence explanation of your verdict with source references.",
                },
                "supporting_urls": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "URLs of sources that support or contradict the claim.",
                },
            },
            "required": ["verdict", "explanation"],
        },
    },
]

VERIFIER_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in VERIFIER_TOOLS)
