#!/usr/bin/env bash
# dev.sh — One-command dev environment for LibreClassroom.
#
# Usage:
#   ./scripts/dev.sh            Start full dev (API + workers + dashboard)
#   ./scripts/dev.sh --light    Start API-only (no background workers) + dashboard
#   ./scripts/dev.sh stop       Stop all dev servers (kills by saved PIDs)
#   ./scripts/dev.sh status     Show which dev servers are running
#
# Idempotent: safe to run repeatedly. DB seed skips if already seeded.
# Save PIDs for clean shutdown — never blindly kills by port.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATH="$HOME/.npm-global/bin:$HOME/.nvm/versions/node/v20.19.3/bin:$PATH"

API_PID_FILE="/tmp/cio-api.pid"
DASHBOARD_PID_FILE="/tmp/cio-dashboard.pid"
JOBS_PID_FILE="/tmp/cio-jobs.pid"
API_LOG="/tmp/cio-api.log"
DASHBOARD_LOG="/tmp/cio-dashboard.log"
JOBS_LOG="/tmp/cio-jobs.log"

# ─── Helpers ────────────────────────────────────────────────────────────────

info()  { printf "\033[36m➜\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m✔\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m⚠\033[0m %s\n" "$*"; }
err()   { printf "\033[31m✘\033[0m %s\n" "$*" >&2; }

cleanup() {
  local pid_file="$1" name="$2"
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && ok "Stopped $name (PID $pid)" || warn "Could not stop $name"
    fi
    rm -f "$pid_file"
  fi
}

wait_for_ready() {
  local url="$1" label="$2" max_attempts="${3:-60}"
  for i in $(seq 1 "$max_attempts"); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      ok "$label is ready"
      return 0
    fi
    sleep 1
  done
  warn "$label did not respond within ${max_attempts}s (check logs: $4)"
  return 1
}

# ─── Commands ────────────────────────────────────────────────────────────────

stop() {
  info "Stopping dev servers..."
  cleanup "$API_PID_FILE" "API"
  cleanup "$JOBS_PID_FILE" "jobs"
  cleanup "$DASHBOARD_PID_FILE" "dashboard"
  # Also catch any orphan tsx/vite processes from hard kills
  for pid in $(pgrep -f "tsx watch.*(index\.ts|src/workers/)" 2>/dev/null); do
    kill "$pid" 2>/dev/null || true
  done
  for pid in $(pgrep -f "vite.*5173" 2>/dev/null); do
    kill "$pid" 2>/dev/null || true
  done
  ok "Stopped"
}

status() {
  info "Dev server status:"
  for pair in "$API_PID_FILE" "API :3002" "$DASHBOARD_PID_FILE" "Dashboard :5173" "$JOBS_PID_FILE" "Jobs"; do
    local pid_file="$pair" label="${pair#* }"
    # Actually let me do this properly
  done
  
  for pid_file in "$API_PID_FILE" "$DASHBOARD_PID_FILE" "$JOBS_PID_FILE"; do
    local name
    case "$pid_file" in
      "$API_PID_FILE") name="API" ;;
      "$DASHBOARD_PID_FILE") name="Dashboard" ;;
      "$JOBS_PID_FILE") name="Jobs" ;;
    esac
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file")
      if kill -0 "$pid" 2>/dev/null; then
        ok "$name running (PID $pid)"
      else
        warn "$name PID file exists but process dead (stale: $pid_file)"
      fi
    else
      warn "$name not running"
    fi
  done
}

# ─── Setup ──────────────────────────────────────────────────────────────────

