import { NextResponse } from "next/server";
import { fetchAllFirecrawl } from "@/lib/fetchers";
import { classifyAndStore } from "@/lib/ingestion";

export const maxDuration = 300;

async function ingestDeep() {
  console.log("[poll-signals/deep] starting Firecrawl ingestion");
  const drafts = await fetchAllFirecrawl();
  console.log(`[poll-signals/deep] ${drafts.length} drafts from Firecrawl tier`);
  return classifyAndStore(drafts);
}

export async function GET() {
  try {
    const summary = await ingestDeep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals/deep] fatal error:", err);
    return NextResponse.json({ error: "Deep ingestion failed", details: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await ingestDeep();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals/deep] fatal error:", err);
    return NextResponse.json({ error: "Deep ingestion failed", details: String(err) }, { status: 500 });
  }
}
