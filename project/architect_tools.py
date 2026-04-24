"""Tool schemas for the Architect agent (RepoMapSkill)."""

ARCHITECT_TOOLS: list[dict] = [
    {
        "name": "query_index",
        "description": (
            "Query the repo symbol index to find where a function, class, or type is defined. "
            "FASTER than search_files — use this first when you know the symbol name. "
            "Returns file paths and line numbers. Falls back gracefully if index not built yet."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
                "query": {"type": "string", "description": "Symbol name to look up (substring match)."},
                "top_k": {"type": "integer", "description": "Max results to return (default 20)."},
            },
            "required": ["repo_path", "query"],
        },
    },
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
        "name": "search_files",
        "description": (
            "Search for files by name pattern (glob) or by content (regex). "
            "Use to locate relevant files before reading them, especially in large repos."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern (e.g. '*.py', 'config.*') or regex for content search.",
                },
                "path": {
                    "type": "string",
                    "description": "Absolute path of root directory to search.",
                },
                "type": {
                    "type": "string",
                    "enum": ["name", "content"],
                    "description": "'name' matches filenames, 'content' searches file text. Default: 'name'.",
                },
            },
            "required": ["pattern", "path"],
        },
    },
    {
        "name": "memory_read",
        "description": (
            "Read facts stored by the PM or previous agents. "
            "Call this early to check for tech stack decisions, user preferences, or constraints "
            "the PM captured during clarification."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
                "keys": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Specific keys to fetch (e.g. ['pm.tech_stack', 'pm.platform']). Omit for all.",
                },
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "memory_write",
        "description": (
            "Store a durable fact for all agents — current build and future builds. "
            "Use to record key decisions, missing secrets, DB schema, architecture constraints. "
            "Use scoped keys, e.g. 'arch.db_orm', 'arch.auth_pattern', 'arch.monorepo'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Scoped fact key (e.g. 'arch.db_orm')."},
                "value": {"type": "string", "description": "Fact content."},
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
            },
            "required": ["key", "value", "repo_path"],
        },
    },
    {
        "name": "memory_search_episodes",
        "description": (
            "Search past build episodes to find prior decisions for similar goals. "
            "Call early in planning to avoid repeating failed approaches."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
                "query": {"type": "string", "description": "Keywords for the current goal."},
                "top_k": {"type": "integer", "description": "Max episodes to return (default 5)."},
            },
            "required": ["repo_path", "query"],
        },
    },
    {
        "name": "check_secrets",
        "description": (
            "Check whether required environment variables (API keys, tokens, DB URLs) are present "
            "in the worker environment. Call this early if the project requires secrets — "
            "report missing ones in the plan notes so builders can surface the issue."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Environment variable names to check (e.g. ['DATABASE_URL', 'OPENAI_API_KEY']).",
                },
            },
            "required": ["names"],
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
                                "minItems": 1,
                                "description": (
                                    "Ordered steps for this track's Builder to execute. "
                                    "REQUIRED — must contain at least one step. "
                                    "Be specific: name the exact file, function, and change. "
                                    "Example: 'In workflows/builder_agent.py, after each tool dispatch, "
                                    "add log.info(tool_name=tool_name, turn=turn, success=not failed)'."
                                ),
                            },
                            "key_files": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Files this track will create or modify. Each builder only touches its own key_files.",
                            },
                            "exports": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": (
                                    "Symbols, types, or route paths this track will export for sibling tracks to import. "
                                    "Example: ['UserService', 'AuthMiddleware', '/api/users']. "
                                    "Sibling builders read this from the manifest to import correctly without guessing."
                                ),
                            },
                            "depends_on": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": (
                                    "Labels of tracks that MUST complete before this track starts. "
                                    "Use when this track imports symbols exported by another track. "
                                    "Example: if 'frontend' imports from 'backend', set depends_on=['backend']. "
                                    "Leave empty for truly independent tracks — they run in parallel. "
                                    "Avoid circular dependencies."
                                ),
                            },
                            "test_spec": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": (
                                    "Descriptions of tests this track's Builder should write BEFORE implementation. "
                                    "Each entry is a test case description, e.g.: "
                                    "'test that POST /api/users returns 201 with valid payload', "
                                    "'test that UserService.create raises ValueError on duplicate email'. "
                                    "The Builder writes these tests first, then implements the code to make them pass. "
                                    "Leave empty if no new tests are needed (e.g. infra or docs tracks)."
                                ),
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

