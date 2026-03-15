/**
 * Feed story synthesizer.
 *
 * Takes raw signals, groups them thematically, and generates rich
 * news-style articles with analytical depth — the same quality as
 * the digest email, but formatted for the web feed.
 *
 * Uses Claude with tools (like the digest agent) to:
 * 1. Fetch source pages for deeper detail
 * 2. Search for related signals to provide broader context
 * 3. Group related signals into coherent stories
 * 4. Produce a JSON array of synthesized stories
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolUseBlock,
  ToolResultBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { Profile, Signal, FeedStory } from "./types";
import { query } from "./db";
import { isValidSourceUrl, zipValidSourceLinks } from "./sourceUrl";
import { areNearDuplicates } from "./contentQualityGate";
import { findSimilarSignals } from "./embeddings";

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Large feed-generation requests can take > 10 min — set a generous timeout
    // and use streaming in the agent loop to avoid the SDK's long-request guard.
    timeout: 30 * 60 * 1000, // 30 minutes
  });
}

const TOOLS: Tool[] = [
  {
    name: "fetch_source_page",
    description:
      "Fetch the full text content of a regulatory source URL for richer detail. Use on the 5-10 most important signals. Returns page text (truncated to ~4000 chars).",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The source URL to fetch" },
        signal_title: { type: "string", description: "The signal title (for logging)" },
      },
      required: ["url", "signal_title"],
    },
  },
  {
    name: "search_related_signals",
    description:
      "Search our signal database for related signals using full-text search. Use to find connections, prior activity, or patterns. Returns up to 10 matching signals.",
    input_schema: {
      type: "object" as const,
      properties: {
        search_query: {
          type: "string",
          description: "Full-text search query (e.g. 'Medtronic recall', 'pembrolizumab Phase 3')",
        },
      },
      required: ["search_query"],
    },
  },
  {
    name: "get_latest_digest",
    description:
      "Retrieve the most recent email digest sent to this user. Use this for continuity — reference what was covered in the digest, avoid redundancy, or add new developments to previously covered stories. Returns the last digest markdown (truncated).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_signals_semantic",
    description:
      "Find signals semantically similar to a natural language query using vector embeddings. More powerful than keyword search — understands meaning, not just words. Use for finding thematic connections, similar regulatory actions, or related product classes. Returns up to 10 matching signals.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Natural language query describing what to find (e.g. 'GLP-1 cardiovascular safety concerns', 'AI medical device regulatory framework')",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
        region: {
          type: "string",
          description: "Optional region filter (e.g. 'US', 'EU')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "finalize_stories",
    description:
      "Call this when you have completed your research and are ready to output the final synthesized stories. Pass a JSON array of story objects. This ends the agent loop.",
    input_schema: {
      type: "object" as const,
      properties: {
        stories: {
          type: "string",
          description: "A JSON string representing an array of story objects. Each story: { headline, summary, body, severity, domains, regions, therapeutic_areas, impact_types, signal_indices, source_urls, source_labels, relevance_reason }",
        },
      },
      required: ["stories"],
    },
  },
];

async function handleFetchSourcePage(url: string, signalTitle: string): Promise<string> {
  console.log(`[feed-agent] fetching source: ${signalTitle}`);
  try {
    if (process.env.FIRECRAWL_API_KEY) {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const md = data?.data?.markdown || "";
        return md.slice(0, 4000) || "Page fetched but no extractable content.";
      }
    }
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

async function handleSearchRelatedSignals(searchQuery: string): Promise<string> {
  console.log(`[feed-agent] searching signals: "${searchQuery}"`);
  try {
    const rows = await query<Signal>(
      `SELECT * FROM signals
       WHERE to_tsvector('english', title || ' ' || summary) @@ plainto_tsquery('english', $1)
       ORDER BY published_at DESC
       LIMIT 10`,
      [searchQuery]
    );
    if (rows.length === 0) return `No signals found matching "${searchQuery}".`;
    return rows
      .map((s) => `- ${s.title} | ${s.authority} | ${s.impact_severity} | ${s.published_at} | ${s.url}`)
      .join("\n");
  } catch {
    return "Signal search failed.";
  }
}

async function handleSearchSignalsSemantic(
  queryText: string,
  limit: number,
  region?: string
): Promise<string> {
  console.log(`[feed-agent] semantic search: "${queryText}"`);
  try {
    if (!process.env.OPENAI_API_KEY) {
      return "Semantic search unavailable (no OPENAI_API_KEY). Use search_related_signals for keyword search instead.";
    }
    const signals = await findSimilarSignals(queryText, { limit, region });
    if (signals.length === 0) return `No semantically similar signals found for "${queryText}".`;
    return signals
      .map((s) => `- ${s.title} | ${s.authority} | ${s.impact_severity} | ${s.published_at} | ${s.url}`)
      .join("\n");
  } catch {
    return "Semantic search failed. Use search_related_signals for keyword search instead.";
  }
}

async function handleGetLatestDigest(profileId: string | null): Promise<string> {
  if (!profileId) return "No user profile — no digest history available.";
  console.log(`[feed-agent] fetching latest digest for profile ${profileId}`);
  try {
    const rows = await query<{ markdown: string; sent_at: string }>(
      `SELECT markdown, sent_at FROM digests WHERE profile_id = $1 ORDER BY sent_at DESC LIMIT 1`,
      [profileId]
    );
    if (rows.length === 0) return "No previous digest found for this user.";
    const d = rows[0];
    return `Latest digest (sent ${d.sent_at}):\n${d.markdown.slice(0, 3000)}${d.markdown.length > 3000 ? "\n[...truncated...]" : ""}`;
  } catch {
    return "Could not retrieve digest history.";
  }
}

interface StoryOutput {
  headline: string;
  summary: string;
  body: string;
  section: string;
  severity: string;
  domains: string[];
  regions: string[];
  therapeutic_areas: string[];
  impact_types: string[];
  signal_indices: number[];
  source_urls: string[];
  source_labels: string[];
  relevance_reason?: string;
}

function derivePublishedAt(signalIndices: number[], signals: Signal[]): string {
  const dates = signalIndices
    .map((idx) => signals[idx]?.published_at)
    .filter(Boolean)
    .map((d) => new Date(d).getTime())
    .filter((t) => !isNaN(t));
  if (dates.length === 0) return new Date().toISOString();
  return new Date(Math.max(...dates)).toISOString();
}

const MAX_TURNS = 20;
const MAX_SAME_SOURCE_SIGNALS = 3;

/**
 * Pre-process signals: remove near-duplicates and cap same-source signals.
 */
