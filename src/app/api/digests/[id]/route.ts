import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await query<{ id: string; markdown: string; html: string; sent_at: string; signal_ids: string[] }>(
      `SELECT id, markdown, html, sent_at, signal_ids FROM digests WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Digest not found" }, { status: 404 });
    }

    const digest = rows[0];
    let evidence_date_min: string | null = null;
    let evidence_date_max: string | null = null;

    if (digest.signal_ids?.length > 0) {
      const dateRows = await query<{ evidence_date_min: string; evidence_date_max: string }>(
        `SELECT MIN(published_at)::text AS evidence_date_min, MAX(published_at)::text AS evidence_date_max
         FROM signals WHERE id = ANY($1)`,
        [digest.signal_ids]
      );
      if (dateRows.length > 0 && dateRows[0].evidence_date_min) {
        evidence_date_min = dateRows[0].evidence_date_min;
        evidence_date_max = dateRows[0].evidence_date_max;
      }
    }

    return NextResponse.json({
      ...digest,
      evidence_date_min,
      evidence_date_max,
    });
  } catch (err) {
    console.error("[api/digests/[id]]", err);
    return NextResponse.json(
      { error: "Failed to load digest", details: String(err) },
      { status: 500 }
    );
  }
}
