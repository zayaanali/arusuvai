#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 4 ]]; then
  cat <<'EOF'
Usage:
  scripts/configure_pages_secrets.sh <project_name> <backend_origin> [backend_shared_secret] [environment]

Example:
  scripts/configure_pages_secrets.sh pantry-manager https://backend.example.ts.net supersecret production

Optional:
  Set CF_ACCESS_CLIENT_ID_INPUT and CF_ACCESS_CLIENT_SECRET_INPUT in the shell to also configure
  CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET for Cloudflare Access-protected origins.
EOF
  exit 1
fi

PROJECT_NAME="$1"
BACKEND_ORIGIN="$2"
BACKEND_SHARED_SECRET="${3:-}"
ENVIRONMENT="${4:-production}"

if [[ "$BACKEND_SHARED_SECRET" == "production" || "$BACKEND_SHARED_SECRET" == "preview" ]]; then
  ENVIRONMENT="$BACKEND_SHARED_SECRET"
  BACKEND_SHARED_SECRET=""
fi

if [[ -z "$BACKEND_SHARED_SECRET" && -f .env ]]; then
  BACKEND_SHARED_SECRET="$(sed -n 's/^BACKEND_SHARED_SECRET=//p' .env | tail -n1)"
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Install Node.js first."
  exit 1
fi

echo "Setting Pages secret BACKEND_ORIGIN for project '$PROJECT_NAME' ($ENVIRONMENT)..."
printf '%s' "$BACKEND_ORIGIN" | npx wrangler pages secret put BACKEND_ORIGIN --project-name "$PROJECT_NAME" --env "$ENVIRONMENT"

if [[ -n "${CF_ACCESS_CLIENT_ID_INPUT:-}" && -n "${CF_ACCESS_CLIENT_SECRET_INPUT:-}" ]]; then
  echo "Setting Pages secret CF_ACCESS_CLIENT_ID..."
  printf '%s' "$CF_ACCESS_CLIENT_ID_INPUT" | npx wrangler pages secret put CF_ACCESS_CLIENT_ID --project-name "$PROJECT_NAME" --env "$ENVIRONMENT"

  echo "Setting Pages secret CF_ACCESS_CLIENT_SECRET..."
  printf '%s' "$CF_ACCESS_CLIENT_SECRET_INPUT" | npx wrangler pages secret put CF_ACCESS_CLIENT_SECRET --project-name "$PROJECT_NAME" --env "$ENVIRONMENT"
fi

if [[ -n "$BACKEND_SHARED_SECRET" ]]; then
  echo "Setting Pages secret BACKEND_SHARED_SECRET..."
  printf '%s' "$BACKEND_SHARED_SECRET" | npx wrangler pages secret put BACKEND_SHARED_SECRET --project-name "$PROJECT_NAME" --env "$ENVIRONMENT"
fi

echo "Done. Trigger a new Pages deployment so Functions picks up the updated secrets."
