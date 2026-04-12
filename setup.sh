#!/usr/bin/env bash
# First-time setup: create venv, install deps, install Playwright Chromium, copy .env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

echo "==> Checking prerequisites..."
command -v uv >/dev/null 2>&1 || { echo "ERROR: uv not found. Install from https://docs.astral.sh/uv/"; exit 1; }
command -v agentex >/dev/null 2>&1 || { echo "ERROR: agentex CLI not found. Install with: uv tool install agentex-sdk"; exit 1; }

echo "==> Creating virtual environment..."
uv venv

echo "==> Installing dependencies..."
uv sync --extra dev

echo "==> Installing Playwright Chromium..."
.venv/bin/playwright install chromium

echo "==> Setting up .env..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    Created .env from .env.example — fill in ANTHROPIC_API_KEY and TAVILY_API_KEY before running."
else
  echo "    .env already exists — skipping."
fi

echo ""
echo "Setup complete. Next steps:"
echo "  1. Edit .env and add your API keys"
echo "  2. ./dev.sh --mock     (run with mock browser/search for testing)"
echo "  3. ./dev.sh            (run with live browser and search)"
echo "  4. ./test.sh           (run the test suite)"
