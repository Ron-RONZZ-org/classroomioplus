#!/usr/bin/env bash
# dev.sh — One-command dev environment for LibreClassroom.
#
# Usage:
#   ./scripts/dev.sh            Start full dev (API + workers + dashboard)
#   ./scripts/dev.sh --light    Start API-only (no background workers) + dashboard
#   ./scripts/dev.sh stop       Stop all dev servers (kills by port)
#   ./scripts/dev.sh status     Show which dev servers are running
#
# Ports:
#   API:       6035  (was 3002)
#   Dashboard: 6036  (was 5173)
#
# Idempotent: safe to run repeatedly. Uses port-based checks so multiple
# invocations don't accumulate orphan processes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Safety checks ────────────────────────────────────────────────────────

# Check inotify watcher limit — Vite + Tailwind + tsc can easily exceed the
# default (8192) on a large monorepo. The kernel limit is per-user.
check_inotify_limit() {
  local limit
  limit=$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || echo 8192)
  if [ "$limit" -lt 65536 ] 2>/dev/null; then
    warn "Low inotify watcher limit ($limit). Vite may crash with ENOSPC."
    warn "  Increase it with:"
    warn "    sudo bash -c 'echo 524288 > /proc/sys/fs/inotify/max_user_watches'"
    echo ""
  fi
}

# Never run as root — creates root-owned cache files that break subsequent
# non-root runs and makes the whole dev environment fragile.
if [ "$EUID" = "0" ]; then
  echo ""
  echo "  ✘ This script must NOT be run as root."
  echo ""
  echo "     Running with sudo creates root-owned cache files (.svelte-kit/,"
  echo "     .vite/, node_modules/.vite/) that subsequent non-root runs"
  echo "     cannot overwrite, causing EACCES errors."
  echo ""
  echo "     Run as your normal user instead:"
  echo "       ./scripts/dev.sh"
  echo ""
  exit 1
fi

# Detect root-owned cache dirs from a previous erroneous sudo run.
# If found, print a one-shot fix command.
check_root_cache_dirs() {
  local suspect=""
  for dir in "$REPO_ROOT/apps/dashboard/.svelte-kit" "$REPO_ROOT/apps/dashboard/node_modules/.vite"; do
    if [ -d "$dir" ] && [ "$(stat -c '%u' "$dir")" = "0" ]; then
      suspect="$dir"
      break
    fi
  done
  if [ -n "$suspect" ]; then
    echo ""
    echo "  ⚠  Root-owned cache directories detected (from a previous sudo run)."
    echo "     Fix with:"
    echo "       sudo chown -R \$USER:\$USER \\"
    echo "         apps/dashboard/.svelte-kit \\"
    echo "         apps/dashboard/node_modules/.vite"
    echo "     Then re-run this script."
    echo ""
    exit 1
  fi
}
check_root_cache_dirs

# ─── Ports ───────────────────────────────────────────────────────────────
API_PORT=6035
DASHBOARD_PORT=6036
API_URL="http://127.0.0.1:$API_PORT"
DASHBOARD_URL="http://127.0.0.1:$DASHBOARD_PORT"
API_READY_TIMEOUT=60
DASHBOARD_READY_TIMEOUT=90

# ─── Node version ─────────────────────────────────────────────────────────
NVM_NODE_DIR="$HOME/.nvm/versions/node/$(cat "$REPO_ROOT/.nvmrc" 2>/dev/null || echo 'v20.19.3')"
if [ -x "$NVM_NODE_DIR/bin/node" ]; then
  PATH="$HOME/.npm-global/bin:$NVM_NODE_DIR/bin:$PATH"
fi

# ─── Log files ────────────────────────────────────────────────────────────
API_LOG="/tmp/cio-api.log"
DASHBOARD_LOG="/tmp/cio-dashboard.log"
JOBS_LOG="/tmp/cio-jobs.log"

# ─── Helpers ──────────────────────────────────────────────────────────────

