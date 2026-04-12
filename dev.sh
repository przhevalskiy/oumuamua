#!/usr/bin/env bash
# dev.sh — Oumuamua development launcher
#
# Assumes the Agentex platform (Docker) is already running via:
#   cd scale-agentex/agentex && docker compose up -d
#
# This script:
#   1. Kills stale processes on local ports (8000, 8233, 3000)
#   2. Starts Temporal dev server if not running (:7233)
#   3. Starts the web-scout agent (ACP :8000 + Temporal worker)
#   4. Starts oumuamua-ui (:3000)
#
# Usage:
#   ./dev.sh               Start (live browser + search)
#   ./dev.sh --mock        Mock browser/search (no Playwright/Tavily)
#   ./dev.sh --cleanup     Clean up stale Temporal workflows on start
#   ./dev.sh --stop        Kill all local processes
#   ./dev.sh --status      Show what's running
#   ./dev.sh --platform    Also start/restart the Docker platform first
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

AGENTEX_DIR="$ROOT/scale-agentex/agentex"
UI_DIR="$ROOT/../oumuamua-ui"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()    { echo -e "${BLUE}==>${NC} $*"; }
ok()     { echo -e "${GREEN} ✓${NC} $*"; }
warn()   { echo -e "${YELLOW}[warn]${NC} $*"; }
err()    { echo -e "${RED}[error]${NC} $*"; }
header() { echo -e "\n${CYAN}━━━  $*  ━━━${NC}"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "Cleared port $port"
  fi
}

wait_for_port() {
  local port=$1 label=$2 max=${3:-30}
  echo -n "    Waiting for $label (:$port)"
  for i in $(seq 1 "$max"); do
    if nc -z localhost "$port" 2>/dev/null; then
      echo " ready."
      return 0
    fi
    sleep 1
    echo -n "."
  done
  echo ""
  err "$label did not start on :$port"
  return 1
}

_stop_all() {
  header "Stopping"
  kill_port 3000
  kill_port 8000
  kill_port 8233
  ok "Done."
}

_show_status() {
  echo ""
  for svc_port in "Agentex API:5003" "Temporal:7233" "Temporal UI:8080" "Agent ACP:8000" "oumuamua-ui:3000" "Redis:6379"; do
    label="${svc_port%%:*}"; port="${svc_port##*:}"
    printf "  %-20s" "$label (:$port)"
    nc -z localhost "$port" 2>/dev/null && echo -e "${GREEN}running${NC}" || echo -e "${RED}stopped${NC}"
  done
  echo ""
  echo "  http://localhost:3000       oumuamua-ui"
  echo "  http://localhost:5003/swagger  Agentex API"
  echo "  http://localhost:8080       Temporal UI"
  echo ""
}

_start_platform() {
  header "Starting Agentex platform (Docker)"
  if [ ! -d "$AGENTEX_DIR" ]; then
    err "Agentex directory not found at $AGENTEX_DIR"; exit 1
  fi
  (cd "$AGENTEX_DIR" && docker compose up -d)
  wait_for_port 7233 "Temporal" 45
  wait_for_port 5003 "Agentex API" 60
  ok "Platform ready"
}

# ── Flags ─────────────────────────────────────────────────────────────────────
MOCK=false
CLEANUP=false
PLATFORM=false

for arg in "$@"; do
  case $arg in
    --mock)     MOCK=true ;;
    --cleanup)  CLEANUP=true ;;
    --platform) PLATFORM=true ;;
    --stop)     _stop_all; exit 0 ;;
    --status)   _show_status; exit 0 ;;
    *) err "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ── Pre-flight ────────────────────────────────────────────────────────────────
[ ! -f .env ]  && { err ".env not found. Run ./setup.sh first."; exit 1; }
[ ! -d .venv ] && { err ".venv not found. Run ./setup.sh first."; exit 1; }

# ── Optional: start Docker platform ──────────────────────────────────────────
if [ "$PLATFORM" = true ]; then
  _start_platform
elif ! nc -z localhost 5003 2>/dev/null; then
  warn "Agentex backend not detected on :5003"
  warn "Start it with: cd scale-agentex/agentex && docker compose up -d"
  warn "Or re-run with: ./dev.sh --platform"
fi

# ── Step 1: Kill stale local processes ───────────────────────────────────────
header "Clearing ports"
kill_port 8000
kill_port 8233
kill_port 3000

# ── Step 2: Temporal dev server (only if Docker Temporal not running) ─────────
if ! nc -z localhost 7233 2>/dev/null; then
  header "Starting Temporal dev server"
  if ! command -v temporal >/dev/null 2>&1; then
    err "temporal CLI not found. Install: brew install temporal"; exit 1
  fi
  temporal server start-dev \
    --namespace default \
    --ui-port 8233 \
    --log-level warn \
    &>/tmp/temporal-dev.log &
  echo "    PID $! — logs: tail -f /tmp/temporal-dev.log"
  wait_for_port 7233 "Temporal" 20
else
  ok "Temporal already running on :7233"
fi

# ── Step 3: web-scout agent ───────────────────────────────────────────────────
header "Starting web-scout agent"

VENV_PACKAGES="$ROOT/.venv/lib/python3.12/site-packages"
export PYTHONPATH="$VENV_PACKAGES${PYTHONPATH:+:$PYTHONPATH}"
export AGENTEX_BASE_URL="http://localhost:5003"

if [ "$MOCK" = true ]; then
  export USE_MOCK_BROWSER=true
  export USE_MOCK_SEARCH=true
  log "Mock mode: USE_MOCK_BROWSER=true USE_MOCK_SEARCH=true"
fi

AGENTEX_ARGS="--manifest manifest.yaml"
[ "$CLEANUP" = true ] && AGENTEX_ARGS="$AGENTEX_ARGS --cleanup-on-start"

agentex agents run $AGENTEX_ARGS >/tmp/oumuamua-agent.log 2>&1 &
AGENT_PID=$!
echo "    PID $AGENT_PID — logs: tail -f /tmp/oumuamua-agent.log"
wait_for_port 8000 "Agent ACP" 30
ok "Agent running"

# ── Step 4: oumuamua-ui ───────────────────────────────────────────────────────
header "Starting oumuamua-ui"

if [ ! -d "$UI_DIR" ]; then
  warn "oumuamua-ui not found at $UI_DIR — skipping"
else
  [ ! -d "$UI_DIR/node_modules" ] && (cd "$UI_DIR" && npm install --silent)
  (cd "$UI_DIR" && npm run dev) >/tmp/oumuamua-ui.log 2>&1 &
  UI_PID=$!
  echo "    PID $UI_PID — logs: tail -f /tmp/oumuamua-ui.log"
  wait_for_port 3000 "oumuamua-ui" 30
  ok "UI running"
fi

# ── Ready ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Ready${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  http://localhost:3000           oumuamua-ui"
echo "  http://localhost:5003/swagger   Agentex API"
echo "  http://localhost:8080           Temporal UI"
echo "  tail -f /tmp/oumuamua-agent.log"
echo "  tail -f /tmp/oumuamua-ui.log"
echo "  ./dev.sh --stop   to tear down"
echo ""

trap '_stop_all' INT TERM
log "Ctrl+C to stop."
wait $AGENT_PID 2>/dev/null || true
