import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: profileId } = await params;
  try {
    const items = await query<{
      id: string;
      entity_id: string;
      canonical_name: string;
      entity_type: string;
      watch_type: string;
      status: string;
      alert_threshold: string;
      frequency: string;
    }>(
      `SELECT
        pwi.id,
        pwi.entity_id,
        e.canonical_name,
        e.entity_type,
        pwi.watch_type,
        COALESCE(pwi.status, 'active') AS status,
        COALESCE(pwi.alert_threshold, 'medium') AS alert_threshold,
        COALESCE(pwi.frequency, 'daily') AS frequency
      FROM profile_watch_items pwi
      JOIN entities e ON e.id = pwi.entity_id
      WHERE pwi.profile_id = $1
      ORDER BY pwi.priority DESC, pwi.created_at DESC`,
      [profileId]
    );
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load watch items", details: String(err) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: profileId } = await params;
  try {
    const { entity_id, watch_type = "exact" } = await request.json();
    if (!entity_id) {
      return NextResponse.json({ error: "entity_id required" }, { status: 400 });
    }

    const rows = await query<{ id: string }>(
      `INSERT INTO profile_watch_items (profile_id, entity_id, watch_type, status, alert_threshold, frequency)
       VALUES ($1, $2, $3, 'active', 'medium', 'daily')
       ON CONFLICT (profile_id, entity_id, watch_type) DO NOTHING
       RETURNING id`,
      [profileId, entity_id, watch_type]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Already tracking this item" }, { status: 409 });
    }

    // Return the full item
    const items = await query<{
      id: string; entity_id: string; canonical_name: string; entity_type: string;
      watch_type: string; status: string; alert_threshold: string; frequency: string;
    }>(
      `SELECT pwi.id, pwi.entity_id, e.canonical_name, e.entity_type, pwi.watch_type,
              COALESCE(pwi.status, 'active') AS status,
              COALESCE(pwi.alert_threshold, 'medium') AS alert_threshold,
              COALESCE(pwi.frequency, 'daily') AS frequency
       FROM profile_watch_items pwi
       JOIN entities e ON e.id = pwi.entity_id
       WHERE pwi.id = $1`,
      [rows[0].id]
    );

    return NextResponse.json({ item: items[0] });
  } catch (err) {
    return NextResponse.json({ error: "Failed to add watch item", details: String(err) }, { status: 500 });
  }
}
