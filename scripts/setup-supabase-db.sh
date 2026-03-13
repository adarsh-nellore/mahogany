#!/bin/bash
# =============================================================================
# Mahogany — Supabase Database Setup
# =============================================================================
# Run this script to apply the full schema and migrations to your Supabase
# Postgres instance. Requires DATABASE_URL in .env.local (or environment).
#
# Usage:
#   ./scripts/setup-supabase-db.sh
#   # or with explicit URL:
#   DATABASE_URL="postgresql://..." ./scripts/setup-supabase-db.sh
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

echo "Applying schema to Supabase..."
echo ""

# 1. Base schema (includes pgvector, profiles, signals, feed_stories, etc.)
echo "[1/6] Running schema.sql..."
psql "$DATABASE_URL" -f src/sql/schema.sql -v ON_ERROR_STOP=1

# 2. Migrations in order
echo "[2/6] Running 001_ingestion_diagnostics.sql..."
psql "$DATABASE_URL" -f src/sql/001_ingestion_diagnostics.sql -v ON_ERROR_STOP=1 2>/dev/null || true

echo "[3/6] Running 002_source_health_columns.sql..."
psql "$DATABASE_URL" -f src/sql/002_source_health_columns.sql -v ON_ERROR_STOP=1 2>/dev/null || true

echo "[4/6] Running 003_embeddings.sql..."
psql "$DATABASE_URL" -f src/sql/003_embeddings.sql -v ON_ERROR_STOP=1 2>/dev/null || true

echo "[5/6] Running 004_relevance_reason.sql..."
psql "$DATABASE_URL" -f src/sql/004_relevance_reason.sql -v ON_ERROR_STOP=1 2>/dev/null || true

echo "[6/6] Running 005_profile_timezone.sql..."
psql "$DATABASE_URL" -f src/sql/005_profile_timezone.sql -v ON_ERROR_STOP=1

echo ""
echo "Done! Supabase database is ready."
