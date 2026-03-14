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
    const rows = await query<Profile>(
      `SELECT * FROM profiles WHERE id = $1`,
      [user.id]
    );

    if (rows.length === 0 && user.email) {
      const byEmail = await query<Profile>(
        `SELECT * FROM profiles WHERE email = $1 LIMIT 1`,
        [user.email]
      );
      if (byEmail.length > 0) return NextResponse.json(byEmail[0]);
    }

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