function deduplicateSignals(signals: Signal[]): Signal[] {
  const deduped: Signal[] = [];
  const sourceCount = new Map<string, number>();

  for (const signal of signals) {
    // Cap same-source signals per section
    const srcCount = sourceCount.get(signal.source_id) || 0;
    if (srcCount >= MAX_SAME_SOURCE_SIGNALS) continue;

    // Check for near-duplicates against already-accepted signals
    const isDuplicate = deduped.some((existing) =>
      areNearDuplicates(
        existing.title + " " + existing.summary,
        signal.title + " " + signal.summary,
        0.8
      )
    );

    if (isDuplicate) {
      console.log(`[feed-agent] skipping near-duplicate: "${signal.title.slice(0, 60)}..."`);
      continue;
    }

    deduped.push(signal);
    sourceCount.set(signal.source_id, srcCount + 1);
  }

  console.log(`[feed-agent] dedup: ${signals.length} → ${deduped.length} signals`);
  return deduped;
}

function getRoleFraming(role: string | undefined): string {
  if (!role) return "";
  const r = role.toLowerCase();
  if (r.includes("vp") || r.includes("director") || r.includes("head") || r.includes("chief"))
    return "\nROLE FRAMING: This user is a senior leader. Emphasize strategic implications, competitive positioning, portfolio impact, and board-level talking points. Lead with business impact, not technical minutiae.";
  if (r.includes("quality") || r.includes("qa") || r.includes("compliance"))
    return "\nROLE FRAMING: This user owns quality/compliance. Emphasize specific regulatory requirements, compliance deadlines, audit implications, and corrective action expectations. Be precise about which standards and clauses apply.";
  if (r.includes("regulatory") || r.includes("ra ") || r.includes("submissions"))
    return "\nROLE FRAMING: This user is a regulatory specialist. Emphasize submission pathways, docket numbers, guidance interpretations, and regulatory precedent. Include specific procedural details and timeline implications for filings.";
  if (r.includes("clinical") || r.includes("medical") || r.includes("physician"))
    return "\nROLE FRAMING: This user has a clinical/medical focus. Emphasize evidence quality, clinical endpoints, patient safety implications, and how regulatory actions affect clinical practice or trial design.";
  return "";
}

