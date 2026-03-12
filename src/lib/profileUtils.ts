/**
 * Profile utilities — derived arrays from profile_watch_items.
 * Single source of truth: profile_watch_items. tracked_products and competitors
 * are derived from active watch items to avoid stale data.
 */

import { query } from "./db";

export interface DerivedProfileArrays {
  tracked_products: string[];
  competitors: string[];
}

/**
 * Derive tracked_products and competitors from active profile_watch_items.
 * Use this instead of profile.tracked_products / profile.competitors for
 * relevance scoring and signal selection.
 */
export async function getDerivedProfileArrays(
  profileId: string
): Promise<DerivedProfileArrays> {
  try {
    const rows = await query<{ canonical_name: string; watch_type: string }>(
      `SELECT e.canonical_name, pwi.watch_type
       FROM profile_watch_items pwi
       JOIN entities e ON e.id = pwi.entity_id
       WHERE pwi.profile_id = $1
         AND COALESCE(pwi.status, 'active') = 'active'
         AND e.canonical_name IS NOT NULL
         AND e.canonical_name != ''`,
      [profileId]
    );

    const tracked_products: string[] = [];
    const competitors: string[] = [];
    const seenProducts = new Set<string>();
    const seenCompetitors = new Set<string>();

    for (const row of rows) {
      const name = row.canonical_name.trim();
      if (row.watch_type === "exact") {
        if (!seenProducts.has(name.toLowerCase())) {
          seenProducts.add(name.toLowerCase());
          tracked_products.push(name);
        }
      } else if (row.watch_type === "competitor") {
        if (!seenCompetitors.has(name.toLowerCase())) {
          seenCompetitors.add(name.toLowerCase());
          competitors.push(name);
        }
      }
    }

    return { tracked_products, competitors };
  } catch {
    return { tracked_products: [], competitors: [] };
  }
}
