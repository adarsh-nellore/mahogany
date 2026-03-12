import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Profile } from "@/lib/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await query<Profile>(
      `SELECT * FROM profiles WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/profiles/[id]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load profile", details: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      "name", "role", "organization", "regions", "domains",
      "therapeutic_areas", "product_types", "tracked_products",
      "active_submissions", "competitors", "regulatory_frameworks",
      "analysis_preferences", "digest_cadence", "digest_send_hour", "timezone",
    ];

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx}`);
        values.push(body[field]);
        idx++;
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push(`updated_at = now()`);
    values.push(id);

    const rows = await query<{ id: string }>(
      `UPDATE profiles SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ id: rows[0].id, message: "Profile updated" });
  } catch (err) {
    console.error("[api/profiles/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update profile", details: String(err) },
      { status: 500 }
    );
  }
}