export async function runFeedAgent(
  signals: Signal[],
  profile?: Profile | null,
  productContext?: {
    ownProducts: string[];
    competitorProducts: string[];
    productLandscape?: { name: string; advisory_committee?: string; device_class?: string; product_code?: string; regulatory_id?: string; regulatory_pathway?: string }[];
  }
): Promise<Omit<FeedStory, "id" | "created_at">[]> {
  const client = getAnthropic();

  // Pre-process: remove near-duplicates and cap same-source signals
  const processedSignals = deduplicateSignals(signals);

  // Round-robin interleave by region for balanced representation
  const byRegion = new Map<string, Signal[]>();
  for (const s of processedSignals) {
    if (!byRegion.has(s.region)) byRegion.set(s.region, []);
    byRegion.get(s.region)!.push(s);
  }
  const interleaved: Signal[] = [];
  const regionQueues = Array.from(byRegion.values());
  let added = true;
  while (added && interleaved.length < 150) {
    added = false;
    for (const queue of regionQueues) {
      if (queue.length > 0 && interleaved.length < 150) {
        interleaved.push(queue.shift()!);
        added = true;
      }
    }
  }

  const signalBlock = interleaved
    .map(
      (s, i) =>
        `[${i}] ${s.title}
    Summary: ${s.summary}
    AI Analysis: ${s.ai_analysis || "N/A"}
    Region: ${s.region} | Domain: ${s.domains.join(", ")} | Severity: ${s.impact_severity}
    Authority: ${s.authority} | Doc ID: ${s.document_id || "N/A"}
    Source: ${s.source_id} | Impact: ${s.impact_type} | Lifecycle: ${s.lifecycle_stage}
    TAs: ${s.therapeutic_areas.join(", ") || "N/A"} | Products: ${s.product_types.join(", ") || "N/A"}
    URL: ${s.url}
    Published: ${s.published_at}`
    )
    .join("\n\n");

  const profileContext = profile
    ? `
USER PROFILE (personalize stories for this user):
- Name: ${profile.name}
- Role: ${profile.role || "N/A"} at ${profile.organization || "N/A"}
- Regions: ${profile.regions.join(", ")}
- Domains: ${profile.domains.join(", ")}
- Therapeutic areas: ${profile.therapeutic_areas.join(", ") || "all"}
- Product types: ${profile.product_types.join(", ") || "all"}
- Tracked products: ${profile.tracked_products.join(", ") || "none"}
- Active submissions: ${profile.active_submissions.join(", ") || "none"}
- Competitors: ${profile.competitors.join(", ") || "none"}
${profile.regulatory_frameworks?.length ? `- Regulatory frameworks: ${profile.regulatory_frameworks.join(", ")}` : ""}
${profile.analysis_preferences ? `- Analysis priorities: ${profile.analysis_preferences}` : ""}
${productContext ? `
- USER'S OWN PRODUCTS (highest priority — always cover news about these): ${productContext.ownProducts.join(", ") || "none specified"}
- COMPETITOR PRODUCTS (track closely — cover news and compare to user's products): ${productContext.competitorProducts.join(", ") || "none specified"}
${productContext.productLandscape?.length ? `
PRODUCT LANDSCAPE (use this to identify relevant signals even when the exact product name isn't mentioned):
${productContext.productLandscape.map(p => `- ${p.name}${p.regulatory_id ? ` (${p.regulatory_id})` : ""}${p.regulatory_pathway ? ` — ${p.regulatory_pathway} clearance` : ""}
  ${[
    p.advisory_committee ? `Advisory committee: ${p.advisory_committee}` : "",
    p.device_class ? `Device class: ${p.device_class}` : "",
    p.product_code ? `FDA product code: ${p.product_code}` : "",
  ].filter(Boolean).join(" | ")}`).join("\n")}
` : ""}
PRODUCT COVERAGE RULES:
- If any signal mentions a user's own product by name, it MUST become a story (never skip).
- If any signal mentions a competitor product, write a story and note the competitive context.
- When both own and competitor products appear in the same therapeutic area, synthesize a competitive landscape story.
- Tag product-specific stories with the product name in the headline when possible.
- LANDSCAPE COVERAGE: Even if a signal doesn't mention the user's product by name, cover it if it relates to the same device class, advisory committee, regulatory pathway, or product code. For example, if the user tracks a 510(k) dental device, a signal about FDA dental device guidance or a competitor's 510(k) clearance is directly relevant.
- Generate AT LEAST 5 stories that are relevant to the user's product landscape (direct mentions, same device class, same advisory committee, same regulatory pathway, competitor activity). These should be clearly marked with relevance_reason.` : ""}
`
    : "No user profile — generate globally relevant stories.\n";

  const roleFraming = profile ? getRoleFraming(profile.role) : "";

  const systemPrompt = `You are the senior editorial director at a leading regulatory intelligence firm, producing a comprehensive daily briefing for pharma/device professionals. Your output should read like the Financial Times or Reuters health policy desk — authoritative, specific, deeply analytical. Every story must feel like it was written by a 20-year regulatory affairs veteran, not summarized by a machine.

${profileContext}${roleFraming}

YOUR WORKFLOW:
1. CHECK DIGEST CONTEXT: Call get_latest_digest ONCE to understand what was covered before.
2. RESEARCH: Use fetch_source_page on the 3-5 most important signals. Use search_related_signals 2-3 times to find connections. Keep total tool calls ≤ 8 to leave enough turns for writing.
3. WRITE & FINALIZE: After research, mentally group signals into 25-40 thematic stories, write them, and call finalize_stories with the complete JSON array. This is your last action — do not call any more tools after finalize_stories.

IMPORTANT: You have ${MAX_TURNS} turns. If you have not called finalize_stories by turn 12, stop all research immediately and finalize your stories with what you have.

THEMATIC SECTIONS — generate your OWN section names that best fit the stories:
- DO NOT use generic bucket names like "Safety & Recalls" or "Approvals & Designations."
- Instead, create specific, descriptive section names that reflect the actual content cluster. Think like a newspaper editor grouping stories by narrative theme.
- Good examples: "GLP-1 Regulatory Crackdown", "AI/ML Device Framework Advances", "EU MDR Implementation Updates", "Wound Care Device Updates", "Post-Market Surveillance Actions", "Cardiovascular Device Safety Signals"
- Bad examples: "Safety & Recalls", "Guidance & Policy", "Industry & Analysis" (too generic — tells the reader nothing)
- Aim for 4-8 sections. Each section should have 2-5 stories that genuinely belong together thematically.
- Standalone stories that don't fit a cluster can have their own 1-story section with a specific name.
- REGIONAL SECTIONS: If there are non-US signals, create region-specific sections like "EMA & European Regulators", "Health Canada Updates", "MHRA Actions" rather than lumping them all into one "International" bucket.

STORY FORMAT — each story in the JSON array must have:
- "headline": Specific and analytical. Name companies, products, regulation numbers, therapeutic areas. Bloomberg/Reuters style. NOT generic like "FDA Issues New Guidance" — instead "FDA Finalizes AI/ML-Based SaMD Framework, Mandating Real-World Performance Monitoring for Class II Devices."
- "summary": 3-4 sentence executive summary. Lead with the "so what" — why should a busy VP of Regulatory Affairs care about this right now? What action might they need to take?
- "body": A focused article. 250-400 words. 3-5 analytical paragraphs in markdown. Structure:
  * **Lead paragraph**: What happened, who is affected, and why it matters NOW.
  * **Details**: Specific documents, docket numbers, effective dates, product names, companies.
  * **Industry impact**: Which companies/products are affected and what action may be needed.
  * **What to watch**: 1-2 concrete next steps or deadlines for RA/QA professionals.
  * Use **bold** for key terms and regulation numbers. Use [inline links](url) to source documents.
- "section": Your chosen thematic section name. REQUIRED. Must be specific and descriptive (see section rules above).
- "severity": "high" (guidance changes—draft or final—final rules, major safety alerts, recalls, product withdrawals, significant approvals), "medium" (consultations, routine approvals, meeting highlights), "low" (news, analysis, workshops). Guidance changes have the highest regulatory implications — always "high".
- "domains": array of "devices" and/or "pharma"
- "regions": array of "US", "EU", "UK", "Canada", "Australia", "Japan", "Switzerland", "Global"
- "therapeutic_areas": array of relevant TAs. Use standard labels: "oncology", "cardiology", "neurology", "orthopedics", "endocrinology", "immunology", "dermatology", "ophthalmology", "gastroenterology", "pulmonology", "hematology", "nephrology", "infectious disease", "rare disease", "wound care", "dental", "SaMD", "respiratory", "psychiatry", "pediatrics". BE COMPREHENSIVE — tag ALL that apply, even indirectly. A cardiac device recall must tag "cardiology". A diabetes drug must tag "endocrinology". Users filter by TA, so untagged stories are invisible to them.
- "impact_types": array of impact types from the source signals
- "signal_indices": array of 0-based indices referencing which signals this story synthesizes. Minimum 1, aim for 3-8 when possible.
- "source_urls": array of ALL source URLs cited. Include as many as available; aim for 2+ per story.
- "source_labels": array of human-readable source labels matching source_urls
- "relevance_reason": ONE sentence explaining why this story matters to this specific user — reference their tracked products, therapeutic areas, or regulatory frameworks by name. If no user profile, omit this field.

CRITICAL RULES:
- Generate 25-40 stories. Cover the most important signals. MUST cover at least 5 different sections.
- EVERY SIGNAL MUST BE COVERED. If you cannot group a signal with others, write it as a standalone story. No signal should be left uncovered.
- GROUPING WHEN POSSIBLE: Group related signals (same company, same product class, same therapeutic area, same regulatory pathway) into richer multi-source stories. But never skip a signal just because it doesn't fit a group.
- STORY DEPTH: Aim for 250-400 words per story. Quality over length — be specific and analytical, not verbose.
- REGIONAL BALANCE: If there are EU/UK/Global signals, produce dedicated stories. The "EU & International" section should have 3-6 stories whenever non-US signals exist. Do NOT make this a US-only feed.
- INTERNATIONAL MINIMUM: At least 30% of stories must cover non-US regions. If you have EU/UK/Canada/Japan/Australia signals, produce at least 8 dedicated international stories. This is non-negotiable.
- THERAPEUTIC AREA COVERAGE: If signals span multiple therapeutic areas (oncology, cardiology, neurology, etc.), ensure stories are distributed across them. The reader should see coverage relevant to their tracked areas.
- COMPETITIVE INTELLIGENCE: When multiple companies have signals related to the same space, synthesize them into a competitive landscape story in "Industry & Analysis."
- CROSS-REFERENCING: When you find connections between signals (same company across regions, same product class across safety/approval/trial), weave them together. This is the knowledge graph the user is paying for.
- Every story must cite sources with URLs. Use the source labels below.
- SOURCE PRIORITY: When building stories, lead with and cite signals from health authority sources (FDA, EMA, MHRA, Health Canada, TGA, PMDA, WHO) over industry press or PR wires. Health authority content is most regulatory-relevant for our audience.
- The output MUST be a valid JSON array string.
- "signal_indices": can reference 1 or more signals. Standalone single-signal stories are valid and encouraged for important items that don't group well.
- "source_labels": Format as "Authority — Article Title" (e.g., "FDA MedWatch — Medline Catheter Recall Notice", "EMA — Keytruda Type II Variation Opinion"). Do NOT use authority name alone. Each signal provides a title — incorporate it. Authority prefixes by source_id: us_fda_medwatch_rss→"FDA MedWatch", us_federal_register→"Federal Register", clinicaltrials→"ClinicalTrials.gov", us_openfda_device_recall→"openFDA Recalls", us_openfda_drug_enforcement→"openFDA Drug Enforcement", us_openfda_510k→"FDA 510(k)", us_openfda_pma→"FDA PMA", us_openfda_maude→"FDA MAUDE", us_openfda_classification→"FDA Device Classification", us_fda_orange_book→"FDA Orange Book", us_fda_ndc→"FDA NDC Directory", us_dailymed_rss→"DailyMed", us_fda_orphan_designations→"FDA Orphan Products", us_fda_pmcpmr→"FDA PMC/PMR", us_fda_guidance_rss→"FDA Guidance", us_fda_press_rss→"FDA Press", eu_ema_*→"EMA", eu_ema_prime→"EMA PRIME", eu_ema_clinical_data→"EMA Clinical Data", eu_ema_medicines_eval→"EMA CHMP", eu_ctis_trials→"EU CTIS", eu_ema_rwd→"EMA RWD", uk_mhra_*→"MHRA", ca_hc_*→"Health Canada", au_tga_*→"TGA Australia", jp_pmda_*→"PMDA Japan", standards_*→"Standards Update", industry_*→infer from source, global_who_*→"WHO", global_imdrf_*→"IMDRF", global_eurlex_*→"EUR-Lex".`;

  const messages: MessageParam[] = [
    {
      role: "user",
      content: `Here are ${signals.length} raw regulatory signals. Research the important ones, group them thematically, and produce synthesized news stories.\n\n${signalBlock}`,
    },
  ];

  console.log(`[feed-agent] starting with ${processedSignals.length} signals (from ${signals.length} raw)${profile ? ` for ${profile.name}` : " (global)"}`);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Use streaming to avoid the SDK's 10-min timeout guard for large contexts
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 32000,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
    const response = await stream.finalMessage();

    const toolUses: ToolUseBlock[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === "text") textParts.push(block.text);
      if (block.type === "tool_use") toolUses.push(block);
    }

    if (textParts.length > 0) {
      console.log(`[feed-agent] turn ${turn + 1} thinking: ${textParts[0].slice(0, 200)}...`);
    }

    if (toolUses.length === 0 && response.stop_reason === "end_turn") {
      console.log("[feed-agent] ended without calling finalize_stories, attempting to parse text output");
      return parseStoriesFromText(textParts.join("\n"), signals);
    }

    const toolResults: ToolResultBlockParam[] = [];
    let finalStories: Omit<FeedStory, "id" | "created_at">[] | null = null;

    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;

      if (toolUse.name === "finalize_stories") {
        const storiesJson = (input.stories as string) || "[]";
        try {
          const parsed: StoryOutput[] = JSON.parse(storiesJson);
          const mapped = parsed.map((s) => {
            const validSources = zipValidSourceLinks(s.source_urls, s.source_labels);

            // Enrich generic labels: if a label lacks " — " (no article title),
            // find the matching signal by URL and append its title.
            const enrichedLabels = validSources.map((src) => {
              if (src.label.includes(" — ")) return src.label;
              const matchingSignal = processedSignals.find((sig) => sig.url === src.url);
              if (matchingSignal) {
                return `${src.label} — ${matchingSignal.title.slice(0, 80)}`;
              }
              return src.label;
            });

            const indices = s.signal_indices || [];
            // Backfill regions from source signals if AI left it empty
            const inferredRegions = (s.regions && s.regions.length > 0)
              ? s.regions
              : [...new Set(
                  indices
                    .map((idx: number) => interleaved[idx]?.region ?? signals[idx]?.region)
                    .filter(Boolean)
                )];
            // Backfill TAs from source signals if AI left it empty
            const inferredTAs = (s.therapeutic_areas && s.therapeutic_areas.length > 0)
              ? s.therapeutic_areas
              : [...new Set(
                  indices.flatMap((idx: number) => interleaved[idx]?.therapeutic_areas ?? signals[idx]?.therapeutic_areas ?? [])
                )];
            return {
              profile_id: profile?.id || null,
              headline: s.headline,
              summary: s.summary,
              body: s.body,
              section: s.section || "",
              severity: (["high", "medium", "low"].includes(s.severity) ? s.severity : "medium") as FeedStory["severity"],
              domains: (s.domains || []) as FeedStory["domains"],
              regions: inferredRegions as FeedStory["regions"],
              therapeutic_areas: inferredTAs,
              impact_types: (s.impact_types || []) as FeedStory["impact_types"],
              signal_ids: indices.map((idx: number) => interleaved[idx]?.id ?? signals[idx]?.id).filter(Boolean),
              source_urls: validSources.map((x) => x.url),
              source_labels: enrichedLabels,
              is_global: !profile,
              published_at: derivePublishedAt(indices, interleaved),
              relevance_reason: s.relevance_reason || null,
            };
          });
          if (mapped.length > 0) {
            if (mapped.length >= 15) {
              finalStories = mapped;
              console.log(`[feed-agent] finalized ${finalStories.length} stories after ${turn + 1} turns`);
            } else {
              // Too few stories — ask the agent to add more
              console.warn(`[feed-agent] agent submitted ${mapped.length} stories (minimum 15), asking to add more`);
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: `ERROR: You submitted only ${mapped.length} stories. You MUST write and submit at least 15 stories (target 25-40). Cover more signals — write standalone stories for important items that don't fit groups. Call finalize_stories again with a larger JSON array.`,
              });
              continue;
            }
          } else {
            // Empty finalization — ask the agent to try again
            console.warn("[feed-agent] agent called finalize_stories with 0 stories, asking to retry");
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: "ERROR: You submitted 0 stories. You MUST write and submit at least 10 stories. Please write your stories now and call finalize_stories again with a non-empty JSON array.",
            });
            continue;
          }
        } catch (parseErr) {
          console.error("[feed-agent] failed to parse stories JSON:", parseErr);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "ERROR: Invalid JSON in stories parameter. Please resubmit with valid JSON.",
          });
          continue;
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Stories finalized.",
        });
      } else if (toolUse.name === "fetch_source_page") {
        const result = await handleFetchSourcePage(
          input.url as string,
          input.signal_title as string
        );
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else if (toolUse.name === "search_related_signals") {
        const result = await handleSearchRelatedSignals(input.search_query as string);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else if (toolUse.name === "search_signals_semantic") {
        const result = await handleSearchSignalsSemantic(
          input.query as string,
          (input.limit as number) || 10,
          input.region as string | undefined
        );
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      } else if (toolUse.name === "get_latest_digest") {
        const result = await handleGetLatestDigest(profile?.id || null);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }
    }

    if (finalStories !== null) return finalStories;

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults as ContentBlockParam[] });
  }

  console.log("[feed-agent] hit max turns, generating fallback");
  return fallbackStories(signals, profile ?? null);
}

