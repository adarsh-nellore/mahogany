-- =====================================================================
-- Migration 001: Ingestion Diagnostics + Exceptions + Source State
-- =====================================================================

-- ─── ingestion_diagnostics ──────────────────────────────────────────
-- Per-fetch telemetry: every HTTP request during ingestion records a row.
CREATE TABLE IF NOT EXISTS ingestion_diagnostics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       TEXT NOT NULL,
  url             TEXT NOT NULL,
  http_status     INT,
  final_url       TEXT,
  response_time_ms INT,
  content_length  INT,
  extracted_text_length INT,
  main_content_ratio NUMERIC(5,4),
  parser_used     TEXT,
  error_code      TEXT,
  metadata_json   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_diag_source ON ingestion_diagnostics (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_diag_error ON ingestion_diagnostics (error_code) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ingestion_diag_created ON ingestion_diagnostics (created_at DESC);

-- ─── ingestion_exceptions ───────────────────────────────────────────
-- Failed items that didn't make it through the quality gate.
-- Instead of silently dropping, we record them for review.
CREATE TABLE IF NOT EXISTS ingestion_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       TEXT NOT NULL,
  url             TEXT NOT NULL DEFAULT '',
  title           TEXT NOT NULL DEFAULT '',
  reason_code     TEXT NOT NULL,
  raw_payload     JSONB NOT NULL DEFAULT '{}',
  suggested_fix   TEXT,
  reviewed        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_exc_source ON ingestion_exceptions (source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_exc_reason ON ingestion_exceptions (reason_code);
CREATE INDEX IF NOT EXISTS idx_ingestion_exc_unreviewed ON ingestion_exceptions (reviewed) WHERE reviewed = false;

-- ─── source_state ───────────────────────────────────────────────────
-- Stores ETags, Last-Modified headers, and API cursors for incremental pulls.
CREATE TABLE IF NOT EXISTS source_state (
  source_id       TEXT PRIMARY KEY,
  etag            TEXT,
  last_modified   TEXT,
  last_cursor     TEXT,
  content_hash    TEXT,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INT NOT NULL DEFAULT 0,
  metadata_json   JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── story_feedback ─────────────────────────────────────────────────
-- User thumbs up/down on feed stories.
CREATE TABLE IF NOT EXISTS story_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  story_id        UUID NOT NULL REFERENCES feed_stories(id) ON DELETE CASCADE,
  signal          TEXT NOT NULL CHECK (signal IN ('up', 'down')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_feedback_unique ON story_feedback (profile_id, story_id);
CREATE INDEX IF NOT EXISTS idx_story_feedback_story ON story_feedback (story_id);

-- ─── digests: add delivery_status column ────────────────────────────
ALTER TABLE digests ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE digests ADD COLUMN IF NOT EXISTS delivery_error TEXT;

-- ─── profile_watch_items: add subscription management columns ───────
ALTER TABLE profile_watch_items ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused'));
ALTER TABLE profile_watch_items ADD COLUMN IF NOT EXISTS alert_threshold TEXT NOT NULL DEFAULT 'medium' CHECK (alert_threshold IN ('high', 'medium', 'low'));
ALTER TABLE profile_watch_items ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('immediate', 'daily', 'weekly'));
