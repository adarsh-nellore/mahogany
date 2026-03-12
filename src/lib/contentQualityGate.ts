/**
 * Content quality gate module.
 *
 * Centralizes all signal quality checks:
 * - Garbage pattern detection (extracted from poll-signals route)
 * - Minimum text thresholds
 * - Content hash dedup (SHA-256 of normalized text)
 * - Boilerplate ratio check
 * - Simple language detection (Latin chars / stopwords)
 *
 * Failed items are recorded in `ingestion_exceptions` instead of being silently dropped.
 */

import { createHash } from "crypto";
import { query } from "./db";
import { SignalDraft } from "./types";

// ─── Garbage patterns (migrated from poll-signals) ──────────────────

const GARBAGE_PATTERNS = [
  // Navigation / UI elements
  /^cookie/i, /^accept all/i, /^skip to/i, /^consent/i,
  /^navigation/i, /^menu/i, /^sign in/i, /^log ?in/i, /^sign up/i,
  /^search$/i, /^home$/i, /^back$/i, /^close$/i, /^subscribe/i,
  /^share this/i, /^follow us/i, /^copyright/i, /^privacy policy/i,
  /^terms of/i, /^contact us/i, /^\d+$/,
  // Error / 404 pages
  /^404/i, /^page not found/i, /^error/i, /^loading/i,
  /^not found/i, /^resource not found/i, /^file not found/i,
  /couldn'?t find/i, /^we couldn'?t/i, /^the page you/i,
  /^sorry.*not found/i, /^oops/i, /^something went wrong/i,
  /^access denied/i, /^unauthorized/i, /^forbidden/i,
  // Cookie / GDPR banners
  /needs your.*consent/i, /explicit consent/i, /store.*cookie/i,
  /^this site uses cookies/i, /^we use cookies/i, /^by (continuing|using)/i,
  /^your privacy/i, /^manage (your )?cookies/i,
  // Generic web chrome
  /^(read|learn) more$/i, /^click here/i, /^view (all|more)/i,
  /^see (all|more)/i, /^download( now)?$/i,
  // Service / product pages (not articles)
  /^book a /i, /^client logins/i, /^resource center$/i,
  /^(site|our) network/i, /^(our )?solutions/i,
  /^(contact|about) us$/i, /^(our )?services$/i,
  /^(training|support|consulting)$/i,
];

const REGULATORY_SIGNAL_WORDS = /\b(fda|ema|mhra|tga|pmda|swissmedic|anvisa|medsafe|hsa|mfds|chmp|prac|cmdh|mdcg|who|imdrf|ich|pics|icmra|ctis|eudamed|ce.marking|notified.body|health.canada|therapeutic.goods|marketing.authorisation|type.ii.variation|referral|signal.assessment|periodic.safety|psur|pbrer|rmp|pharmacovigilance|post.market|clinical.investigation|medical.device|ivd|samed|class.ii[ab]?|annex|delegated.act|implementing.act|recall|guidance|approval|clinical|trial|drug|device|regulation|safety|warning|alert|review|authorization|licence|clearance|designation|submission|inspection|enforcement|compliance|standard|directive)\b/i;

// Source ID prefixes that should bypass the short-title regulatory keyword check
// (press wires, podcasts, YouTube, curated sources, and industry blogs often have
// short titles that are legitimately regulatory but don't contain keyword matches)
const RELAXED_KEYWORD_PREFIXES = ["press_", "podcast_", "youtube_", "curated_", "industry_", "company_"];

// Wire service noise filter — rejects earnings, executive, investor content
// that isn't regulatory-relevant. Applied only to wire_* sources.
const WIRE_NOISE_PATTERNS = /\b(quarterly results|earnings|revenue|dividend|stock|share price|executive appointment|board of directors|investor conference|annual report|fiscal year)\b/i;

// ─── Boilerplate detection ──────────────────────────────────────────

const BOILERPLATE_PHRASES = [
  "all rights reserved",
  "terms and conditions",
  "privacy notice",
  "cookie policy",
  "newsletter signup",
  "follow us on",
  "share on social",
  "powered by",
  "website design by",
  "copyright ©",
  "loading please wait",
  "javascript is required",
  "enable javascript",
  "your browser does not support",
];

// ─── Language detection (simple heuristic) ───────────────────────────

const LATIN_RATIO_MIN = 0.5;
const ENGLISH_STOPWORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "her", "an", "or",
  "is", "was", "are", "been", "has", "had", "will", "would", "could",
]);

// ─── Quality check result ───────────────────────────────────────────

