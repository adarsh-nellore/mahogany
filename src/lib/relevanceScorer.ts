/**
 * Relevance scoring + tiering module.
 *
 * Scores each signal based on how well it matches a user's profile:
 * - Exact entity match: 1.0
 * - Same product family: 0.8
 * - Same TA: 0.6
 * - Same domain only: 0.3
 * - No match: 0.1
 *
 * Multiplied by severity weight: high=3, medium=2, low=1
 * Tiered: must-see (>2.0), digest (1.0-2.0), exploratory (<1.0)
 */

import { Signal, Profile, ImpactSeverity } from "./types";
import { query } from "./db";
import { getDerivedProfileArrays } from "./profileUtils";
import { SOURCE_PRIORITY, SOURCE_PRIORITY_ORDER_SQL, IMPACT_TYPE_ORDER_SQL } from "./fetchers/sourceRegistry";

export type RelevanceTier = "must_see" | "digest" | "exploratory";

export interface ScoredSignal {
  signal: Signal;
  relevanceScore: number;
  tier: RelevanceTier;
  matchReasons: string[];
}

const SEVERITY_WEIGHT: Record<ImpactSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Score a batch of signals against a user profile.
 * Uses derived tracked_products/competitors from profile_watch_items as single source of truth.
 */
export async function scoreSignals(
  signals: Signal[],
  profile: Profile
): Promise<ScoredSignal[]> {
  const [watchedEntities, derived] = await Promise.all([
    getProfileWatchedEntities(profile.id),
    getDerivedProfileArrays(profile.id),
  ]);

  return signals.map((signal) => {
    const { score, reasons } = computeRelevanceScore(
      signal,
      profile,
      watchedEntities,
      derived.tracked_products,
      derived.competitors
    );
    const severityMultiplier = SEVERITY_WEIGHT[signal.impact_severity] || 1;
    const finalScore = score * severityMultiplier;

    return {
      signal,
      relevanceScore: Math.round(finalScore * 100) / 100,
      tier: getTier(finalScore),
      matchReasons: reasons,
    };
  });
}

/**
 * Score and sort signals, returning only signals above minimum threshold.
 */
const RELEVANCE_TIE_EPSILON = 0.05;

function getSourcePriority(sourceId: string): number {
  return SOURCE_PRIORITY[sourceId] ?? 3;
}

export async function scoreAndRank(
  signals: Signal[],
  profile: Profile,
  minTier: RelevanceTier = "exploratory"
): Promise<ScoredSignal[]> {
  const scored = await scoreSignals(signals, profile);

  const minScore = minTier === "must_see" ? 2.0 : minTier === "digest" ? 1.0 : 0;

  return scored
    .filter((s) => s.relevanceScore >= minScore)
    .sort((a, b) => {
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(scoreDiff) >= RELEVANCE_TIE_EPSILON) return scoreDiff;
      // Tiebreaker: prefer higher-priority sources (1 before 2 before 3)
      return getSourcePriority(a.signal.source_id) - getSourcePriority(b.signal.source_id);
    });
}

function getTier(score: number): RelevanceTier {
  if (score > 2.0) return "must_see";
  if (score >= 1.0) return "digest";
  return "exploratory";
}

interface WatchedEntity {
  entity_id: string;
  canonical_name: string;
  normalized_name: string;
  watch_type: string;
  entity_type: string;
  metadata_json: Record<string, unknown>;
}

export async function getProfileWatchedEntities(profileId: string): Promise<WatchedEntity[]> {
  try {
    return await query<WatchedEntity>(
      `SELECT
        pwi.entity_id,
        e.canonical_name,
        e.normalized_name,
        pwi.watch_type,
        e.entity_type,
        e.metadata_json
      FROM profile_watch_items pwi
      JOIN entities e ON e.id = pwi.entity_id
      WHERE pwi.profile_id = $1
        AND COALESCE(pwi.status, 'active') = 'active'`,
      [profileId]
    );
  } catch {
    return [];
  }
}

