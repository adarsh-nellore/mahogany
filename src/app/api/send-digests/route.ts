import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireCronAuth } from "@/lib/cron-auth";
import { query } from "@/lib/db";
import { selectSignalsForProfile } from "@/lib/signalSelection";
import { generateDigest } from "@/lib/summarizer";
import { renderDigestEmail, getDigestSubjectFromMarkdown } from "@/lib/emailRenderer";
import { Profile, DigestSendSummary } from "@/lib/types";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function getLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) : 0;
  } catch {
    return 0;
  }
}

function getLocalDayOfWeek(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
    });
    const parts = formatter.formatToParts(new Date());
    const weekdayPart = parts.find((p) => p.type === "weekday");
    const dayNames: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return weekdayPart ? (dayNames[weekdayPart.value] ?? 0) : 0;
  } catch {
    return 0;
  }
}

function isInDigestHourWindow(localHour: number, digestSendHour: number): boolean {
  const target = digestSendHour ?? 7;
  const lo = (target - 1 + 24) % 24;
  const hi = (target + 1) % 24;
  if (lo <= hi) return localHour >= lo && localHour <= hi;
  return localHour >= lo || localHour <= hi;
}

/** twice_weekly = Tue (2) & Fri (5); weekly = Mon (1). */
function isDigestDayForCadence(localDayOfWeek: number, cadence: string): boolean {
  if (cadence === "daily") return true;
  if (cadence === "twice_weekly") return localDayOfWeek === 2 || localDayOfWeek === 5;
  if (cadence === "weekly") return localDayOfWeek === 1;
  return true;
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
    console.log(`[send-digests] running at ${now.toISOString()}`);

    const candidates = await query<Profile>(
      `SELECT * FROM profiles
       WHERE (
         last_digest_at IS NULL
         OR (digest_cadence = 'daily'        AND last_digest_at < now() - interval '20 hours')
         OR (digest_cadence = 'twice_weekly'  AND last_digest_at < now() - interval '3 days')
         OR (digest_cadence = 'weekly'        AND last_digest_at < now() - interval '6 days')
       )`
    );

    const profiles = candidates.filter((p) => {
      const tz = p.timezone || "UTC";
      const localHour = getLocalHour(tz);
      const localDay = getLocalDayOfWeek(tz);
      const digestHour = p.digest_send_hour ?? 7;
      return (
        isInDigestHourWindow(localHour, digestHour) &&
        isDigestDayForCadence(localDay, p.digest_cadence || "daily")
      );
    });

    console.log(`[send-digests] ${profiles.length} profile(s) in digest hour window (of ${candidates.length} cadence-eligible)`);

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

export async function GET(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await sendDigests();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: "Digest send failed", details: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await sendDigests();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: "Digest send failed", details: String(err) }, { status: 500 });
  }
}
