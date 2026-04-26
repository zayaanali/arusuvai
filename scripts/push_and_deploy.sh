#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  scripts/push_and_deploy.sh [deploy_path] [service_name]

Defaults:
  deploy_path  = /opt/pantry-manager
  service_name = pantry-manager.service

Environment:
  REMOTE_NAME=origin   (optional git remote override)
  SKIP_DB_BACKUP=1     (skip pre-deploy DB backup)
EOF
  exit 0
fi

DEPLOY_PATH="${1:-/opt/pantry-manager}"
SERVICE_NAME="${2:-pantry-manager.service}"
REMOTE_NAME="${REMOTE_NAME:-origin}"

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required."
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "Run this script from the repo root."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  echo "Could not determine current git branch."
  exit 1
fi

echo "Pushing ${BRANCH} to ${REMOTE_NAME}..."
git push "$REMOTE_NAME" "$BRANCH"

echo "Syncing repo to ${DEPLOY_PATH}..."
mkdir -p "$DEPLOY_PATH"
rsync -az --delete \
  --exclude ".git/" \
  --exclude ".github/" \
  --exclude "node_modules/" \
  --exclude ".env" \
  --exclude ".env.save" \
  --exclude "pantry_manager.db" \
  --exclude "data/*.db" \
  ./ "$DEPLOY_PATH/"

if [[ "${SKIP_DB_BACKUP:-0}" != "1" ]]; then
  echo "Creating production DB backup..."
  "${DEPLOY_PATH}/scripts/backup_production_db.sh" \
    "${DEPLOY_PATH}/.env" \
    "${DEPLOY_PATH}/backups" \
    "14"
fi

echo "Installing production dependencies..."
npm ci --omit=dev --prefix "$DEPLOY_PATH"

echo "Restarting ${SERVICE_NAME}..."
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME"

echo "Deploy complete."
