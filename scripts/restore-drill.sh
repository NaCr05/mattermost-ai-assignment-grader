#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s BACKUP_PATH\n' "$0" >&2
  exit 2
fi

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENVIRONMENT_FILE="${ENVIRONMENT_FILE-.env.production}"
RELEASE_ENVIRONMENT_FILE="${RELEASE_ENVIRONMENT_FILE-release-images.env}"
PROJECT_NAME="${PROJECT_NAME:-tide-final-grading}"
BACKUP_ALERT_WEBHOOK_URL="${BACKUP_ALERT_WEBHOOK_URL:-}"
KEEP_RESTORE_DRILL_DATABASE="${KEEP_RESTORE_DRILL_DATABASE:-false}"
backup_path="$1"
target_database="tide_restore_drill_$(date -u +'%Y%m%d_%H%M%S')_$$"
container_id=""
database_user=""
created_database="false"

notify_failure() {
  local exit_code="$1"
  if [[ -z "${BACKUP_ALERT_WEBHOOK_URL}" ]] || ! command -v curl >/dev/null 2>&1; then
    return 0
  fi

  local host_name timestamp payload
  host_name="$(hostname 2>/dev/null || printf 'unknown-host')"
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  payload="$(printf '{"text":"Mattermost grader restore drill failed on %s at %s (exit %s)."}' \
    "${host_name}" "${timestamp}" "${exit_code}")"
  curl --fail --silent --show-error --max-time 10 \
    --header 'content-type: application/json' \
    --data "${payload}" "${BACKUP_ALERT_WEBHOOK_URL}" >/dev/null || true
}

handle_exit() {
  local exit_code="$?"
  trap - EXIT
  if [[ "${created_database}" == "true" && "${KEEP_RESTORE_DRILL_DATABASE}" != "true" ]]; then
    docker exec "${container_id}" dropdb --username "${database_user}" \
      --if-exists "${target_database}" >/dev/null 2>&1 || true
  fi
  if [[ "${exit_code}" -ne 0 ]]; then
    notify_failure "${exit_code}"
  fi
  exit "${exit_code}"
}

trap handle_exit EXIT

if [[ ! -f "${backup_path}" ]]; then
  printf 'Backup file was not found: %s\n' "${backup_path}" >&2
  exit 2
fi
backup_path="$(cd "$(dirname "${backup_path}")" && pwd)/$(basename "${backup_path}")"

checksum_path="${backup_path}.sha256"
if [[ -f "${checksum_path}" ]]; then
  (
    cd "$(dirname "${backup_path}")"
    sha256sum --check "$(basename "${checksum_path}")" >/dev/null
  )
fi

compose=(docker compose)
for environment_file in "${ENVIRONMENT_FILE}" "${RELEASE_ENVIRONMENT_FILE}"; do
  if [[ -z "${environment_file}" ]]; then
    continue
  fi
  if [[ "${environment_file}" != /* ]]; then
    environment_file="${PROJECT_ROOT}/${environment_file}"
  fi
  if [[ ! -f "${environment_file}" ]]; then
    printf 'Environment file was not found: %s\n' "${environment_file}" >&2
    exit 2
  fi
  compose+=(--env-file "${environment_file}")
done
compose+=(-p "${PROJECT_NAME}" -f "${PROJECT_ROOT}/docker-compose.prod.yml")

container_id="$("${compose[@]}" ps -q db)"
if [[ -z "${container_id}" ]]; then
  printf 'The production PostgreSQL container is not running for project %s.\n' \
    "${PROJECT_NAME}" >&2
  exit 1
fi

active_database="$(docker exec "${container_id}" printenv POSTGRES_DB)"
database_user="$(docker exec "${container_id}" printenv POSTGRES_USER)"
if [[ -z "${active_database}" || -z "${database_user}" ]]; then
  printf 'PostgreSQL container identity is incomplete.\n' >&2
  exit 1
fi
if [[ "${target_database}" == "${active_database}" ]]; then
  printf 'Restore drill must never target the active database.\n' >&2
  exit 1
fi

docker exec -i "${container_id}" pg_restore --list <"${backup_path}" >/dev/null
docker exec "${container_id}" createdb --username "${database_user}" "${target_database}"
created_database="true"
docker exec -i "${container_id}" pg_restore \
  --username "${database_user}" \
  --dbname "${target_database}" \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  <"${backup_path}"

migration_count="$(docker exec "${container_id}" psql \
  --username "${database_user}" --dbname "${target_database}" --tuples-only --no-align \
  --command 'SELECT COUNT(*) FROM "_prisma_migrations";')"
if [[ ! "${migration_count}" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Restore drill found no applied migrations.\n' >&2
  exit 1
fi

business_counts="$(docker exec "${container_id}" psql \
  --username "${database_user}" --dbname "${target_database}" --tuples-only --no-align \
  --command 'SELECT (SELECT COUNT(*) FROM "User"), (SELECT COUNT(*) FROM "Assignment"), (SELECT COUNT(*) FROM "Submission"), (SELECT COUNT(*) FROM "Evaluation"), (SELECT COUNT(*) FROM "AuthAudit");')"
if [[ ! "${business_counts}" =~ ^[0-9]+\|[0-9]+\|[0-9]+\|[0-9]+\|[0-9]+$ ]]; then
  printf 'Restore drill could not query the restored application tables.\n' >&2
  exit 1
fi

printf 'Restore drill passed for %s in database %s with %s migrations.\n' \
  "$(basename "${backup_path}")" "${target_database}" "${migration_count}"
if [[ "${KEEP_RESTORE_DRILL_DATABASE}" == "true" ]]; then
  printf 'The restored database was retained for manual inspection.\n'
fi
