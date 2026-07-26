#!/usr/bin/env bash
# backup.sh — Create a full backup of the ClassroomIO Plus stack.
#
# Captures:
#   - PostgreSQL database (pg_dump --clean --if-exists)
#   - Uploaded files (MinIO volume or local storage directory)
#   - Environment configuration (.env files)
#
# Usage:
#   ./scripts/backup.sh [--output-dir <dir>] [--redact-secrets] [--help]
#
# By default detects Docker Compose mode (containers cio-postgres, cio-minio)
# and backs up Docker volumes. Use --native to skip Docker detection.
#
# Output: <output-dir>/classroomioplus-backup-<timestamp>.tar.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────
OUTPUT_DIR="${PWD}"
REDACT_SECRETS=false
MODE="auto"
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
BACKUP_NAME="classroomioplus-backup-${TIMESTAMP}"
STAGING_DIR=""
COMPOSE_PROJECT="classroomio"
CONTAINER_PREFIX="cio"

# ── Help ──────────────────────────────────────────────────────────────
print_usage() {
  cat <<'USAGE'
Usage: ./scripts/backup.sh [options]

Creates a timestamped backup tarball of the ClassroomIO Plus stack.

Options:
  --output-dir <dir>  Directory to write the backup tarball (default: current dir)
  --redact-secrets    Replace secret values in backed-up .env with "[REDACTED]"
  --native            Skip Docker detection; assume native (non-Docker) deployment
  --help              Show this help and exit

Output:
  <output-dir>/classroomioplus-backup-<YYYY-MM-DD-HHMMSS>.tar.gz
USAGE
}

# ── Parse arguments ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --redact-secrets)
      REDACT_SECRETS=true
      shift
      ;;
    --native)
      MODE="native"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option: $1"
      print_usage
      exit 1
      ;;
  esac
done

# ── Utilities ─────────────────────────────────────────────────────────
log()  { printf '\e[32m[backup]\e[0m %s\n' "$*"; }
warn() { printf '\e[33m[backup]\e[0m %s\n' "$*" >&2; }
err()  { printf '\e[31m[backup]\e[0m %s\n' "$*" >&2; }

cleanup() {
  if [[ -n "${STAGING_DIR}" && -d "${STAGING_DIR}" ]]; then
    rm -rf "${STAGING_DIR}"
  fi
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" &>/dev/null; then
    err "Required command not found: $1"
    exit 1
  fi
}

is_docker_container_running() {
  local name="$1"
  docker inspect --format '{{.State.Running}}' "${name}" 2>/dev/null | grep -q 'true'
}

