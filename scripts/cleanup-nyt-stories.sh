#!/bin/bash
# =============================================================================
# Mahogany — Cleanup NYT Stories (One-Time)
# =============================================================================
# Removes feed_stories that cite NYT (removed source). Requires DATABASE_URL.
#
# Usage:
#   npm run cleanup:nyt
#   # or:
#   ./scripts/cleanup-nyt-stories.sh
# =============================================================================

set -e

# Load .env.local if it exists
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set. Add it to .env.local or pass it as an env var."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/../src/sql/006_cleanup_nyt_stories.sql"

echo "Removing NYT stories from feed_stories..."
psql "$DATABASE_URL" -f "$SQL_FILE" -v ON_ERROR_STOP=1
echo "Done."
