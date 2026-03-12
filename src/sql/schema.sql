-- =====================================================================
-- Mahogany RI Platform — Full Postgres Schema
-- =====================================================================
-- Run this against your Supabase Postgres instance:
--   psql $DATABASE_URL -f src/sql/schema.sql
-- =====================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable pgvector for semantic embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── profiles ────────────────────────────────────────────────────────
-- One row per user. Drives all personalization: which sources to fetch,
-- how signals are filtered/ranked, and how the digest is framed.
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  regions       TEXT[] NOT NULL DEFAULT '{}',
  domains       TEXT[] NOT NULL DEFAULT '{}',
  therapeutic_areas TEXT[] NOT NULL DEFAULT '{}',
  product_types TEXT[] NOT NULL DEFAULT '{}',
  tracked_products TEXT[] NOT NULL DEFAULT '{}',
  role             TEXT NOT NULL DEFAULT '',
  organization     TEXT NOT NULL DEFAULT '',
  active_submissions TEXT[] NOT NULL DEFAULT '{}',
  competitors      TEXT[] NOT NULL DEFAULT '{}',
  regulatory_frameworks TEXT[] NOT NULL DEFAULT '{}',
  analysis_preferences TEXT NOT NULL DEFAULT '',
  digest_cadence TEXT NOT NULL DEFAULT 'daily',
  digest_send_hour INT NOT NULL DEFAULT 7,
  last_digest_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── raw_events ──────────────────────────────────────────────────────
