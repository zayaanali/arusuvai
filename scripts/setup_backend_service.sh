#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  cat <<'EOF'
Usage:
  scripts/setup_backend_service.sh <linux_user> <repo_dir>

Example:
  scripts/setup_backend_service.sh zayaan /home/zayaan/projects/pantry-manager
EOF
  exit 1
fi

LINUX_USER="$1"
REPO_DIR="$2"
SERVICE_NAME="pantry-manager.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
ENV_PATH="${REPO_DIR}/.env"

if [[ ! -d "$REPO_DIR" ]]; then
  echo "Repo directory not found: $REPO_DIR"
  exit 1
fi

if [[ ! -f "$ENV_PATH" ]]; then
  echo "Missing ${ENV_PATH}. Create it first (for example: cp .env.example .env)."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js first."
  exit 1
fi

sudo tee "$SERVICE_PATH" >/dev/null <<EOF
[Unit]
Description=Pantry Manager Backend
After=network.target

[Service]
Type=simple
User=${LINUX_USER}
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${ENV_PATH}
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "Reloading systemd and enabling ${SERVICE_NAME}..."
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"
sudo systemctl status "${SERVICE_NAME}" --no-pager

echo "Done. Backend is now managed by systemd."