setup_env() {
  # Root .env — Docker Compose needs BETTER_AUTH_SECRET + PRIVATE_SERVER_KEY
  if [ ! -f "$REPO_ROOT/.env" ]; then
    local key
    key=$(openssl rand -hex 32)
    echo "BETTER_AUTH_SECRET=$key" > "$REPO_ROOT/.env"
    echo "PRIVATE_SERVER_KEY=$key" >> "$REPO_ROOT/.env"
    ok "Created .env with new session keys"
  fi

  # Source the root env so we can reuse the server key
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env"

  # apps/api/.env
  if [ ! -f "$REPO_ROOT/apps/api/.env" ]; then
    cat > "$REPO_ROOT/apps/api/.env" <<- APIEOF
	DATABASE_URL="postgresql://postgres:postgres@localhost:5432/classroomio"
	REDIS_URL="redis://localhost:6379"
	PUBLIC_SERVER_URL="http://localhost:3002"
	TRUSTED_ORIGINS="http://localhost:5173"
	BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET"
	PRIVATE_SERVER_KEY="$PRIVATE_SERVER_KEY"
	SMTP_HOST=""
	SMTP_PORT=""
	SMTP_USER=""
	SMTP_SENDER=""
	SMTP_PASSWORD=""
	MINIO_ROOT_USER=""
	MINIO_ROOT_PASSWORD=""
	OBJECT_STORAGE_ENDPOINT=""
	OBJECT_STORAGE_PUBLIC_ENDPOINT=""
	OBJECT_STORAGE_ACCESS_KEY_ID=""
	OBJECT_STORAGE_SECRET_ACCESS_KEY=""
	OBJECT_STORAGE_FORCE_PATH_STYLE=""
	OBJECT_STORAGE_MEDIA_PUBLIC_BASE_URL=""
	APIEOF
    ok "Created apps/api/.env"
  fi

  # apps/dashboard/.env — ensure critical fields are present
  if [ ! -f "$REPO_ROOT/apps/dashboard/.env" ]; then
    cat > "$REPO_ROOT/apps/dashboard/.env" <<- DASHEOF
	PUBLIC_IS_SELFHOSTED=true
	PUBLIC_SERVER_URL=http://localhost:3002
	PRIVATE_SERVER_URL=http://localhost:3002
	PRIVATE_SERVER_KEY=$PRIVATE_SERVER_KEY
	PUBLIC_APP_NAME=LibreClassroom
	DASHEOF
    ok "Created apps/dashboard/.env"
  else
    # Ensure PRIVATE_SERVER_KEY is set in dashboard env
    if ! grep -q "^PRIVATE_SERVER_KEY=" "$REPO_ROOT/apps/dashboard/.env" 2>/dev/null; then
      echo "PRIVATE_SERVER_KEY=$PRIVATE_SERVER_KEY" >> "$REPO_ROOT/apps/dashboard/.env"
      ok "Added PRIVATE_SERVER_KEY to apps/dashboard/.env"
    fi
    if ! grep -q "^PUBLIC_SERVER_URL=" "$REPO_ROOT/apps/dashboard/.env" 2>/dev/null; then
      echo "PUBLIC_SERVER_URL=http://localhost:3002" >> "$REPO_ROOT/apps/dashboard/.env"
      ok "Added PUBLIC_SERVER_URL to apps/dashboard/.env"
    fi
    if ! grep -q "^PRIVATE_SERVER_URL=" "$REPO_ROOT/apps/dashboard/.env" 2>/dev/null; then
      echo "PRIVATE_SERVER_URL=http://localhost:3002" >> "$REPO_ROOT/apps/dashboard/.env"
      ok "Added PRIVATE_SERVER_URL to apps/dashboard/.env"
    fi
  fi

  # packages/db/.env
  if [ ! -f "$REPO_ROOT/packages/db/.env" ]; then
    echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/classroomio"' > "$REPO_ROOT/packages/db/.env"
    ok "Created packages/db/.env"
  fi

  # apps/jobs/.env
  if [ ! -f "$REPO_ROOT/apps/jobs/.env" ]; then
    cp "$REPO_ROOT/apps/api/.env" "$REPO_ROOT/apps/jobs/.env"
    ok "Created apps/jobs/.env (copied from api)"
  fi
}

ensure_infra() {
  # Docker Compose v2 is required
  if ! docker compose version &>/dev/null; then
    err "docker compose (v2) not found. Install: sudo apt-get install docker-compose-v2"
    exit 1
  fi

  # Check if the docker socket is accessible (catching permission denied)
  if ! docker info &>/dev/null; then
    err "Cannot connect to the Docker daemon. Is the docker socket accessible?"
    err ""
    err "  If you just installed Docker, your user may not be in the 'docker' group yet."
    err "  Run the following to fix it:"
    err ""
    err "    sudo usermod -aG docker \$USER"
    err "    newgrp docker   # activate immediately (no logout needed)"
    err ""
    err "  Then re-run this script."
    err ""
    err "  See README.md → Prerequisites → Docker for details."
    exit 1
  fi

  # Start Postgres + Redis if not running
  if ! docker compose -f "$REPO_ROOT/docker-compose.yaml" ps --status running postgres redis 2>/dev/null | grep -q "postgres\|redis"; then
    info "Starting Postgres and Redis..."
    docker compose -f "$REPO_ROOT/docker-compose.yaml" up -d postgres redis
    ok "Postgres and Redis are running"
  else
    ok "Postgres and Redis already running"
  fi
}

