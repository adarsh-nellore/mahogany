import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { FeedStory } from "@/lib/types";
import { zipValidSourceLinks } from "@/lib/sourceUrl";

function sanitizeStorySources(story: FeedStory): FeedStory {
  const valid = zipValidSourceLinks(story.source_urls, story.source_labels);
  return {
    ...story,
    source_urls: valid.map((x) => x.url),
    source_labels: valid.map((x) => x.label),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const rows = await query<FeedStory>(
      `SELECT * FROM feed_stories WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    return NextResponse.json(sanitizeStorySources(rows[0]));
  } catch (err) {
    console.error("[api/feed/stories/id] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch story", details: String(err) },
      { status: 500 }
    );
  }
}
