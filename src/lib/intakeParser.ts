import { query } from "./db";
import { getAnthropicClient } from "./agentRuntime";
import { IntakeMentionType } from "./types";

export interface ParsedMention {
  mention_text: string;
  mention_type: IntakeMentionType;
  confidence: number;
  start_pos: number | null;
  end_pos: number | null;
}

export interface ParsedIntakeResult {
  mentions: ParsedMention[];
  suggested_followups: string[];
  parser: "heuristic" | "anthropic";
}

const TA_KEYWORDS = [
  "oncology",
  "cardiology",
  "neurology",
  "orthopedics",
  "endocrinology",
  "immunology",
  "dermatology",
  "ophthalmology",
  "gastroenterology",
  "pulmonology",
  "hematology",
  "nephrology",
  "infectious disease",
  "rare disease",
  "wound care",
  "dental",
  "samd",
  "respiratory",
  "psychiatry",
  "pediatrics",
  "radiology",
];

const FRAMEWORK_KEYWORDS = [
  "510(k)",
  "pma",
  "de novo",
  "nda",
  "bla",
  "anda",
  "mdr",
  "ivdr",
  "iso 13485",
  "iso 14971",
  "ich",
];

function clampConfidence(v: number): number {
  return Math.max(0, Math.min(1, Number(v.toFixed(3))));
}

