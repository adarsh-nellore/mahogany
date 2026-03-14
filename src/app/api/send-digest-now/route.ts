import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { query } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guards";
import { selectSignalsForProfile } from "@/lib/signalSelection";
import { generateDigest } from "@/lib/summarizer";
import { renderDigestEmail, getDigestSubjectFromMarkdown } from "@/lib/emailRenderer";
import { Profile } from "@/lib/types";

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
    const body = (await request.json().catch(() => ({}))) as {
      profile_id?: string;
      to?: string;
      therapeutic_areas?: string[];
      regions?: string[];
      domains?: string[];
    };
    const authUser = await getAuthUser(request);
    const profileId: string | null = body?.profile_id ?? authUser?.id ?? null;
    if (!profileId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profiles = await query<Profile>(
      `SELECT * FROM profiles WHERE id = $1`,
      [profileId]
    );
    if (profiles.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const baseProfile = profiles[0];
    // Allow test sends to override with current form config (so unsaved changes take effect for the test)
    const profile: Profile = {
      ...baseProfile,
      therapeutic_areas: Array.isArray(body.therapeutic_areas) ? body.therapeutic_areas : baseProfile.therapeutic_areas,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      regions: Array.isArray(body.regions) ? (body.regions as any) : baseProfile.regions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      domains: Array.isArray(body.domains) ? (body.domains as any) : baseProfile.domains,
    };
    const toEmail = body?.to && body.to.includes("@") ? body.to : profile.email;

    // Select signals using shared logic: feed_stories first, fallback with product injection + scoring
    const signals = await selectSignalsForProfile(profile);

    const markdown = await generateDigest(profile, signals);
    const html = renderDigestEmail(markdown);

    // Always send the digest email (including when 0 signals — welcome digest).
    let sendError: { message?: string } | null = null;
    if (process.env.RESEND_API_KEY) {
      const subject = getDigestSubjectFromMarkdown(markdown);
      const res = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Mahogany RI <onboarding@resend.dev>",
        to: [toEmail],
        subject,
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
