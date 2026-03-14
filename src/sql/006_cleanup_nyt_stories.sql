-- Remove feed_stories that cite NYT (removed source). One-time cleanup.
-- Run with: psql $DATABASE_URL -f src/sql/006_cleanup_nyt_stories.sql
DELETE FROM feed_stories
WHERE EXISTS (
  SELECT 1 FROM unnest(source_labels) AS l
  WHERE l ILIKE '%nyt%' OR l ILIKE '%new york times%'
)
OR EXISTS (
  SELECT 1 FROM unnest(source_urls) AS u
  WHERE u ILIKE '%nytimes.com%'
);
