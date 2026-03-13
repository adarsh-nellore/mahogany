import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { FeedStory, Profile } from "@/lib/types";
import { getAuthUser } from "@/lib/auth-guards";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const profileId = user?.id ?? null;
    let profileContext = "";
    let storyHeadlines: string[] = [];

    if (profileId) {
      const profiles = await query<Profile>(
        `SELECT name, therapeutic_areas, regions, domains, tracked_products FROM profiles WHERE id = $1`,
        [profileId]
      );
      if (profiles.length > 0) {
        const p = profiles[0];
        profileContext = `Profile: tracks ${(p.therapeutic_areas || []).join(", ") || "general"}; regions: ${(p.regions || []).join(", ")}; domains: ${(p.domains || []).join(", ")}; products: ${(p.tracked_products || []).join(", ") || "none"}.`;
      }

      const conditions = `WHERE (profile_id = $1 OR is_global = true)`;
      const stories = await query<FeedStory>(
        `SELECT headline, section, therapeutic_areas, regions FROM feed_stories ${conditions} ORDER BY published_at DESC LIMIT 15`,
        [profileId]
      );
      storyHeadlines = stories.map((s) =>
        `- ${s.headline} (${s.section}; ${(s.therapeutic_areas || []).slice(0, 2).join(", ") || "—"}; ${(s.regions || []).join("/")})`
      );
    }

    if (storyHeadlines.length === 0) {
      return NextResponse.json({
        suggestions: [
          "What are the biggest safety concerns today?",
          "Summarize recent regulatory activity",
          "Any guidance updates I should know about?",
        ],
      });
    }

    const client = getAnthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: `You suggest 3–5 short clickable questions (each under 50 chars) for a regulatory news briefing chat.

Be SPECIFIC to the user's profile and the ACTUAL stories in their feed. Reference:
- Their therapeutic areas (e.g. "wound care", "cardiology")
- Their regions (US, EU, UK, etc.)
- Actual story topics from the headlines (devices, pharma, specific agencies)
- Product or framework names when relevant

Output ONLY the questions, one per line. No numbering, no prefixes, no explanations.`,
      messages: [
        {
          role: "user",
          content: `${profileContext}\n\nStories in user's briefing:\n${storyHeadlines.join("\n")}\n\nGenerate 3–5 specific follow-up questions:`,
        },
      ],
    });

    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const suggestions = text
      .trim()
      .split("\n")
      .map((s) => s.replace(/^[\d\-\*\.]+\s*/, "").trim())
      .filter((s) => s.length > 5 && s.length < 60)
      .slice(0, 5);

    if (suggestions.length === 0) {
      return NextResponse.json({
        suggestions: [
          "Summarize recent regulatory activity",
          "What are the top safety concerns?",
          "Any guidance relevant to my focus?",
        ],
      });
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[api/chat/suggestions]", err);
    return NextResponse.json(
      {
        suggestions: [
          "What are the biggest safety concerns today?",
          "Summarize recent regulatory activity",
          "Any guidance relevant to my focus?",
        ],
      },
      { status: 200 }
    );
  }
}
