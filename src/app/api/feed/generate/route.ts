import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runFeedAgent } from "@/lib/feedAgent";
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
      if (profile.regions?.length) {
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

    paramIdx++;
    conditions.push(`created_at > now() - interval '3 days'`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const signals = await query<Signal>(
      `SELECT * FROM signals ${where}
       ORDER BY
         CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
         published_at DESC
       LIMIT 80`,
      params
    );

    if (signals.length === 0) {
      return NextResponse.json({
        message: "No signals found to generate stories from.",
        stories_created: 0,
      });
    }

    const stories = await runFeedAgent(signals, profile);

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

    console.log(`[feed/generate] created ${inserted} stories from ${signals.length} signals`);
    return NextResponse.json({
      stories_created: inserted,
      signal_count: signals.length,
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
