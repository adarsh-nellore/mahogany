-- Add timezone column for timezone-aware morning feed updates and digest send.
-- IANA timezone string (e.g. America/New_York). Default UTC preserves existing behavior.
-- Run: psql $DATABASE_URL -f src/sql/005_profile_timezone.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