function parseStoriesFromText(
  text: string,
  signals: Signal[]
): Omit<FeedStory, "id" | "created_at">[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed: StoryOutput[] = JSON.parse(jsonMatch[0]);
      return parsed.map((s) => {
        const validSources = zipValidSourceLinks(s.source_urls, s.source_labels);
        const enrichedLabels = validSources.map((src) => {
          if (src.label.includes(" — ")) return src.label;
          const matchingSignal = signals.find((sig) => sig.url === src.url);
          if (matchingSignal) return `${src.label} — ${matchingSignal.title.slice(0, 80)}`;
          return src.label;
        });
        const indices = s.signal_indices || [];
        const inferredRegions = (s.regions && s.regions.length > 0)
          ? s.regions
          : [...new Set(indices.map((idx: number) => signals[idx]?.region).filter(Boolean))];
        const inferredTAs = (s.therapeutic_areas && s.therapeutic_areas.length > 0)
          ? s.therapeutic_areas
          : [...new Set(indices.flatMap((idx: number) => signals[idx]?.therapeutic_areas ?? []))];
        return {
          profile_id: null,
          headline: s.headline,
          summary: s.summary,
          body: s.body,
          section: s.section || "",
          severity: (["high", "medium", "low"].includes(s.severity) ? s.severity : "medium") as FeedStory["severity"],
          domains: (s.domains || []) as FeedStory["domains"],
          regions: inferredRegions as FeedStory["regions"],
          therapeutic_areas: inferredTAs,
          impact_types: (s.impact_types || []) as FeedStory["impact_types"],
          signal_ids: indices.map((idx: number) => signals[idx]?.id).filter(Boolean),
          source_urls: validSources.map((x) => x.url),
          source_labels: enrichedLabels,
          is_global: true,
          published_at: derivePublishedAt(indices, signals),
          relevance_reason: s.relevance_reason || null,
        };
      });
    }
  } catch { /* fall through */ }
  return fallbackStories(signals, null);
}

