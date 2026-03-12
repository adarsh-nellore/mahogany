import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runFeedAgent } from "@/lib/feedAgent";
import { DISABLE_US_SOURCES } from "@/lib/experimentFlags";
import { Signal, Profile } from "@/lib/types";

export const maxDuration = 300;

/** Load regionally balanced signals for feed generation. Shared by generate-feed and generate-feed-morning. */
export async function loadFeedSignals(): Promise<Signal[]> {
  const severityOrder = `CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;
  const expandedBuckets = [
    { region: "EU", limit: 80 },
    { region: "UK", limit: 50 },
    { region: "Canada", limit: 40 },
    { region: "Australia", limit: 30 },
    { region: "Japan", limit: 30 },
    { region: "Switzerland", limit: 20 },
    { region: "Global", limit: 60 },
  ];
  const regionBuckets: { region: string; limit: number }[] = DISABLE_US_SOURCES
    ? expandedBuckets
    : [{ region: "US", limit: 120 }, ...expandedBuckets];
  const signalWindowDays = 30;
  const unionParts = regionBuckets.map(
    (b) =>
      `(SELECT * FROM signals WHERE region = '${b.region}' AND created_at > now() - interval '${signalWindowDays} days' ORDER BY ${severityOrder}, published_at DESC LIMIT ${b.limit})`
  );
  return unionParts.length > 0 ? await query<Signal>(unionParts.join("\n UNION ALL\n")) : [];
}

/**
 * Generate feed stories for profiles.
 * @param profileIds - null = all profiles (full run with global). string[] = only those IDs (profile-only, no global).
 */
export async function generateFeedForProfiles(
  profileIds: string[] | null,
  signals: Signal[]
): Promise<{ global_stories: number; profile_stories: Record<string, number>; signal_count: number }> {
  const result = { global_stories: 0, profile_stories: {} as Record<string, number>, signal_count: signals.length };

  if (signals.length === 0) return result;

  // ── Generate global stories (only when profileIds is null = full run) ──
  if (profileIds === null) {
    try {
      const stories = await runFeedAgent(signals, null);
      for (const story of stories) {
        try {
          await query(
            `INSERT INTO feed_stories (
              profile_id, headline, summary, body, section, severity,
              domains, regions, therapeutic_areas, impact_types,
              signal_ids, source_urls, source_labels, is_global, published_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              null, story.headline, story.summary, story.body,
              story.section, story.severity, story.domains, story.regions,
              story.therapeutic_areas, story.impact_types, story.signal_ids,
              story.source_urls, story.source_labels, true, story.published_at,
            ]
          );
          result.global_stories++;
        } catch (err) {
          console.error("[generate-feed] insert error:", err);
        }
      }
      console.log(`[generate-feed] created ${result.global_stories} global stories`);
    } catch (err) {
      console.error("[generate-feed] global agent error:", err);
    }
  }

  // ── Generate personalized stories per profile ──────────────────
  const profiles = profileIds === null
    ? await query<Profile>(`SELECT * FROM profiles`)
    : await query<Profile>(`SELECT * FROM profiles WHERE id = ANY($1)`, [profileIds]);

  for (const profile of profiles) {
    try {
      const profileSignals = signals.filter((s) => {
        const regionMatch = profile.regions.includes(s.region) || profile.regions.includes("Global");
        const domainMatch = s.domains.some((d) => profile.domains.includes(d));
        return regionMatch && domainMatch;
      });

      if (profileSignals.length < 3) continue;

      const personalStories = await runFeedAgent(profileSignals, profile);

      let inserted = 0;
      for (const story of personalStories) {
        try {
          await query(
            `INSERT INTO feed_stories (
              profile_id, headline, summary, body, section, severity,
              domains, regions, therapeutic_areas, impact_types,
              signal_ids, source_urls, source_labels, is_global, published_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              profile.id, story.headline, story.summary, story.body,
              story.section, story.severity, story.domains, story.regions,
              story.therapeutic_areas, story.impact_types, story.signal_ids,
              story.source_urls, story.source_labels, false, story.published_at,
            ]
          );
          inserted++;
        } catch (err) {
          console.error(`[generate-feed] profile ${profile.id} insert error:`, err);
        }
      }
      result.profile_stories[profile.id] = inserted;
      console.log(`[generate-feed] created ${inserted} stories for profile ${profile.id}`);
    } catch (err) {
      console.error(`[generate-feed] profile ${profile.id} agent error:`, err);
    }
  }

  return result;
}

/**
 * Cron endpoint: generates feed stories from the latest signals.
 * Runs every 4 hours (30 min after poll-signals).
 *
 * Strategy:
 * 1. Always generate a fresh global feed from signals ingested since the
 *    last global generation (not a fixed 3-hour window).
 * 2. Also generate personalized stories for each profile that has new
 *    signals since their last feed generation.
 * 3. Pulls a much larger, regionally balanced signal set so the agent
 *    has a richer knowledge graph to work with.
 */
async function generate(): Promise<{ global_stories: number; profile_stories: Record<string, number>; signal_count: number }> {
  const result = { global_stories: 0, profile_stories: {} as Record<string, number>, signal_count: 0 };

  const lastGenRow = await query<{ last: string }>(
    `SELECT max(created_at)::text as last FROM feed_stories WHERE is_global = true`
  );
  const lastGenTime = lastGenRow[0]?.last;
  const signalCutoff = lastGenTime || new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  const newCountRow = await query<{ count: string }>(
    `SELECT count(*)::text as count FROM signals WHERE created_at > $1`,
    [signalCutoff]
  );
  const newSignalCount = parseInt(newCountRow[0]?.count || "0", 10);
  const totalSignalRow = await query<{ count: string }>(
    `SELECT count(*)::text as count FROM signals WHERE created_at > now() - interval '30 days'`
  );
  const totalRecentSignals = parseInt(totalSignalRow[0]?.count || "0", 10);

  if (newSignalCount < 1 && totalRecentSignals < 1) {
    console.log(`[generate-feed] no signals available, skipping`);
    return result;
  }
  console.log(`[generate-feed] ${newSignalCount} new signals since last gen (${totalRecentSignals} total in 30d window)`);

  const signals = await loadFeedSignals();
  if (signals.length === 0) {
    console.log("[generate-feed] no signals found");
    return result;
  }
  console.log(`[generate-feed] ${signals.length} signals (${newSignalCount} new since last gen)`);

  return generateFeedForProfiles(null, signals);
}

export async function GET() {
  try {
    const result = await generate();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-feed] error:", err);
    return NextResponse.json({ error: "Feed generation failed", details: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await generate();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-feed] error:", err);
    return NextResponse.json({ error: "Feed generation failed", details: String(err) }, { status: 500 });
  }
}
