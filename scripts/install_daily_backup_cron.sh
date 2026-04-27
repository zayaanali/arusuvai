#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  scripts/install_daily_backup_cron.sh [hour] [minute] [env_file] [backup_dir] [retention_days]

Defaults:
  hour           = 2
  minute         = 15
  env_file       = /opt/pantry-manager/.env
  backup_dir     = /opt/pantry-manager/backups
  retention_days = 14

Examples:
  scripts/install_daily_backup_cron.sh
  scripts/install_daily_backup_cron.sh 3 0
  scripts/install_daily_backup_cron.sh 1 30 /opt/pantry-manager/.env /opt/pantry-manager/backups 30
EOF
  exit 0
fi

HOUR="${1:-2}"
MINUTE="${2:-15}"
ENV_FILE="${3:-/opt/pantry-manager/.env}"
BACKUP_DIR="${4:-/opt/pantry-manager/backups}"
RETENTION_DAYS="${5:-14}"

if ! [[ "$HOUR" =~ ^[0-9]+$ ]] || (( HOUR < 0 || HOUR > 23 )); then
  echo "hour must be an integer between 0 and 23"
  exit 1
fi

if ! [[ "$MINUTE" =~ ^[0-9]+$ ]] || (( MINUTE < 0 || MINUTE > 59 )); then
  echo "minute must be an integer between 0 and 59"
  exit 1
fi

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "retention_days must be a non-negative integer"
  exit 1
fi

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup_production_db.sh"
if [[ ! -x "$SCRIPT_PATH" ]]; then
  echo "Backup script not found or not executable: $SCRIPT_PATH"
  exit 1
fi

CRON_MARKER="# pantry-manager-daily-db-backup"
CRON_CMD="$MINUTE $HOUR * * * $SCRIPT_PATH \"$ENV_FILE\" \"$BACKUP_DIR\" \"$RETENTION_DAYS\" $CRON_MARKER"

CURRENT_CRON="$(crontab -l 2>/dev/null || true)"
UPDATED_CRON="$(printf '%s\n' "$CURRENT_CRON" | sed "/$CRON_MARKER/d")"

{
  printf '%s\n' "$UPDATED_CRON"
  printf '%s\n' "$CRON_CMD"
} | sed '/^[[:space:]]*$/N;/^\n$/D' | crontab -

echo "Installed daily backup cron:"
echo "  $CRON_CMD"
echo
echo "Current crontab:"
crontab -l
