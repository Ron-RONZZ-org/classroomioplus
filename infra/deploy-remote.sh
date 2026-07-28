#!/usr/bin/env bash
# deploy-remote.sh — Post-deploy steps on the VPS.
#
# Called from a GitHub Actions workflow after rsync-ing pre-built artifacts,
# or run directly on the VPS with --build to build from source.
#
# Usage:
#   # Default: artifacts arrived via rsync from CI (no build on VPS)
#   bash infra/deploy-remote.sh
#
#   # Build from source on the VPS (fallback when CI is unavailable)
#   bash infra/deploy-remote.sh --build
#
#   # Non-interactive: skip confirmation prompts (CI mode)
#   bash infra/deploy-remote.sh --yes
#
# Preconditions:
#   - The repo is cloned at /var/www/classroomio
#   - infra/ecosystem.config.cjs exists
#
# What it does:
#   1. Check dependencies (Node, pnpm, PM2, Postgres, Redis, Docker, ffmpeg)
#   2. Check .env files for required variables
#   3. pnpm install --frozen-lockfile (runtime deps)
#   4. Optionally pnpm -r build (only with --build)
#   5. Symlink apps/jobs/.env → apps/api/.env
#   6. db:setup (schema migrations)
#   7. Ensure MinIO is running in Docker
#   8. PM2 reload all processes

set -euo pipefail

APP_DIR="/var/www/classroomio"
BUILD=false
ASSUME_YES=false

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) BUILD=true; shift ;;
    --yes|-y) ASSUME_YES=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--build] [--yes]"
      echo "  --build  Build TypeScript on the VPS (default: skip, expect rsynced artifacts)"
      echo "  --yes    Non-interactive mode — skip all prompts, fail on missing deps"
      exit 0
      ;;
    *) echo "Error: Unknown option: $1"; exit 1 ;;
  esac
done

# ── Utils ────────────────────────────────────────────────────────────────────
log()  { printf '\e[32m[deploy]\e[0m %s\n' "$*"; }
warn() { printf '\e[33m[deploy]\e[0m %s\n' "$*" >&2; }
err()  { printf '\e[31m[deploy]\e[0m %s\n' "$*" >&2; }

# Detect if running interactively (SSH terminal) vs CI.
IS_INTERACTIVE=false
[ -t 0 ] && IS_INTERACTIVE=true

confirm() {
  local prompt="${1:-Continue?} [Y/n] "
  local response
  read -r -p "${prompt}" response
  case "${response}" in
    n|N|no|NO) return 1 ;;
    *) return 0 ;;
  esac
}

cd "$APP_DIR"

# ── 0a. Dependency checks ───────────────────────────────────────────────────
log ""
log "── Dependency check ─────────────────────────────────────"
DEPS_OK=true

# In --yes (non-interactive) mode: never install, print error + fix hint, fail.
# In interactive mode: prompt [Y/n] to auto-install.

check_cmd() {
  local name="$1" cmd="$2" version_cmd="${3:-$2 --version 2>/dev/null | head -1}"
  if command -v "$cmd" &>/dev/null; then
    local ver
    ver=$(eval "$version_cmd" 2>/dev/null || echo "present")
    log "  $name: $ver"
    return 0
  fi
  # Not found — behavior differs by mode
  if [ "$ASSUME_YES" = true ] || [ "$IS_INTERACTIVE" = false ]; then
    err "  $name: NOT FOUND (required)"
  else
    warn "  $name: not found"
  fi
  DEPS_OK=false
  return 1
}

try_install() {
  local name="$1" install_cmd="$2"
  if [ "$ASSUME_YES" = true ] || [ "$IS_INTERACTIVE" = false ]; then
    # Non-interactive mode: print error with fix hint, don't install
    err "  Fix: $install_cmd"
    return 1
  fi
  if confirm "  Install $name?"; then
    eval "$install_cmd" && log "  $name: installed" && return 0
    warn "  $name: installation failed — continuing anyway"
    return 1
  fi
  return 1
}