-- Immutable log of every item fetched from every source, stored as-is.
-- We never delete or mutate these — they are the audit trail.
CREATE TABLE IF NOT EXISTS raw_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  raw_payload   JSONB NOT NULL DEFAULT '{}',
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_events_source ON raw_events (source_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_url ON raw_events (url);
CREATE INDEX IF NOT EXISTS idx_raw_events_fetched ON raw_events (fetched_at DESC);

-- ─── signals ─────────────────────────────────────────────────────────
-- Normalized, AI-classified signals derived from raw_events.
-- This is what the feed UI queries and what the digest summarizer reads.
CREATE TABLE IF NOT EXISTS signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_event_id    UUID REFERENCES raw_events(id),
  source_id       TEXT NOT NULL,
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  published_at    TIMESTAMPTZ,
  authority       TEXT NOT NULL DEFAULT '',
  document_id     TEXT,
  region          TEXT NOT NULL,
  domains         TEXT[] NOT NULL DEFAULT '{}',
  therapeutic_areas TEXT[] NOT NULL DEFAULT '{}',
  product_types   TEXT[] NOT NULL DEFAULT '{}',
  product_classes TEXT[] NOT NULL DEFAULT '{}',
  lifecycle_stage TEXT NOT NULL DEFAULT 'other',
  impact_type     TEXT NOT NULL DEFAULT 'other',
  impact_severity TEXT NOT NULL DEFAULT 'medium',
  ai_analysis     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_region ON signals (region);
CREATE INDEX IF NOT EXISTS idx_signals_severity ON signals (impact_severity);
CREATE INDEX IF NOT EXISTS idx_signals_published ON signals (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_authority ON signals (authority);
CREATE INDEX IF NOT EXISTS idx_signals_source ON signals (source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_signals_dedup
  ON signals (document_id, authority) WHERE document_id IS NOT NULL;

-- Full-text search index on title + summary
CREATE INDEX IF NOT EXISTS idx_signals_fts
  ON signals USING gin (to_tsvector('english', title || ' ' || summary));

-- ─── feed_stories ──────────────────────────────────────────────────
-- AI-synthesized news stories generated from groups of related signals.
-- Powers the main feed page with rich, analytical articles.
CREATE TABLE IF NOT EXISTS feed_stories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID REFERENCES profiles(id),
  headline        TEXT NOT NULL,
  summary         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  section         TEXT NOT NULL DEFAULT '',
  severity        TEXT NOT NULL DEFAULT 'medium',
  domains         TEXT[] NOT NULL DEFAULT '{}',
  regions         TEXT[] NOT NULL DEFAULT '{}',
  therapeutic_areas TEXT[] NOT NULL DEFAULT '{}',
  impact_types    TEXT[] NOT NULL DEFAULT '{}',
  signal_ids      UUID[] NOT NULL DEFAULT '{}',
  source_urls     TEXT[] NOT NULL DEFAULT '{}',
  source_labels   TEXT[] NOT NULL DEFAULT '{}',
  is_global       BOOLEAN NOT NULL DEFAULT false,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_stories_profile ON feed_stories (profile_id);
CREATE INDEX IF NOT EXISTS idx_feed_stories_global ON feed_stories (is_global) WHERE is_global = true;
CREATE INDEX IF NOT EXISTS idx_feed_stories_published ON feed_stories (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_stories_severity ON feed_stories (severity);

-- Full-text search on stories
CREATE INDEX IF NOT EXISTS idx_feed_stories_fts
  ON feed_stories USING gin (to_tsvector('english', headline || ' ' || summary || ' ' || body));

-- ─── digests ─────────────────────────────────────────────────────────
-- Log of every digest sent, including the rendered markdown and signal IDs used.
-- Useful for debugging, replaying, and showing "past digests" in the UI.
CREATE TABLE IF NOT EXISTS digests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id),
  signal_ids    UUID[] NOT NULL DEFAULT '{}',
  markdown      TEXT NOT NULL DEFAULT '',
  html          TEXT NOT NULL DEFAULT '',
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digests_profile ON digests (profile_id);
CREATE INDEX IF NOT EXISTS idx_digests_sent ON digests (sent_at DESC);

-- ─── intake intelligence ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intake_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  raw_text      TEXT NOT NULL DEFAULT '',
  parsed_json   JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'parsed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_sessions_profile ON intake_sessions (profile_id);
CREATE INDEX IF NOT EXISTS idx_intake_sessions_created ON intake_sessions (created_at DESC);

CREATE TABLE IF NOT EXISTS intake_mentions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  mention_text  TEXT NOT NULL,
  mention_type  TEXT NOT NULL,
  confidence    NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  start_pos     INT,
  end_pos       INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mention_type IN ('product_name', 'product_code', 'company', 'ta', 'framework'))
);

CREATE INDEX IF NOT EXISTS idx_intake_mentions_session ON intake_mentions (session_id);
CREATE INDEX IF NOT EXISTS idx_intake_mentions_type ON intake_mentions (mention_type);

-- ─── entity graph core ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (entity_type IN ('product', 'company', 'regulator', 'submission', 'standard', 'therapeutic_area', 'framework'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_type_name ON entities (entity_type, normalized_name);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias_text       TEXT NOT NULL,
  alias_type       TEXT NOT NULL DEFAULT 'name_variant',
  normalized_alias TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'system',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_alias_unique
  ON entity_aliases (entity_id, normalized_alias);
CREATE INDEX IF NOT EXISTS idx_entity_alias_lookup
  ON entity_aliases (normalized_alias);

CREATE TABLE IF NOT EXISTS entity_mentions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  signal_id      UUID REFERENCES signals(id) ON DELETE CASCADE,
  intake_mention_id UUID REFERENCES intake_mentions(id) ON DELETE SET NULL,
  provenance_type TEXT NOT NULL DEFAULT 'signal',
  confidence     NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  metadata_json  JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (provenance_type IN ('signal', 'intake', 'manual', 'agent'))
);

CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON entity_mentions (entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_signal ON entity_mentions (signal_id);

CREATE TABLE IF NOT EXISTS relations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  object_entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type    TEXT NOT NULL,
  confidence       NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  provenance_json  JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (relation_type IN ('manufacturer_of', 'competitor_of', 'same_product_family', 'same_ta', 'same_framework', 'same_regulator_pathway', 'mentioned_with'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_unique
  ON relations (subject_entity_id, object_entity_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_relations_subject ON relations (subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_object ON relations (object_entity_id);

CREATE TABLE IF NOT EXISTS profile_entity_interest (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  interest_score NUMERIC(5,3) NOT NULL DEFAULT 0.000,
  source         TEXT NOT NULL DEFAULT 'intake',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_entity_interest_unique
  ON profile_entity_interest (profile_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_profile_entity_interest_profile
  ON profile_entity_interest (profile_id, interest_score DESC);

-- ─── profile retrieval policy and watchlist ───────────────────────────
CREATE TABLE IF NOT EXISTS profile_focus (
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  focus_type    TEXT NOT NULL,
  weight        NUMERIC(5,3) NOT NULL DEFAULT 0.000,
  derived_from  TEXT NOT NULL DEFAULT 'inferred',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, focus_type),
  CHECK (focus_type IN ('product', 'ta', 'framework', 'broad')),
  CHECK (derived_from IN ('explicit', 'inferred', 'behavioral'))
);

CREATE TABLE IF NOT EXISTS profile_watch_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  watch_type    TEXT NOT NULL DEFAULT 'exact',
  priority      INT NOT NULL DEFAULT 50,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (watch_type IN ('exact', 'competitor', 'adjacent'))
);

CREATE INDEX IF NOT EXISTS idx_profile_watch_items_profile
  ON profile_watch_items (profile_id, priority DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_watch_item_unique
  ON profile_watch_items (profile_id, entity_id, watch_type);

CREATE TABLE IF NOT EXISTS profile_query_policies (
  profile_id             UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  retrieval_policy_json  JSONB NOT NULL DEFAULT '{}',
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── source + agent observability ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_registry (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  region        TEXT NOT NULL,
  domain        TEXT NOT NULL,
  access_method TEXT NOT NULL,
  url           TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name     TEXT NOT NULL,
  profile_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'running',
  input_json     JSONB NOT NULL DEFAULT '{}',
  output_json    JSONB NOT NULL DEFAULT '{}',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  error_text     TEXT,
  metadata_json  JSONB NOT NULL DEFAULT '{}',
  CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_profile ON agent_runs (profile_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs (agent_name, started_at DESC);

CREATE TABLE IF NOT EXISTS agent_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  action_name   TEXT NOT NULL,
  action_input  JSONB NOT NULL DEFAULT '{}',
  action_output JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'completed',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('queued', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_run ON agent_actions (run_id, created_at);

-- ─── signal_embeddings ──────────────────────────────────────────────
-- Vector embeddings for semantic search, dedup, and agent retrieval.
-- Each signal gets one or more chunks embedded (chunk 0 = title+summary+analysis).
CREATE TABLE IF NOT EXISTS signal_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id   UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text  TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,
  model       TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_embeddings_signal ON signal_embeddings (signal_id);

CREATE INDEX IF NOT EXISTS idx_signal_embeddings_hnsw
  ON signal_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── profile_interest_embeddings ────────────────────────────────────
-- Single vector per profile capturing their interest space.
-- Used for semantic ranking of signals in feed/digest generation.
CREATE TABLE IF NOT EXISTS profile_interest_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interest_text TEXT NOT NULL,
  embedding     vector(1536) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_interest_embed_profile
  ON profile_interest_embeddings (profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_interest_embed_hnsw
  ON profile_interest_embeddings USING hnsw (embedding vector_cosine_ops);
