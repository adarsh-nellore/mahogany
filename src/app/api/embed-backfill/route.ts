/**
 * Embedding backfill endpoint.
 *
 * POST /api/embed-backfill
 *   Embeds signals that have no signal_embeddings row.
 *   Processes in chunks (default 200 per run) to stay within API limits and cron runtime.
 *
 * Call via cron or manually to backfill historical signals.
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  embedAndStoreSignals,
  extractBodyFromRawPayload,
} from "@/lib/embeddings";
import { requireCronAuth } from "@/lib/cron-auth";

const DEFAULT_CHUNK_SIZE = 200;
const MAX_CHUNK_SIZE = 500;

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const chunkSize = Math.min(
    MAX_CHUNK_SIZE,
    Math.max(1, parseInt(url.searchParams.get("chunk_size") || String(DEFAULT_CHUNK_SIZE), 10))
  );

  try {
    const unembedded = await query<{
      id: string;
      title: string;
      summary: string;
      ai_analysis: string;
      raw_payload: Record<string, unknown>;
    }>(
      `SELECT s.id, s.title, s.summary, s.ai_analysis, COALESCE(re.raw_payload, '{}')::jsonb AS raw_payload
       FROM signals s
       LEFT JOIN raw_events re ON re.id = s.raw_event_id
       LEFT JOIN signal_embeddings se ON se.signal_id = s.id AND se.chunk_index = 0
       WHERE se.id IS NULL
       ORDER BY s.created_at DESC
       LIMIT $1`,
      [chunkSize]
    );

    if (unembedded.length === 0) {
      return NextResponse.json({
        ok: true,
        embedded: 0,
        message: "No unembedded signals",
      });
    }

    const withBody = unembedded.map((s) => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      ai_analysis: s.ai_analysis,
      body: extractBodyFromRawPayload(s.raw_payload),
    }));
    const embedded = await embedAndStoreSignals(withBody);
    console.log(`[embed-backfill] embedded ${embedded} signals`);

    return NextResponse.json({
      ok: true,
      embedded,
      chunk_size: chunkSize,
    });
  } catch (err) {
    console.error("[embed-backfill] error:", err);
    return NextResponse.json(
      { error: "Embedding backfill failed", details: String(err) },
      { status: 500 }
    );
  }
}
