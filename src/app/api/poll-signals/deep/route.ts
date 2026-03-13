import { NextResponse } from "next/server";
import { fetchAllFirecrawl } from "@/lib/fetchers";
import { classifyAndStore } from "@/lib/ingestion";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;

async function ingestDeep() {
  console.log("[poll-signals/deep] starting Firecrawl ingestion");
  const drafts = await fetchAllFirecrawl();
  console.log(`[poll-signals/deep] ${drafts.length} drafts from Firecrawl tier`);
  return classifyAndStore(drafts);
}

export async function GET(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await ingestDeep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals/deep] fatal error:", err);
    return NextResponse.json({ error: "Deep ingestion failed", details: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await ingestDeep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals/deep] fatal error:", err);
    return NextResponse.json({ error: "Deep ingestion failed", details: String(err) }, { status: 500 });
  }
}
