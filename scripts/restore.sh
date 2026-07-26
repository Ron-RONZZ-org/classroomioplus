#!/usr/bin/env bash
# restore.sh — Restore a ClassroomIO Plus backup from a backup tarball.
#
# Usage:
#   ./scripts/restore.sh <backup-file.tar.gz> [options]
#
# Options:
#   --yes       Skip all confirmation prompts (use with caution)
#   --native    Skip Docker detection; assume native (non-Docker) deployment
#   --help      Show this help and exit
#
# The restore script:
#   1. Extracts the backup tarball
#   2. Validates the manifest
#   3. Drops and recreates the database, then restores from pg_dump
#   4. Restores MinIO/uploaded files
#   5. Restores .env files (with backup of current ones)
#
# IMPORTANT: This will DESTROY and REPLACE the current database and storage
# data. All current data will be overwritten with the backup contents.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────
BACKUP_FILE=""
ASSUME_YES=false
MODE="auto"
CONTAINER_PREFIX="cio"
COMPOSE_PROJECT="classroomio"

# ── Help ──────────────────────────────────────────────────────────────
print_usage() {
  cat <<'USAGE'
Usage: ./scripts/restore.sh <backup-file.tar.gz> [options]

Restore a ClassroomIO Plus backup from a tarball created by backup.sh.

Options:
  --yes       Skip all confirmation prompts (use with caution)
  --native    Skip Docker detection; assume native (non-Docker) deployment
  --help      Show this help and exit

Examples:
  ./scripts/restore.sh ./classroomioplus-backup-2026-07-26-120000.tar.gz
USAGE
}

# ── Parse arguments ───────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      ASSUME_YES=true
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
    -*)
      echo "Error: Unknown option: $1"
      print_usage
      exit 1
      ;;
    *)
      if [[ -z "${BACKUP_FILE}" ]]; then
        BACKUP_FILE="$1"
        shift
      else
        echo "Error: Unexpected argument: $1"
        print_usage
        exit 1
      fi
      ;;
  esac
done

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Error: No backup file specified."
  echo "Usage: $0 <backup-file.tar.gz> [--yes] [--native]"
  exit 1
fi

# ── Utilities ─────────────────────────────────────────────────────────
log()  { printf '\e[32m[restore]\e[0m %s\n' "$*"; }
warn() { printf '\e[33m[restore]\e[0m %s\n' "$*" >&2; }
err()  { printf '\e[31m[restore]\e[0m %s\n' "$*" >&2; }

STAGING_DIR=""
cleanup() {
  if [[ -n "${STAGING_DIR}" && -d "${STAGING_DIR}" ]]; then
    rm -rf "${STAGING_DIR}"
  fi
}
trap cleanup EXIT