function computeRelevanceScore(
  signal: Signal,
  profile: Profile,
  watchedEntities: WatchedEntity[],
  trackedProducts: string[] = profile.tracked_products,
  competitors: string[] = profile.competitors
): { score: number; reasons: string[] } {
  let maxScore = 0.1;
  const reasons: string[] = [];

  // Check entity matches
  const signalText = `${signal.title} ${signal.summary}`.toLowerCase();

  for (const entity of watchedEntities) {
    if (signalText.includes(entity.normalized_name)) {
      if (entity.watch_type === "exact") {
        maxScore = Math.max(maxScore, 1.0);
        reasons.push(`exact_match:${entity.canonical_name}`);
      } else if (entity.watch_type === "competitor") {
        maxScore = Math.max(maxScore, 0.8);
        reasons.push(`competitor:${entity.canonical_name}`);
      } else {
        maxScore = Math.max(maxScore, 0.8);
        reasons.push(`adjacent:${entity.canonical_name}`);
      }
    }
  }

  // Check product landscape matches (advisory committee, device class keywords)
  for (const entity of watchedEntities) {
    if (entity.entity_type !== "product") continue;
    const meta = entity.metadata_json || {};
    // Advisory committee match — e.g., signal about "dental devices" matches product with advisory_committee="Dental"
    if (meta.advisory_committee && typeof meta.advisory_committee === "string") {
      const committee = (meta.advisory_committee as string).toLowerCase();
      if (signalText.includes(committee)) {
        maxScore = Math.max(maxScore, 0.7);
        reasons.push(`product_landscape:${meta.advisory_committee}`);
      }
    }
    // Device class match
    if (meta.device_class && typeof meta.device_class === "string") {
      if (signalText.includes((meta.device_class as string).toLowerCase())) {
        maxScore = Math.max(maxScore, 0.7);
        reasons.push(`device_class:${meta.device_class}`);
      }
    }
    // Product code regulatory pathway match — 510(k) or PMA signals
    if (meta.source_api === "openfda_510k" && signalText.includes("510(k)")) {
      maxScore = Math.max(maxScore, 0.5);
      reasons.push("regulatory_pathway:510k");
    } else if (meta.source_api === "openfda_pma" && signalText.includes("premarket approval")) {
      maxScore = Math.max(maxScore, 0.5);
      reasons.push("regulatory_pathway:pma");
    }
  }

  // Check TA overlap
  const profileTAs = new Set(profile.therapeutic_areas.map((t) => t.toLowerCase()));
  const signalTAs = signal.therapeutic_areas.map((t) => t.toLowerCase());
  for (const ta of signalTAs) {
    if (profileTAs.has(ta)) {
      maxScore = Math.max(maxScore, 0.6);
      reasons.push(`same_ta:${ta}`);
      break;
    }
  }

  // Check domain overlap
  const profileDomains = new Set(profile.domains);
  for (const domain of signal.domains) {
    if (profileDomains.has(domain)) {
      maxScore = Math.max(maxScore, 0.3);
      if (!reasons.some((r) => r.startsWith("same_ta:") || r.startsWith("exact_match:") || r.startsWith("competitor:"))) {
        reasons.push(`same_domain:${domain}`);
      }
      break;
    }
  }

  // Check region overlap
  const profileRegions = new Set(profile.regions);
  if (profileRegions.has(signal.region as typeof profile.regions[number])) {
    maxScore = Math.max(maxScore, 0.2);
  }

  // Check tracked products (text match) — use derived from watch items
  for (const product of trackedProducts) {
    if (product && signalText.includes(product.toLowerCase())) {
      maxScore = Math.max(maxScore, 1.0);
      reasons.push(`tracked_product:${product}`);
    }
  }

  // Check competitors (text match) — use derived from watch items
  for (const competitor of competitors) {
    if (competitor && signalText.includes(competitor.toLowerCase())) {
      maxScore = Math.max(maxScore, 0.8);
      reasons.push(`competitor_text:${competitor}`);
    }
  }

  if (reasons.length === 0) {
    reasons.push("general");
  }

  return { score: maxScore, reasons };
}

