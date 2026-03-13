import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guards";
import { Profile } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profileId = user.id;

    const rows = await query<Profile>(
      `SELECT * FROM profiles WHERE id = $1`,
      [profileId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/profiles/me]", err);
    return NextResponse.json(
      { error: "Failed to load profile", details: String(err) },
      { status: 500 }
    );
  }
}
