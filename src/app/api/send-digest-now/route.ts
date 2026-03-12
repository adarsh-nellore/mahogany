import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { query } from "@/lib/db";
import { getSessionProfileId } from "@/lib/session";
import { generateDigest } from "@/lib/summarizer";
import { renderDigestEmail } from "@/lib/emailRenderer";
import { Profile, Signal } from "@/lib/types";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[send-digest-now] RESEND_API_KEY is not set — email will not be sent");
  }
  return new Resend(key);
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    let profileId: string | null = await getSessionProfileId();
    if (!profileId) {
      try {
        const body = await request.json().catch(() => ({})) as { profile_id?: string };
        if (body?.profile_id) profileId = body.profile_id;
      } catch { /* no body */ }
    }
    if (!profileId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const profiles = await query<Profile>(
      `SELECT * FROM profiles WHERE id = $1`,
      [profileId]
    );
    if (profiles.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const profile = profiles[0];

    // Use the same content as the feed: get signals from this profile's feed stories (and global).
    // That way the digest is a condensed version of what they see in the feed, not a separate "since last digest" pool.
    const feedConditions: string[] = ["(profile_id = $1 OR is_global = true)"];
    const feedParams: unknown[] = [profile.id];
    let fp = 2;
    if (profile.domains?.length) {
      feedConditions.push(`(cardinality(domains) = 0 OR domains && $${fp})`);
      feedParams.push(profile.domains);
      fp++;
    }
    if (profile.regions?.length && !profile.regions.includes("Global")) {
      feedConditions.push(`(cardinality(regions) = 0 OR regions && $${fp})`);
      feedParams.push(profile.regions);
      fp++;
    }
    const feedWhere = feedConditions.join(" AND ");
    const storyRows = await query<{ signal_ids: string[] }>(
      `SELECT signal_ids FROM feed_stories
       WHERE ${feedWhere}
       ORDER BY published_at DESC
       LIMIT 80`,
      feedParams
    );
    const allSignalIds = [...new Set(storyRows.flatMap((r) => r.signal_ids || []))];

    let signals: Signal[];
    if (allSignalIds.length > 0) {
      signals = await query<Signal>(
        `SELECT * FROM signals WHERE id = ANY($1)
         ORDER BY CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, published_at DESC
         LIMIT 60`,
        [allSignalIds]
      );
    } else {
      // No feed stories yet (e.g. feed not generated): fall back to recent signals matching profile (no "since last digest" filter).
      const orParts: string[] = ["(region = ANY($1) AND domains && $2)"];
      const par: unknown[] = [profile.regions, profile.domains];
      let pi = 3;
      if (profile.therapeutic_areas?.length) {
        orParts.push(`therapeutic_areas && $${pi}`);
        par.push(profile.therapeutic_areas);
        pi++;
      }
      const kw = [profile.analysis_preferences || "", (profile.tracked_products || []).join(" "), (profile.active_submissions || []).join(" ")].join(" ").replace(/\s+/g, " ").trim();
      if (kw.length >= 2) {
        orParts.push(`(to_tsvector('english', title || ' ' || COALESCE(summary, '')) @@ plainto_tsquery('english', $${pi}))`);
        par.push(kw.slice(0, 2000));
        pi++;
      }
      par.push(30); // last 30 days
      signals = await query<Signal>(
        `SELECT * FROM signals
         WHERE published_at > now() - interval '1 day' * $${pi} AND (${orParts.join(" OR ")})
         ORDER BY CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, published_at DESC
         LIMIT 60`,
        par
      );
    }

    const markdown = await generateDigest(profile, signals);
    const html = renderDigestEmail(markdown);

    // Always send the digest email (including when 0 signals — welcome digest).
    let sendError: { message?: string } | null = null;
    if (process.env.RESEND_API_KEY) {
      const res = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Mahogany RI <onboarding@resend.dev>",
        to: [profile.email],
        subject: `RI Digest \u2014 ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        html,
      });
      sendError = res.error;
      if (sendError) {
        console.error("[send-digest-now] Resend error:", sendError.message || sendError);
      }
    } else {
      sendError = { message: "RESEND_API_KEY not configured" };
      console.warn("[send-digest-now] Skipped sending email: RESEND_API_KEY not set");
    }

    const signalIds = signals.map((s) => s.id);
    await query(
      `INSERT INTO digests (profile_id, signal_ids, markdown, html) VALUES ($1, $2, $3, $4)`,
      [profile.id, signalIds, markdown, html]
    );

    await query(
      `UPDATE profiles SET last_digest_at = now(), updated_at = now() WHERE id = $1`,
      [profile.id]
    );

    return NextResponse.json({
      message: "Digest generated and sent",
      signal_count: signals.length,
      email_error: sendError ? (sendError.message || JSON.stringify(sendError)) : null,
    });
  } catch (err) {
    console.error("[send-digest-now]", err);
    return NextResponse.json(
      { error: "Failed to generate digest", details: String(err) },
      { status: 500 }
    );
  }
}