get_env_value() {
  local key="$1" file="${2:-${REPO_ROOT}/.env}"
  local line
  line="$(grep -E "^${key}=" "${file}" 2>/dev/null | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

# ── Detect mode ───────────────────────────────────────────────────────
detect_mode() {
  if [[ "${MODE}" == "native" ]]; then
    return
  fi

  if ! command -v docker &>/dev/null; then
    warn "Docker not found; falling back to native mode."
    MODE="native"
    return
  fi

  if is_docker_container_running "${CONTAINER_PREFIX}-postgres"; then
    MODE="docker"
    log "Detected Docker Compose stack (container: ${CONTAINER_PREFIX}-postgres)."
  else
    warn "Container ${CONTAINER_PREFIX}-postgres not running; falling back to native mode."
    MODE="native"
  fi
}

# ── Step: backup database ──────────────────────────────────────────────
backup_database() {
  local dest="$1" db_name db_user

  log "Backing up database..."

  if [[ "${MODE}" == "docker" ]]; then
    db_name="$(get_env_value POSTGRES_DB)"
    db_user="$(get_env_value POSTGRES_USER)"
    [[ -z "${db_name}" ]] && db_name="classroomio"
    [[ -z "${db_user}" ]] && db_user="postgres"

    docker exec "${CONTAINER_PREFIX}-postgres" \
      pg_dump --clean --if-exists --no-owner --no-privileges \
        -U "${db_user}" -d "${db_name}" \
        > "${dest}/db.sql" 2>/dev/null
  else
    # Native: try to read DATABASE_URL from .env, or assume pg_dump with PGPASSWORD
    local env_file="${REPO_ROOT}/.env"
    local db_url
    db_url="$(get_env_value DATABASE_URL "${env_file}")"

    if [[ -n "${db_url}" ]]; then
      # Parse DATABASE_URL to extract connection parameters
      # Format: postgresql://user:password@host:port/dbname
      local user pass host port db
      user="$(echo "${db_url}" | sed -n 's|^postgresql://\([^:]*\):.*$|\1|p')"
      pass="$(echo "${db_url}" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*$|\1|p')"
      host="$(echo "${db_url}" | sed -n 's|^postgresql://[^@]*@\([^:]*\):.*$|\1|p')"
      port="$(echo "${db_url}" | sed -n 's|^postgresql://[^@]*@[^:]*:\([^/]*\)/.*$|\1|p')"
      db="$(echo "${db_url}" | sed -n 's|^postgresql://.*/\(.*\)$|\1|p')"

      [[ -z "${host}" ]] && host="localhost"
      [[ -z "${port}" ]] && port="5432"

      PGPASSWORD="${pass}" pg_dump --clean --if-exists --no-owner --no-privileges \
        -h "${host}" -p "${port}" -U "${user}" -d "${db}" \
        > "${dest}/db.sql" 2>/dev/null
    else
      # Fallback: try PGPASSWORD or local socket
      local fallback_db
      fallback_db="$(get_env_value POSTGRES_DB "${env_file}")"
      fallback_db="${fallback_db:-classroomio}"
      pg_dump --clean --if-exists --no-owner --no-privileges \
        -d "${fallback_db}" \
        > "${dest}/db.sql" 2>/dev/null || {
        warn "Could not dump database. Ensure DATABASE_URL or POSTGRES_* vars are set."
        warn "Skipping database backup."
        touch "${dest}/db.sql"
        return
      }
    fi
  fi

  local size
  size="$(wc -c < "${dest}/db.sql" 2>/dev/null || echo 0)"
  log "Database dump: ${size} bytes."
}

# ── Step: backup storage (MinIO volume or local) ──────────────────────
backup_storage() {
  local dest="$1"
  local storage_size=0
  local storage_method="none"

  mkdir -p "${dest}"

  if [[ "${MODE}" == "docker" ]]; then
    # Check if the minio-data volume exists
    if docker volume inspect minio-data &>/dev/null; then
      log "Backing up MinIO volume (minio-data)..."
      # Use a temporary Docker container to tar the volume contents
      local volume_tar="${dest}/minio-data.tar.gz"
      docker run --rm \
        -v minio-data:/source:ro \
        alpine:3.20 \
        tar czf - -C /source . > "${volume_tar}" 2>/dev/null || {
        warn "MinIO volume backup failed. Skipping storage backup."
        storage_method="failed"
        rm -f "${volume_tar}"
        return
      }
      storage_size="$(wc -c < "${volume_tar}" 2>/dev/null || echo 0)"
      storage_method="docker-volume"
      log "MinIO data: ${storage_size} bytes."
    else
      warn "Docker volume 'minio-data' not found. Skipping storage backup."
      storage_method="not-found"
    fi
  else
    # Native: try to detect local storage directory from env
    local env_file="${REPO_ROOT}/.env"
    local endpoint
    endpoint="$(get_env_value OBJECT_STORAGE_ENDPOINT "${env_file}")"

    # If endpoint points to localhost/127.0.0.1 or is empty, check for MinIO
    # binary or a local data directory
    local minio_data_dir=""
    if [[ -d "${REPO_ROOT}/data/minio" ]]; then
      minio_data_dir="${REPO_ROOT}/data/minio"
    elif [[ -d "${HOME}/.minio/data" ]]; then
      minio_data_dir="${HOME}/.minio/data"
    fi

    if [[ -n "${minio_data_dir}" ]]; then
      log "Backing up local storage directory: ${minio_data_dir}"
      tar czf "${dest}/minio-data.tar.gz" -C "$(dirname "${minio_data_dir}")" \
        "$(basename "${minio_data_dir}")" 2>/dev/null || {
        warn "Local storage backup failed. Skipping."
        storage_method="failed"
        return
      }
      storage_size="$(wc -c < "${dest}/minio-data.tar.gz" 2>/dev/null || echo 0)"
      storage_method="local-dir"
      log "Storage data: ${storage_size} bytes."
    elif [[ -n "${endpoint}" ]] && ! echo "${endpoint}" | grep -qE 'localhost|127\.0\.0\.1'; then
      warn "Object storage endpoint (${endpoint}) appears to be remote (S3/R2)."
      warn "Skipping local storage backup — ensure your S3 provider has its own backup."
      storage_method="remote-s3"
    else
      warn "No local storage directory found. Skipping storage backup."
      storage_method="not-found"
    fi
  fi

  # Store storage metadata
  cat > "${dest}/.storage-info.json" <<-JSON
{
  "method": "${storage_method}",
  "size_bytes": ${storage_size}
}
JSON
}

# ── Step: backup env files ──────────────────────────────────────────────
backup_env_files() {
  local dest="$1"
  local env_dir="${dest}/env"
  mkdir -p "${env_dir}"

  log "Backing up environment files..."

  # Root .env
  if [[ -f "${REPO_ROOT}/.env" ]]; then
    if [[ "${REDACT_SECRETS}" == "true" ]]; then
      sed -E \
        -e 's/^(BETTER_AUTH_SECRET)=.*/\1=[REDACTED]/' \
        -e 's/^(PRIVATE_SERVER_KEY)=.*/\1=[REDACTED]/' \
        -e 's/^(MINIO_ROOT_USER)=.*/\1=[REDACTED]/' \
        -e 's/^(MINIO_ROOT_PASSWORD)=.*/\1=[REDACTED]/' \
        -e 's/^(OBJECT_STORAGE_ACCESS_KEY_ID)=.*/\1=[REDACTED]/' \
        -e 's/^(OBJECT_STORAGE_SECRET_ACCESS_KEY)=.*/\1=[REDACTED]/' \
        -e 's/^(OPENAI_API_KEY)=.*/\1=[REDACTED]/' \
        -e 's/^(GOOGLE_API_KEY)=.*/\1=[REDACTED]/' \
        -e 's/^(ANTHROPIC_API_KEY)=.*/\1=[REDACTED]/' \
        -e 's/^(SMTP_PASSWORD)=.*/\1=[REDACTED]/' \
        -e 's/^(SECRET_KEY)=.*/\1=[REDACTED]/' \
        "${REPO_ROOT}/.env" > "${env_dir}/root.env"
      log "  ✓ .env (secrets redacted)"
    else
      cp "${REPO_ROOT}/.env" "${env_dir}/root.env"
      log "  ✓ .env"
    fi
  else
    warn "  No .env file found at ${REPO_ROOT}/.env"
    touch "${env_dir}/root.env"
  fi

  # .env files in app directories (dev setups)
  local app_dirs=("apps/api" "apps/dashboard" "apps/jobs" "packages/db")
  for app_dir in "${app_dirs[@]}"; do
    local env_path="${REPO_ROOT}/${app_dir}/.env"
    if [[ -f "${env_path}" ]]; then
      local safe_name
      safe_name="$(echo "${app_dir}" | tr '/' '-')"
      if [[ "${REDACT_SECRETS}" == "true" ]]; then
        sed -E \
          -e 's/(PASSWORD|SECRET|KEY|TOKEN)=.*/\1=[REDACTED]/g' \
          "${env_path}" > "${env_dir}/${safe_name}.env"
      else
        cp "${env_path}" "${env_dir}/${safe_name}.env"
      fi
      log "  ✓ ${app_dir}/.env"
    fi
  done
}

# ── Step: write manifest ──────────────────────────────────────────────
write_manifest() {
  local dest="$1"

  local db_size storage_size
  db_size="$(wc -c < "${dest}/db.sql" 2>/dev/null || echo 0)"
  if [[ -f "${dest}/minio-data.tar.gz" ]]; then
    storage_size="$(wc -c < "${dest}/minio-data.tar.gz" 2>/dev/null || echo 0)"
  else
    storage_size=0
  fi

  # Collect Docker image versions if available
  local api_version="unknown" dashboard_version="unknown"
  if command -v docker &>/dev/null; then
    local api_inspect dashboard_inspect
    api_inspect="$(docker inspect "${CONTAINER_PREFIX}-api" --format '{{.Config.Image}}' 2>/dev/null || true)"
    dashboard_inspect="$(docker inspect "${CONTAINER_PREFIX}-dashboard" --format '{{.Config.Image}}' 2>/dev/null || true)"
    [[ -n "${api_inspect}" ]] && api_version="${api_inspect}"
    [[ -n "${dashboard_inspect}" ]] && dashboard_version="${dashboard_inspect}"
  fi

  cat > "${dest}/manifest.json" <<-JSON
{
  "backup_tool_version": "1.0.0",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mode": "${MODE}",
  "components": {
    "database": {
      "file": "db.sql",
      "size_bytes": ${db_size}
    },
    "storage": {
      "method": "$([ -f "${dest}/minio-data.tar.gz" ] && echo "archive" || echo "none")",
      "file": "$([ -f "${dest}/minio-data.tar.gz" ] && echo "minio-data.tar.gz" || echo "null")",
      "size_bytes": ${storage_size}
    },
    "env_files": {
      "count": $(find "${dest}/env" -name '*.env' -type f 2>/dev/null | wc -l | tr -d ' ')
    }
  },
  "image_versions": {
    "api": "${api_version}",
    "dashboard": "${dashboard_version}"
  }
}
JSON
  log "Manifest written."
}

# ── Package backup ────────────────────────────────────────────────────
package_backup() {
  local staging="$1" output_dir="$2"
  local tarball="${output_dir}/${BACKUP_NAME}.tar.gz"

  mkdir -p "${output_dir}"

  log "Packaging backup: ${tarball}"
  tar czf "${tarball}" -C "${staging}" "${BACKUP_NAME}"

  log "Backup created: ${tarball}"
  local total_size
  total_size="$(wc -c < "${tarball}" 2>/dev/null || echo 0)"
  log "Total size: ${total_size} bytes ($(( total_size / 1024 / 1024 )) MB)"
}

# ── Main ──────────────────────────────────────────────────────────────
main() {
  log "ClassroomIO Plus Backup — ${TIMESTAMP}"
  log ""

  # Validate output directory
  mkdir -p "${OUTPUT_DIR}"
  if [[ ! -w "${OUTPUT_DIR}" ]]; then
    err "Output directory is not writable: ${OUTPUT_DIR}"
    exit 1
  fi

  # Create staging directory with the backup name as the top-level dir
  STAGING_DIR="$(mktemp -d)"
  local backup_dir="${STAGING_DIR}/${BACKUP_NAME}"
  mkdir -p "${backup_dir}/env"
  # Write a marker so the restore script can find the backup dir
  echo "${BACKUP_NAME}" > "${STAGING_DIR}/.backup_dir_name"

  # Detect deployment mode
  detect_mode
  log "Mode: ${MODE}"

  # Run backup steps
  backup_database "${backup_dir}"
  echo ""
  backup_storage "${backup_dir}"
  echo ""
  backup_env_files "${backup_dir}"
  echo ""
  write_manifest "${backup_dir}"
  echo ""
  package_backup "${STAGING_DIR}" "${OUTPUT_DIR}"
  echo ""
  log "Backup completed successfully."
}

main "$@"
