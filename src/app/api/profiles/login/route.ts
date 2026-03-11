import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const rows = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE LOWER(email) = $1`,
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No account found for this email" },
        { status: 404 }
      );
    }

    const res = NextResponse.json({ id: rows[0].id });
    setSessionCookie(res, rows[0].id);
    return res;
  } catch (err) {
    console.error("[api/profiles/login]", err);
    return NextResponse.json(
      { error: "Login failed", details: String(err) },
      { status: 500 }
    );
  }
}
