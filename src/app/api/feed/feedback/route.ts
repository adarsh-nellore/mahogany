import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guards";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profileId = user.id;

    const { story_id, signal } = (await request.json()) as {
      story_id: string;
      signal: "up" | "down";
    };

    if (!story_id || !["up", "down"].includes(signal)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    await query(
      `INSERT INTO story_feedback (profile_id, story_id, signal)
       VALUES ($1, $2, $3)
       ON CONFLICT (profile_id, story_id) DO UPDATE SET
         signal = $3,
         created_at = now()`,
      [profileId, story_id, signal]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/feed/feedback]", err);
    return NextResponse.json(
      { error: "Feedback failed", details: String(err) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profileId = user.id;

    const storyId = request.nextUrl.searchParams.get("story_id");
    if (storyId) {
      const rows = await query<{ signal: string }>(
        `SELECT signal FROM story_feedback WHERE profile_id = $1 AND story_id = $2`,
        [profileId, storyId]
      );
      return NextResponse.json({ signal: rows[0]?.signal || null });
    }

    // Return all feedback for this profile
    const rows = await query<{ story_id: string; signal: string }>(
      `SELECT story_id, signal FROM story_feedback WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [profileId]
    );
    return NextResponse.json({ feedback: rows });
  } catch (err) {
    console.error("[api/feed/feedback]", err);
    return NextResponse.json(
      { error: "Failed to load feedback", details: String(err) },
      { status: 500 }
    );
  }
}
