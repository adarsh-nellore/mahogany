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
 */
export async function scoreSignals(
  signals: Signal[],
  profile: Profile
): Promise<ScoredSignal[]> {
  // Pre-fetch profile's watched entities for efficient matching
  const watchedEntities = await getProfileWatchedEntities(profile.id);

  return signals.map((signal) => {
    const { score, reasons } = computeRelevanceScore(signal, profile, watchedEntities);
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
export async function scoreAndRank(
  signals: Signal[],
  profile: Profile,
  minTier: RelevanceTier = "exploratory"
): Promise<ScoredSignal[]> {
  const scored = await scoreSignals(signals, profile);

  const minScore = minTier === "must_see" ? 2.0 : minTier === "digest" ? 1.0 : 0;

  return scored
    .filter((s) => s.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
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
}

async function getProfileWatchedEntities(profileId: string): Promise<WatchedEntity[]> {
  try {
    return await query<WatchedEntity>(
      `SELECT
        pwi.entity_id,
        e.canonical_name,
        e.normalized_name,
        pwi.watch_type,
        e.entity_type
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
  watchedEntities: WatchedEntity[]
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

  // Check tracked products (text match)
  for (const product of profile.tracked_products) {
    if (product && signalText.includes(product.toLowerCase())) {
      maxScore = Math.max(maxScore, 1.0);
      reasons.push(`tracked_product:${product}`);
    }
  }

  // Check competitors (text match)
  for (const competitor of profile.competitors) {
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
