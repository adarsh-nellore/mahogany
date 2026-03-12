import { NextResponse } from "next/server";
import { fetchAllFast } from "@/lib/fetchers";
import { classifyAndStore } from "@/lib/ingestion";

export const maxDuration = 300;

async function ingestFast() {
  console.log("[poll-signals/fast] starting RSS + API ingestion");
  const drafts = await fetchAllFast();
  console.log(`[poll-signals/fast] ${drafts.length} drafts from fast tier`);
  return classifyAndStore(drafts);
}

export async function GET() {
  try {
    const summary = await ingestFast();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals/fast] fatal error:", err);
    return NextResponse.json({ error: "Fast ingestion failed", details: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await ingestFast();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals/fast] fatal error:", err);
    return NextResponse.json({ error: "Fast ingestion failed", details: String(err) }, { status: 500 });
  }
}
