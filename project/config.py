"""Config for Swarm Factory."""
import os
from dotenv import load_dotenv

load_dotenv(override=False)

ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6")
CLAUDE_SONNET_MODEL: str = os.getenv("CLAUDE_SONNET_MODEL", CLAUDE_MODEL)
CLAUDE_HAIKU_MODEL: str = os.getenv("CLAUDE_HAIKU_MODEL", "claude-3-5-haiku-latest")
MAX_AGENT_TURNS: int = int(os.getenv("MAX_AGENT_TURNS", "24"))
MAX_CONTEXT_PAIRS: int = int(os.getenv("MAX_CONTEXT_PAIRS", "12"))  # keep last N tool call/result pairs
