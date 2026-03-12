import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // consume params
  const q = request.nextUrl.searchParams.get("q") || "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await query<{
      entity_id: string;
      canonical_name: string;
      entity_type: string;
    }>(
      `SELECT id AS entity_id, canonical_name, entity_type
       FROM entities
       WHERE normalized_name ILIKE $1
          OR canonical_name ILIKE $1
       ORDER BY canonical_name
       LIMIT 20`,
      [`%${q.toLowerCase()}%`]
    );

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: "Search failed", details: String(err) }, { status: 500 });
  }
}