ensure_build() {
  if [ ! -d "$REPO_ROOT/packages/utils/dist" ] || [ ! -d "$REPO_ROOT/packages/core/dist" ]; then
    info "Building shared packages..."
    pnpm turbo run build --filter=@cio/api^... --filter=@cio/dashboard^...
    ok "Shared packages built"
  else
    ok "Shared packages already built"
  fi
}

ensure_db() {
  info "Ensuring database is up-to-date..."
  pnpm --filter @cio/db db:setup:seed
  ok "Database ready"
}

# ─── Start ──────────────────────────────────────────────────────────────────

start_full() {
  local light="${1:-false}"

  info "Starting LibreClassroom dev environment..."
  echo ""

  # Ensure infrastructure
  ensure_infra
  echo ""

  # Ensure configuration
  setup_env
  echo ""

  # Ensure build
  ensure_build
  echo ""

  # Ensure database
  ensure_db
  echo ""

  # Kill any leftovers from previous runs
  for pid_file in "$API_PID_FILE" "$DASHBOARD_PID_FILE" "$JOBS_PID_FILE"; do
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file")
      if kill -0 "$pid" 2>/dev/null; then
        warn "Stale $pid_file — process still running. Use '$0 stop' first."
        exit 1
      fi
      rm -f "$pid_file"
    fi
  done

  if [ "$light" = "true" ]; then
    info "Starting API server only (no background workers)..."
    rm -f "$API_PID_FILE"
    cd "$REPO_ROOT"
    setsid pnpm --filter @cio/api run dev:server > "$API_LOG" 2>&1 &
    echo $! > "$API_PID_FILE"
  else
    info "Starting API + background workers..."
    rm -f "$API_PID_FILE" "$JOBS_PID_FILE"
    cd "$REPO_ROOT"
    # Run api:dev via setsid so concurrent children survive shell timeout
    setsid pnpm api:dev > "$API_LOG" 2>&1 &
    echo $! > "$API_PID_FILE"
  fi

  info "Starting Dashboard..."
  rm -f "$DASHBOARD_PID_FILE"
  cd "$REPO_ROOT"
  setsid pnpm dashboard:dev > "$DASHBOARD_LOG" 2>&1 &
  echo $! > "$DASHBOARD_PID_FILE"

  echo ""
  info "Waiting for servers to be ready..."

  wait_for_ready "http://127.0.0.1:3002/" "API" 30 "$API_LOG"
  wait_for_ready "http://127.0.0.1:5173/" "Dashboard" 90 "$DASHBOARD_LOG"

  echo ""
  ok "Dev environment is running!"
  echo ""
  echo "   API:       http://localhost:3002"
  echo "   Dashboard: http://localhost:5173"
  echo "   Login:     admin@test.com / 123456"
  echo ""
  echo "   Logs:"
  echo "     API:        tail -f $API_LOG"
  echo "     Dashboard:  tail -f $DASHBOARD_LOG"
  echo ""
  echo "   Stop:  $0 stop"
}

# ─── Main ────────────────────────────────────────────────────────────────────

case "${1:-}" in
  stop)
    stop
    ;;
  status)
    status
    ;;
  --light)
    start_full true
    ;;
  -h|--help)
    echo "Usage: $0 [stop|status|--light|--help]"
    echo ""
    echo "Start full dev environment (API + workers + dashboard):"
    echo "  $0"
    echo ""
    echo "Start API-only (no background workers) + dashboard:"
    echo "  $0 --light"
    echo ""
    echo "Stop all dev servers:"
    echo "  $0 stop"
    echo ""
    echo "Show running status:"
    echo "  $0 status"
    exit 0
    ;;
  "")
    start_full false
    ;;
  *)
    err "Unknown command: $1"
    echo "Usage: $0 [stop|status|--light|--help]"
    exit 1
    ;;
esac
