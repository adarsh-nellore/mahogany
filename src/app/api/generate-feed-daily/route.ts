/**
 * Daily feed refresh — ensures content is updated each morning.
 *
 * GET/POST /api/generate-feed-daily
 *   Runs at 7:15 UTC daily (after poll-signals/deep at 6:00).
 *   Regenerates the global feed so users see fresh content from overnight
 *   ingestion (RSS + APIs) and the 6am Firecrawl deep scrape.
 *
 * Complements the 4-hourly generate-feed cron with a guaranteed morning run.
 */

import { NextResponse } from "next/server";
import { generate } from "@/app/api/generate-feed/route";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await generate();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[generate-feed-daily] error:", err);
    return NextResponse.json(
      { error: "Daily feed generation failed", details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await generate();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[generate-feed-daily] error:", err);
    return NextResponse.json(
      { error: "Daily feed generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
