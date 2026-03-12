import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { FeedStory } from "@/lib/types";
import { getSessionProfileId } from "@/lib/session";
import { searchProfileEvidence } from "@/lib/profileSearchAgent";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function deduplicateStories(stories: FeedStory[]): FeedStory[] {
  const seen = new Map<string, FeedStory>();
  for (const s of stories) {
    const key = s.headline
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 6)
      .join(" ");

    const existing = seen.get(key);
    if (!existing || new Date(s.published_at) > new Date(existing.published_at)) {
      seen.set(key, s);
    }
  }
  return [...seen.values()];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const q = typeof body.q === "string" ? body.q : body.query;
    const therapeuticOpt = body.therapeutic_areas !== undefined
      ? (Array.isArray(body.therapeutic_areas) ? body.therapeutic_areas : body.therapeutic_areas?.split(",").filter(Boolean) || [])
      : [];
    const regionsOpt = Array.isArray(body.regions) ? body.regions : body.regions?.split(",").filter(Boolean) || [];
    const domainsOpt = Array.isArray(body.domains) ? body.domains : body.domains?.split(",").filter(Boolean) || [];
    const productCodesOpt = Array.isArray(body.product_codes) ? body.product_codes : body.product_codes?.split(",").filter(Boolean) || [];
    if (!q || typeof q !== "string" || q.trim().length < 2) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    const profileId = await getSessionProfileId();
    const evidence = profileId
      ? await searchProfileEvidence(profileId, 80).catch(() => [])
      : [];
    const evidenceByUrl = new Map(evidence.map((e) => [e.url, e.reason_codes]));

    const conditions: string[] = profileId
      ? ["(profile_id = $1 OR is_global = true)"]
      : ["is_global = true"];
    const params: unknown[] = profileId ? [profileId] : [];
    let paramIdx = params.length;

    // Use explicit request filters only — no profile fallback. Empty = no filter.
    if (regionsOpt.length > 0) {
      paramIdx++;
      conditions.push(`(cardinality(regions) = 0 OR regions && $${paramIdx})`);
      params.push(regionsOpt);
    }
    if (domainsOpt.length > 0) {
      paramIdx++;
      conditions.push(`(cardinality(domains) = 0 OR domains && $${paramIdx})`);
      params.push(domainsOpt);
    }
    if (therapeuticOpt.length > 0) {
      const taParam = paramIdx + 1;
      const taTextParam = paramIdx + 2;
      const taTerms = therapeuticOpt.map((t: string) => t.replace(/\s+/g, " & ")).join(" | ");
      conditions.push(
        `(cardinality(therapeutic_areas) = 0 OR therapeutic_areas && $${taParam} OR to_tsvector('english', headline || ' ' || summary || ' ' || body) @@ to_tsquery('english', $${taTextParam}))`
      );
      params.push(therapeuticOpt);
      params.push(taTerms);
      paramIdx += 2;
    }
    if (productCodesOpt.length > 0) {
      const pcConditions: string[] = [];
      for (const pc of productCodesOpt) {
        paramIdx++;
        pcConditions.push(`(headline || ' ' || COALESCE(summary,'') || ' ' || COALESCE(body,'')) ILIKE $${paramIdx}`);
        params.push(`%${String(pc).replace(/%/g, "\\%")}%`);
      }
      conditions.push(`(${pcConditions.join(" OR ")})`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const rawStories = await query<FeedStory & { signal_ids?: string[] }>(
      `SELECT id, headline, summary, body, section, severity, domains, regions,
              therapeutic_areas, impact_types, source_urls, source_labels, signal_ids, published_at
       FROM feed_stories ${where}
       ORDER BY published_at DESC
       LIMIT 80`,
      params
    );

    const stories = deduplicateStories(rawStories as FeedStory[]);

    if (stories.length === 0) {
      return NextResponse.json({ results: [], answer: "No stories available to search." });
    }

    const evidenceBySignalId = new Map(evidence.map((e) => [e.signal_id, e.reason_codes]));

    const storyContext = stories.map((s, i) =>
      `[${i}] ${s.section} | ${s.headline}\n${s.summary}\nTAs: ${s.therapeutic_areas.join(", ") || "none"} | Domains: ${s.domains.join(", ")} | Regions: ${s.regions.join(", ")}`
    ).join("\n\n");

    const client = getAnthropic();

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: `You are a regulatory intelligence search assistant. Find stories that are DIRECTLY and SPECIFICALLY relevant to the user's query.

Return valid JSON only:
{"indices": [0, 3, 7], "explanation": "Brief 1-2 sentence explanation"}

STRICT RELEVANCE RULES:
- ONLY return stories that genuinely match the query topic. Match the query's therapeutic area and domain — e.g. wound care queries must return wound care content, not unrelated recalls.
- Read each story's headline, summary, AND therapeutic areas carefully before including it.
- If the query mentions a specific therapeutic area, ONLY include stories where the therapeutic_areas field contains that area OR the headline/summary clearly discusses that topic.
- Return 1-8 indices, ordered by relevance (most relevant first).
- If fewer than 3 stories are truly relevant, return fewer. Quality over quantity.
- If nothing matches, return {"indices": [], "explanation": "No stories found matching that topic in today's briefing."}`,
      messages: [{
        role: "user",
        content: `STORIES:\n${storyContext}\n\nSEARCH QUERY: "${q.trim()}"`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ results: [], answer: "Could not parse search results." });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { indices: number[]; explanation: string };
    const resultStories = (parsed.indices || [])
      .filter((i: number) => i >= 0 && i < stories.length)
      .map((i: number) => {
        const story = stories[i];
        const reasonCodes = [
          ...(story.signal_ids || [])
            .flatMap((sid) => evidenceBySignalId.get(sid) || []),
          ...(story.source_urls || [])
            .flatMap((url) => evidenceByUrl.get(url) || []),
        ].filter((v, idx, arr) => arr.indexOf(v) === idx);
        return {
          ...story,
          why_matched: reasonCodes,
        };
      });

    return NextResponse.json({
      results: resultStories,
      answer: parsed.explanation || "",
      total: resultStories.length,
    });
  } catch (err) {
    console.error("[api/feed/search]", err);
    return NextResponse.json(
      { error: "Search failed", details: String(err) },
      { status: 500 }
    );
  }
}
