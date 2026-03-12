-- Add source health monitoring columns for circuit breaker
-- access_method tracks current fetching strategy (rss, api, firecrawl, firecrawl_fallback)
-- degraded_until parks broken sources for 24h instead of burning money on retries

ALTER TABLE source_state
  ADD COLUMN IF NOT EXISTS access_method TEXT DEFAULT 'rss',
  ADD COLUMN IF NOT EXISTS degraded_until TIMESTAMPTZ;
