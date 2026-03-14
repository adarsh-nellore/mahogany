-- Remove feed_stories that cite NYT or American Heart Association (removed sources). One-time cleanup.
-- Run with: psql $DATABASE_URL -f src/sql/006_cleanup_nyt_stories.sql
DELETE FROM feed_stories
WHERE EXISTS (
  SELECT 1 FROM unnest(source_labels) AS l
  WHERE l ILIKE '%nyt%' OR l ILIKE '%new york times%'
    OR l ILIKE '%american heart association%' OR l ILIKE '%heart.org%'
)
OR EXISTS (
  SELECT 1 FROM unnest(source_urls) AS u
  WHERE u ILIKE '%nytimes.com%' OR u ILIKE '%heart.org%' OR u ILIKE '%americanheart.org%'
);
