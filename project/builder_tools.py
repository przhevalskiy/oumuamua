"""
Tool schemas for the Builder agent (CodeWriterSkill).
Writes, modifies, and deletes files in the local repo.
"""

BUILDER_TOOLS: list[dict] = [
    {
        "name": "read_file",
        "description": "Read the current contents of a file before modifying it.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write (create or overwrite) a file with the given content. "
            "Use this to create new files or fully replace existing ones."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file."},
                "content": {"type": "string", "description": "Full file content to write."},
                "description": {"type": "string", "description": "One-line description of what this change does."},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "patch_file",
        "description": (
            "Apply a targeted string replacement to an existing file. "
            "Prefer this over write_file for small, surgical edits."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file."},
                "old_str": {"type": "string", "description": "Exact string to find and replace."},
                "new_str": {"type": "string", "description": "Replacement string."},
                "description": {"type": "string", "description": "One-line description of the change."},
            },
            "required": ["path", "old_str", "new_str"],
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file from the repository.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file to delete."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "web_search",
        "description": (
            "Search the web for documentation, error messages, package APIs, or implementation patterns. "
            "Use when you're uncertain about a library's API or need to look up an error."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "num_results": {"type": "integer", "description": "Number of results (default: 5, max: 10)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": "Fetch a documentation page or API reference URL and return its text content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch."},
                "max_chars": {"type": "integer", "description": "Max characters to return (default: 8000)."},
            },
            "required": ["url"],
        },
    },
    {
        "name": "execute_sql",
        "description": (
            "Execute SQL against the project database to verify migrations, inspect schema, or seed data. "
            "Reads DATABASE_URL from env if database_url is not provided."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "SQL to execute (e.g. 'SELECT * FROM users LIMIT 5')."},
                "database_url": {"type": "string", "description": "DB URL override (default: reads DATABASE_URL env var)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "git_diff",
        "description": (
            "Show what has changed vs. HEAD. Call before finish_build to verify all intended changes are "
            "present and no unintended files were modified."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "cwd": {"type": "string", "description": "Working directory (repo root)."},
                "staged": {"type": "boolean", "description": "If true, show staged-only diff."},
                "paths": {"type": "array", "items": {"type": "string"}, "description": "Limit diff to these paths."},
            },
            "required": [],
        },
    },
    {
        "name": "run_migration",
        "description": "Run database migrations (alembic, prisma, knex, rails). Auto-detects tool from project files.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tool": {
                    "type": "string",
                    "enum": ["auto", "alembic", "prisma", "knex", "rails", "flyway"],
                    "description": "Migration tool ('auto' detects from project files).",
                },
                "cwd": {"type": "string", "description": "Working directory (repo root)."},
                "command": {"type": "string", "description": "Command override (e.g. 'upgrade head', 'migrate dev')."},
            },
            "required": [],
        },
    },
    {
        "name": "memory_read",
        "description": "Read context notes left by the Architect or earlier agents in this build.",
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
                "keys": {"type": "array", "items": {"type": "string"}, "description": "Specific keys to fetch. Omit for all."},
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "memory_write",
        "description": "Store a context note for other agents or heal cycles to read.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Note key."},
                "value": {"type": "string", "description": "Note content."},
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
            },
            "required": ["key", "value", "repo_path"],
        },
    },
    {
        "name": "search_files",
        "description": (
            "Search for files by name pattern (glob) or by content (regex). "
            "Use before editing to locate the right file when you are unsure of its path."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern for name search (e.g. '*.tsx') or regex for content search.",
                },
                "path": {
                    "type": "string",
                    "description": "Root directory to search. Use the repo_root you were given.",
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
        "name": "str_replace_editor",
        "description": (
            "View a file with line numbers, perform a precise string replacement, or create a new file. "
            "Prefer this over patch_file — it shows file context when old_str is not found, "
            "and warns when old_str is ambiguous."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "enum": ["view", "str_replace", "create"],
                    "description": (
                        "'view' shows the file with line numbers. "
                        "'str_replace' replaces old_str with new_str. "
                        "'create' writes a new file with new_str as content."
                    ),
                },
                "path": {"type": "string", "description": "Absolute path to the file."},
                "old_str": {
                    "type": "string",
                    "description": "[str_replace] Exact string to replace. Must be unique in the file.",
                },
                "new_str": {
                    "type": "string",
                    "description": "[str_replace/create] Replacement string or full file content.",
                },
                "view_range": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "minItems": 2,
                    "maxItems": 2,
                    "description": "[view] Optional [start_line, end_line] to view a specific range.",
                },
            },
            "required": ["command", "path"],
        },
    },
    {
        "name": "install_packages",
        "description": (
            "Install packages using a package manager. Use this for ANY dependency installation — "
            "do not use run_command for installs."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "manager": {
                    "type": "string",
                    "enum": ["npm", "yarn", "pnpm", "pip", "pip3", "uv"],
                    "description": "Package manager to use.",
                },
                "packages": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Package names to install. Omit to install from lockfile.",
                },
                "flags": {
                    "type": "string",
                    "description": "Extra flags (e.g. '--save-dev', '--dev', '--group dev').",
                },
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["manager"],
        },
    },
    {
        "name": "run_command",
        "description": (
            "Run a shell command in the repo directory. "
            "Use only for lightweight commands like mkdir or touch. "
            "For package installation use install_packages instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run."},
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "query_index",
        "description": (
            "Query the repo symbol index to find where a function, class, or type is defined. "
            "Use this BEFORE find_symbol or read_file when you know the symbol name — it's instant. "
            "Returns file paths and line numbers."
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
        "name": "find_symbol",
        "description": (
            "Find where a function, class, type, or interface is DEFINED in the repo. "
            "Use this BEFORE read_file when you need to locate a symbol — it's much faster "
            "than reading files one by one. Returns file path, line number, and the definition line."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Symbol name to find (function, class, type, interface, etc.).",
                },
                "repo_path": {
                    "type": "string",
                    "description": "Absolute repo root path.",
                },
                "exact": {
                    "type": "boolean",
                    "description": "If true, match exact name only. Default false (substring match).",
                },
            },
            "required": ["symbol", "repo_path"],
        },
    },
    {
        "name": "verify_build",
        "description": (
            "Run lightweight verification checks (lint, type-check) on the repo before finishing. "
            "Call this BEFORE finish_build to catch errors early. "
            "If it returns failures, fix them and call verify_build again. "
            "Do NOT call finish_build until verify_build passes or reports no tools detected."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {
                    "type": "string",
                    "description": "Absolute path to the repo root.",
                },
            },
            "required": ["repo_path"],
        },
    },
    {
        "name": "finish_build",
        "description": (
            "Call this when all code changes are complete AND verify_build has passed. "
            "Provide a summary of every file you created or modified."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "What was built and why."},
                "edits": {
                    "type": "array",
                    "description": "List of all file edits made.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "operation": {"type": "string", "enum": ["create", "modify", "delete"]},
                            "description": {"type": "string"},
                        },
                        "required": ["path", "operation"],
                    },
                },
            },
            "required": ["summary", "edits"],
        },
    },
]

BUILDER_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in BUILDER_TOOLS)
