import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guards";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profileId = user.id;

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const perPage = Math.min(50, Math.max(1, parseInt(sp.get("per_page") || "20", 10)));
    const offset = (page - 1) * perPage;

    const countResult = await query<{ count: string }>(
      `SELECT count(*)::text as count FROM digests WHERE profile_id = $1`,
      [profileId]
    );
    const total = parseInt(countResult[0]?.count || "0", 10);

    const digests = await query(
      `SELECT id, profile_id, signal_ids, sent_at, created_at,
              left(markdown, 300) as preview
       FROM digests
       WHERE profile_id = $1
       ORDER BY sent_at DESC
       LIMIT $2 OFFSET $3`,
      [profileId, perPage, offset]
    );

    return NextResponse.json({ digests, total, page, per_page: perPage });
  } catch (err) {
    console.error("[api/digests]", err);
    return NextResponse.json(
      { error: "Failed to load digests", details: String(err) },
      { status: 500 }
    );
  }
}
