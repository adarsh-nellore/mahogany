import { NextResponse } from "next/server";
import { Resend } from "resend";
import { query } from "@/lib/db";
import { selectSignalsForProfile } from "@/lib/signalSelection";
import { generateDigest } from "@/lib/summarizer";
import { renderDigestEmail, getDigestSubjectFromMarkdown } from "@/lib/emailRenderer";
import { Profile, DigestSendSummary } from "@/lib/types";

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

    console.log(`[send-digests] currentHour=${currentHour} UTC, hourWindow=${JSON.stringify(hourWindow)}, time=${now.toISOString()}`);

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

    console.log(`[send-digests] matched ${profiles.length} profile(s) for hourWindow=${JSON.stringify(hourWindow)}`);

    if (profiles.length === 0) {
      return summary;
    }

    for (const profile of profiles) {
      try {
        // Select signals using shared logic: feed_stories first, fallback with product injection + scoring
        const signals = await selectSignalsForProfile(profile);

        // Generate digest markdown (same as feed content, condensed)
        const markdown = await generateDigest(profile, signals);

        // Render to HTML
        const html = renderDigestEmail(markdown);

        // Send via Resend
        const subject = getDigestSubjectFromMarkdown(markdown);
        const { error: sendError } = await getResend().emails.send({
          from: process.env.RESEND_FROM_EMAIL || "Mahogany RI <onboarding@resend.dev>",
          to: [profile.email],
          subject,
          html,
        });

        if (sendError) {
          const msg = `Resend error for ${profile.email}: ${JSON.stringify(sendError)}`;
          console.error(`[send-digests] ${msg}`);
          summary.errors.push(msg);
        }

        const signalIds = signals.map((s) => s.id);
        const deliveryStatus = sendError ? "failed" : "sent";
        const deliveryError = sendError ? JSON.stringify(sendError) : null;

        await query(
          `INSERT INTO digests (profile_id, signal_ids, markdown, html, delivery_status, delivery_error)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [profile.id, signalIds, markdown, html, deliveryStatus, deliveryError]
        );

        await query(
          `UPDATE profiles SET last_digest_at = now(), updated_at = now() WHERE id = $1`,
          [profile.id]
        );

        if (!sendError) {
          summary.total_sent++;
        }

        // Check for ingestion gaps — if last digest was > expected cadence + buffer,
        // note the gap period for the next digest to include backfill
        if (profile.last_digest_at) {
          const lastDigest = new Date(profile.last_digest_at);
          const expectedHours = profile.digest_cadence === "daily" ? 26
            : profile.digest_cadence === "twice_weekly" ? 96
            : 192;
          const actualHours = (Date.now() - lastDigest.getTime()) / 3_600_000;
          if (actualHours > expectedHours) {
            console.log(
              `[send-digests] ingestion gap detected for ${profile.email}: ${Math.round(actualHours)}h since last digest (expected ~${expectedHours}h)`
            );
          }
        }

        summary.profiles.push({
          id: profile.id,
          email: profile.email,
          signal_count: signals.length,
        });

        console.log(
          `[send-digests] ${deliveryStatus} digest for ${profile.email} with ${signals.length} signals`
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
