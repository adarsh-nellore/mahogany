/**
 * Agentic digest generator.
 *
 * Instead of a single Claude call, this gives Claude tools to:
 * 1. Fetch the actual source webpage for any signal (deeper analysis)
 * 2. Look up previous digests sent to this user (continuity)
 * 3. Search our signal database for related signals (broader context)
 *
 * Claude loops — calling tools as needed — until it decides it has
 * enough context and calls finalize_digest with the final markdown.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolUseBlock,
  ToolResultBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { Profile, Signal } from "./types";
import { query } from "./db";
import { searchProfileEvidence, comparativeAlerts } from "./profileSearchAgent";
import { isValidSourceUrl } from "./sourceUrl";
import { findSimilarSignals, rankSignalsForProfile } from "./embeddings";

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ─── Tool Definitions ────────────────────────────────────────────────
// These tell Claude what tools are available and what they accept.

const TOOLS: Tool[] = [
  {
    name: "fetch_source_page",
    description:
      "Fetch the full text content of a regulatory source URL. Use this to get richer detail for signals where the title/summary alone isn't enough — e.g. to read the actual FDA recall notice, Federal Register document, or clinical trial details. Returns the page text (truncated to ~4000 chars). Use selectively on the 3-8 most important signals, not on every one.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The source URL to fetch",
        },
        signal_title: {
          type: "string",
          description: "The signal title (for logging)",
        },
      },
      required: ["url", "signal_title"],
    },
  },
  {
    name: "get_previous_digests",
    description:
      "Retrieve summaries of previous digests sent to this user. Use this to provide continuity — reference what you flagged last time, note evolving stories, or avoid repeating the same analysis. Returns the last N digest markdowns.",
    input_schema: {
      type: "object" as const,
      properties: {
        count: {
          type: "number",
          description: "Number of previous digests to retrieve (1-3)",
        },
      },
      required: ["count"],
    },
  },
  {
    name: "search_related_signals",
    description:
      "Search our signal database for related signals using full-text search. Use this to find connections — e.g. if you see a recall, search for previous recalls from the same company, or search for related clinical trials. Returns up to 10 matching signals.",
    input_schema: {
      type: "object" as const,
      properties: {
        search_query: {
          type: "string",
          description:
            "Full-text search query (e.g. 'Medtronic recall', 'pembrolizumab Phase 3')",
        },
      },
      required: ["search_query"],
    },
  },
  {
    name: "get_profile_evidence",
    description:
      "Retrieve evidence bundles that match this user's watchlist (tracked products, codes, competitors). Returns signals with reason codes: exact_code_match, same_product_family, competitor_equivalent, same_ta_regulatory_pathway. Use to prioritize and explain why items belong in this digest.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max number of evidence items to return (default 25)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_comparative_alerts",
    description:
      "Retrieve comparative intelligence: signals about competitors or peer products that may affect the user's watchlist. Use to add a 'Competitive intelligence' or 'Watchlist-relevant' section when present.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_signals_semantic",
    description:
      "Find signals semantically similar to a natural language query using vector embeddings. More powerful than keyword search — understands meaning and context. Use for finding thematic connections across signals. Returns up to 10 matching signals.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language query (e.g. 'GLP-1 cardiovascular safety', 'Class III device post-market surveillance')",
        },
        limit: {
          type: "number",
          description: "Max results (default 10)",
        },
        region: {
          type: "string",
          description: "Optional region filter",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "finalize_digest",
    description:
      "Call this when you have completed your research and are ready to output the final digest. Pass the complete markdown string. This ends the agent loop.",
    input_schema: {
      type: "object" as const,
      properties: {
        markdown: {
          type: "string",
          description: "The complete digest markdown",
        },
      },
      required: ["markdown"],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────────
// These actually execute when Claude calls a tool.

async function handleFetchSourcePage(
  url: string,
  signalTitle: string
): Promise<string> {
  console.log(`[agent] fetching source: ${signalTitle}`);
  try {
    // Use Firecrawl if available, otherwise basic fetch
    if (process.env.FIRECRAWL_API_KEY) {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const md = data?.data?.markdown || "";
        return md.slice(0, 4000) || "Page fetched but no extractable content.";
      }
    }

    // Fallback: basic fetch with HTML stripping
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MahoganyRI/1.0" },
    });
    clearTimeout(timeout);
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000) || "Page fetched but content was empty.";
  } catch (err) {
    return `Could not fetch URL: ${err}`;
  }
}

async function handleGetPreviousDigests(
  profileId: string,
  count: number
): Promise<string> {
  console.log(`[agent] fetching ${count} previous digests`);
  const clampedCount = Math.min(Math.max(count, 1), 3);
  try {
    const rows = await query<{ markdown: string; sent_at: string }>(
      `SELECT markdown, sent_at FROM digests
       WHERE profile_id = $1
       ORDER BY sent_at DESC
       LIMIT $2`,
      [profileId, clampedCount]
    );
    if (rows.length === 0) {
      return "No previous digests found for this user. This is their first digest.";
    }
    return rows
      .map(
        (r, i) =>
          `--- Previous Digest ${i + 1} (sent ${r.sent_at}) ---\n${r.markdown.slice(0, 2000)}${r.markdown.length > 2000 ? "\n[...truncated...]" : ""}`
      )
      .join("\n\n");
  } catch {
    return "Could not retrieve previous digests.";
  }
}

async function handleSearchRelatedSignals(
  searchQuery: string
): Promise<string> {
  console.log(`[agent] searching signals: "${searchQuery}"`);
  try {
    const rows = await query<Signal>(
      `SELECT * FROM signals
       WHERE to_tsvector('english', title || ' ' || summary) @@ plainto_tsquery('english', $1)
       ORDER BY published_at DESC
       LIMIT 10`,
      [searchQuery]
    );
    if (rows.length === 0) {
      return `No signals found matching "${searchQuery}".`;
    }
    return rows
      .map(
        (s) =>
          `- ${s.title} | ${s.authority} | ${s.impact_severity} | ${s.published_at} | ${s.url}`
      )
      .join("\n");
  } catch {
    return "Signal search failed.";
  }
}

async function handleGetProfileEvidence(profileId: string, limit = 25): Promise<string> {
  try {
    const bundles = await searchProfileEvidence(profileId, limit);
    if (bundles.length === 0) {
      return "No profile evidence (watchlist matches) found. User may have no watch items, or no signals linked to them yet.";
    }
    return bundles
      .map(
        (e) =>
          `- ${e.title} | reasons: ${e.reason_codes.join(", ")} | entities: ${e.matched_entities.join(", ")} | ${e.url}`
      )
      .join("\n");
  } catch (err) {
    return `Profile evidence failed: ${err}`;
  }
}

async function handleGetComparativeAlerts(profileId: string): Promise<string> {
  try {
    const bundles = await comparativeAlerts(profileId);
    if (bundles.length === 0) {
      return "No comparative alerts (competitor/watchlist deltas) for this profile.";
    }
    return bundles
      .map(
        (e) =>
          `- ${e.title} | ${e.reason_codes.join(", ")} | ${e.matched_entities.join(", ")} | ${e.url}`
      )
      .join("\n");
  } catch (err) {
    return `Comparative alerts failed: ${err}`;
  }
}

async function handleSearchSignalsSemantic(
  queryText: string,
  limit: number,
  region?: string
): Promise<string> {
  console.log(`[agent] semantic search: "${queryText}"`);
  try {
    if (!process.env.OPENAI_API_KEY) {
      return "Semantic search unavailable (no OPENAI_API_KEY). Use search_related_signals instead.";
    }
    const signals = await findSimilarSignals(queryText, { limit, region });
    if (signals.length === 0) return `No semantically similar signals found for "${queryText}".`;
    return signals
      .map((s) => `- ${s.title} | ${s.authority} | ${s.impact_severity} | ${s.published_at} | ${s.url}`)
      .join("\n");
  } catch {
    return "Semantic search failed. Use search_related_signals instead.";
  }
}

// ─── Agent Loop ──────────────────────────────────────────────────────

const MAX_TURNS = 12;

export async function runDigestAgent(
  profile: Profile,
  signals: Signal[]
): Promise<string> {
  const client = getAnthropic();
  const evidence = await searchProfileEvidence(profile.id, 20).catch(() => []);

  // Semantically rank signals by profile interest if embeddings are available
  let rankedSignals = signals;
  if (process.env.OPENAI_API_KEY && signals.length > 0) {
    try {
      const rankedIds = await rankSignalsForProfile(
        profile.id,
        signals.map((s) => s.id),
        60
      );
      if (rankedIds.length > 0) {
        const idOrder = new Map(rankedIds.map((id, i) => [id, i]));
        rankedSignals = [...signals].sort((a, b) => {
          const aRank = idOrder.get(a.id) ?? signals.length;
          const bRank = idOrder.get(b.id) ?? signals.length;
          return aRank - bRank;
        });
        console.log(`[agent] semantically ranked ${rankedIds.length} signals for ${profile.name}`);
      }
    } catch {
      // Fall through to unranked signals
    }
  }

  const signalBlock = rankedSignals
    .slice(0, 60)
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}
    Summary: ${s.summary}
    Region: ${s.region} | Domain: ${s.domains.join(", ")} | Severity: ${s.impact_severity}
    Authority: ${s.authority} | Doc ID: ${s.document_id || "N/A"}
    Source ID: ${s.source_id}
    URL: ${s.url}
    TAs: ${s.therapeutic_areas.join(", ") || "N/A"} | Products: ${s.product_types.join(", ") || "N/A"}
    Impact Type: ${s.impact_type} | Lifecycle: ${s.lifecycle_stage}
    Published: ${s.published_at}`
    )
    .join("\n\n");

  const profileContext = buildProfileContext(profile);
  const digestFormat = buildDigestFormatInstructions(profile);

  const evidenceContext = evidence.length
    ? `\nPROFILE MATCH CONTEXT:\n${evidence
      .map(
        (e) =>
          `- ${e.title} | reasons=${e.reason_codes.join(",")} | matched_entities=${e.matched_entities.join(",")}`
      )
      .join("\n")}`
    : "";

  const systemPrompt = `You are a senior regulatory intelligence analyst building a personalized daily digest. You have tools to research signals more deeply before writing.

${profileContext}
${evidenceContext}

YOUR WORKFLOW:
1. REVIEW all ${signals.length} signals and the user's profile.
2. RESEARCH: Use your tools strategically:
   - get_profile_evidence: Call early to see which signals match the user's watchlist (products, codes, competitors). Use this to prioritize and to write "Why this surfaced" lines.
   - get_comparative_alerts: Call to get competitor/watchlist-relevant signals; include a COMPETITIVE INTELLIGENCE section when present.
   - fetch_source_page: Fetch the actual source document for the 3-8 most important signals. Prioritize HIGH severity and watchlist-matched items.
   - get_previous_digests: Check what you sent the user last time for continuity (call once with count=1).
   - search_related_signals: Search for related context when you spot a pattern.
3. WRITE: Call finalize_digest with the complete markdown. For items that match the user's watchlist, include a "Why this surfaced: [reason codes]" line so the email shows relevance.

IMPORTANT:
- You MUST call get_profile_evidence (and optionally get_comparative_alerts) so the digest explains why items matter for this user.
- You MUST use at least fetch_source_page on the top signals. Don't skip research.
- You MUST check get_previous_digests for continuity (call it once with count=1).
- For entries that match the user's products/codes/competitors, add a line: "Why this surfaced: exact code match" (or same_product_family, competitor_equivalent, same_ta_regulatory_pathway) so the email can display it.
- When comparative alerts exist, include a section "COMPETITIVE INTELLIGENCE" or "WATCHLIST RELEVANT" with those items.

${digestFormat}`;

  const messages: MessageParam[] = [
    {
      role: "user",
      content: `Here are ${signals.length} regulatory signals for today's digest. Research the important ones, then produce the digest.\n\n${signalBlock}`,
    },
  ];

  console.log(
    `[agent] starting digest agent for ${profile.name} with ${signals.length} signals`
  );

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Collect text output and tool calls
    const toolUses: ToolUseBlock[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === "text") textParts.push(block.text);
      if (block.type === "tool_use") toolUses.push(block);
    }

    // If Claude produced text thinking, log it
    if (textParts.length > 0) {
      console.log(`[agent] turn ${turn + 1} thinking: ${textParts[0].slice(0, 200)}...`);
    }

    // If no tool calls and stop reason is "end_turn", Claude finished without finalize
    if (toolUses.length === 0 && response.stop_reason === "end_turn") {
      console.log("[agent] Claude ended without calling finalize_digest, using text output");
      return textParts.join("\n") || fallbackDigest(profile, signals);
    }

    // Process tool calls
    const toolResults: ToolResultBlockParam[] = [];
    let finalMarkdown: string | null = null;

    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;

      if (toolUse.name === "finalize_digest") {
        finalMarkdown = (input.markdown as string) || "";
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Digest finalized.",
        });
        console.log(
          `[agent] finalized digest (${finalMarkdown.length} chars) after ${turn + 1} turns`
        );
      } else if (toolUse.name === "fetch_source_page") {
        const result = await handleFetchSourcePage(
          input.url as string,
          input.signal_title as string
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } else if (toolUse.name === "get_previous_digests") {
        const result = await handleGetPreviousDigests(
          profile.id,
          input.count as number
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } else if (toolUse.name === "search_related_signals") {
        const result = await handleSearchRelatedSignals(
          input.search_query as string
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } else if (toolUse.name === "search_signals_semantic") {
        const result = await handleSearchSignalsSemantic(
          (input.query || input.search_query) as string,
          (input.limit as number) || 10,
          input.region as string | undefined
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } else if (toolUse.name === "get_profile_evidence") {
        const result = await handleGetProfileEvidence(
          profile.id,
          (input.limit as number) || 25
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      } else if (toolUse.name === "get_comparative_alerts") {
        const result = await handleGetComparativeAlerts(profile.id);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }
    }

    // If we got the final digest, return it
    if (finalMarkdown !== null) {
      return finalMarkdown;
    }

    // Add assistant response and tool results to conversation history
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults as ContentBlockParam[] });
  }

  console.log("[agent] hit max turns, generating fallback");
  return fallbackDigest(profile, signals);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildProfileContext(profile: Profile): string {
  const sections: string[] = [];

  sections.push("USER PROFILE:");
  sections.push(`- Name: ${profile.name}`);
  if (profile.role) sections.push(`- Role: ${profile.role}`);
  if (profile.organization)
    sections.push(`- Organization: ${profile.organization}`);
  sections.push(`- Regions: ${profile.regions.join(", ")}`);
  sections.push(`- Domains: ${profile.domains.join(", ")}`);
  sections.push(
    `- Therapeutic areas: ${profile.therapeutic_areas.join(", ") || "all"}`
  );
  sections.push(
    `- Product types: ${profile.product_types.join(", ") || "all"}`
  );

  if (profile.tracked_products.length > 0) {
    sections.push(`\nTRACKED PRODUCTS (reference these by name in analysis):`);
    for (const p of profile.tracked_products) sections.push(`- ${p}`);
  }

  if (profile.active_submissions.length > 0) {
    sections.push(
      `\nACTIVE REGULATORY SUBMISSIONS (high priority — flag anything relevant):`
    );
    for (const s of profile.active_submissions) sections.push(`- ${s}`);
  }

  if (profile.competitors.length > 0) {
    sections.push(`\nCOMPETITIVE LANDSCAPE (watch for activity from these):`);
    for (const c of profile.competitors) sections.push(`- ${c}`);
  }

  if (profile.regulatory_frameworks.length > 0) {
    sections.push(`\nREGULATORY FRAMEWORKS OF INTEREST:`);
    sections.push(`- ${profile.regulatory_frameworks.join(", ")}`);
  }

  if (profile.analysis_preferences) {
    sections.push(
      `\nANALYSIS PRIORITIES (from the user in their own words):\n${profile.analysis_preferences}`
    );
  }

  return sections.join("\n");
}

function buildDigestFormatInstructions(profile: Profile): string {
  const dl = domainLabel(profile);
  const dateStr = fmtDate(new Date());

  return `DIGEST OUTPUT FORMAT — follow this exactly when calling finalize_digest:

LINE 1: "${profile.regions.join("/")} ${dl} Regulatory Intelligence Digest – ${dateStr}"

LINES 3-5: Executive summary (2-3 sentences). What's hot, patterns, upcoming deadlines. Reference tracked products by name. If you found evolving stories from previous digests, mention them.

Then: thematic sections covering ALL signals.

SECTION HEADERS: ALL CAPS, SPECIFIC (name products/companies/regulations), followed by severity badge:
MEDLINE CATHETER CONTAMINATION — CARDIAC DEVICE SUPPLY CHAIN AT RISK — 🔴 HIGH

SIGNAL ENTRIES — two paragraphs (plus optional relevance line):

Paragraph 1: **Bold headline** — analysis with WHY this matters to this specific user. Use details from your source page research when available.

When the item matches the user's watchlist (products, codes, competitors), add on its own line:
Why this surfaced: exact code match
(or: same_product_family | competitor_equivalent | same_ta_regulatory_pathway — use the reason codes from get_profile_evidence/get_comparative_alerts)

Paragraph 2: Source attribution with markdown link. Put the evidence date FIRST (when the update/podcast/article was published):
YYYY-MM-DD · Authority · Source Name · Doc ID · [Link Text](URL)

When you have comparative/watchlist alerts from get_comparative_alerts, include a section:
COMPETITIVE INTELLIGENCE — WATCHLIST RELEVANT — 🟡 MEDIUM
Then 1–2 paragraph entries for those items, with "Why this surfaced: competitor_equivalent" (or other reason) and source line.

RULES:
- Cover ALL signals. Group related ones.
- For watchlist-matched items, always include a "Why this surfaced: ..." line so the email shows relevance.
- Section headers must be SPECIFIC, never generic.
- Every entry needs a clickable [link](url).
- Always use the signal's published_at (evidence date) as YYYY-MM-DD at the start of each source line — that is when the source was published, not today.
- Source ID mapping: us_fda_medwatch_rss→"FDA MedWatch", us_federal_register→"Federal Register", clinicaltrials→"ClinicalTrials.gov", us_openfda_device_recall→"openFDA", us_openfda_drug_enforcement→"openFDA Drug Enforcement", us_fda_guidance_rss→"FDA Guidance", us_fda_press_rss→"FDA Press", podcast_fda_voices→"FDA Press", standards_*→"Standards Update", eu_mdcg_documents→"MDCG", industry_*→infer name.
- 5-12 sections. Paragraph form, no bullets/lists.
- No top-level heading. No ## headers.
- Authoritative but accessible tone.`;
}

function domainLabel(profile: Profile): string {
  return profile.domains
    .map((d) => (d === "pharma" ? "Biopharma" : "Medical Device"))
    .join(" & ");
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtEvidenceDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().slice(0, 10);
  } catch {
    return iso?.slice(0, 10) || "";
  }
}

function fallbackDigest(profile: Profile, signals: Signal[]): string {
  const items = signals
    .slice(0, 20)
    .map((s) => {
      const sourcePart = isValidSourceUrl(s.url) ? ` · [Source](${s.url})` : "";
      const evidenceDate = fmtEvidenceDate(s.published_at);
      return `**${s.title}** — ${s.summary}\n${evidenceDate} · ${s.authority} · ${s.source_id}${sourcePart}`;
    })
    .join("\n\n");

  return `${profile.regions.join("/")} ${domainLabel(profile)} Regulatory Intelligence Digest – ${fmtDate(new Date())}\n\nAutomated fallback — agent research unavailable.\n\n${items}\n`;
}
