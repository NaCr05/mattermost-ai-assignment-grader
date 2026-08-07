#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENVIRONMENT_FILE="${ENVIRONMENT_FILE-.env.production}"
RELEASE_ENVIRONMENT_FILE="${RELEASE_ENVIRONMENT_FILE-release-images.env}"
PROJECT_NAME="${PROJECT_NAME:-tide-final-grading}"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_ROOT}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_ALERT_WEBHOOK_URL="${BACKUP_ALERT_WEBHOOK_URL:-}"

temporary_backup=""

notify_failure() {
  local exit_code="$1"
  if [[ -z "${BACKUP_ALERT_WEBHOOK_URL}" ]] || ! command -v curl >/dev/null 2>&1; then
    return 0
  fi

  local host_name timestamp payload
  host_name="$(hostname 2>/dev/null || printf 'unknown-host')"
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  payload="$(printf '{"text":"Mattermost grader backup failed on %s at %s (exit %s)."}' \
    "${host_name}" "${timestamp}" "${exit_code}")"
  curl --fail --silent --show-error --max-time 10 \
    --header 'content-type: application/json' \
    --data "${payload}" "${BACKUP_ALERT_WEBHOOK_URL}" >/dev/null || true
}

handle_exit() {
  local exit_code="$?"
  trap - EXIT
  if [[ -n "${temporary_backup}" && -f "${temporary_backup}" ]]; then
    rm -f -- "${temporary_backup}"
  fi
  if [[ "${exit_code}" -ne 0 ]]; then
    notify_failure "${exit_code}"
  fi
  exit "${exit_code}"
}

trap handle_exit EXIT

if [[ ! "${RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
  printf 'RETENTION_DAYS must be a non-negative integer.\n' >&2
  exit 2
fi

mkdir -p -- "${BACKUP_DIR}"
BACKUP_DIR="$(cd "${BACKUP_DIR}" && pwd)"
if [[ "${BACKUP_DIR}" == "/" || "${BACKUP_DIR}" == "${PROJECT_ROOT}" ]]; then
  printf 'Refusing unsafe BACKUP_DIR: %s\n' "${BACKUP_DIR}" >&2
  exit 2
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

timestamp="$(date -u +'%Y%m%d-%H%M%S')"
backup_name="tide-grader-${timestamp}-$$.dump"
final_backup="${BACKUP_DIR}/${backup_name}"
temporary_backup="$(mktemp "${BACKUP_DIR}/.${backup_name}.tmp.XXXXXX")"

docker exec "${container_id}" sh -c \
  'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  >"${temporary_backup}"

if [[ ! -s "${temporary_backup}" ]]; then
  printf 'The generated backup is empty.\n' >&2
  exit 1
fi

docker exec -i "${container_id}" pg_restore --list <"${temporary_backup}" >/dev/null
mv -- "${temporary_backup}" "${final_backup}"
temporary_backup=""
(
  cd "${BACKUP_DIR}"
  sha256sum "${backup_name}" >"${backup_name}.sha256"
)

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'tide-grader-*.dump' -o -name 'tide-grader-*.dump.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

printf '%s\n' "${final_backup}"
