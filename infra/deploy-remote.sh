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
# Preconditions:
#   - The repo is cloned at /var/www/classroomio
#   - infra/ecosystem.config.cjs exists
#   - Node 20 is available (see .nvmrc)
#   - pm2 is installed globally
#
# What it does:
#   1. pnpm install --frozen-lockfile (runtime deps)
#   2. Optionally pnpm -r build (only with --build)
#   3. Symlink apps/jobs/.env → apps/api/.env
#   4. db:setup (schema migrations)
#   5. Ensure MinIO is running in Docker
#   6. PM2 reload all processes

set -euo pipefail

APP_DIR="/var/www/classroomio"
BUILD=false

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) BUILD=true; shift ;;
    -h|--help)
      echo "Usage: $0 [--build]"
      echo "  --build  Build TypeScript on the VPS (default: skip, expect rsynced artifacts)"
      exit 0
      ;;
    *) echo "Error: Unknown option: $1"; exit 1 ;;
  esac
done

# ── Utils ────────────────────────────────────────────────────────────────────
log()  { printf '\e[32m[deploy]\e[0m %s\n' "$*"; }
warn() { printf '\e[33m[deploy]\e[0m %s\n' "$*" >&2; }
err()  { printf '\e[31m[deploy]\e[0m %s\n' "$*" >&2; }

cd "$APP_DIR"

# Ensure the correct Node version (the repo's .nvmrc)
if [ -f "$APP_DIR/.nvmrc" ] && command -v nvm &>/dev/null; then
  nvm use || true
fi

# ── 1. Install runtime dependencies ─────────────────────────────────────────
log "[1] Installing runtime dependencies"
# --frozen-lockfile guarantees the same dependency tree as CI.
# --shamefully-hoist avoids resolution issues with packages expecting flat
# node_modules. Workspace packages (@cio/*) resolve via pnpm's symlinks.
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
# db:setup needs DATABASE_URL. We export it from apps/api/.env (the source of
# truth) without duplicating secrets.
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
