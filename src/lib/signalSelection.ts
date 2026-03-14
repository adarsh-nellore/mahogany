/**
 * Shared signal selection logic for feed and digest.
 *
 * Single pipeline: region buckets + product signals + scoreAndRank.
 * Both feed generation and digest use this so they stay in sync.
 * Uses published_at consistently for time window.
 */

import { query } from "./db";
import { fetchProductSignals, scoreAndRank } from "./relevanceScorer";
import { DISABLE_US_SOURCES } from "./experimentFlags";
import { SOURCE_PRIORITY_ORDER_SQL, IMPACT_TYPE_ORDER_SQL } from "./fetchers/sourceRegistry";
import { Profile, Signal } from "./types";

export interface SelectSignalsOptions {
  limit?: number;
  dayWindow?: number;
  productReservedSlots?: number;
  capSignals?: number;
}

const SEVERITY_ORDER =
  `CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`;

const REGION_BUCKETS = [
  { region: "EU", limit: 80 },
  { region: "UK", limit: 50 },
  { region: "Canada", limit: 40 },
  { region: "Australia", limit: 30 },
  { region: "Japan", limit: 30 },
  { region: "Switzerland", limit: 20 },
  { region: "Global", limit: 60 },
];

// US/FDA first with higher limit; international kept as-is
const DEFAULT_REGION_BUCKETS = DISABLE_US_SOURCES
  ? REGION_BUCKETS
  : [{ region: "US", limit: 120 }, ...REGION_BUCKETS];

/**
 * Shared signal selection used by both feed and digest.
 * Region buckets + product signals + scoreAndRank. Uses published_at.
 */
export async function selectSignalsForFeed(
  profile: Profile | null,
  profileId: string | null,
  options?: SelectSignalsOptions
): Promise<Signal[]> {
  const dayWindow = options?.dayWindow ?? 30;
  const productReservedSlots = options?.productReservedSlots ?? 50;
  const capSignals = options?.capSignals ?? 220;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 0;

  if (profile) {
    if (profile.regions?.length && !profile.regions.includes("Global")) {
      paramIdx++;
      conditions.push(`region = ANY($${paramIdx})`);
      params.push(profile.regions);
    }
    if (profile.domains?.length) {
      paramIdx++;
      conditions.push(`domains && $${paramIdx}`);
      params.push(profile.domains);
    }
    // Filter by therapeutic areas: include signals that match profile TAs or have no TA tags (general content)
    if (profile.therapeutic_areas?.length) {
      const raw = profile.therapeutic_areas.map((t) => t.toLowerCase().trim()).filter(Boolean);
      const expand = (t: string): string[] => {
        const out: string[] = [t];
        if (t.includes("wound") || t.includes("dressing")) out.push("wound care");
        if (t === "hematoma") out.push("hematology");
        return out;
      };
      const tasLower = [...new Set(raw.flatMap(expand))];
      if (tasLower.length > 0) {
        paramIdx++;
        params.push(tasLower);
        conditions.push(
          `(cardinality(therapeutic_areas) = 0 OR EXISTS (SELECT 1 FROM unnest(therapeutic_areas) t WHERE lower(trim(t::text)) = ANY($${paramIdx})))`
        );
      }
    }
  }

  conditions.push(`published_at > now() - interval '1 day' * ${dayWindow}`);
  const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const selectedRegions =
    profile?.regions?.length && !profile.regions.includes("Global")
      ? profile.regions
      : null;
  const activeBuckets = selectedRegions
    ? DEFAULT_REGION_BUCKETS.filter((b) => (selectedRegions as string[]).includes(b.region))
    : DEFAULT_REGION_BUCKETS;

  const unionParts = activeBuckets.map((b) => {
    const regionWhere = baseWhere
      ? `${baseWhere} AND region = '${b.region}'`
      : `WHERE region = '${b.region}'`;
    return `(SELECT * FROM signals ${regionWhere} ORDER BY ${SEVERITY_ORDER}, ${IMPACT_TYPE_ORDER_SQL}, ${SOURCE_PRIORITY_ORDER_SQL}, published_at DESC LIMIT ${b.limit})`;
  });

  const signals =
    unionParts.length > 0
      ? await query<Signal>(unionParts.join("\n UNION ALL\n"), params)
      : [];

  const seenIds = new Set<string>();
  const dedupedSignals = signals
    .filter((s) => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    })
    .slice(0, capSignals);

  let productSignals: Signal[] = [];
  if (profileId) {
    productSignals = await fetchProductSignals(profileId, dayWindow, productReservedSlots);
  }

  const productIds = new Set(productSignals.map((s) => s.id));
  const regionOnly = dedupedSignals.filter((s) => !productIds.has(s.id));
  const merged = [...productSignals, ...regionOnly].slice(0, capSignals);

  const scored = profile
    ? (await scoreAndRank(merged, profile, "exploratory")).map((s) => s.signal)
    : merged;

  return scored;
}

/**
 * Select signals for digest. Uses same pipeline as feed for sync.
 */
export async function selectSignalsForProfile(
  profile: Profile,
  options?: SelectSignalsOptions
): Promise<Signal[]> {
  const limit = options?.limit ?? 60;
  const signals = await selectSignalsForFeed(profile, profile.id, {
    ...options,
    capSignals: 220,
  });
  return signals.slice(0, limit);
}