confirm() {
  if [[ "${ASSUME_YES}" == "true" ]]; then
    return 0
  fi
  local prompt="${1:-Continue?} [y/N] "
  local response
  read -r -p "${prompt}" response
  case "${response}" in
    [yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

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
    warn "Docker not found; assuming native mode."
    MODE="native"
    return
  fi

  # Check if the postgres container exists (even if stopped)
  if docker inspect "${CONTAINER_PREFIX}-postgres" &>/dev/null; then
    MODE="docker"
    log "Detected Docker Compose stack."
  else
    warn "Container ${CONTAINER_PREFIX}-postgres not found; assuming native mode."
    MODE="native"
  fi
}

# ── Validate backup ───────────────────────────────────────────────────
validate_backup() {
  local extracted="$1"

  if [[ ! -f "${extracted}/manifest.json" ]]; then
    err "Invalid backup: manifest.json not found."
    err "Is this a backup created by backup.sh?"
    exit 1
  fi

  if [[ ! -f "${extracted}/db.sql" ]]; then
    err "Invalid backup: db.sql not found."
    exit 1
  fi

  log "Backup validated."
  log "  Created: $(jq -r '.created_at' "${extracted}/manifest.json" 2>/dev/null || echo 'unknown')"
  log "  Mode: $(jq -r '.mode' "${extracted}/manifest.json" 2>/dev/null || echo 'unknown')"

  local db_size storage_size
  db_size="$(jq -r '.components.database.size_bytes' "${extracted}/manifest.json" 2>/dev/null || echo 0)"
  storage_size="$(jq -r '.components.storage.size_bytes' "${extracted}/manifest.json" 2>/dev/null || echo 0)"

  log "  Database dump: $(( db_size / 1024 )) KB"
  if [[ "${storage_size}" -gt 0 ]]; then
    log "  Storage data: $(( storage_size / 1024 / 1024 )) MB"
  else
    log "  Storage data: none"
  fi
}

# ── Restore database ──────────────────────────────────────────────────
restore_database() {
  local dump_file="$1"

  log "Restoring database..."

  if [[ ! -s "${dump_file}" ]]; then
    warn "Database dump is empty. Skipping database restore."
    return
  fi

  if [[ "${MODE}" == "docker" ]]; then
    if ! is_docker_container_running "${CONTAINER_PREFIX}-postgres"; then
      err "PostgreSQL container (${CONTAINER_PREFIX}-postgres) is not running."
      err "Start the stack first: docker compose -f docker-compose.yaml up -d postgres"
      exit 1
    fi

    local db_name db_user
    db_name="$(get_env_value POSTGRES_DB)"
    db_user="$(get_env_value POSTGRES_USER)"
    [[ -z "${db_name}" ]] && db_name="classroomio"
    [[ -z "${db_user}" ]] && db_user="postgres"

    log "  Dropping existing connections and recreating database..."

    # Terminate existing connections and drop/recreate the database
    docker exec "${CONTAINER_PREFIX}-postgres" \
      psql -U "${db_user}" -d postgres \
        -c "SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '${db_name}'
              AND pid <> pg_backend_pid();" \
        -c "DROP DATABASE IF EXISTS \"${db_name}\";" \
        -c "CREATE DATABASE \"${db_name}\";" >/dev/null

    log "  Restoring from dump..."
    docker exec -i "${CONTAINER_PREFIX}-postgres" \
      psql -U "${db_user}" -d "${db_name}" \
      < "${dump_file}"

    log "  Database restore complete."
  else
    # Native mode
    local env_file="${REPO_ROOT}/.env"
    local db_url
    db_url="$(get_env_value DATABASE_URL "${env_file}")"

    if [[ -n "${db_url}" ]]; then
      local user pass host port db
      user="$(echo "${db_url}" | sed -n 's|^postgresql://\([^:]*\):.*$|\1|p')"
      pass="$(echo "${db_url}" | sed -n 's|^postgresql://[^:]*:\([^@]*\)@.*$|\1|p')"
      host="$(echo "${db_url}" | sed -n 's|^postgresql://[^@]*@\([^:]*\):.*$|\1|p')"
      port="$(echo "${db_url}" | sed -n 's|^postgresql://[^@]*@[^:]*:\([^/]*\)/.*$|\1|p')"
      db="$(echo "${db_url}" | sed -n 's|^postgresql://.*/\(.*\)$|\1|p')"

      [[ -z "${host}" ]] && host="localhost"
      [[ -z "${port}" ]] && port="5432"

      require_command "psql"

      PGPASSWORD="${pass}" psql -h "${host}" -p "${port}" -U "${user}" -d postgres \
        -c "SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '${db}'
              AND pid <> pg_backend_pid();" \
        -c "DROP DATABASE IF EXISTS \"${db}\";" \
        -c "CREATE DATABASE \"${db}\";" >/dev/null

      PGPASSWORD="${pass}" psql -h "${host}" -p "${port}" -U "${user}" -d "${db}" \
        < "${dump_file}"

      log "  Database restore complete."
    else
      err "Cannot restore database: DATABASE_URL not set in .env"
      err "Set DATABASE_URL or ensure POSTGRES_* vars are configured manually."
      exit 1
    fi
  fi
}

# ── Restore storage ───────────────────────────────────────────────────
restore_storage() {
  local storage_archive="$1"

  if [[ ! -f "${storage_archive}" ]]; then
    log "No storage archive found. Skipping storage restore."
    return
  fi

  log "Restoring storage data..."

  if [[ "${MODE}" == "docker" ]]; then
    if ! docker volume inspect minio-data &>/dev/null; then
      log "  Creating minio-data volume..."
      docker volume create minio-data >/dev/null
    fi

    # Copy archived data into the volume via a temporary container
    log "  Restoring minio-data volume..."
    docker run --rm \
      -v minio-data:/dest \
      -v "$(dirname "${storage_archive}")":/source:ro \
      alpine:3.20 \
      sh -c "tar xzf \"/source/$(basename "${storage_archive}")\" -C /dest" 2>/dev/null || {
      warn "  Storage restore had issues. Check the MinIO console for data integrity."
    }

    log "  Storage restore complete. Restart MinIO to pick up changes:"
    log "    docker restart ${CONTAINER_PREFIX}-minio"
  else
    # Native: extract to the detected storage directory
    local env_file="${REPO_ROOT}/.env"
    local minio_data_dir

    if [[ -d "${REPO_ROOT}/data/minio" ]]; then
      minio_data_dir="${REPO_ROOT}/data/minio"
    elif [[ -d "${HOME}/.minio/data" ]]; then
      minio_data_dir="${HOME}/.minio/data"
    fi

    if [[ -n "${minio_data_dir}" ]]; then
      log "  Restoring to: ${minio_data_dir}"
      tar xzf "${storage_archive}" -C "$(dirname "${minio_data_dir}")"
      log "  Storage restore complete."
    else
      warn "  No local storage directory found. Extracting archive to ${REPO_ROOT}/restored-storage/"
      mkdir -p "${REPO_ROOT}/restored-storage"
      tar xzf "${storage_archive}" -C "${REPO_ROOT}/restored-storage"
      warn "  Storage data extracted to ${REPO_ROOT}/restored-storage/"
      warn "  Move it to your MinIO/local storage data directory manually."
    fi
  fi
}

# ── Restore env files ────────────────────────────────────────────────
restore_env_files() {
  local env_dir="$1"

  if [[ ! -d "${env_dir}" ]]; then
    warn "No env directory found in backup. Skipping env restore."
    return
  fi

  log "Restoring environment files..."

  local env_files=("${env_dir}"/*.env)
  if [[ ${#env_files[@]} -eq 0 ]]; then
    warn "  No .env files found in backup."
    return
  fi

  for env_backup in "${env_files[@]}"; do
    local base_name
    base_name="$(basename "${env_backup}")"

    # Map backup filename back to original path
    local target_path
    case "${base_name}" in
      root.env)
        target_path="${REPO_ROOT}/.env"
        ;;
      apps-api.env)
        target_path="${REPO_ROOT}/apps/api/.env"
        ;;
      apps-dashboard.env)
        target_path="${REPO_ROOT}/apps/dashboard/.env"
        ;;
      apps-jobs.env)
        target_path="${REPO_ROOT}/apps/jobs/.env"
        ;;
      packages-db.env)
        target_path="${REPO_ROOT}/packages/db/.env"
        ;;
      *)
        warn "  Unknown env file: ${base_name}. Restoring to ${REPO_ROOT}/${base_name}"
        target_path="${REPO_ROOT}/${base_name}"
        ;;
    esac

    # Check if target exists and back it up
    if [[ -f "${target_path}" ]]; then
      local backup_of_backup="${target_path}.restore-bak"
      cp "${target_path}" "${backup_of_backup}"
      log "  Current ${base_name} saved to ${backup_of_backup}"
    fi

    cp "${env_backup}" "${target_path}"
    log "  Restored: ${target_path}"
  done
}

# ── Verify restore ────────────────────────────────────────────────────
verify_restore() {
  log "Verifying restore..."

  if [[ "${MODE}" == "docker" ]]; then
    # Check that postgres is still running
    if is_docker_container_running "${CONTAINER_PREFIX}-postgres"; then
      log "  ✓ PostgreSQL is running."
    else
      warn "  ✗ PostgreSQL is not running. Start it: docker start ${CONTAINER_PREFIX}-postgres"
    fi

    # Check that the database has tables
    local db_name db_user table_count
    db_name="$(get_env_value POSTGRES_DB)"
    db_user="$(get_env_value POSTGRES_USER)"
    [[ -z "${db_name}" ]] && db_name="classroomio"
    [[ -z "${db_user}" ]] && db_user="postgres"

    table_count="$(docker exec "${CONTAINER_PREFIX}-postgres" \
      psql -U "${db_user}" -d "${db_name}" -tAc \
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")"

    log "  ✓ Database '${db_name}' has ${table_count} tables."
  fi

  log "Restore verification complete."
}

# ── Main ──────────────────────────────────────────────────────────────
main() {
  log "ClassroomIO Plus Restore"
  log ""

  # Validate backup file
  if [[ ! -f "${BACKUP_FILE}" ]]; then
    err "Backup file not found: ${BACKUP_FILE}"
    exit 1
  fi
  log "Backup file: ${BACKUP_FILE}"

  # Detect deployment mode
  detect_mode
  log "Mode: ${MODE}"
  echo ""

  # Extract backup to staging
  log "Extracting backup..."
  STAGING_DIR="$(mktemp -d)"
  tar xzf "${BACKUP_FILE}" -C "${STAGING_DIR}"

  # Find the extracted directory — look for the directory with a manifest.json
  local extracted_dir
  extracted_dir="$(find "${STAGING_DIR}" -maxdepth 3 -name "manifest.json" -exec dirname {} \; | head -1)"
  if [[ -z "${extracted_dir}" ]]; then
    err "Could not find backup directory (no manifest.json found in tarball)."
    exit 1
  fi
  log "Extracted to: ${extracted_dir}"
  echo ""

  # Validate
  validate_backup "${extracted_dir}"
  echo ""

  # Confirm before destructive operation
  log "⚠️  WARNING: This will DESTROY and REPLACE the current database and storage data."
  log "   All current data will be overwritten with the contents of the backup."
  echo ""
  if ! confirm "Restore from backup? [y/N] "; then
    log "Restore cancelled."
    exit 0
  fi
  echo ""

  # Run restore steps
  restore_database "${extracted_dir}/db.sql"
  echo ""

  restore_storage "${extracted_dir}/minio-data.tar.gz"
  echo ""

  restore_env_files "${extracted_dir}/env"
  echo ""

  verify_restore
  echo ""

  log "Restore completed."
  log ""
  log "Next steps:"
  if [[ "${MODE}" == "docker" ]]; then
    log "  1. Restart the API container: docker restart ${CONTAINER_PREFIX}-api"
    log "  2. If MinIO data was restored: docker restart ${CONTAINER_PREFIX}-minio"
    log "  3. Check the dashboard is working: http://localhost:3082"
  else
    log "  1. Restart your application services"
    log "  2. Verify data integrity"
  fi
  log ""
  log "If anything went wrong, previous .env backups were saved with .restore-bak suffix."
}

main "$@"