function uniqueMentions(mentions: ParsedMention[]): ParsedMention[] {
  const seen = new Set<string>();
  const out: ParsedMention[] = [];
  for (const m of mentions) {
    const key = `${m.mention_type}:${m.mention_text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function parseHeuristic(text: string): ParsedIntakeResult {
  const mentions: ParsedMention[] = [];
  const lc = text.toLowerCase();

  // FDA-like product code patterns: NDC, 510(k), PMA, product codes (e.g. IYO), 21 CFR, UDI.
  const codeRegexes = [
    /\b\d{4,5}-\d{3,4}-\d{1,2}\b/g, // NDC
    /\bK\d{6}\b/gi, // 510(k)
    /\bP\d{6}\b/gi, // PMA
    /\b(BLA|NDA|ANDA)\s*\d{4,8}\b/gi,
    /\bUDI[:\s-]*[A-Z0-9\-]{6,}\b/gi,
  ];

  for (const rx of codeRegexes) {
    for (const match of text.matchAll(rx)) {
      const mentionText = match[1] ?? match[0];
      if (!mentionText || mentionText.length < 2) continue;
      mentions.push({
        mention_text: mentionText.trim(),
        mention_type: "product_code",
        confidence: 0.95,
        start_pos: match.index ?? null,
        end_pos: typeof match.index === "number" ? match.index + match[0].length : null,
      });
    }
  }

  // Standalone FDA 3-letter product codes (e.g. IYO) when near "Product Code" or similar.
  const productCodeLabel = /(?:Product Code|product code|Product code)[:\s]*([A-Z]{2,5})\b/gi;
  for (const m of text.matchAll(productCodeLabel)) {
    if (m[1] && !mentions.some((x) => x.mention_text === m[1])) {
      const idx = text.indexOf(m[1]);
      mentions.push({
        mention_text: m[1],
        mention_type: "product_code",
        confidence: 0.92,
        start_pos: idx >= 0 ? idx : null,
        end_pos: idx >= 0 ? idx + m[1].length : null,
      });
    }
  }

  // 21 CFR regulation numbers (e.g. 21 CFR 892.5050)
  for (const m of text.matchAll(/\b21\s*CFR\s*[\d.]+/gi)) {
    mentions.push({
      mention_text: m[0].replace(/\s+/g, " "),
      mention_type: "framework",
      confidence: 0.9,
      start_pos: m.index ?? null,
      end_pos: typeof m.index === "number" ? m.index + m[0].length : null,
    });
  }

  for (const ta of TA_KEYWORDS) {
    const idx = lc.indexOf(ta);
    if (idx >= 0) {
      mentions.push({
        mention_text: ta,
        mention_type: "ta",
        confidence: 0.9,
        start_pos: idx,
        end_pos: idx + ta.length,
      });
    }
  }

  for (const fw of FRAMEWORK_KEYWORDS) {
    const idx = lc.indexOf(fw.toLowerCase());
    if (idx >= 0) {
      mentions.push({
        mention_text: fw,
        mention_type: "framework",
        confidence: 0.88,
        start_pos: idx,
        end_pos: idx + fw.length,
      });
    }
  }

  const companyMatch = text.match(/\b(at|from)\s+([A-Z][A-Za-z0-9&.\- ]{2,40})/);
  if (companyMatch && companyMatch[2]) {
    const phrase = companyMatch[2].trim();
    const idx = text.indexOf(phrase);
    mentions.push({
      mention_text: phrase,
      mention_type: "company",
      confidence: 0.72,
      start_pos: idx >= 0 ? idx : null,
      end_pos: idx >= 0 ? idx + phrase.length : null,
    });
  }

  // Simple product-name capture from quoted phrases or leading capitalized tokens.
  const quotedProducts = [...text.matchAll(/"([^"]{3,80})"/g)];
  for (const m of quotedProducts) {
    const value = (m[1] || "").trim();
    if (!value) continue;
    mentions.push({
      mention_text: value,
      mention_type: "product_name",
      confidence: 0.75,
      start_pos: m.index ?? null,
      end_pos: typeof m.index === "number" ? m.index + value.length : null,
    });
  }

  const uniq = uniqueMentions(mentions);
  const followups: string[] = [];
  if (!uniq.some((m) => m.mention_type === "product_name" || m.mention_type === "product_code")) {
    followups.push("Could you share at least one product name or submission code?");
  }
  if (!uniq.some((m) => m.mention_type === "ta")) {
    followups.push("Which therapeutic area is highest priority?");
  }

  return {
    mentions: uniq,
    suggested_followups: followups,
    parser: "heuristic",
  };
}

async function parseWithAnthropic(text: string): Promise<ParsedIntakeResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1600,
      system: `You extract structured intake mentions from regulatory/device user text. The goal is to inform a knowledge graph and signal matching — we use this for personalized digests, not just one-to-one code match.

Extract ALL of the following when present:
- product_name: device or product names (e.g. "Varian TrueBeam", "HyperSight", "CardioSense Pro")
- product_code: 510(k) numbers (K232870, K213977), PMA numbers, FDA product codes (e.g. IYO), NDC, submission IDs
- company: manufacturers and parent companies (e.g. "Varian Medical Systems", "Siemens Healthineers")
- ta: therapeutic areas — infer from context (e.g. "radiation therapy for cancer" -> oncology, "Radiology (CDRH)" -> radiology, "cardiac" -> cardiology). Use lowercase: oncology, radiology, cardiology, etc.
- framework: regulatory pathways and regulations (e.g. "510(k)", "21 CFR 892.5050", "Class II", "CDRH", "MDR", "ISO 13485")

Return JSON only:
{ "mentions": [{ "mention_text": "exact string", "mention_type": "product_name|product_code|company|ta|framework", "confidence": 0.0-1.0, "start_pos": 0, "end_pos": 0 }], "suggested_followups": ["optional question"] }

Be inclusive: extract device names, all codes, and inferred therapeutic areas so we can surface relevant regulatory news.`,
      messages: [{ role: "user", content: text }],
    });
    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as ParsedIntakeResult;
    const mentions = (parsed.mentions || [])
      .filter((m) => m.mention_text && m.mention_type)
      .map((m) => ({
        ...m,
        confidence: clampConfidence(m.confidence ?? 0.5),
        start_pos: m.start_pos ?? null,
        end_pos: m.end_pos ?? null,
      }));
    return {
      mentions: uniqueMentions(mentions),
      suggested_followups: parsed.suggested_followups || [],
      parser: "anthropic",
    };
  } catch {
    return null;
  }
}

export async function parseIntakeText(text: string): Promise<ParsedIntakeResult> {
  const llm = await parseWithAnthropic(text);
  if (llm && llm.mentions.length > 0) return llm;
  return parseHeuristic(text);
}

export async function persistIntakeSession(
  rawText: string,
  parsed: ParsedIntakeResult,
  profileId?: string | null
): Promise<{ id: string }> {
  const rows = await query<{ id: string }>(
    `INSERT INTO intake_sessions (profile_id, raw_text, parsed_json, status)
     VALUES ($1, $2, $3, 'parsed')
     RETURNING id`,
    [profileId || null, rawText, parsed]
  );
  return rows[0];
}

export async function persistIntakeMentions(
  sessionId: string,
  mentions: ParsedMention[]
): Promise<void> {
  for (const m of mentions) {
    await query(
      `INSERT INTO intake_mentions (session_id, mention_text, mention_type, confidence, start_pos, end_pos)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, m.mention_text, m.mention_type, m.confidence, m.start_pos, m.end_pos]
    );
  }
}

