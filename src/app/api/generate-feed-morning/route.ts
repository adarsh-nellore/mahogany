/**
 * Timezone-aware morning feed generation.
 *
 * GET/POST /api/generate-feed-morning
 *   Runs hourly via cron. Finds profiles where it's currently "morning"
 *   (digest_send_hour ± 1) in their timezone, then generates feed stories
 *   for those profiles only. Skips global feed (handled by generate-feed).
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { loadFeedSignals, generateFeedForProfiles } from "@/app/api/generate-feed/route";

export const maxDuration = 300;

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
    return 0; // fallback to UTC-like if invalid TZ
  }
}

function isInMorningWindow(localHour: number, digestSendHour: number): boolean {
  const lo = (digestSendHour - 1 + 24) % 24;
  const hi = (digestSendHour + 1) % 24;
  if (lo <= hi) {
    return localHour >= lo && localHour <= hi;
  }
  return localHour >= lo || localHour <= hi;
}

async function runMorningFeed(): Promise<{
  ok: boolean;
  profiles_matched: number;
  profile_stories: Record<string, number>;
  signal_count: number;
}> {
  const profiles = await query<{
    id: string;
    timezone: string;
    digest_send_hour: number;
  }>(`SELECT id, COALESCE(timezone, 'UTC') as timezone, digest_send_hour FROM profiles`);

  const matchedIds: string[] = [];
  for (const p of profiles) {
    const tz = p.timezone || "UTC";
    const localHour = getLocalHour(tz);
    if (isInMorningWindow(localHour, p.digest_send_hour ?? 7)) {
      matchedIds.push(p.id);
    }
  }

  if (matchedIds.length === 0) {
    return { ok: true, profiles_matched: 0, profile_stories: {}, signal_count: 0 };
  }

  console.log(`[generate-feed-morning] ${matchedIds.length} profile(s) in morning window`);

  const signals = await loadFeedSignals();
  if (signals.length === 0) {
    return { ok: true, profiles_matched: matchedIds.length, profile_stories: {}, signal_count: 0 };
  }

  const result = await generateFeedForProfiles(matchedIds, signals);

  return {
    ok: true,
    profiles_matched: matchedIds.length,
    profile_stories: result.profile_stories,
    signal_count: result.signal_count,
  };
}

export async function GET() {
  try {
    const result = await runMorningFeed();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-feed-morning] error:", err);
    return NextResponse.json(
      { error: "Morning feed generation failed", details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await runMorningFeed();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[generate-feed-morning] error:", err);
    return NextResponse.json(
      { error: "Morning feed generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
