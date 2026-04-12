"""
Canonical tool schema definitions for the Claude tool-use planner.
extract_page_content and summarize_results are internal pipeline steps —
Claude should never call them directly. navigate already returns clean text.
"""

TOOLS: list[dict] = [
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
        "name": "finish",
        "description": (
            "Signal that the task is complete. Call this ONLY after visiting at least 3 distinct sources. "
            "Your answer MUST follow this exact structure:\n\n"
            "## Summary\n"
            "[2-3 sentence overview of the answer]\n\n"
            "## Key Findings\n"
            "- [Finding]: [explanation] (source: URL)\n"
            "- [Finding]: [explanation] (source: URL)\n"
            "- [Finding]: [explanation] (source: URL)\n\n"
            "## Contradictions or Disagreements\n"
            "[Note any conflicting claims across sources, or write 'Sources were consistent.']\n\n"
            "## Sources Consulted\n"
            "- [Title or domain](URL)\n"
            "- [Title or domain](URL)\n"
            "- [Title or domain](URL)\n\n"
            "Minimum: 3 sources, 200+ words, explicit URL citations."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "answer": {
                    "type": "string",
                    "description": (
                        "The final answer following the required structure: "
                        "Summary, Key Findings (with URLs), Contradictions or Disagreements, Sources Consulted. "
                        "Minimum 200 words. Minimum 3 source URLs."
                    ),
                }
            },
            "required": ["answer"],
        },
    },
]

# Set of valid tool names — used by the workflow to validate dispatched tool calls (G3)
VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in TOOLS)
