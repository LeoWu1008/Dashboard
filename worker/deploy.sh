#!/usr/bin/env bash
# Lädt den Cloud-Helfer zu Cloudflare hoch (benötigt API-Token mit Workers-Rechten).
set -euo pipefail
cd "$(dirname "$0")"
ACC="${CF_ACCOUNT_ID:?CF_ACCOUNT_ID fehlt}"
NAME="dashboard-helfer"
API="https://api.cloudflare.com/client/v4/accounts/$ACC/workers/scripts/$NAME"
AUTH=()
[ -n "${CF_API_TOKEN:-}" ] && AUTH=(-H "Authorization: Bearer $CF_API_TOKEN")

curl -sS -X PUT "$API" "${AUTH[@]}" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "index.js=@index.js;type=application/javascript+module" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Upload:', d['success'], d.get('errors'))"

curl -sS -X POST "$API/subdomain" "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"enabled":true}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('workers.dev:', d['success'], d.get('errors'))"
