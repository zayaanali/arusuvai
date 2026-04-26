#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  scripts/backup_production_db.sh [env_file] [backup_dir] [retention_days]

Defaults:
  env_file       = /opt/pantry-manager/.env
  backup_dir     = /opt/pantry-manager/backups
  retention_days = 14

Notes:
  - Reads DB_PATH from env_file.
  - Uses sqlite3 .backup when available, otherwise falls back to cp.
  - Deletes backup files older than retention_days.
EOF
  exit 0
fi

ENV_FILE="${1:-/opt/pantry-manager/.env}"
BACKUP_DIR="${2:-/opt/pantry-manager/backups}"
RETENTION_DAYS="${3:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "retention_days must be a non-negative integer."
  exit 1
fi

DB_PATH="$(sed -n 's/^DB_PATH=//p' "$ENV_FILE" | tail -n1)"
DB_PATH="${DB_PATH%\"}"
DB_PATH="${DB_PATH#\"}"

if [[ -z "$DB_PATH" ]]; then
  echo "DB_PATH is not set in $ENV_FILE"
  exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
  echo "Database file not found: $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DB_NAME="$(basename "$DB_PATH")"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME%.db}_${STAMP}.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".timeout 5000" ".backup '$BACKUP_FILE'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

find "$BACKUP_DIR" -type f -name '*.db' -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $BACKUP_FILE"