export type QualityRejectReason =
  | "title_too_short"
  | "title_too_long"
  | "no_alpha_chars"
  | "garbage_pattern"
  | "too_few_words"
  | "missing_regulatory_keyword"
  | "duplicate_content"
  | "high_boilerplate"
  | "non_latin_content"
  | "empty_content";

export interface QualityCheckResult {
  passed: boolean;
  reason?: QualityRejectReason;
  contentHash?: string;
}

// ─── In-memory content hash map for dedup within a single poll run ───
// Maps content hash → source region prefix (e.g. "us", "eu", "uk", "global")
// Allows one signal per region prefix through dedup, preserving source diversity.

const recentContentHashes = new Map<string, string>();
const MAX_HASH_CACHE = 10000;

export function resetContentHashCache(): void {
  recentContentHashes.clear();
}

function sourceRegionPrefix(sourceId: string): string {
  if (sourceId.startsWith("us_") || sourceId.startsWith("clinicaltrials")) return "us";
  if (sourceId.startsWith("eu_")) return "eu";
  if (sourceId.startsWith("uk_")) return "uk";
  if (sourceId.startsWith("ca_")) return "ca";
  if (sourceId.startsWith("au_")) return "au";
  if (sourceId.startsWith("jp_")) return "jp";
  if (sourceId.startsWith("ch_")) return "ch";
  if (sourceId.startsWith("global_")) return "global";
  if (sourceId.startsWith("industry_") || sourceId.startsWith("standards_") || sourceId.startsWith("podcast_")) return "industry";
  if (sourceId.startsWith("wire_")) return "wire";
  if (sourceId.startsWith("company_")) return "company";
  return "other";
}

// ─── Main quality check ─────────────────────────────────────────────

export function checkSignalQuality(draft: SignalDraft): QualityCheckResult {
  // Decode common HTML entities before quality checks
  const title = draft.title
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?38;/g, "&")
    .replace(/&#\d+;/g, "")
    .trim();

  // Title length checks
  if (title.length < 10) {
    return { passed: false, reason: "title_too_short" };
  }
  if (title.length > 500) {
    return { passed: false, reason: "title_too_long" };
  }

  // Minimum alphabetic chars
  if (!title.match(/[a-zA-Z]{3,}/)) {
    return { passed: false, reason: "no_alpha_chars" };
  }

  // Garbage pattern match
  if (GARBAGE_PATTERNS.some((p) => p.test(title))) {
    return { passed: false, reason: "garbage_pattern" };
  }

  // Word count
  const wordCount = title.split(/\s+/).length;
  if (wordCount < 3) {
    return { passed: false, reason: "too_few_words" };
  }

  // Regulatory keyword requirement for short titles
  // Relaxed for press/podcast/youtube/curated/industry/company sources whose titles are
  // legitimately regulatory but may not contain explicit keyword matches.
  const relaxed = RELAXED_KEYWORD_PREFIXES.some((p) => draft.source_id.startsWith(p));
  if (wordCount < 8 && !relaxed && !REGULATORY_SIGNAL_WORDS.test(title)) {
    return { passed: false, reason: "missing_regulatory_keyword" };
  }

  // Wire service noise filter: wire_* sources get strict filtering.
  // Must pass regulatory keyword check AND not match noise patterns.
  if (draft.source_id.startsWith("wire_")) {
    if (!REGULATORY_SIGNAL_WORDS.test(title) && !REGULATORY_SIGNAL_WORDS.test(draft.summary || "")) {
      return { passed: false, reason: "missing_regulatory_keyword" };
    }
    if (WIRE_NOISE_PATTERNS.test(title) || WIRE_NOISE_PATTERNS.test(draft.summary || "")) {
      return { passed: false, reason: "missing_regulatory_keyword" };
    }
  }

  // Content hash dedup (title + summary normalized)
  // Allows one signal per region prefix through — so a US FDA signal and an
  // EU EMA signal covering the same topic both survive dedup.
  const normalizedContent = normalizeForHash(title + " " + (draft.summary || ""));
  const contentHash = sha256(normalizedContent);
  const regionPrefix = sourceRegionPrefix(draft.source_id);

  if (recentContentHashes.has(contentHash)) {
    const existingRegion = recentContentHashes.get(contentHash)!;
    if (existingRegion === regionPrefix) {
      return { passed: false, reason: "duplicate_content", contentHash };
    }
    // Different region — allow through for source diversity
  }

  // Boilerplate ratio check (on summary if available)
  if (draft.summary && draft.summary.length > 50) {
    const boilerplateRatio = computeBoilerplateRatio(draft.summary);
    if (boilerplateRatio > 0.4) {
      return { passed: false, reason: "high_boilerplate", contentHash };
    }
  }

  // Language detection (on title)
  if (!isLikelyLatinText(title)) {
    // Don't reject — some sources may have non-Latin titles legitimately (PMDA Japan)
    // Just flag it but still pass
  }

  // Track hash for in-run dedup (first region to claim a hash wins for that region)
  if (recentContentHashes.size >= MAX_HASH_CACHE) {
    // Evict oldest by clearing (simple strategy for bounded memory)
    recentContentHashes.clear();
  }
  if (!recentContentHashes.has(contentHash)) {
    recentContentHashes.set(contentHash, regionPrefix);
  }

  return { passed: true, contentHash };
}

