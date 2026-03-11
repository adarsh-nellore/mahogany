import { query } from "./db";
import { MatchReasonCode, SearchEvidenceBundle } from "./types";

interface MatchSignalRow {
  signal_id: string;
  title: string;
  summary: string;
  url: string;
  authority: string;
  published_at: string;
  reason_code: MatchReasonCode;
  matched_entity: string;
}

function dedupeBundles(rows: MatchSignalRow[]): SearchEvidenceBundle[] {
  const map = new Map<string, SearchEvidenceBundle>();
  for (const row of rows) {
    const existing = map.get(row.signal_id);
    if (!existing) {
      map.set(row.signal_id, {
        signal_id: row.signal_id,
        title: row.title,
        summary: row.summary,
        url: row.url,
        authority: row.authority,
        published_at: row.published_at,
        reason_codes: [row.reason_code],
        matched_entities: [row.matched_entity],
      });
      continue;
    }
    if (!existing.reason_codes.includes(row.reason_code)) {
      existing.reason_codes.push(row.reason_code);
    }
    if (!existing.matched_entities.includes(row.matched_entity)) {
      existing.matched_entities.push(row.matched_entity);
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

export async function searchProfileEvidence(
  profileId: string,
  limit = 40
): Promise<SearchEvidenceBundle[]> {
  const clamped = Math.max(1, Math.min(150, limit));
  const rows = await query<MatchSignalRow>(
    `WITH watch AS (
      SELECT pwi.entity_id, e.canonical_name, pwi.watch_type
      FROM profile_watch_items pwi
      JOIN entities e ON e.id = pwi.entity_id
      WHERE pwi.profile_id = $1
    ),
    exact AS (
      SELECT
        s.id AS signal_id, s.title, s.summary, s.url, s.authority, s.published_at,
        'exact_code_match'::text AS reason_code,
        w.canonical_name AS matched_entity
      FROM watch w
      JOIN entity_mentions em ON em.entity_id = w.entity_id
      JOIN signals s ON s.id = em.signal_id
    ),
    alias_expanded AS (
      SELECT
        s.id AS signal_id, s.title, s.summary, s.url, s.authority, s.published_at,
        CASE WHEN w.watch_type = 'competitor' THEN 'competitor_equivalent' ELSE 'same_product_family' END::text AS reason_code,
        w.canonical_name AS matched_entity
      FROM watch w
      JOIN relations r
        ON r.subject_entity_id = w.entity_id
       AND r.relation_type IN ('same_product_family', 'competitor_of')
      JOIN entity_mentions em ON em.entity_id = r.object_entity_id
      JOIN signals s ON s.id = em.signal_id
    ),
    ta_framework AS (
      SELECT
        s.id AS signal_id, s.title, s.summary, s.url, s.authority, s.published_at,
        'same_ta_regulatory_pathway'::text AS reason_code,
        w.canonical_name AS matched_entity
      FROM watch w
      JOIN relations r
        ON r.subject_entity_id = w.entity_id
       AND r.relation_type IN ('same_ta', 'same_framework', 'same_regulator_pathway')
      JOIN entity_mentions em ON em.entity_id = r.object_entity_id
      JOIN signals s ON s.id = em.signal_id
    )
    SELECT * FROM exact
    UNION ALL
    SELECT * FROM alias_expanded
    UNION ALL
    SELECT * FROM ta_framework
    ORDER BY published_at DESC
    LIMIT $2`,
    [profileId, clamped]
  );

  return dedupeBundles(rows);
}

export async function comparativeAlerts(profileId: string): Promise<SearchEvidenceBundle[]> {
  const rows = await query<MatchSignalRow>(
    `WITH watch AS (
      SELECT entity_id, watch_type
      FROM profile_watch_items
      WHERE profile_id = $1
    ),
    competitor_relations AS (
      SELECT r.object_entity_id AS competitor_entity_id
      FROM watch w
      JOIN relations r
        ON r.subject_entity_id = w.entity_id
       AND r.relation_type = 'competitor_of'
    )
    SELECT
      s.id AS signal_id, s.title, s.summary, s.url, s.authority, s.published_at,
      'competitor_equivalent'::text AS reason_code,
      e.canonical_name AS matched_entity
    FROM competitor_relations cr
    JOIN entities e ON e.id = cr.competitor_entity_id
    JOIN entity_mentions em ON em.entity_id = cr.competitor_entity_id
    JOIN signals s ON s.id = em.signal_id
    ORDER BY s.published_at DESC
    LIMIT 40`,
    [profileId]
  );

  return dedupeBundles(rows);
}

