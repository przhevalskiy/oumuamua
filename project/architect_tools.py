"""Tool schemas for the Architect agent (RepoMapSkill)."""

ARCHITECT_TOOLS: list[dict] = [
    {
        "name": "list_directory",
        "description": (
            "List the contents of a directory in the repository. "
            "ALWAYS pass the absolute path (e.g. the repo_root you were given, or a subdirectory of it). "
            "Use this to explore the project structure before reading files."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the directory (e.g. '/Users/alice/myproject' or '/Users/alice/myproject/src')."},
                "max_depth": {"type": "integer", "description": "Max recursion depth (default 2).", "default": 2},
            },
            "required": ["path"],
        },
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file in the repository. ALWAYS use the absolute path.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the file (e.g. '/Users/alice/myproject/src/main.py')."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "report_plan",
        "description": (
            "Call this when you have fully mapped the repository and are ready to produce "
            "the implementation plan. Decompose the work into independent parallel tracks "
            "that can be built simultaneously. Each track should touch distinct files with "
            "minimal overlap. For small tasks, a single track is fine."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_root": {"type": "string", "description": "Absolute or relative root of the repo."},
                "tech_stack": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Languages, frameworks, and tools detected.",
                },
                "tracks": {
                    "type": "array",
                    "description": (
                        "Independent parallel workstreams for the Builder swarm. "
                        "Each track is assigned to a separate Builder agent running in parallel. "
                        "Use 1 track for small tasks, 2-4 tracks for larger ones. "
                        "Tracks must touch different files to avoid conflicts."
                    ),
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {
                                "type": "string",
                                "description": "Short name for this track, e.g. 'backend', 'frontend', 'tests', 'infra'.",
                            },
                            "implementation_steps": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Ordered steps for this track's Builder to execute.",
                            },
                            "key_files": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Files this track will create or modify.",
                            },
                        },
                        "required": ["label", "implementation_steps"],
                    },
                    "minItems": 1,
                },
                "notes": {"type": "string", "description": "Additional context for the team."},
            },
            "required": ["repo_root", "tracks"],
        },
    },
]

ARCHITECT_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in ARCHITECT_TOOLS)
