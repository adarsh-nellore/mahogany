#!/bin/bash
# =============================================================================
# Mahogany — Seed Feed (Ingestion + Generate)
# =============================================================================
# Runs the same pipeline as Vercel crons: poll-signals/fast then generate-feed.
# Requires the app to be running (npm run dev or a deployed URL).
#
# Usage:
#   npm run seed-feed
#   # or with custom URL:
#   BASE_URL=https://your-app.vercel.app npm run seed-feed
# =============================================================================

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT=600
AUTH_OPTS=()
if [ -n "$CRON_SECRET" ]; then
  AUTH_OPTS=(-H "Authorization: Bearer $CRON_SECRET")
fi

echo "Seeding feed via $BASE_URL"
echo ""

echo "[1/2] Running poll-signals/fast (RSS + API ingestion, may take 2-5 min)..."
if ! res1=$(curl -s -w "\n%{http_code}" -X POST "${AUTH_OPTS[@]}" "$BASE_URL/api/poll-signals/fast" --max-time $TIMEOUT 2>/dev/null); then
  echo "Error: Request failed. Is the app running at $BASE_URL?"
  exit 1
fi
http1=$(echo "$res1" | tail -n1)
body1=$(echo "$res1" | sed '$d')
if [ "$http1" != "200" ]; then
  echo "Error: poll-signals/fast returned HTTP $http1"
  echo "$body1" | head -5
  exit 1
fi
echo "  Done."
echo ""

echo "[2/2] Running generate-feed..."
if ! res2=$(curl -s -w "\n%{http_code}" -X POST "${AUTH_OPTS[@]}" "$BASE_URL/api/generate-feed" --max-time $TIMEOUT 2>/dev/null); then
  echo "Error: Request failed."
  exit 1
fi
http2=$(echo "$res2" | tail -n1)
body2=$(echo "$res2" | sed '$d')
if [ "$http2" != "200" ]; then
  echo "Error: generate-feed returned HTTP $http2"
  echo "$body2" | head -5
  exit 1
fi
echo "  Done."
echo ""

echo "Summary:"
echo "$body2" | head -3
echo ""
echo "Feed seeded. Refresh the landing page to see stories."
