import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: profileId, itemId } = await params;
  try {
    const updates = await request.json();
    const sets: string[] = [];
    const values: unknown[] = [];
    let pi = 1;

    if (updates.status) {
      sets.push(`status = $${pi}`);
      values.push(updates.status);
      pi++;
    }
    if (updates.alert_threshold) {
      sets.push(`alert_threshold = $${pi}`);
      values.push(updates.alert_threshold);
      pi++;
    }
    if (updates.frequency) {
      sets.push(`frequency = $${pi}`);
      values.push(updates.frequency);
      pi++;
    }
    if (updates.watch_type) {
      sets.push(`watch_type = $${pi}`);
      values.push(updates.watch_type);
      pi++;
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(itemId, profileId);
    await query(
      `UPDATE profile_watch_items SET ${sets.join(", ")} WHERE id = $${pi} AND profile_id = $${pi + 1}`,
      values
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update watch item", details: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: profileId, itemId } = await params;
  try {
    await query(
      `DELETE FROM profile_watch_items WHERE id = $1 AND profile_id = $2`,
      [itemId, profileId]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete watch item", details: String(err) }, { status: 500 });
  }
}
