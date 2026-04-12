"""
Tool schemas for Scout agents.
Scout does broad discovery only — search_web + report_sources.
No navigate, no deep reading. Fast, wide coverage.
"""

SCOUT_TOOLS: list[dict] = [
    {
        "name": "search_web",
        "description": (
            "Search the web using Tavily. Returns a list of results with title, URL, "
            "and snippet. Run multiple searches with different query phrasings to find "
            "a broad set of relevant sources."
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
                    "description": "Maximum number of results (default 7, max 10).",
                    "default": 7,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "report_sources",
        "description": (
            "Call this when you have run all your searches and collected a comprehensive "
            "list of relevant source URLs. Report a ranked list of discovered sources — "
            "the most relevant first. Call ONLY after running at least 4 distinct searches."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sources": {
                    "type": "array",
                    "description": "Ranked list of discovered sources, most relevant first.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "url": {
                                "type": "string",
                                "description": "Full URL of the source.",
                            },
                            "relevance_note": {
                                "type": "string",
                                "description": "One sentence on why this source is relevant.",
                            },
                            "source_type": {
                                "type": "string",
                                "description": "Type: news, academic, official, blog, forum, other.",
                            },
                        },
                        "required": ["url", "relevance_note"],
                    },
                }
            },
            "required": ["sources"],
        },
    },
]

SCOUT_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in SCOUT_TOOLS)
