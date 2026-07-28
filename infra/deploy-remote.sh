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
# When non-interactive, skip prompts and use the --yes default.
IS_INTERACTIVE=false
[ -t 0 ] && IS_INTERACTIVE=true

confirm() {
  local prompt="${1:-Continue?} [Y/n] "
  local response
  if [ "$ASSUME_YES" = true ] || [ "$IS_INTERACTIVE" = false ]; then
    return 0
  fi
  read -r -p "${prompt}" response
  case "${response}" in
    n|N|no|NO) return 1 ;;
    *) return 0 ;;
  esac
}

require_command() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command not found: $1"
    return 1
  fi
}

cd "$APP_DIR"

# ── 0a. Dependency checks ───────────────────────────────────────────────────
log ""
log "── Dependency check ─────────────────────────────────────"
PASS=true

# Node version
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  EXPECTED=$(cat "$APP_DIR/.nvmrc" 2>/dev/null || echo "v20.19.3")
  log "  Node:     $NODE_VER (repo expects $EXPECTED)"
  NODE_OK=true
else
  warn "  Node:     not found"
  if confirm "  Install Node 20 via NodeSource?"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
    sudo apt-get install -y nodejs
    NODE_OK=true
  fi
fi

# pnpm
PNPM_OK=false
if command -v pnpm &>/dev/null; then
  PNPM_VER=$(pnpm -v)
  log "  pnpm:     $PNPM_VER"
  PNPM_OK=true
else
  warn "  pnpm:     not found"
  if confirm "  Install pnpm via corepack?"; then
    sudo corepack enable
    sudo corepack prepare pnpm@10.19.0 --activate || sudo npm install -g pnpm@10.19.0
    PNPM_OK=true
  fi
fi

# PM2
PM2_OK=false
if command -v pm2 &>/dev/null; then
  PM2_VER=$(pm2 --version)
  log "  PM2:      $PM2_VER"
  PM2_OK=true
else
  warn "  PM2:      not found"
  if confirm "  Install PM2 globally via npm?"; then
    sudo npm install -g pm2
    PM2_OK=true
  fi
fi

# PostgreSQL
PG_OK=false
if command -v psql &>/dev/null && pg_isready -h 127.0.0.1 &>/dev/null 2>&1; then
  log "  Postgres: running"
  PG_OK=true
elif command -v docker &>/dev/null; then
  if docker ps --filter name=cio-postgres --format '{{.Names}}' 2>/dev/null | grep -q cio-postgres; then
    log "  Postgres: running (Docker container cio-postgres)"
    PG_OK=true
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
      log "  Postgres: started in Docker (user=postgres, password=postgres, db=classroomio)"
      # Update .env if DATABASE_URL isn't already set
      if grep -q '^DATABASE_URL=""$' apps/api/.env 2>/dev/null; then
        sed -i 's|^DATABASE_URL=""$|DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/classroomio"|' apps/api/.env
      fi
      PG_OK=true
    fi
  fi
else
  warn "  Postgres: not running and Docker not available"
  err "  Install Postgres or Docker first, or set DATABASE_URL in apps/api/.env"
fi

# Redis
REDIS_OK=false
if redis-cli ping &>/dev/null 2>&1; then
  log "  Redis:    running"
  REDIS_OK=true
elif command -v docker &>/dev/null; then
  if docker ps --filter name=cio-redis --format '{{.Names}}' 2>/dev/null | grep -q cio-redis; then
    log "  Redis:    running (Docker container cio-redis)"
    REDIS_OK=true
  else
    warn "  Redis:    not running"
    if confirm "  Start Redis 7 in Docker?"; then
      docker run -d --name cio-redis \
        -p 127.0.0.1:6379:6379 \
        --restart unless-stopped \
        redis:7-alpine 2>/dev/null
      log "  Redis:    started in Docker"
      if grep -q '^REDIS_URL=""$' apps/api/.env 2>/dev/null; then
        sed -i 's|^REDIS_URL=""$|REDIS_URL="redis://127.0.0.1:6379"|' apps/api/.env
      fi
      REDIS_OK=true
    fi
  fi
else
  warn "  Redis:    not running and Docker not available"
  warn "  The jobs worker and session store require Redis."
fi

# Docker (needed for MinIO)
DOCKER_OK=false
if command -v docker &>/dev/null; then
  DOCKER_VER=$(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ',')
  log "  Docker:   $DOCKER_VER"
  DOCKER_OK=true
else
  warn "  Docker:   not found (needed for MinIO object storage)"
  warn "  Install Docker: curl -fsSL https://get.docker.com | sh"
fi

# ffmpeg (needed for jobs worker — media processing)
FFMPEG_OK=false
if command -v ffmpeg &>/dev/null; then
  log "  ffmpeg:   $(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f1-3)"
  FFMPEG_OK=true
else
  warn "  ffmpeg:   not found (media worker — thumbnails, transcoding)"
  if confirm "  Install ffmpeg?"; then
    sudo apt-get install -y ffmpeg
    FFMPEG_OK=true
  fi
fi

echo ""
if [ "$PG_OK" = false ] && [ "$REDIS_OK" = false ]; then
  err "Both Postgres and Redis are unavailable. Cannot continue."
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
# Recreate minio.env from the API .env credentials (the source of truth).
# The rsync --delete in CI would have removed minio.env.
if [ ! -f infra/minio.env ]; then
  MINIO_U=$(grep -E '^OBJECT_STORAGE_ACCESS_KEY_ID=' apps/api/.env | cut -d= -f2-)
  MINIO_P=$(grep -E '^OBJECT_STORAGE_SECRET_ACCESS_KEY=' apps/api/.env | cut -d= -f2-)
  cat > infra/minio.env <<EOF
MINIO_ROOT_USER=${MINIO_U}
MINIO_ROOT_PASSWORD=${MINIO_P}
MINIO_MEM_LIMIT=256m
EOF
  chmod 600 infra/minio.env
  log "  infra/minio.env recreated from apps/api/.env"
fi

# Idempotent: if MinIO is already running, compose up -d does nothing.
docker compose -f infra/minio-compose.yaml --env-file infra/minio.env up -d

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