function fallbackStories(
  signals: Signal[],
  profile: Profile | null
): Omit<FeedStory, "id" | "created_at">[] {
  const highSignals = signals.filter((s) => s.impact_severity === "high").slice(0, 10);
  const rest = signals.filter((s) => s.impact_severity !== "high").slice(0, 10);
  const selected = [...highSignals, ...rest];

  return selected.map((s) => {
    const sourceUrl = s.url && isValidSourceUrl(s.url) ? s.url : null;
    const sourceUrls = sourceUrl ? [sourceUrl] : [];
    const sourceLabels = sourceUrl ? [`${s.authority || "Source"} — ${s.title.slice(0, 80)}`] : [];
    const body = sourceUrl
      ? `**${s.title}**\n\n${s.ai_analysis || s.summary}\n\nSource: [${s.authority}](${s.url})`
      : `**${s.title}**\n\n${s.ai_analysis || s.summary}`;
    return {
      profile_id: profile?.id || null,
      headline: s.title,
      summary: s.ai_analysis || s.summary,
      body,
      section: "Regulatory Updates",
      severity: s.impact_severity as FeedStory["severity"],
      domains: s.domains as FeedStory["domains"],
      regions: [s.region] as FeedStory["regions"],
      therapeutic_areas: s.therapeutic_areas,
      impact_types: [s.impact_type] as FeedStory["impact_types"],
      signal_ids: [s.id],
      source_urls: sourceUrls,
      source_labels: sourceLabels,
      is_global: !profile,
      published_at: s.published_at,
    };
  });
}
