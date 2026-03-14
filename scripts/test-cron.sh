#!/bin/bash
# Test cron endpoints from your machine.
# Usage: CRON_SECRET=your_secret ./scripts/test-cron.sh [send-digests|generate-feed] [debug]
#   debug = GET ?debug=1 to see why profiles are/aren't in the digest window (no emails sent)

BASE="${NEXT_PUBLIC_APP_URL:-https://mahogany2-production.up.railway.app}"
ENDPOINT="${1:-send-digests}"
MODE="${2:-}"

if [ -z "$CRON_SECRET" ]; then
  echo "Set CRON_SECRET (from Railway mahogany2 variables)"
  exit 1
fi

if [ "$MODE" = "debug" ]; then
  echo "GET $BASE/api/$ENDPOINT?debug=1 (diagnostic only, no emails)"
  curl -sS -w "\n\n---\nHTTP status: %{http_code}\n" "$BASE/api/$ENDPOINT?debug=1" \
    -H "Authorization: Bearer $CRON_SECRET"
else
  echo "POST $BASE/api/$ENDPOINT"
  curl -sS -w "\n\n---\nHTTP status: %{http_code}\n" -X POST "$BASE/api/$ENDPOINT" \
    -H "Authorization: Bearer $CRON_SECRET"
fi
