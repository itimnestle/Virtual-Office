#!/usr/bin/env bash
# Share the LOCAL demo over public Cloudflare quick tunnels (synthetic data only).
# Anyone with the link and the seed accounts in README can sign in — stop it (Ctrl+C) when done.
#
# Two tunnels are needed: the app, and the local Supabase API, because chat,
# live updates and uploads call Supabase from the visitor's browser.
# Your dev server on :3000 is left alone; this serves a production build on :3001.
set -euo pipefail
cd "$(dirname "$0")/.."
CF=${CLOUDFLARED:-cloudflared}
LOG=.test-output; mkdir -p "$LOG"

url_of() { for _ in $(seq 1 60); do u=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$1" | head -1 || true); [ -n "$u" ] && { echo "$u"; return; }; sleep 1; done; echo "no tunnel URL in $1" >&2; exit 1; }

"$CF" tunnel --no-autoupdate --url http://127.0.0.1:55421 > "$LOG/tunnel-api.log" 2>&1 & API_PID=$!
"$CF" tunnel --no-autoupdate --url http://localhost:3001 > "$LOG/tunnel-app.log" 2>&1 & APP_PID=$!
trap 'kill $API_PID $APP_PID 2>/dev/null || true' EXIT
API=$(url_of "$LOG/tunnel-api.log"); APP=$(url_of "$LOG/tunnel-app.log")
echo "API tunnel: $API"; echo "App tunnel: $APP"

# Public URLs are baked into the client bundle at build time.
export NEXT_PUBLIC_SUPABASE_URL="$API" NEXT_PUBLIC_SITE_URL="$APP" SERVER_ACTIONS_ALLOWED_ORIGINS="${APP#https://}"
npx next build
echo
echo "Open: $APP   (sign in with the seed accounts listed in README)"
npx next start -p 3001