info()  { printf "\033[36m➜\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m✔\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m⚠\033[0m %s\n" "$*"; }
err()   { printf "\033[31m✘\033[0m %s\n" "$*" >&2; }

port_in_use() {
  ss -tlnp "sport = :$1" 2>/dev/null | grep -q ":$1"
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

# ─── Commands ─────────────────────────────────────────────────────────────

stop() {
  info "Stopping dev servers on ports $API_PORT and $DASHBOARD_PORT..."
  local killed=false

  if port_in_use "$API_PORT"; then
    fuser -k "$API_PORT/tcp" 2>/dev/null && ok "Stopped API (port $API_PORT)" && killed=true
  else
    ok "API port $API_PORT is free"
  fi

  if port_in_use "$DASHBOARD_PORT"; then
    fuser -k "$DASHBOARD_PORT/tcp" 2>/dev/null && ok "Stopped Dashboard (port $DASHBOARD_PORT)" && killed=true
  else
    ok "Dashboard port $DASHBOARD_PORT is free"
  fi

  # Also clean up orphan job workers (no fixed port, use pgrep)
  for pid in $(pgrep -f "tsx watch.*src/workers/" 2>/dev/null); do
    kill "$pid" 2>/dev/null || true
    killed=true
  done

  if [ "$killed" = true ]; then
    ok "Stopped"
  else
    warn "No servers were running"
  fi

  rm -f "$API_LOG" "$DASHBOARD_LOG" "$JOBS_LOG"
}

status() {
  info "Dev server status:"

  if port_in_use "$API_PORT"; then
    local pid
    pid=$(ss -tlnp "sport = :$API_PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
    ok "API running (PID $pid, port $API_PORT)"
  else
    warn "API not running (port $API_PORT)"
  fi

  if port_in_use "$DASHBOARD_PORT"; then
    local pid
    pid=$(ss -tlnp "sport = :$DASHBOARD_PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
    ok "Dashboard running (PID $pid, port $DASHBOARD_PORT)"
  else
    warn "Dashboard not running (port $DASHBOARD_PORT)"
  fi
}

# ─── Helpers for .env management ──────────────────────────────────────────

# Fill in MinIO defaults for any env var that is still empty ("").
# Only overwrites `=""` — leaves user-configured values untouched.
fill_minio_env() {
  local file="$1"
  local dirty=false

  if grep -q '^OBJECT_STORAGE_ENDPOINT=""$' "$file" 2>/dev/null; then
    sed -i 's|^OBJECT_STORAGE_ENDPOINT=""$|OBJECT_STORAGE_ENDPOINT="http://localhost:9000"|' "$file"
    dirty=true
  fi
  if grep -q '^OBJECT_STORAGE_PUBLIC_ENDPOINT=""$' "$file" 2>/dev/null; then
    sed -i 's|^OBJECT_STORAGE_PUBLIC_ENDPOINT=""$|OBJECT_STORAGE_PUBLIC_ENDPOINT="http://localhost:9000"|' "$file"
    dirty=true
  fi
  if grep -q '^OBJECT_STORAGE_ACCESS_KEY_ID=""$' "$file" 2>/dev/null; then
    sed -i 's|^OBJECT_STORAGE_ACCESS_KEY_ID=""$|OBJECT_STORAGE_ACCESS_KEY_ID="minioadmin"|' "$file"
    dirty=true
  fi
  if grep -q '^OBJECT_STORAGE_SECRET_ACCESS_KEY=""$' "$file" 2>/dev/null; then
    sed -i 's|^OBJECT_STORAGE_SECRET_ACCESS_KEY=""$|OBJECT_STORAGE_SECRET_ACCESS_KEY="minioadmin"|' "$file"
    dirty=true
  fi
  if grep -q '^OBJECT_STORAGE_FORCE_PATH_STYLE=""$' "$file" 2>/dev/null; then
    sed -i 's|^OBJECT_STORAGE_FORCE_PATH_STYLE=""$|OBJECT_STORAGE_FORCE_PATH_STYLE="true"|' "$file"
    dirty=true
  fi
  if grep -q '^OBJECT_STORAGE_MEDIA_PUBLIC_BASE_URL=""$' "$file" 2>/dev/null; then
    sed -i 's|^OBJECT_STORAGE_MEDIA_PUBLIC_BASE_URL=""$|OBJECT_STORAGE_MEDIA_PUBLIC_BASE_URL="http://localhost:9000/media"|' "$file"
    dirty=true
  fi

  if [ "$dirty" = true ]; then
    ok "Filled MinIO defaults in $(basename "$file")"
  fi
}

# ─── Setup ────────────────────────────────────────────────────────────────

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

  # apps/api/.env — update port refs in-place if they exist
  local api_env="$REPO_ROOT/apps/api/.env"
  if [ ! -f "$api_env" ]; then
    cat > "$api_env" <<- APIEOF
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/classroomio"
REDIS_URL="redis://localhost:6379"
PUBLIC_SERVER_URL="http://localhost:$API_PORT"
TRUSTED_ORIGINS="http://localhost:$DASHBOARD_PORT"
BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET"
PRIVATE_SERVER_KEY="$PRIVATE_SERVER_KEY"
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_SENDER=""
SMTP_PASSWORD=""
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
OBJECT_STORAGE_ENDPOINT="${OBJECT_STORAGE_ENDPOINT:-http://localhost:9000}"
OBJECT_STORAGE_PUBLIC_ENDPOINT="${OBJECT_STORAGE_PUBLIC_ENDPOINT:-http://localhost:9000}"
OBJECT_STORAGE_ACCESS_KEY_ID="${OBJECT_STORAGE_ACCESS_KEY_ID:-minioadmin}"
OBJECT_STORAGE_SECRET_ACCESS_KEY="${OBJECT_STORAGE_SECRET_ACCESS_KEY:-minioadmin}"
OBJECT_STORAGE_FORCE_PATH_STYLE="${OBJECT_STORAGE_FORCE_PATH_STYLE:-true}"
OBJECT_STORAGE_MEDIA_PUBLIC_BASE_URL="${OBJECT_STORAGE_MEDIA_PUBLIC_BASE_URL:-http://localhost:9000/media}"
APIEOF
    ok "Created apps/api/.env"
  else
    # Update port references in existing .env files (don't overwrite if user customized)
    local dirty=false
    if grep -q "localhost:3002" "$api_env" 2>/dev/null; then
      sed -i "s|localhost:3002|localhost:$API_PORT|g" "$api_env"
      dirty=true
    fi
    if grep -q "localhost:5173" "$api_env" 2>/dev/null; then
      sed -i "s|localhost:5173|localhost:$DASHBOARD_PORT|g" "$api_env"
      dirty=true
    fi
    if [ "$dirty" = true ]; then
      ok "Updated port references in apps/api/.env"
    fi
  fi

  # apps/dashboard/.env — ensure critical fields are present
  local dash_env="$REPO_ROOT/apps/dashboard/.env"
  if [ ! -f "$dash_env" ]; then
    cat > "$dash_env" <<- DASHEOF
PUBLIC_IS_SELFHOSTED=true
PUBLIC_SERVER_URL=http://localhost:$API_PORT
PRIVATE_SERVER_URL=http://localhost:$API_PORT
PRIVATE_SERVER_KEY=$PRIVATE_SERVER_KEY
PUBLIC_APP_NAME=LibreClassroom
DASHEOF
    ok "Created apps/dashboard/.env"
  else
    # Update port references
    local dirty=false
    if grep -q "localhost:3002" "$dash_env" 2>/dev/null; then
      sed -i "s|localhost:3002|localhost:$API_PORT|g" "$dash_env"
      dirty=true
    fi
    # Ensure PRIVATE_SERVER_KEY is set
    if ! grep -q "^PRIVATE_SERVER_KEY=" "$dash_env" 2>/dev/null; then
      echo "PRIVATE_SERVER_KEY=$PRIVATE_SERVER_KEY" >> "$dash_env"
      ok "Added PRIVATE_SERVER_KEY to apps/dashboard/.env"
    fi
    if ! grep -q "^PUBLIC_SERVER_URL=" "$dash_env" 2>/dev/null; then
      echo "PUBLIC_SERVER_URL=http://localhost:$API_PORT" >> "$dash_env"
      ok "Added PUBLIC_SERVER_URL to apps/dashboard/.env"
    fi
    if ! grep -q "^PRIVATE_SERVER_URL=" "$dash_env" 2>/dev/null; then
      echo "PRIVATE_SERVER_URL=http://localhost:$API_PORT" >> "$dash_env"
      ok "Added PRIVATE_SERVER_URL to apps/dashboard/.env"
    fi
    if [ "$dirty" = true ]; then
      ok "Updated port references in apps/dashboard/.env"
    fi
  fi

  # packages/db/.env
  local db_env="$REPO_ROOT/packages/db/.env"
  if [ ! -f "$db_env" ]; then
    echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/classroomio"' > "$db_env"
    ok "Created packages/db/.env"
  fi

  # apps/jobs/.env — reuse api's
  local jobs_env="$REPO_ROOT/apps/jobs/.env"
  if [ ! -f "$jobs_env" ]; then
    cp "$api_env" "$jobs_env"
    ok "Created apps/jobs/.env (copied from api)"
  fi

  # Fill in MinIO defaults for any vars still empty in api/.env and jobs/.env
  fill_minio_env "$api_env"
  fill_minio_env "$jobs_env"
}

ensure_infra() {
  if ! docker compose version &>/dev/null; then
    err "docker compose (v2) not found. Install: sudo apt-get install docker-compose-v2"
    exit 1
  fi

  if ! docker info &>/dev/null; then
    if [ -e /var/run/docker.sock ]; then
      # Socket exists but current user can't talk to it → group membership issue.
      err "Cannot connect to the Docker daemon — permission denied."
      err ""
      err "  The docker socket exists at /var/run/docker.sock but your user"
      err "  does not have access. This normally means you are not in the"
      err "  'docker' group. Add yourself with:"
      err ""
      err "    sudo usermod -aG docker \$USER"
      err "    newgrp docker   # activate immediately (no logout needed)"
      err ""
      err "  Then re-run this script."
    else
      # Socket missing → daemon probably not running.
      err "Cannot connect to the Docker daemon — socket not found."
      err ""
      err "  The docker socket at /var/run/docker.sock does not exist."
      err "  This normally means the Docker daemon is not running."
      err "  Start it with:"
      err ""
      err "    sudo dockerd &"
      err ""
      err "  Or via your system's service manager:"
      err "    sudo systemctl start docker"
      err ""
    fi
    exit 1
  fi

  if ! docker compose -f "$REPO_ROOT/docker-compose.yaml" ps --status running postgres redis 2>/dev/null | grep -q "postgres\|redis"; then
    info "Starting Postgres and Redis..."
    docker compose -f "$REPO_ROOT/docker-compose.yaml" up -d postgres redis
    ok "Postgres and Redis are running"
  else
    ok "Postgres and Redis already running"
  fi

  # Object storage (MinIO) — needed for media uploads, OG images, video processing.
  # The `--profile minio` flag activates the minio and minio-init services.
  # minio-init auto-creates the required buckets (videos, documents, media).
  if ! docker compose --profile minio -f "$REPO_ROOT/docker-compose.yaml" ps --status running minio 2>/dev/null | grep -q "minio"; then
    info "Starting MinIO (object storage)..."
    docker compose --profile minio -f "$REPO_ROOT/docker-compose.yaml" up -d minio minio-init
    ok "MinIO is running"
  else
    ok "MinIO already running"
  fi
}

ensure_build() {
  info "Building shared packages..."
  # Always run turbo build — its cache handles incremental rebuilds efficiently
  # when nothing changed (sub-second), and this guarantees no stale dist/.
  pnpm turbo run build --filter=@cio/api^... --filter=@cio/dashboard^... 2>&1
  ok "Shared packages built"
}

check_node_modules() {
  # Detects dangling pnpm symlinks (broken node_modules symlinks that would
  # cause cryptic "Cannot find module" at dev time) and auto-repairs them.
  # The doctor script exits 0 (clean), 1 (broken → fixed), or 2 (broken).
  node scripts/doctor.mjs --fix 2>&1
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    return 0
  elif [ "$rc" -eq 1 ]; then
    ok "node_modules repaired"
  else
    warn "node_modules may have broken symlinks — build step may fail"
  fi
}

ensure_db() {
  info "Ensuring database is up-to-date..."
  pnpm --filter @cio/db db:setup:seed
  ok "Database ready"
}

# ─── Start ────────────────────────────────────────────────────────────────

start_full() {
  local light="${1:-false}"

  info "Starting LibreClassroom dev environment..."
  echo ""

  check_inotify_limit

  # Check port availability before starting
  local port_conflict=false
  if port_in_use "$API_PORT"; then
    err "Port $API_PORT is already in use. Run '$0 stop' first or check what's using it."
    ss -tlnp "sport = :$API_PORT" 2>/dev/null | head -3
    port_conflict=true
  fi
  if port_in_use "$DASHBOARD_PORT"; then
    err "Port $DASHBOARD_PORT is already in use. Run '$0 stop' first or check what's using it."
    ss -tlnp "sport = :$DASHBOARD_PORT" 2>/dev/null | head -3
    port_conflict=true
  fi
  if [ "$port_conflict" = true ]; then
    exit 1
  fi

  ensure_infra
  echo ""
  setup_env
  echo ""
  check_node_modules
  echo ""
  ensure_build
  echo ""
  ensure_db
  echo ""

  # Clean stale log files
  rm -f "$API_LOG" "$DASHBOARD_LOG" "$JOBS_LOG"

  if [ "$light" = "true" ]; then
    info "Starting API server only (no background workers)..."
    # Start in a new process group so we can kill the whole tree
    setsid pnpm --filter @cio/api run dev:server > "$API_LOG" 2>&1 &
    API_SETSID=$!
    info "API starting (PID $API_SETSID) — log: tail -f $API_LOG"
  else
    info "Starting API + background workers..."
    setsid pnpm api:dev > "$API_LOG" 2>&1 &
    API_SETSID=$!
    info "API starting (PID $API_SETSID) — log: tail -f $API_LOG"
  fi

  info "Starting Dashboard..."
  setsid pnpm dashboard:dev > "$DASHBOARD_LOG" 2>&1 &
  DASHBOARD_SETSID=$!
  info "Dashboard starting (PID $DASHBOARD_SETSID) — log: tail -f $DASHBOARD_LOG"

  echo ""
  info "Waiting for servers to be ready..."

  local api_ok=false dashboard_ok=false
  if wait_for_ready "$API_URL/" "API" "$API_READY_TIMEOUT" "$API_LOG"; then
    api_ok=true
  fi
  if wait_for_ready "$DASHBOARD_URL/" "Dashboard" "$DASHBOARD_READY_TIMEOUT" "$DASHBOARD_LOG"; then
    dashboard_ok=true
  fi

  echo ""
  if [ "$api_ok" = true ] && [ "$dashboard_ok" = true ]; then
    ok "Dev environment is running!"
  else
    warn "Some services did not start (check logs above)."
  fi
  echo ""
  echo "   API:       http://localhost:$API_PORT"
  echo "   API Docs:  http://localhost:$API_PORT/docs"
  echo "   Dashboard: http://localhost:$DASHBOARD_PORT"
  echo "   Login:     admin@test.com / 123456"
  echo ""
  echo "   Logs:"
  echo "     API:        tail -f $API_LOG"
  echo "     Dashboard:  tail -f $DASHBOARD_LOG"
  echo ""
  echo "   Stop:  $0 stop"
}

# ─── Main ──────────────────────────────────────────────────────────────────

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
    echo ""
    echo "Ports — API: $API_PORT, Dashboard: $DASHBOARD_PORT"
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
