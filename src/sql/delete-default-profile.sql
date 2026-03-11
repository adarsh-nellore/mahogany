-- Remove the demo/default profile so new users go through onboarding.
-- Run with: psql $DATABASE_URL -f src/sql/delete-default-profile.sql
DELETE FROM profile_watch_items WHERE profile_id IN (SELECT id FROM profiles WHERE email = 'jane@mahogany-demo.local');
DELETE FROM profile_query_policies WHERE profile_id IN (SELECT id FROM profiles WHERE email = 'jane@mahogany-demo.local');
DELETE FROM digests WHERE profile_id IN (SELECT id FROM profiles WHERE email = 'jane@mahogany-demo.local');
DELETE FROM profiles WHERE email = 'jane@mahogany-demo.local';
