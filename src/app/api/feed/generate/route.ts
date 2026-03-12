import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runFeedAgent } from "@/lib/feedAgent";
import { selectSignalsForFeed } from "@/lib/signalSelection";
import { getDerivedProfileArrays } from "@/lib/profileUtils";
import { Profile } from "@/lib/types";
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

    const signalsToUse = await selectSignalsForFeed(profile, profileId, {
      dayWindow: 30,
      productReservedSlots: 50,
      capSignals: 220,
    });

    const regionCounts = signalsToUse.reduce((acc, s) => {
      acc[s.region] = (acc[s.region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(
      `[feed/generate] signal selection: ${signalsToUse.length} total, regions: ${JSON.stringify(regionCounts)}`
    );

    if (signalsToUse.length === 0) {
      return NextResponse.json({
        message: "No signals found to generate stories from.",
        stories_created: 0,
      });
    }

    // Fetch product watch items for product-aware feed generation
    let productContext: {
      ownProducts: string[];
      competitorProducts: string[];
      productLandscape?: { name: string; advisory_committee?: string; device_class?: string; product_code?: string; regulatory_id?: string; regulatory_pathway?: string }[];
    } | undefined;
    if (profileId) {
      const watchItems = await query<{
        canonical_name: string; watch_type: string; metadata_json: Record<string, unknown>;
      }>(
        `SELECT e.canonical_name, pwi.watch_type, e.metadata_json
         FROM profile_watch_items pwi
         JOIN entities e ON e.id = pwi.entity_id
         WHERE pwi.profile_id = $1 AND e.entity_type = 'product'
           AND COALESCE(pwi.status, 'active') = 'active'`,
        [profileId]
      );
      if (watchItems.length > 0) {
        productContext = {
          ownProducts: watchItems.filter(w => w.watch_type === "exact").map(w => w.canonical_name),
          competitorProducts: watchItems.filter(w => w.watch_type === "competitor").map(w => w.canonical_name),
          productLandscape: watchItems
            .filter(w => w.watch_type === "exact")
            .map(w => {
              const meta = w.metadata_json || {};
              return {
                name: w.canonical_name,
                advisory_committee: (meta.advisory_committee as string) || undefined,
                device_class: (meta.device_class as string) || undefined,
                product_code: (meta.product_code as string) || undefined,
                regulatory_id: (meta.regulatory_id as string) || undefined,
                regulatory_pathway: meta.source_api === "openfda_510k" ? "510(k)" : meta.source_api === "openfda_pma" ? "PMA" : undefined,
              };
            }),
        };
      }
    }

    // Use derived tracked_products/competitors from watch items for agent context
    let profileForAgent = profile;
    if (profileId && profile) {
      const derived = await getDerivedProfileArrays(profileId);
      profileForAgent = {
        ...profile,
        tracked_products: derived.tracked_products,
        competitors: derived.competitors,
      };
    }

    const stories = await runFeedAgent(signalsToUse, profileForAgent, productContext);

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
            signal_ids, source_urls, source_labels, is_global, published_at,
            relevance_reason
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
            story.relevance_reason || null,
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
