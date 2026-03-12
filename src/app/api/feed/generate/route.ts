import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runFeedAgent } from "@/lib/feedAgent";
import { DISABLE_US_SOURCES } from "@/lib/experimentFlags";
import { Profile, Signal } from "@/lib/types";
import { getSessionProfileId } from "@/lib/session";

export const maxDuration = 300;

export async function POST() {
  try {
    const profileId = await getSessionProfileId();

    let profile: Profile | null = null;
    if (profileId) {
      const rows = await query<Profile>(
        `SELECT * FROM profiles WHERE id = $1`,
        [profileId]
      );
      profile = rows[0] || null;
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (profile) {
      // "Global" means all regions — only filter by region if "Global" is NOT selected
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
    }

    // 30-day window and expanded caps for full breadth
    conditions.push(`created_at > now() - interval '30 days'`);

    const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Regionally balanced UNION ALL — expanded caps for full breadth.
    // When DISABLE_US_SOURCES, omit US bucket.
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
      : [{ region: "US", limit: 60 }, ...expandedBuckets];

    // If profile has specific regions (not "Global"), only include those buckets
    const selectedRegions = profile?.regions?.length && !profile.regions.includes("Global")
      ? profile.regions
      : null;
    const activeBuckets = selectedRegions
      ? regionBuckets.filter((b) => (selectedRegions as string[]).includes(b.region))
      : regionBuckets;

    const severityOrder = `CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`;
    const unionParts = activeBuckets.map((b) => {
      const regionWhere = baseWhere
        ? `${baseWhere} AND region = '${b.region}'`
        : `WHERE region = '${b.region}'`;
      return `(SELECT * FROM signals ${regionWhere} ORDER BY ${severityOrder}, published_at DESC LIMIT ${b.limit})`;
    });

    const signals = unionParts.length > 0
      ? await query<Signal>(unionParts.join("\n UNION ALL\n"), params)
      : [];

    // Dedup by id and cap at 220 for full breadth
    const seenIds = new Set<string>();
    const dedupedSignals = signals.filter((s) => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    }).slice(0, 220);

    const regionCounts = dedupedSignals.reduce((acc, s) => {
      acc[s.region] = (acc[s.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(
      `[feed/generate] signal selection: ${dedupedSignals.length} total, regions: ${JSON.stringify(regionCounts)}`
    );

    const signalsToUse = dedupedSignals;

    if (signalsToUse.length === 0) {
      return NextResponse.json({
        message: "No signals found to generate stories from.",
        stories_created: 0,
      });
    }

    const stories = await runFeedAgent(signalsToUse, profile);

    if (stories.length === 0) {
      return NextResponse.json({
        message: "Agent produced no stories.",
        stories_created: 0,
      });
    }

    let inserted = 0;
    for (const story of stories) {
      try {
        await query(
          `INSERT INTO feed_stories (
            profile_id, headline, summary, body, section, severity,
            domains, regions, therapeutic_areas, impact_types,
            signal_ids, source_urls, source_labels, is_global, published_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            story.profile_id,
            story.headline,
            story.summary,
            story.body,
            story.section,
            story.severity,
            story.domains,
            story.regions,
            story.therapeutic_areas,
            story.impact_types,
            story.signal_ids,
            story.source_urls,
            story.source_labels,
            story.is_global,
            story.published_at,
          ]
        );
        inserted++;
      } catch (err) {
        console.error("[feed/generate] failed to insert story:", err);
      }
    }

    console.log(`[feed/generate] created ${inserted} stories from ${signalsToUse.length} signals`);
    return NextResponse.json({
      stories_created: inserted,
      signal_count: signalsToUse.length,
      profile_id: profile?.id || null,
    });
  } catch (err) {
    console.error("[feed/generate] error:", err);
    return NextResponse.json(
      { error: "Feed generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