/**
 * Fetch signals that mention watched product names OR relate to the product's
 * device class / therapeutic landscape via full-text search.
 *
 * Builds search terms from:
 * 1. Exact product canonical names (highest relevance)
 * 2. Product metadata keywords: advisory_committee, device name keywords,
 *    product_code — stored in entity metadata_json during onboarding
 *
 * This ensures a user who adds "K203606" (Serena Sleep mandibular advancement
 * device) also gets signals about dental device regulations, mandibular
 * advancement competitors, and sleep apnea device clearances — not just
 * signals that literally mention "Serena Sleep."
 */
export async function fetchProductSignals(
  profileId: string,
  dayWindow: number = 30,
  limit: number = 50
): Promise<Signal[]> {
  const watchedEntities = await getProfileWatchedEntities(profileId);
  const productEntities = watchedEntities.filter(e => e.entity_type === "product");

  if (productEntities.length === 0) return [];

  // Primary: exact product names
  const exactTerms = productEntities
    .map(e => e.canonical_name)
    .filter(Boolean);

  // Secondary: landscape keywords from entity metadata
  const landscapeTerms: string[] = [];
  try {
    const entityIds = productEntities.map(e => e.entity_id);
    if (entityIds.length > 0) {
      const entities = await query<{ metadata_json: Record<string, unknown> }>(
        `SELECT metadata_json FROM entities WHERE id = ANY($1)`,
        [entityIds]
      );
      for (let idx = 0; idx < entities.length; idx++) {
        const meta = entities[idx].metadata_json || {};
        // Advisory committee → e.g., "Dental", "Cardiovascular"
        if (meta.advisory_committee && typeof meta.advisory_committee === "string") {
          landscapeTerms.push(meta.advisory_committee);
        }
        // Device class → e.g., "Mandibular Advancement Device"
        if (meta.device_class && typeof meta.device_class === "string") {
          landscapeTerms.push(meta.device_class);
        }
        // Company name → catch recall/enforcement actions against the manufacturer
        if (meta.company && typeof meta.company === "string") {
          landscapeTerms.push(meta.company);
        }
        // Regulatory pathway terms for the product type
        if (meta.product_code && typeof meta.product_code === "string") {
          // Map product codes to searchable regulatory terms
          // e.g., a 510(k) device → search for "510(k)" and "substantial equivalence"
          if (meta.source_api === "openfda_510k") {
            landscapeTerms.push("510(k)");
            landscapeTerms.push("substantial equivalence");
          } else if (meta.source_api === "openfda_pma") {
            landscapeTerms.push("premarket approval");
          }
        }
        // Device name keywords → extract therapeutic terms
        // e.g., "Serena Sleep Block Mandibular Advancement" → "mandibular advancement"
        const canonical = productEntities[idx]?.canonical_name || "";
        if (canonical) {
          const stopWords = new Set(["and", "the", "for", "with", "from", "device", "system", "model", "type", "kit", "inc", "llc", "corp"]);
          const words = canonical
            .replace(/[^a-zA-Z0-9\s-]/g, " ")
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
          // Take meaningful multi-word phrases
          if (words.length >= 2) {
            landscapeTerms.push(words.join(" "));
          }
        }
      }
    }
  } catch {
    // Non-critical — fall back to exact terms only
  }

  const allTerms = [...exactTerms, ...landscapeTerms].filter(Boolean);
  if (allTerms.length === 0) return [];

  // Deduplicate search terms
  const uniqueTerms = [...new Set(allTerms.map(t => t.toLowerCase()))].map(
    lower => allTerms.find(t => t.toLowerCase() === lower)!
  );

  const tsQueries = uniqueTerms.map((_, i) =>
    `to_tsvector('english', title || ' ' || COALESCE(summary, '')) @@ plainto_tsquery('english', $${i + 1})`
  );

  const params: unknown[] = [...uniqueTerms, limit, dayWindow];

  return query<Signal>(
    `SELECT * FROM signals
     WHERE published_at > now() - interval '1 day' * $${uniqueTerms.length + 2}
       AND (${tsQueries.join(" OR ")})
     ORDER BY CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
              ${IMPACT_TYPE_ORDER_SQL},
              ${SOURCE_PRIORITY_ORDER_SQL},
              published_at DESC
     LIMIT $${uniqueTerms.length + 1}`,
    params
  );
}
