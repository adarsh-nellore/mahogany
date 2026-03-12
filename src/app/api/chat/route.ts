import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { FeedStory, Profile } from "@/lib/types";
import { getSessionProfileId } from "@/lib/session";
import { searchProfileEvidence } from "@/lib/profileSearchAgent";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function ensureLinkedSources(
  reply: string,
  stories: FeedStory[]
): string {
  const hasAnyLinks = /\[[^\]]+\]\([^)]+\)/.test(reply);
  const hasExternalLink = /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(reply);
  if (hasAnyLinks && hasExternalLink) return reply;

  const citations = stories
    .slice(0, 3)
    .map((s) => {
      const storyLink = `[${s.headline}](/stories/${s.id})`;
      const firstUrl = s.source_urls[0];
      const firstLabel = s.source_labels[0] || "Source";
      if (firstUrl) {
        return `- ${storyLink} — [${firstLabel}](${firstUrl})`;
      }
      return `- ${storyLink}`;
    })
    .filter(Boolean);

  if (citations.length === 0) return reply;
  return `${reply.trim()}\n\n**Sources**\n${citations.join("\n")}`;
}

export async function POST(request: NextRequest) {
  try {
    const { messages: chatMessages } = (await request.json()) as {
      messages: ChatMessage[];
    };

    if (!chatMessages || chatMessages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const profileId = await getSessionProfileId();
    const evidenceBundles = profileId ? await searchProfileEvidence(profileId, 12) : [];

    let profileContext = "";
    if (profileId) {
      const profiles = await query<Profile>(
        `SELECT * FROM profiles WHERE id = $1`,
        [profileId]
      );
      if (profiles.length > 0) {
        const p = profiles[0];
        profileContext = `\nUser profile: ${p.name}, ${p.role || "RA professional"} at ${p.organization || "N/A"}. Tracks: ${p.therapeutic_areas.join(", ") || "general"}. Domains: ${p.domains.join(", ")}. Regions: ${p.regions.join(", ")}.`;
      }
    }

    // ── Enhanced retrieval: combine recency + relevance + FTS ──────────
    const userQuery = chatMessages[chatMessages.length - 1]?.content || "";

    const conditions = profileId
      ? `WHERE (profile_id = $1 OR is_global = true)`
      : `WHERE is_global = true`;
    const params = profileId ? [profileId] : [];

    // 1. Recent stories (recency-based baseline)
    const recentStories = await query<FeedStory>(
      `SELECT id, headline, summary, body, section, severity, domains, regions,
              therapeutic_areas, impact_types, source_urls, source_labels, published_at
       FROM feed_stories ${conditions}
       ORDER BY published_at DESC
       LIMIT 25`,
      params
    );

    // 2. Full-text search on user query against stories (if query is substantive)
    let ftsStories: FeedStory[] = [];
    if (userQuery.length >= 3) {
      const ftsConditions = profileId
        ? `WHERE (profile_id = $1 OR is_global = true) AND to_tsvector('english', headline || ' ' || summary || ' ' || body) @@ plainto_tsquery('english', $2)`
        : `WHERE is_global = true AND to_tsvector('english', headline || ' ' || summary || ' ' || body) @@ plainto_tsquery('english', $1)`;
      const ftsParams = profileId ? [profileId, userQuery] : [userQuery];

      ftsStories = await query<FeedStory>(
        `SELECT id, headline, summary, body, section, severity, domains, regions,
                therapeutic_areas, impact_types, source_urls, source_labels, published_at
         FROM feed_stories ${ftsConditions}
         ORDER BY published_at DESC
         LIMIT 15`,
        ftsParams
      );
    }

    // 3. Signal-level data for entity-specific questions
    let signalContext = "";
    if (userQuery.length >= 3) {
      const signalRows = await query<{ title: string; summary: string; url: string; authority: string; published_at: string }>(
        `SELECT title, summary, url, authority, published_at
         FROM signals
         WHERE to_tsvector('english', title || ' ' || summary) @@ plainto_tsquery('english', $1)
         ORDER BY published_at DESC
         LIMIT 10`,
        [userQuery]
      ).catch(() => []);

      if (signalRows.length > 0) {
        signalContext = `\n\nRAW SIGNALS MATCHING QUERY:\n${signalRows.map((s) =>
          `- ${s.title} | ${s.authority} | ${s.published_at} | ${s.url}`
        ).join("\n")}`;
      }
    }

    // Merge and deduplicate stories (FTS results first, then recency)
    const seenIds = new Set<string>();
    const stories: FeedStory[] = [];
    for (const s of [...ftsStories, ...recentStories]) {
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        stories.push(s);
      }
      if (stories.length >= 40) break;
    }

    const storyContext = stories.map((s, i) => {
      const sources = s.source_labels.map((label, j) => {
        const url = s.source_urls[j] || "";
        return url ? `${label}: ${url}` : label;
      }).join("\n  ");
      return `[${i}] "${s.headline}" (${s.section}, ${s.severity} severity, ${s.regions.join("/")})
Summary: ${s.summary}
Key details: ${s.body.slice(0, 500)}${s.body.length > 500 ? "..." : ""}
Sources:
  ${sources}
Story link: /stories/${s.id}
Published: ${s.published_at}`;
    }).join("\n\n");

    const client = getAnthropic();

    const evidenceContext = evidenceBundles.length
      ? `\nPROFILE-MATCH EVIDENCE (for why-this-matched explanations):\n${evidenceBundles
        .map(
          (e) =>
            `- ${e.title} | reasons=${e.reason_codes.join(",")} | entities=${e.matched_entities.join(",")} | ${e.url}`
        )
        .join("\n")}`
      : "";

    const systemPrompt = `You are a regulatory intelligence assistant for Mahogany, a platform that delivers AI-curated regulatory news for pharma and medical device professionals.
${profileContext}

BRIEFING CONTENT (${stories.length} stories):
${storyContext}
${evidenceContext}
${signalContext}

RESPONSE FORMAT:
You must ALWAYS end your response with exactly this format on its own line:
---SUGGESTIONS---
suggestion 1 text
suggestion 2 text
suggestion 3 text

The suggestions should be natural follow-up questions the user might want to ask next, contextual to what was just discussed. Keep them short (under 50 chars each).

RULES:
- Answer questions about regulatory developments using the briefing content above.
- ALWAYS cite your sources with links. When referencing a story, include a markdown link using the story's headline and its /stories/ID path, like: [FDA Approves New Drug](/stories/abc-123). Also include the original source links when available, like: [FDA MedWatch](https://www.fda.gov/...).
- Every claim should be traceable to a specific story and source.
- Be specific: cite agencies, dates, document numbers when relevant.
- When relevant, explicitly explain why a story surfaced for the user using reason codes such as exact code match, product family, competitor equivalent, or same TA/pathway.
- If asked about something not in the briefing, say so clearly but offer to explain what IS covered.
- Keep responses concise but informative — 2-4 paragraphs max unless the user asks for detail.
- Use a professional, conversational tone.
- You can compare, contrast, and synthesize across multiple stories.
- If the user asks "what's new" or similar, summarize the top 3-5 most significant developments with source links.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    const splitIdx = text.indexOf("---SUGGESTIONS---");
    let reply = text;
    let suggestions: string[] = [];

    if (splitIdx !== -1) {
      reply = text.slice(0, splitIdx).trim();
      suggestions = text
        .slice(splitIdx + "---SUGGESTIONS---".length)
        .trim()
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length < 80)
        .slice(0, 3);
    }

    if (suggestions.length === 0) {
      suggestions = [
        "Tell me more about this topic",
        "What else is in today's briefing?",
        "Any related safety updates?",
      ];
    }

    // Enforce linked citations even if model misses formatting instructions.
    reply = ensureLinkedSources(reply, stories);

    return NextResponse.json({ reply, suggestions });
  } catch (err) {
    console.error("[api/chat]", err);
    return NextResponse.json(
      { error: "Chat failed", details: String(err) },
      { status: 500 }
    );
  }
}
