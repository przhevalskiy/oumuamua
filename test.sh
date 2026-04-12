#!/usr/bin/env bash
# Run the test suite.
# Tests use mock flags via monkeypatch — no real API calls, no Playwright, no Tavily.
# Dummy API keys satisfy config.py's import-time validation.
#
# Usage:
#   ./test.sh                  Run all tests
#   ./test.sh tests/test_planner.py   Run a specific file
#   ./test.sh -k test_extract  Run tests matching a keyword
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [ ! -d .venv ]; then
  echo "ERROR: .venv not found. Run ./setup.sh first."
  exit 1
fi

export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-test-key}"
export TAVILY_API_KEY="${TAVILY_API_KEY:-test-key}"
export AGENT_NAME="${AGENT_NAME:-web-scout}"
export ACP_URL="${ACP_URL:-http://localhost:8000}"
export WORKFLOW_NAME="${WORKFLOW_NAME:-web-scout}"
export WORKFLOW_TASK_QUEUE="${WORKFLOW_TASK_QUEUE:-web_scout_queue}"

echo "==> Running tests..."
.venv/bin/python -m pytest "$@"