# Node
if check_cmd "Node" node "node -v | head -1"; then
  NODE_VER=$(node -v)
  EXPECTED=$(cat "$APP_DIR/.nvmrc" 2>/dev/null || echo "v20.19.3")
  log "         (repo expects $EXPECTED)"
else
  try_install "Node 20" 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs' && DEPS_OK=true
fi

# pnpm
if check_cmd "pnpm" pnpm "pnpm -v | head -1"; then
  :
else
  try_install "pnpm" 'sudo npm install -g pnpm@10.19.0' && DEPS_OK=true
fi

# PM2
if check_cmd "PM2" pm2 "pm2 --version | head -1"; then
  :
else
  try_install "PM2" 'sudo npm install -g pm2' && DEPS_OK=true
fi

# PostgreSQL — check native first, then Docker
PG_OK=false
if command -v psql &>/dev/null && pg_isready -h 127.0.0.1 &>/dev/null 2>&1; then
  log "  Postgres: running (native)"
  PG_OK=true
elif docker ps --filter name=cio-postgres --format '{{.Names}}' 2>/dev/null | grep -q cio-postgres; then
  log "  Postgres: running (Docker container cio-postgres)"
  PG_OK=true
elif [ "$ASSUME_YES" = true ] || [ "$IS_INTERACTIVE" = false ]; then
  err "  Postgres: NOT RUNNING (required)"
  err "  Fix: docker run -d --name cio-postgres -e POSTGRES_DB=classroomio -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:5432:5432 postgres:16-alpine"
  DEPS_OK=false
else
  warn "  Postgres: not running"
  if confirm "  Start Postgres 16 in Docker? (persistent volume)"; then
    docker run -d --name cio-postgres \
      -e POSTGRES_DB=classroomio \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -p 127.0.0.1:5432:5432 \
      --restart unless-stopped \
      postgres:16-alpine 2>/dev/null
    log "  Postgres: started (user=postgres, password=postgres, db=classroomio)"
    if grep -q '^DATABASE_URL=""$' apps/api/.env 2>/dev/null; then
      sed -i 's|^DATABASE_URL=""$|DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/classroomio"|' apps/api/.env
    fi
    PG_OK=true
  fi
fi

# Redis — check native first, then Docker
REDIS_OK=false
if redis-cli ping &>/dev/null 2>&1; then
  log "  Redis:    running"
  REDIS_OK=true
elif docker ps --filter name=cio-redis --format '{{.Names}}' 2>/dev/null | grep -q cio-redis; then
  log "  Redis:    running (Docker container cio-redis)"
  REDIS_OK=true
elif [ "$ASSUME_YES" = true ] || [ "$IS_INTERACTIVE" = false ]; then
  err "  Redis: NOT RUNNING (required)"
  err "  Fix: docker run -d --name cio-redis -p 127.0.0.1:6379:6379 redis:7-alpine"
  DEPS_OK=false
else
  warn "  Redis:    not running"
  if confirm "  Start Redis 7 in Docker? (persistent volume)"; then
    docker run -d --name cio-redis \
      -p 127.0.0.1:6379:6379 \
      --restart unless-stopped \
      redis:7-alpine 2>/dev/null
    log "  Redis:    started"
    if grep -q '^REDIS_URL=""$' apps/api/.env 2>/dev/null; then
      sed -i 's|^REDIS_URL=""$|REDIS_URL="redis://127.0.0.1:6379"|' apps/api/.env
    fi
    REDIS_OK=true
  fi
fi

# Docker (needed for MinIO only)
if command -v docker &>/dev/null; then
  log "  Docker:   $(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ',')"
else
  warn "  Docker:   not found (needed for MinIO object storage)"
  warn "  Fix: curl -fsSL https://get.docker.com | sh"
fi

