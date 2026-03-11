import { NextResponse } from "next/server";
import { Resend } from "resend";
import { query } from "@/lib/db";
import { generateDigest } from "@/lib/summarizer";
import { renderDigestEmail } from "@/lib/emailRenderer";
import { Profile, Signal, DigestSendSummary } from "@/lib/types";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export const maxDuration = 300;

async function sendDigests(): Promise<DigestSendSummary> {
  const summary: DigestSendSummary = {
    total_sent: 0,
    profiles: [],
    errors: [],
  };

  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const hourWindow = [(currentHour + 23) % 24, currentHour, (currentHour + 1) % 24];

    const profiles = await query<Profile>(
      `SELECT * FROM profiles
       WHERE digest_send_hour = ANY($1)
         AND (
           last_digest_at IS NULL
           OR (digest_cadence = 'daily'        AND last_digest_at < now() - interval '20 hours')
           OR (digest_cadence = 'twice_weekly'  AND last_digest_at < now() - interval '3 days')
           OR (digest_cadence = 'weekly'        AND last_digest_at < now() - interval '6 days')
         )`,
      [hourWindow]
    );

    if (profiles.length === 0) {
      return summary;
    }

    for (const profile of profiles) {
      try {
        // Use the same content as the feed so the digest matches what they see in the app.
        const feedConditions: string[] = ["(profile_id = $1 OR is_global = true)"];
        const feedParams: unknown[] = [profile.id];
        let fp = 2;
        if (profile.domains?.length) {
          feedConditions.push(`(cardinality(domains) = 0 OR domains && $${fp})`);
          feedParams.push(profile.domains);
          fp++;
        }
        if (profile.regions?.length) {
          feedConditions.push(`(cardinality(regions) = 0 OR regions && $${fp})`);
          feedParams.push(profile.regions);
          fp++;
        }
        const feedWhere = feedConditions.join(" AND ");
        const storyRows = await query<{ signal_ids: string[] }>(
          `SELECT signal_ids FROM feed_stories WHERE ${feedWhere} ORDER BY published_at DESC LIMIT 80`,
          feedParams
        );
        const allSignalIds = [...new Set(storyRows.flatMap((r) => r.signal_ids || []))];

        let signals: Signal[];
        if (allSignalIds.length > 0) {
          signals = await query<Signal>(
            `SELECT * FROM signals WHERE id = ANY($1)
             ORDER BY CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, published_at DESC LIMIT 60`,
            [allSignalIds]
          );
        } else {
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
          par.push(30);
          signals = await query<Signal>(
            `SELECT * FROM signals
             WHERE published_at > now() - interval '1 day' * $${pi} AND (${orParts.join(" OR ")})
             ORDER BY CASE impact_severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, published_at DESC LIMIT 60`,
            par
          );
        }

        // Generate digest markdown (same as feed content, condensed)
        const markdown = await generateDigest(profile, signals);

        // Render to HTML
        const html = renderDigestEmail(markdown);

        // Send via Resend
        const { error: sendError } = await getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL || "Mahogany RI <onboarding@resend.dev>",
          to: [profile.email],
          subject: `RI Digest — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
          html,
        });

        if (sendError) {
          const msg = `Resend error for ${profile.email}: ${JSON.stringify(sendError)}`;
          console.error(`[send-digests] ${msg}`);
          summary.errors.push(msg);
        }

        const signalIds = signals.map((s) => s.id);
        await query(
          `INSERT INTO digests (profile_id, signal_ids, markdown, html)
           VALUES ($1, $2, $3, $4)`,
          [profile.id, signalIds, markdown, html]
        );

        await query(
          `UPDATE profiles SET last_digest_at = now(), updated_at = now() WHERE id = $1`,
          [profile.id]
        );

        if (!sendError) {
          summary.total_sent++;
        }
        summary.profiles.push({
          id: profile.id,
          email: profile.email,
          signal_count: signals.length,
        });

        console.log(
          `[send-digests] ${sendError ? "saved (email failed)" : "sent"} digest for ${profile.email} with ${signals.length} signals`
        );
      } catch (profileErr) {
        const msg = `Profile ${profile.id} error: ${profileErr}`;
        console.error(`[send-digests] ${msg}`);
        summary.errors.push(msg);
      }
    }

    return summary;
  } catch (err) {
    console.error("[send-digests] fatal error:", err);
    throw err;
  }
}

export async function GET() {
  try {
    const summary = await sendDigests();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: "Digest send failed", details: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await sendDigests();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: "Digest send failed", details: String(err) }, { status: 500 });
  }
}
