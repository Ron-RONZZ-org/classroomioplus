#!/usr/bin/env bash
# test-e2e.sh — One-command E2E run for LibreClassroom.
#
# Usage:
#   ./scripts/test-e2e.sh                # full E2E suite against the dev servers
#   ./scripts/test-e2e.sh --smoke        # fast smoke: export/import + core login tests
#   ./scripts/test-e2e.sh --grep PATTERN # run only tests matching PATTERN
#   ./scripts/test-e2e.sh --stop         # stop servers started by this script
#
# Spins up (if not already running): Postgres + Redis (docker compose),
# the API dev server (:6035) and the dashboard dev server (:6036), then runs
# Playwright against http://localhost:6036.
#
# NOTE on speed: the Vite dev server compiles routes on demand — a cold first
# run can take minutes (each page 60-120s). CI runs the production build
# instead (see ci.yml scope=e2e) which is pre-compiled and much faster.
# For local iteration use --smoke or --grep to avoid the full ~40min suite.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
export PATH="$HOME/.nvm/versions/node/v20.19.3/bin:$PATH"

PORT_SCRIPT="$SCRIPT_DIR/dev.sh"
DASHBOARD_PORT=6036
API_PORT=6035
PID_FILE_API="${REPO_ROOT}/.e2e-api.pid"
PID_FILE_DASH="${REPO_ROOT}/.e2e-dash.pid"

GREP_ARGS=()
RUN_MODE="full"

for arg in "$@"; do
  case "$arg" in
    --smoke) GREP_ARGS=(--grep "TC-CRUD-10|TC-CRUD-11|TC-01|TC-02|TC-03") ;;
    --grep) RUN_MODE="grep" ;;
    --stop) RUN_MODE="stop" ;;
    *) if [ "$RUN_MODE" = "grep" ]; then GREP_ARGS=(--grep "$arg"); RUN_MODE="full"; fi ;;
  esac
done

if [ "$RUN_MODE" = "stop" ]; then
  if [ -f "$PID_FILE_API" ]; then kill "$(cat "$PID_FILE_API")" 2>/dev/null || true; rm -f "$PID_FILE_API"; fi
  if [ -f "$PID_FILE_DASH" ]; then kill "$(cat "$PID_FILE_DASH")" 2>/dev/null || true; rm -f "$PID_FILE_DASH"; fi
  echo "Stopped E2E servers."
  exit 0
fi

cd "$REPO_ROOT"

# 1. Database + Redis via docker compose
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q cio-postgres; then
  echo "▶ Starting Postgres + Redis..."
  docker compose up -d postgres redis
  for i in $(seq 1 30); do
    docker exec cio-postgres pg_isready -U postgres >/dev/null 2>&1 && break
    sleep 2
  done
fi

# 2. Seed if needed (idempotent — seed skips existing rows)
echo "▶ Seeding database (idempotent)..."
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/classroomio" \
  pnpm --filter @cio/db db:setup:seed

# 3. API server (if not already listening)
if ! curl -s -o /dev/null --max-time 2 "http://localhost:${API_PORT}/" 2>/dev/null; then
  echo "▶ Starting API dev server (:${API_PORT})..."
  setsid pnpm api:dev > "${REPO_ROOT}/.e2e-api.log" 2>&1 &
  echo $! > "$PID_FILE_API"
  for i in $(seq 1 60); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${API_PORT}/" 2>/dev/null || true)
    [ "$code" = "200" ] || [ "$code" = "404" ] || [ "$code" = "401" ] && break
    sleep 5
  done
fi

# 4. Dashboard dev server (if not already listening)
if ! curl -s -o /dev/null --max-time 2 "http://localhost:${DASHBOARD_PORT}/login" 2>/dev/null; then
  echo "▶ Starting dashboard dev server (:${DASHBOARD_PORT})..."
  setsid pnpm --filter @cio/dashboard dev > "${REPO_ROOT}/.e2e-dash.log" 2>&1 &
  echo $! > "$PID_FILE_DASH"
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://localhost:${DASHBOARD_PORT}/login" 2>/dev/null || true)
    [ "$code" = "200" ] && break
    sleep 10
  done
fi

# 5. Run Playwright
echo "▶ Running E2E (E2E_BASE_URL=http://localhost:${DASHBOARD_PORT})..."
cd "$REPO_ROOT/apps/dashboard"
E2E_BASE_URL="http://localhost:${DASHBOARD_PORT}" \
  npx playwright test --config e2e/playwright.config.ts "${GREP_ARGS[@]}"
