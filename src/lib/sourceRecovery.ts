/**
 * Source recovery agent.
 *
 * Periodically resets degraded or repeatedly-failing sources so they get
 * a fresh chance to recover via the primary method (RSS/API) instead of
 * staying stuck on Firecrawl escalation or 24h degradation.
 *
 * Resets sources where:
 * - degraded_until has expired (cooldown over) — give primary method another try
 * - consecutive_failures >= 3 but not yet degraded — stuck in Firecrawl loop
 */

import { query } from "./db";

export interface RecoveryResult {
  source_id: string;
  reason: "degraded_expired" | "high_failures";
  previous_failures: number;
}

/**
 * Reset sources that qualify for recovery.
 * Returns the list of sources that were reset.
 */
export async function resetRecoverableSources(): Promise<RecoveryResult[]> {
  const rows = await query<{
    source_id: string;
    consecutive_failures: number;
    degraded_until: string | null;
  }>(
    `SELECT source_id, consecutive_failures, degraded_until
     FROM source_state
     WHERE (degraded_until IS NOT NULL AND degraded_until < now())
        OR (consecutive_failures >= 3 AND (degraded_until IS NULL OR degraded_until < now()))`
  );

  if (rows.length === 0) {
    return [];
  }

  const results: RecoveryResult[] = [];

  for (const row of rows) {
    const reason =
      row.degraded_until && new Date(row.degraded_until) < new Date()
        ? "degraded_expired"
        : "high_failures";

    await query(
      `UPDATE source_state
       SET consecutive_failures = 0,
           degraded_until = NULL,
           access_method = 'rss',
           updated_at = now()
       WHERE source_id = $1`,
      [row.source_id]
    );

    results.push({
      source_id: row.source_id,
      reason,
      previous_failures: row.consecutive_failures,
    });
  }

  return results;
}
