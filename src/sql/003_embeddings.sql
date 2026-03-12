-- =====================================================================
-- Migration 003: Vector Embedding Pipeline
-- =====================================================================
-- Adds pgvector extension + tables for semantic search/dedup/retrieval.
-- Run: psql $DATABASE_URL -f src/sql/003_embeddings.sql
-- =====================================================================

-- Enable pgvector (available on Supabase by default)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── signal_embeddings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id   UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL DEFAULT 0,        -- 0 = title+summary+analysis, 1+ = body chunks
  chunk_text  TEXT NOT NULL,                  -- the text that was embedded
  embedding   vector(1536) NOT NULL,          -- text-embedding-3-small dimension
  model       TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_embeddings_signal ON signal_embeddings (signal_id);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS idx_signal_embeddings_hnsw
  ON signal_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── profile_interest_embeddings ────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_interest_embeddings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interest_text TEXT NOT NULL,                -- concatenated interest description
  embedding     vector(1536) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_interest_embed_profile
  ON profile_interest_embeddings (profile_id);

CREATE INDEX IF NOT EXISTS idx_profile_interest_embed_hnsw
  ON profile_interest_embeddings USING hnsw (embedding vector_cosine_ops);