# ffmpeg (optional — jobs worker media processing)
if command -v ffmpeg &>/dev/null; then
  log "  ffmpeg:   $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f1-3)"
else
  warn "  ffmpeg:   not found (media worker optional — thumbnails, transcoding)"
  try_install "ffmpeg" "sudo apt-get install -y ffmpeg"
fi

echo ""

# Fail if critical deps are missing
if [ "$PG_OK" = false ]; then
  err "FATAL: Postgres is not running. Cannot run database migrations."
  DEPS_OK=false
fi
if [ "$REDIS_OK" = false ]; then
  err "FATAL: Redis is not running. The jobs worker and session store require it."
  DEPS_OK=false
fi
if [ "$DEPS_OK" = false ]; then
  exit 1
fi

# ── 0b. .env validation ────────────────────────────────────────────────────
log "── .env validation ─────────────────────────────────────"

env_missing_var() {
  local file="$1" var="$2"
  local val
  val=$(grep -E "^${var}=" "$file" 2>/dev/null | cut -d= -f2-)
  if [ -z "$val" ] || [ "$val" = '""' ] || [ "$val" = "''" ]; then
    warn "  ${file}: ${var} is empty or missing"
    return 1
  fi
  return 0
}

API_ENV_OK=true
DASH_ENV_OK=true

[ -f apps/api/.env ] || { err "  apps/api/.env not found"; API_ENV_OK=false; }
[ -f apps/dashboard/.env ] || { err "  apps/dashboard/.env not found"; DASH_ENV_OK=false; }

if [ "$API_ENV_OK" = true ]; then
  env_missing_var apps/api/.env DATABASE_URL && log "  api .env: DATABASE_URL    ✓" || API_ENV_OK=false
  env_missing_var apps/api/.env REDIS_URL && log "  api .env: REDIS_URL       ✓" || API_ENV_OK=false
  env_missing_var apps/api/.env BETTER_AUTH_SECRET && log "  api .env: BETTER_AUTH_SECRET ✓" || API_ENV_OK=false
  env_missing_var apps/api/.env PRIVATE_SERVER_KEY && log "  api .env: PRIVATE_SERVER_KEY ✓" || API_ENV_OK=false
fi

if [ "$DASH_ENV_OK" = true ]; then
  env_missing_var apps/dashboard/.env PRIVATE_SERVER_KEY && log "  dash .env: PRIVATE_SERVER_KEY ✓" || DASH_ENV_OK=false
  env_missing_var apps/dashboard/.env PUBLIC_SERVER_URL && log "  dash .env: PUBLIC_SERVER_URL  ✓" || true
  env_missing_var apps/dashboard/.env PRIVATE_SERVER_URL && log "  dash .env: PRIVATE_SERVER_URL  ✓" || true

  # Warn if API and dashboard PRIVATE_SERVER_KEY differ
  API_KEY=$(grep -E '^PRIVATE_SERVER_KEY=' apps/api/.env 2>/dev/null | cut -d= -f2-)
  DASH_KEY=$(grep -E '^PRIVATE_SERVER_KEY=' apps/dashboard/.env 2>/dev/null | cut -d= -f2-)
  if [ -n "$API_KEY" ] && [ -n "$DASH_KEY" ] && [ "$API_KEY" != "$DASH_KEY" ]; then
    warn "  ✗ PRIVATE_SERVER_KEY differs between api and dashboard .env — API calls from dashboard will be rejected"
    DASH_ENV_OK=false
  fi
fi

echo ""

# ── 1. Install runtime dependencies ─────────────────────────────────────────
log "[1] Installing runtime dependencies"
pnpm install --frozen-lockfile --shamefully-hoist

# ── 2. Build from source (optional) ─────────────────────────────────────────
if [ "$BUILD" = true ]; then
  log "[2] Building TypeScript on VPS"
  pnpm -r build
else
  log "[2] Skipping build (using pre-built artifacts from CI)"
fi

