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
    // Fetch entity info before delete so we can sync profiles.tracked_products/competitors
    const rows = await query<{ canonical_name: string; watch_type: string }>(
      `SELECT e.canonical_name, pwi.watch_type
       FROM profile_watch_items pwi
       JOIN entities e ON e.id = pwi.entity_id
       WHERE pwi.id = $1 AND pwi.profile_id = $2`,
      [itemId, profileId]
    );

    await query(
      `DELETE FROM profile_watch_items WHERE id = $1 AND profile_id = $2`,
      [itemId, profileId]
    );

    // Sync profiles arrays: remove from tracked_products (exact) or competitors (competitor)
    if (rows.length > 0 && rows[0].canonical_name) {
      const { canonical_name, watch_type } = rows[0];
      if (watch_type === "exact") {
        await query(
          `UPDATE profiles SET tracked_products = array_remove(tracked_products, $2), updated_at = now()
           WHERE id = $1 AND $2 = ANY(tracked_products)`,
          [profileId, canonical_name]
        );
      } else if (watch_type === "competitor") {
        await query(
          `UPDATE profiles SET competitors = array_remove(competitors, $2), updated_at = now()
           WHERE id = $1 AND $2 = ANY(competitors)`,
          [profileId, canonical_name]
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete watch item", details: String(err) }, { status: 500 });
  }
}