/**
 * Check quality and record exceptions for rejected items.
 * Returns filtered array of passing drafts.
 */
export async function filterWithExceptions(
  drafts: SignalDraft[]
): Promise<SignalDraft[]> {
  const passed: SignalDraft[] = [];
  const exceptions: { draft: SignalDraft; reason: QualityRejectReason }[] = [];

  for (const draft of drafts) {
    const result = checkSignalQuality(draft);
    if (result.passed) {
      passed.push(draft);
    } else {
      exceptions.push({ draft, reason: result.reason! });
    }
  }

  // Batch-insert exceptions (non-blocking)
  if (exceptions.length > 0) {
    recordExceptions(exceptions).catch(() => {});
  }

  return passed;
}

async function recordExceptions(
  exceptions: { draft: SignalDraft; reason: QualityRejectReason }[]
): Promise<void> {
  // Insert in batches of 50
  for (let i = 0; i < exceptions.length; i += 50) {
    const batch = exceptions.slice(i, i + 50);
    const values: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    for (const { draft, reason } of batch) {
      values.push(`($${pi}, $${pi + 1}, $${pi + 2}, $${pi + 3}, $${pi + 4}, $${pi + 5})`);
      params.push(
        draft.source_id,
        (draft.url || "").slice(0, 2000),
        (draft.title || "").slice(0, 500),
        reason,
        JSON.stringify(draft.raw_payload || {}),
        suggestedFix(reason)
      );
      pi += 6;
    }

    try {
      await query(
        `INSERT INTO ingestion_exceptions (source_id, url, title, reason_code, raw_payload, suggested_fix)
         VALUES ${values.join(", ")}`,
        params
      );
    } catch {
      // Never break the pipeline for exception logging
    }
  }
}

function suggestedFix(reason: QualityRejectReason): string {
  switch (reason) {
    case "title_too_short": return "Check if source changed its HTML structure";
    case "title_too_long": return "Extraction may be pulling full paragraphs instead of titles";
    case "no_alpha_chars": return "Source may be returning encoded/numeric content";
    case "garbage_pattern": return "Extraction is pulling navigation/chrome elements";
    case "too_few_words": return "May need a more specific extraction prompt";
    case "missing_regulatory_keyword": return "Short title without regulatory context — may be generic";
    case "duplicate_content": return "Same content seen from another source or earlier in this run";
    case "high_boilerplate": return "Source page may have changed layout, extracting boilerplate";
    case "non_latin_content": return "Source may need language-specific extraction";
    case "empty_content": return "Source returned empty response";
  }
}

// ─── Utility functions ──────────────────────────────────────────────

function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function computeBoilerplateRatio(text: string): number {
  const lower = text.toLowerCase();
  let boilerplateChars = 0;
  for (const phrase of BOILERPLATE_PHRASES) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      boilerplateChars += phrase.length;
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }
  return text.length > 0 ? boilerplateChars / text.length : 0;
}

function isLikelyLatinText(text: string): boolean {
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) return true;
  return latinChars / totalChars >= LATIN_RATIO_MIN;
}

/**
 * Check if two texts are near-duplicates (>80% overlap by normalized content hash similarity).
 * Uses a simpler approach: compare normalized word sets with Jaccard similarity.
 */
export function areNearDuplicates(text1: string, text2: string, threshold = 0.8): boolean {
  const words1 = new Set(normalizeForHash(text1).split(" ").filter(Boolean));
  const words2 = new Set(normalizeForHash(text2).split(" ").filter(Boolean));

  if (words1.size === 0 || words2.size === 0) return false;

  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }

  const union = words1.size + words2.size - intersection;
  return union > 0 ? intersection / union >= threshold : false;
}
