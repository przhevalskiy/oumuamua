"""
Config loader for web-scout custom env vars.
Agentex SDK env vars (TEMPORAL_ADDRESS, AGENT_NAME, etc.) are handled by
agentex.lib.environment_variables.EnvironmentVariables — do not duplicate them here.
Fails loudly at import time if required keys are missing.
"""
import os
from dotenv import load_dotenv

load_dotenv(override=False)

# ── LLM ─────────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]

# sonnet for research quality; override via CLAUDE_MODEL env var
CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")

# ── Web Search ───────────────────────────────────────────────────────────────

TAVILY_API_KEY: str = os.environ["TAVILY_API_KEY"]

# ── Browser ──────────────────────────────────────────────────────────────────

BROWSER_HEADLESS: bool = os.getenv("BROWSER_HEADLESS", "true").lower() == "true"
BROWSER_TIMEOUT_MS: int = int(os.getenv("BROWSER_TIMEOUT_MS", "30000"))

# ── Feature flags (dev-only; never hardcode True in non-test code) ────────────

USE_MOCK_BROWSER: bool = os.getenv("USE_MOCK_BROWSER", "false").lower() == "true"
USE_MOCK_SEARCH: bool = os.getenv("USE_MOCK_SEARCH", "false").lower() == "true"

# ── Hard caps ────────────────────────────────────────────────────────────────

MAX_AGENT_TURNS: int = int(os.getenv("MAX_AGENT_TURNS", "10"))
MAX_PAGES_PER_TASK: int = int(os.getenv("MAX_PAGES_PER_TASK", "8"))
