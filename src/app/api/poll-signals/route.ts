import { NextResponse } from "next/server";
import { fetchAllSignals } from "@/lib/fetchers";
import { classifyAndStore } from "@/lib/ingestion";

export const maxDuration = 300;

/**
 * Legacy endpoint — runs all fetcher tiers (RSS + API + Firecrawl) globally.
 * Prefer /api/poll-signals/fast and /api/poll-signals/deep for scheduled runs.
 */
async function ingest() {
  console.log("[poll-signals] starting full ingestion (all tiers)");
  const drafts = await fetchAllSignals();
  console.log(`[poll-signals] ${drafts.length} drafts from all tiers`);
  return classifyAndStore(drafts);
}

export async function GET() {
  try {
    const summary = await ingest();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals] fatal error:", err);
    return NextResponse.json({ error: "Ingestion failed", details: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await ingest();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals] fatal error:", err);
    return NextResponse.json({ error: "Ingestion failed", details: String(err) }, { status: 500 });
  }
}
