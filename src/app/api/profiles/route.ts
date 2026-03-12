import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ProfileCreateRequest } from "@/lib/types";
import { setSessionCookie } from "@/lib/session";
import { parseIntakeText, persistIntakeMentions, persistIntakeSession } from "@/lib/intakeParser";
import { persistIntakeEntityMappings, resolveIntakeMentions } from "@/lib/entityResolver";
import { buildPolicyFromSession, persistProfilePolicy } from "@/lib/pathPlanner";
import { kickoffIntakeWorkflow, kickoffProfileRefreshWorkflow } from "@/lib/orchestration";

export async function POST(request: NextRequest) {
  try {
    const body: ProfileCreateRequest = await request.json();

    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: "email and name are required" },
        { status: 400 }
      );
    }
    if (!body.regions || body.regions.length === 0) {
      return NextResponse.json(
        { error: "At least one region is required" },
        { status: 400 }
      );
    }
    if (!body.domains || body.domains.length === 0) {
      return NextResponse.json(
        { error: "At least one domain is required" },
        { status: 400 }
      );
    }

    // For re-onboarding (same email): clear all derived/stale data so profile starts fresh
    const existing = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE email = $1 LIMIT 1`,
      [body.email]
    );
    if (existing.length > 0) {
      const pid = existing[0].id;
      await query(`DELETE FROM profile_watch_items WHERE profile_id = $1`, [pid]);
      await query(`DELETE FROM feed_stories WHERE profile_id = $1`, [pid]);
      await query(`DELETE FROM profile_entity_interest WHERE profile_id = $1`, [pid]);
      await query(`DELETE FROM profile_query_policies WHERE profile_id = $1`, [pid]);
      await query(`DELETE FROM profile_focus WHERE profile_id = $1`, [pid]);
      await query(`DELETE FROM intake_sessions WHERE profile_id = $1`, [pid]);
      try {
        await query(`DELETE FROM profile_interest_embeddings WHERE profile_id = $1`, [pid]);
      } catch { /* table may not exist */ }
    }

    const result = await query<{ id: string }>(
      `INSERT INTO profiles (
        email, name, regions, domains, therapeutic_areas,
        product_types, tracked_products, role, organization,
        active_submissions, competitors, regulatory_frameworks,
        analysis_preferences, digest_cadence, digest_send_hour, timezone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        regions = EXCLUDED.regions,
        domains = EXCLUDED.domains,
        therapeutic_areas = EXCLUDED.therapeutic_areas,
        product_types = EXCLUDED.product_types,
        tracked_products = EXCLUDED.tracked_products,
        role = EXCLUDED.role,
        organization = EXCLUDED.organization,
        active_submissions = EXCLUDED.active_submissions,
        competitors = EXCLUDED.competitors,
        regulatory_frameworks = EXCLUDED.regulatory_frameworks,
        analysis_preferences = EXCLUDED.analysis_preferences,
        digest_cadence = EXCLUDED.digest_cadence,
        digest_send_hour = EXCLUDED.digest_send_hour,
        timezone = EXCLUDED.timezone,
        updated_at = now()
      RETURNING id`,
      [
        body.email,
        body.name,
        body.regions,
        body.domains,
        body.therapeutic_areas || [],
        body.product_types || [],
        body.tracked_products || [],
        body.role || "",
        body.organization || "",
        body.active_submissions || [],
        body.competitors || [],
        body.regulatory_frameworks || [],
        body.analysis_preferences || "",
        body.digest_cadence || "daily",
        body.digest_send_hour ?? 7,
        body.timezone || "UTC",
      ]
    );

    const profileId = result[0].id;

    if (body.intake_text && body.intake_text.trim().length > 0) {
      const parsed = await parseIntakeText(body.intake_text);
      const session = await persistIntakeSession(body.intake_text, parsed, profileId);
      await persistIntakeMentions(session.id, parsed.mentions);
      const resolved = await resolveIntakeMentions(parsed.mentions);
      await persistIntakeEntityMappings(session.id, resolved);

      for (const r of resolved) {
        const watchType = r.mention_type === "company" ? "competitor" : "exact";
        const priority = r.mention_type === "product_code" ? 95 : 80;
        await query(
          `INSERT INTO profile_watch_items (profile_id, entity_id, watch_type, priority)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (profile_id, entity_id, watch_type) DO UPDATE
           SET priority = EXCLUDED.priority`,
          [profileId, r.entity_id, watchType, priority]
        );
      }

      const policy = await buildPolicyFromSession(session.id);
      await persistProfilePolicy(profileId, policy);
      kickoffIntakeWorkflow(profileId, body.intake_text).catch((err) =>
        console.error("[profiles] temporal intake workflow failed:", err)
      );
    }

    // Fire-and-forget: trigger feed story generation for this new profile
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    fetch(`${baseUrl}/api/feed/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `mahogany_profile=${profileId}`,
      },
    }).catch((err) => console.error("[profiles] feed generation trigger failed:", err));
    kickoffProfileRefreshWorkflow(profileId).catch((err) =>
      console.error("[profiles] temporal profile refresh failed:", err)
    );

    const res = NextResponse.json({ id: profileId, message: "Profile saved" });
    setSessionCookie(res, profileId);
    return res;
  } catch (err) {
    console.error("[api/profiles] error:", err);
    return NextResponse.json(
      { error: "Failed to save profile", details: String(err) },
      { status: 500 }
    );
  }
}
