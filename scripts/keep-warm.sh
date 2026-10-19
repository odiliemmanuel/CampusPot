#!/usr/bin/env bash
# Keeps the PotKeeper API warm so the next request doesn't pay a cold start.
#
# Render's free tier sleeps after ~15 minutes of inactivity, so we ping the
# lightweight /health endpoint every 13 minutes. The web app also does this
# itself while a tab is open (see frontend/src/lib/keepAlive.ts); this script
# is for keeping the API warm when nobody has the app open.
#
# Usage:
#   ./scripts/keep-warm.sh [URL]
#   URL defaults to the production health endpoint.
#
# Run it in a terminal, or schedule it (note: cron's shortest interval is 1 min,
# so the loop below is preferred — keep it running under tmux/systemd):
#   */13 * * * * /path/to/scripts/keep-warm.sh >/dev/null 2>&1
set -u

URL="${1:-https://campusspot-kvjm.onrender.com/health}"
INTERVAL="${KEEP_WARM_INTERVAL:-780}" # seconds (13 minutes)

echo "Warming $URL every ${INTERVAL}s — Ctrl+C to stop"
while true; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -m 60 "$URL" || echo 000)"
  printf '%s -> %s\n' "$(date '+%H:%M:%S')" "$code"
  sleep "$INTERVAL"
done
