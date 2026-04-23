"""
Tool schemas for the Inspector agent (QASkill).
Runs tests, lints, and type checks. Triggers self-healing if failures found.
"""

INSPECTOR_TOOLS: list[dict] = [
    {
        "name": "run_coverage",
        "description": (
            "Run the test suite with coverage measurement and return a coverage report. "
            "Use after run_tests passes to verify the new code is actually covered by tests. "
            "Example commands: 'pytest --cov=src --cov-report=term-missing -q', "
            "'npx jest --coverage --coverageReporters=text'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Coverage command to run.",
                },
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "run_tests",
        "description": (
            "Run the project's test suite. Returns pass/fail counts and output. "
            "Always run this first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Test command to run (e.g. 'pytest --tb=short', 'npm test -- --run').",
                },
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "run_lint",
        "description": "Run the linter (e.g. ruff, eslint, flake8) and return issues found.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Lint command (e.g. 'ruff check .')."},
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "run_type_check",
        "description": "Run static type checking (e.g. mypy, pyright, tsc --noEmit).",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Type check command."},
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "web_search",
        "description": (
            "Search the web to diagnose an unfamiliar error message, look up a test framework's API, "
            "or find known issues with a library version."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query."},
                "num_results": {"type": "integer", "description": "Number of results (default: 5)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_url",
        "description": "Fetch a URL (e.g. a GitHub issue, changelog, or error page) and return its text.",
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
        "description": "Query the project database to verify data integrity, check migration results, or confirm schema.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "SQL to execute."},
                "database_url": {"type": "string", "description": "DB URL (default: reads DATABASE_URL env var)."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_ports",
        "description": "Check which ports are in use. Use before run_application to verify the port is free, or after to confirm the process started.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ports": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Specific ports to check (e.g. [3000, 8080]). Omit for all listening ports.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "memory_read",
        "description": "Read context notes from the Architect or earlier agents. Call at start to check for known issues or missing secrets.",
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
        "description": (
            "Store a durable QA finding or recurring failure pattern. "
            "Use scoped keys, e.g. 'inspector.fragile_auth', 'inspector.lint_ignores'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "Scoped fact key."},
                "value": {"type": "string", "description": "Finding or note content."},
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
            },
            "required": ["key", "value", "repo_path"],
        },
    },
    {
        "name": "memory_search_episodes",
        "description": (
            "Search past build episodes to find recurring failure patterns. "
            "Use when a test keeps failing and you want to know if it has failed before."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "repo_path": {"type": "string", "description": "Absolute repo root path."},
                "query": {"type": "string", "description": "Keywords for the failure or area."},
                "top_k": {"type": "integer", "description": "Max episodes to return (default 5)."},
            },
            "required": ["repo_path", "query"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a file to understand a test failure or lint error in context.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Relative path to the file."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "run_application",
        "description": (
            "Start the application with a shell command, wait for it to boot, probe a URL, "
            "and return the HTTP status + response body. Use this to verify the app actually "
            "starts and serves traffic — not just that tests pass."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_command": {
                    "type": "string",
                    "description": "Command to start the application (e.g. 'npm run dev', 'python app.py', 'uvicorn main:app').",
                },
                "url": {
                    "type": "string",
                    "description": "URL to probe after startup (default: http://localhost:3000).",
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Seconds to wait for startup before probing (default: 5, max: 30).",
                },
                "cwd": {"type": "string", "description": "Working directory (default: repo root)."},
            },
            "required": ["start_command"],
        },
    },
    {
        "name": "check_secrets",
        "description": (
            "Check whether required environment variables are present. "
            "Use when tests fail with auth errors, missing config, or connection refused — "
            "missing secrets are a common root cause."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Environment variable names to check.",
                },
            },
            "required": ["names"],
        },
    },
    {
        "name": "report_inspection",
        "description": (
            "Call this when all checks are complete. Report whether the build passed "
            "and provide heal instructions if it failed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "passed": {"type": "boolean", "description": "True if all checks passed."},
                "summary": {"type": "string", "description": "Overall QA summary."},
                "lint_issues": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of lint issues found.",
                },
                "type_errors": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of type errors found.",
                },
                "heal_instructions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Concrete fix instructions for the Builder if checks failed.",
                },
                "test_passed": {"type": "integer", "description": "Number of tests passed."},
                "test_failed": {"type": "integer", "description": "Number of tests failed."},
                "test_errors": {"type": "integer", "description": "Number of test errors."},
                "coverage_pct": {"type": "number", "description": "Overall test coverage percentage (0-100). Omit if not measured."},
                "coverage_summary": {"type": "string", "description": "Coverage report summary. Omit if not measured."},
            },
            "required": ["passed", "summary"],
        },
    },
]

INSPECTOR_VALID_TOOL_NAMES: frozenset[str] = frozenset(t["name"] for t in INSPECTOR_TOOLS)
