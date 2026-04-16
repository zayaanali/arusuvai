#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"

check_json() {
  local url="$1"
  local body
  body="$(curl -fsS "$url")"
  python3 -c 'import json,sys; json.loads(sys.stdin.read())' <<<"$body" >/dev/null
}

echo "Checking API health at ${BASE_URL}/api/health"
check_json "${BASE_URL}/api/health"

echo "Checking pantry list at ${BASE_URL}/api/pantry"
check_json "${BASE_URL}/api/pantry"

echo "Smoke checks passed."