# ── 3. Symlink jobs .env → api .env ─────────────────────────────────────────
log "[3] Linking apps/jobs/.env → apps/api/.env"
ln -sf ../api/.env apps/jobs/.env

# ── 4. Database setup ───────────────────────────────────────────────────────
log "[4] Running database setup (schema migrations)"
(
  set -a
  # shellcheck disable=SC1090
  grep -E '^(DATABASE_URL|PRIVATE_DATABASE_URL|BETTER_AUTH_SECRET|REDIS_URL)=' apps/api/.env > /tmp/cio-db-setup.env
  source /tmp/cio-db-setup.env
  set +a
  pnpm --filter @cio/db db:setup
  rm -f /tmp/cio-db-setup.env
)

# ── 5. MinIO (Docker) ───────────────────────────────────────────────────────
log "[5] Ensuring MinIO is running"
# MinIO is the only service that still runs in Docker. We start it directly
# with docker run (no compose file needed).
MINIO_U=$(grep -E '^OBJECT_STORAGE_ACCESS_KEY_ID=' apps/api/.env 2>/dev/null | cut -d= -f2-)
MINIO_P=$(grep -E '^OBJECT_STORAGE_SECRET_ACCESS_KEY=' apps/api/.env 2>/dev/null | cut -d= -f2-)

if [ -z "$MINIO_U" ] || [ -z "$MINIO_P" ]; then
  warn "  MinIO credentials not in apps/api/.env (OBJECT_STORAGE_ACCESS_KEY_ID / _SECRET_ACCESS_KEY)"
  warn "  Skipping MinIO setup — uploads and media will fail until configured"
elif docker ps --filter name=cio-minio --format '{{.Names}}' 2>/dev/null | grep -q cio-minio; then
  log "  MinIO:    already running (container cio-minio)"
else
  log "  MinIO:    starting..."
  # Ensure Docker volume exists
  docker volume inspect cio-minio-data &>/dev/null || docker volume create cio-minio-data >/dev/null
  docker run -d --name cio-minio \
    -p 127.0.0.1:9000:9000 \
    -p 127.0.0.1:9001:9001 \
    -e MINIO_ROOT_USER="$MINIO_U" \
    -e MINIO_ROOT_PASSWORD="$MINIO_P" \
    -v cio-minio-data:/data \
    --restart unless-stopped \
    minio/minio:latest server /data --console-address ":9001" 2>/dev/null
  log "  MinIO:    started (API :9000, console :9001)"
  # Create required buckets
  sleep 3
  docker run --rm --network host \
    -e MINIO_ROOT_USER="$MINIO_U" \
    -e MINIO_ROOT_PASSWORD="$MINIO_P" \
    minio/mc:latest \
    sh -c "mc alias set local http://127.0.0.1:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD \
      && mc mb local/videos --ignore-existing \
      && mc mb local/documents --ignore-existing \
      && mc mb local/media --ignore-existing \
      && mc anonymous set download local/media" >/dev/null 2>&1 || true
  log "  MinIO:    buckets created (videos, documents, media)"
fi

# ── 6. PM2 reload ───────────────────────────────────────────────────────────
log "[6] Reloading PM2 processes"
# startOrReload: starts if absent, zero-downtime reload if running.
pm2 startOrReload infra/ecosystem.config.cjs --env production --update-env
pm2 save

# ── Done ─────────────────────────────────────────────────────────────────────
log "Deploy complete."
log "Verify: pm2 ls && docker ps && curl -sS http://127.0.0.1:3081/"

if [ "$API_ENV_OK" = false ] || [ "$DASH_ENV_OK" = false ]; then
  warn ""
  warn "── Post-deploy notes ────────────────────────────────"
  warn "  Some .env variables were missing or misconfigured."
  warn "  The services may start but won't function fully."
  warn "  Edit the .env files in apps/api/ and apps/dashboard/"
  warn "  then run: pm2 restart all"
fi
