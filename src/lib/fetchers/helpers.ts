import Parser from "rss-parser";
import { Region, Domain, SignalDraft } from "../types";
import { fetchWithRetry, recordDiagnostic, conditionalFetch, updateSourceState } from "../fetchRetry";
import { query } from "../db";

// ─── Firecrawl concurrency limiter ──────────────────────────────────
// Prevents flooding Firecrawl's API with 50+ simultaneous requests,
// which causes rate-limit (429) failures and timeouts.
const FIRECRAWL_CONCURRENCY = 5;
let firecrawlActive = 0;
const firecrawlQueue: (() => void)[] = [];

async function acquireFirecrawlSlot(): Promise<void> {
  if (firecrawlActive < FIRECRAWL_CONCURRENCY) {
    firecrawlActive++;
    return;
  }
  return new Promise<void>((resolve) => {
    firecrawlQueue.push(() => {
      firecrawlActive++;
      resolve();
    });
  });
}

function releaseFirecrawlSlot(): void {
  firecrawlActive--;
  const next = firecrawlQueue.shift();
  if (next) next();
}

// ─── Source health circuit breaker ────────────────────────────────────
// Checks source_state for consecutive failures. If an RSS source fails 3+
// times, it auto-escalates to Firecrawl. If Firecrawl also fails, the source
// is parked (degraded) for 24 hours to avoid burning money on retries.

export interface SourceHealth {
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccess: Date | null;
  accessMethod: string;
  degradedUntil: Date | null;
}

const FAILURE_THRESHOLD = 3;
const DEGRADED_HOURS = 24;

export async function checkSourceHealth(sourceId: string): Promise<SourceHealth> {
  try {
    const rows = await query<{
      consecutive_failures: number;
      last_success_at: string | null;
      access_method: string | null;
      degraded_until: string | null;
    }>(
      `SELECT consecutive_failures, last_success_at, access_method, degraded_until
       FROM source_state WHERE source_id = $1`,
      [sourceId]
    );

    if (rows.length === 0) {
      return { healthy: true, consecutiveFailures: 0, lastSuccess: null, accessMethod: "rss", degradedUntil: null };
    }

    const row = rows[0];
    const degradedUntil = row.degraded_until ? new Date(row.degraded_until) : null;
    const isDegraded = degradedUntil && degradedUntil > new Date();

    return {
      healthy: row.consecutive_failures < FAILURE_THRESHOLD && !isDegraded,
      consecutiveFailures: row.consecutive_failures,
      lastSuccess: row.last_success_at ? new Date(row.last_success_at) : null,
      accessMethod: row.access_method || "rss",
      degradedUntil,
    };
  } catch {
    return { healthy: true, consecutiveFailures: 0, lastSuccess: null, accessMethod: "rss", degradedUntil: null };
  }
}

/**
 * Mark a source as degraded — skip fetches for DEGRADED_HOURS.
 * Called when both primary method and Firecrawl fallback fail.
 */
export async function markSourceDegraded(sourceId: string): Promise<void> {
  try {
    await query(
      `UPDATE source_state
       SET degraded_until = now() + interval '${DEGRADED_HOURS} hours',
           access_method = 'firecrawl_fallback',
           updated_at = now()
       WHERE source_id = $1`,
      [sourceId]
    );
  } catch {
    // Non-blocking
  }
}

/**
 * Record that a source recovered via Firecrawl fallback.
 */
export async function markSourceRecovered(sourceId: string, method: string): Promise<void> {
  try {
    await query(
      `UPDATE source_state
       SET consecutive_failures = 0,
           access_method = $2,
           degraded_until = NULL,
           last_success_at = now(),
           updated_at = now()
       WHERE source_id = $1`,
      [sourceId, method]
    );
  } catch {
    // Non-blocking
  }
}

// User-Agent pool — some international sites block generic bot UAs.
// Rotate through browser-like agents per fetch to reduce 403s.
const USER_AGENTS = [
  "Mozilla/5.0 (compatible; Mahogany-RI/1.0; +https://mahogany.dev)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
];
let uaIndex = 0;
function nextUserAgent(): string {
  return USER_AGENTS[uaIndex++ % USER_AGENTS.length];
}

const rssParser = new Parser({
  timeout: 20000, // Increased from 15s for slower international feeds
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; Mahogany-RI/1.0; +https://mahogany.dev)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  },
});

export interface RSSFetcherOptions {
  source_id: string;
  url: string;
  authority: string;
  region_hint: Region | null;
  domain_hint: Domain | null;
  /** Set false to disable age filtering entirely. Defaults to 7 days. */
  maxAge24h?: boolean;
  /** Max age in hours. Defaults to 168 (7 days). */
  maxAgeHours?: number;
}

/**
 * Generic RSS/Atom fetcher with retry, diagnostics, and conditional fetch support.
 * Used by ~15 fetchers that all follow the same pattern.
 * Defaults to a 7-day lookback window so infrequent feeds aren't filtered to zero.
 */
export async function fetchRSS(opts: RSSFetcherOptions): Promise<SignalDraft[]> {
  // ── Circuit breaker: check source health before fetching ───────────
  const health = await checkSourceHealth(opts.source_id);

  // If degraded, skip entirely until degraded_until expires
  if (health.degradedUntil && health.degradedUntil > new Date()) {
    console.log(`[fetcher:${opts.source_id}] degraded until ${health.degradedUntil.toISOString()}, skipping`);
    return [];
  }

  // If 3+ consecutive failures, auto-escalate to Firecrawl
  if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
    console.log(`[fetcher:${opts.source_id}] ${health.consecutiveFailures} consecutive failures, escalating to Firecrawl`);
    const firecrawlResults = await fetchPageSignals(opts.url, opts.source_id, {
      authority: opts.authority,
      region_hint: opts.region_hint,
      domain_hint: opts.domain_hint,
    });
    if (firecrawlResults.length > 0) {
      console.log(`[fetcher:${opts.source_id}] Firecrawl fallback recovered ${firecrawlResults.length} items`);
      markSourceRecovered(opts.source_id, "firecrawl_fallback").catch(() => {});
      return firecrawlResults;
    }
    // Both methods failed — degrade the source for 24h
    console.warn(`[fetcher:${opts.source_id}] Firecrawl fallback also failed, degrading for 24h`);
    markSourceDegraded(opts.source_id).catch(() => {});
    return [];
  }

  // ── Normal RSS fetch ──────────────────────────────────────────────
  const startMs = Date.now();
  try {
    const feed = await rssParser.parseURL(opts.url);
    const now = Date.now();
    const ageMs = (opts.maxAgeHours ?? 168) * 60 * 60 * 1000; // default 7 days
    const cutoff = now - ageMs;

    const items = opts.maxAge24h !== false
      ? feed.items.filter((item) => {
          const pub = item.pubDate || item.isoDate;
          if (!pub) return true;
          return new Date(pub).getTime() > cutoff;
        })
      : feed.items;

    const drafts: SignalDraft[] = items.map((item) => ({
      source_id: opts.source_id,
      url: item.link || "",
      title: item.title || "(no title)",
      summary: stripHtml(item.contentSnippet || item.content || ""),
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      authority: opts.authority,
      document_id: item.guid || item.link || null,
      raw_payload: item as unknown as Record<string, unknown>,
      region_hint: opts.region_hint,
      domain_hint: opts.domain_hint,
    }));

    // Record success diagnostics
    recordDiagnostic(opts.source_id, opts.url, {
      http_status: 200,
      response_time_ms: Date.now() - startMs,
      extracted_text_length: drafts.reduce((sum, d) => sum + d.title.length + d.summary.length, 0),
      parser_used: "rss",
      error_code: null,
    }).catch(() => {});

    updateSourceState(opts.source_id, {}).catch(() => {});

    console.log(`[fetcher:${opts.source_id}] fetched ${drafts.length} items from RSS`);
    return drafts;
  } catch (err) {
    const responseTimeMs = Date.now() - startMs;
    console.error(`[fetcher:${opts.source_id}] RSS error:`, err);

    // Record failure diagnostics
    recordDiagnostic(opts.source_id, opts.url, {
      http_status: null,
      response_time_ms: responseTimeMs,
      parser_used: "rss",
      error_code: "rss_parse_error",
    }).catch(() => {});

    updateSourceState(opts.source_id, { failure: true }).catch(() => {});

    // Fallback: try direct HTTP fetch + basic link extraction
    return fetchRSSFallback(opts);
  }
}

/**
 * Build alternate feed URL variants to try when the primary URL fails.
 * Tries Atom ↔ RSS conversions and common feed URL patterns.
 */
function buildAlternateUrls(url: string): string[] {
  const alts: string[] = [];

  // .atom ↔ .xml / .rss conversion
  if (url.endsWith(".atom")) {
    alts.push(url.replace(/\.atom$/, ".xml"));
    alts.push(url.replace(/\.atom$/, ".rss"));
  } else if (url.endsWith(".xml")) {
    alts.push(url.replace(/\.xml$/, ".atom"));
  } else if (url.endsWith(".rss")) {
    alts.push(url.replace(/\.rss$/, ".xml"));
    alts.push(url.replace(/\.rss$/, ".atom"));
  }

  // /feed suffix variants
  if (url.endsWith("/feed")) {
    alts.push(url + ".xml");
    alts.push(url.replace(/\/feed$/, "/rss"));
    alts.push(url.replace(/\/feed$/, "/rss.xml"));
  } else if (!url.includes("/feed")) {
    // Try appending /feed
    const base = url.endsWith("/") ? url.slice(0, -1) : url;
    alts.push(base + "/feed");
  }

  return alts;
}

/**
 * Fallback for RSS failures: first tries alternate feed URLs, then falls back
 * to direct HTML fetch + link extraction.
 */
async function fetchRSSFallback(opts: RSSFetcherOptions): Promise<SignalDraft[]> {
  // First, try alternate URL variants (Atom ↔ RSS, /feed suffix)
  const alternates = buildAlternateUrls(opts.url);
  for (const altUrl of alternates) {
    try {
      console.log(`[fetcher:${opts.source_id}] trying alternate RSS URL: ${altUrl}`);
      const altFeed = await rssParser.parseURL(altUrl);
      if (altFeed.items.length > 0) {
        const ageMs = (opts.maxAgeHours ?? 168) * 60 * 60 * 1000;
        const cutoff = Date.now() - ageMs;
        const items = altFeed.items.filter((item) => {
          const pub = item.pubDate || item.isoDate;
          if (!pub) return true;
          return new Date(pub).getTime() > cutoff;
        });
        console.log(`[fetcher:${opts.source_id}] alternate URL succeeded with ${items.length} items`);
        return items.map((item) => ({
          source_id: opts.source_id,
          url: item.link || "",
          title: item.title || "(no title)",
          summary: stripHtml(item.contentSnippet || item.content || ""),
          published_at: item.isoDate || item.pubDate || new Date().toISOString(),
          authority: opts.authority,
          document_id: item.guid || item.link || null,
          raw_payload: item as unknown as Record<string, unknown>,
          region_hint: opts.region_hint,
          domain_hint: opts.domain_hint,
        }));
      }
    } catch {
      // Try next alternate
    }
  }

  // Fall back to direct HTML fetch with rotating User-Agent
  try {
    console.log(`[fetcher:${opts.source_id}] attempting HTML fallback for failed RSS`);
    const { response } = await fetchWithRetry(opts.url, {
      sourceId: opts.source_id,
      parserUsed: "rss_html_fallback",
      timeoutMs: 20000,
      maxRetries: 1,
      headers: { "User-Agent": nextUserAgent() },
    });

    if (!response.ok) return [];

    const html = await response.text();
    // Very basic: extract <a> tags with href and title-like text
    const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]{15,300})<\/a>/gi;
    const drafts: SignalDraft[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      const title = stripHtml(match[2]).trim();
      if (title.length < 15 || seen.has(href)) continue;
      seen.add(href);

      const fullUrl = href.startsWith("http") ? href : new URL(href, opts.url).toString();
      drafts.push({
        source_id: opts.source_id,
        url: fullUrl,
        title,
        summary: "",
        published_at: new Date().toISOString(),
        authority: opts.authority,
        document_id: fullUrl,
        raw_payload: { fallback: true },
        region_hint: opts.region_hint,
        domain_hint: opts.domain_hint,
      });
    }

    console.log(`[fetcher:${opts.source_id}] HTML fallback extracted ${drafts.length} links`);
    return drafts.slice(0, 30);
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

// ─── fetchPageSignals ─────────────────────────────────────────────────────────
//
// Smart scraper for pages that have no RSS/API. Uses Firecrawl in two modes:
//   1. Extract mode  — AI-powered structured extraction (title, url, date, summary)
//   2. Markdown mode — fallback: pull markdown then extract hyperlinks
//
// This replaces the old pattern of splitting page markdown by newlines,
// which produced garbage (nav items, cookie notices, footer text).

export interface PageSignalsOptions {
  authority: string;
  region_hint: Region | null;
  domain_hint: Domain | null;
  maxItems?: number;
  /** Custom extraction prompt. Defaults to a regulatory-focused prompt. */
  extractPrompt?: string;
}

interface ExtractedItem {
  title: string;
  url?: string;
  date?: string;
  summary?: string;
}

const DEFAULT_EXTRACT_PROMPT =
  "Extract all regulatory news items, announcements, guidance documents, approvals, safety alerts, or updates listed on this page. For each item return: title (the headline or document name), url (direct link to the item), date (publication or effective date if shown), summary (brief description if available). Skip navigation links, cookie notices, and generic page elements.";

/**
 * Fetches structured signals from a web page using Firecrawl.
 *
 * Strategy:
 *   1. Try Firecrawl extract mode → AI returns structured items with title/url/date/summary
 *   2. If extract returns nothing → Firecrawl scrape → extract hyperlinks from markdown
 *   3. If no Firecrawl key → return empty (source will appear in health report)
 */
export async function fetchPageSignals(
  url: string,
  sourceId: string,
  opts: PageSignalsOptions
): Promise<SignalDraft[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn(`[fetcher:${sourceId}] FIRECRAWL_API_KEY not set, skipping`);
    return [];
  }

  const maxItems = opts.maxItems ?? 30;

  // ── 1. Try extract mode (AI-powered structured extraction) ───────────────
  const extracted = await firecrawlExtract(url, sourceId, apiKey, opts.extractPrompt);
  if (extracted.length > 0) {
    console.log(`[fetcher:${sourceId}] extract mode returned ${extracted.length} items`);
    return extracted.slice(0, maxItems).map((item) => toSignalDraft(item, url, sourceId, opts));
  }

  // ── 2. Fall back to markdown scrape + link extraction ────────────────────
  const markdown = await firecrawlMarkdown(url, sourceId, apiKey);
  if (markdown) {
    const links = linksFromMarkdown(markdown, url);
    if (links.length > 0) {
      console.log(`[fetcher:${sourceId}] markdown fallback extracted ${links.length} links`);
      return links.slice(0, maxItems).map((item) => toSignalDraft(item, url, sourceId, opts));
    }
  }

  // ── 3. Fall back to direct HTML fetch + link extraction ─────────────────
  const htmlFallbackResults = await directHtmlFallback(url, sourceId, opts, maxItems);
  if (htmlFallbackResults.length > 0) {
    return htmlFallbackResults;
  }

  console.warn(`[fetcher:${sourceId}] no items extracted from ${url} (all methods failed)`);
  updateSourceState(sourceId, { failure: true }).catch(() => {});
  return [];
}

async function firecrawlExtract(
  url: string,
  sourceId: string,
  apiKey: string,
  prompt?: string
): Promise<ExtractedItem[]> {
  await acquireFirecrawlSlot();
  const startMs = Date.now();
  try {
    const { response } = await fetchWithRetry("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        url,
        formats: ["extract"],
        extract: {
          prompt: prompt || DEFAULT_EXTRACT_PROMPT,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    date: { type: "string" },
                    summary: { type: "string" },
                  },
                  required: ["title"],
                },
              },
            },
          },
        },
      }),
      sourceId,
      parserUsed: "firecrawl_extract",
      timeoutMs: 45000,
      maxRetries: 1,
    });

    if (!response.ok) {
      recordDiagnostic(sourceId, url, {
        http_status: response.status,
        response_time_ms: Date.now() - startMs,
        parser_used: "firecrawl_extract",
        error_code: `firecrawl_${response.status}`,
      }).catch(() => {});
      return [];
    }
    const data = await response.json();
    const items: ExtractedItem[] = data?.data?.extract?.items || [];
    const filtered = items.filter(
      (i) => i.title && i.title.trim().length >= 10 && i.title.trim().length <= 500
    );

    recordDiagnostic(sourceId, url, {
      http_status: 200,
      response_time_ms: Date.now() - startMs,
      extracted_text_length: filtered.reduce((sum, i) => sum + (i.title?.length || 0), 0),
      parser_used: "firecrawl_extract",
      error_code: null,
    }).catch(() => {});

    return filtered;
  } catch {
    recordDiagnostic(sourceId, url, {
      http_status: null,
      response_time_ms: Date.now() - startMs,
      parser_used: "firecrawl_extract",
      error_code: "firecrawl_error",
    }).catch(() => {});
    return [];
  } finally {
    releaseFirecrawlSlot();
  }
}

async function firecrawlMarkdown(
  url: string,
  sourceId: string,
  apiKey: string
): Promise<string> {
  await acquireFirecrawlSlot();
  const startMs = Date.now();
  try {
    const { response } = await fetchWithRetry("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      sourceId,
      parserUsed: "firecrawl_markdown",
      timeoutMs: 30000,
      maxRetries: 1,
    });
    if (!response.ok) return "";
    const data = await response.json();
    const md = (data?.data?.markdown as string) || "";

    recordDiagnostic(sourceId, url, {
      http_status: 200,
      response_time_ms: Date.now() - startMs,
      content_length: md.length,
      parser_used: "firecrawl_markdown",
      error_code: null,
    }).catch(() => {});

    return md;
  } catch (err) {
    console.error(`[fetcher:${sourceId}] Firecrawl markdown error:`, err);
    recordDiagnostic(sourceId, url, {
      http_status: null,
      response_time_ms: Date.now() - startMs,
      parser_used: "firecrawl_markdown",
      error_code: "firecrawl_error",
    }).catch(() => {});
    return "";
  } finally {
    releaseFirecrawlSlot();
  }
}

/**
 * Direct HTML fetch + readability-style text extraction fallback.
 * Used when Firecrawl fails for a scrape source.
 */
async function directHtmlFallback(
  url: string,
  sourceId: string,
  opts: PageSignalsOptions,
  maxItems: number
): Promise<SignalDraft[]> {
  try {
    console.log(`[fetcher:${sourceId}] attempting direct HTML fallback`);
    const { response } = await fetchWithRetry(url, {
      sourceId,
      parserUsed: "direct_html_fallback",
      timeoutMs: 20000,
      maxRetries: 1,
      headers: { "User-Agent": nextUserAgent(), "Accept-Language": "en-US,en;q=0.9" },
    });

    if (!response.ok) return [];

    const html = await response.text();
    // Extract links with substantial titles
    const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]{15,300})<\/a>/gi;
    const items: ExtractedItem[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(html)) !== null && items.length < maxItems) {
      const href = match[1];
      const title = stripHtml(match[2]).trim();
      if (title.length < 15 || seen.has(href) || isJunkLink(title)) continue;
      seen.add(href);

      const fullUrl = href.startsWith("http") ? href : new URL(href, url).toString();
      items.push({ title, url: fullUrl });
    }

    console.log(`[fetcher:${sourceId}] HTML fallback extracted ${items.length} links`);
    return items.map((item) => toSignalDraft(item, url, sourceId, opts));
  } catch {
    return [];
  }
}

/** Extract hyperlinks from Firecrawl markdown. Much better than line-splitting. */
function linksFromMarkdown(
  markdown: string,
  pageUrl: string
): ExtractedItem[] {
  const results: ExtractedItem[] = [];
  const seen = new Set<string>();

  // Match absolute and root-relative links: [title](url)
  const absolutePattern = /\[([^\]]{10,400})\]\((https?:\/\/[^)\s]+)\)/g;
  const relativePattern = /\[([^\]]{10,400})\]\((\/[^)\s]+)\)/g;

  const base = new URL(pageUrl).origin;

  let match: RegExpExecArray | null;

  while ((match = absolutePattern.exec(markdown)) !== null) {
    const title = cleanTitle(match[1]);
    const url = match[2];
    if (title && !seen.has(url) && !isJunkLink(title)) {
      seen.add(url);
      results.push({ title, url });
    }
  }

  while ((match = relativePattern.exec(markdown)) !== null) {
    const title = cleanTitle(match[1]);
    const url = `${base}${match[2]}`;
    if (title && !seen.has(url) && !isJunkLink(title)) {
      seen.add(url);
      results.push({ title, url });
    }
  }

  return results;
}

function cleanTitle(raw: string): string {
  return raw.replace(/[*_`#[\]]/g, "").replace(/\s+/g, " ").trim();
}

const JUNK_PATTERNS = [
  /^(home|back|next|previous|more|read more|click here|learn more|see all|view all)$/i,
  /^(cookie|privacy|terms|contact|sign in|log in|register|subscribe)$/i,
  /^(menu|navigation|search|skip to|accessibility)$/i,
  /^\d+$/,
  /^[^a-zA-Z]{0,5}$/,
];

function isJunkLink(title: string): boolean {
  if (title.length < 10) return true;
  return JUNK_PATTERNS.some((p) => p.test(title.trim()));
}

function toSignalDraft(
  item: ExtractedItem,
  pageUrl: string,
  sourceId: string,
  opts: PageSignalsOptions
): SignalDraft {
  const itemUrl = item.url || pageUrl;
  const docId = itemUrl !== pageUrl ? itemUrl : null;

  return {
    source_id: sourceId,
    url: itemUrl,
    title: (item.title || "").trim().slice(0, 300),
    summary: (item.summary || "").trim().slice(0, 1000),
    published_at: parseFlexDate(item.date) ?? new Date().toISOString(),
    authority: opts.authority,
    document_id: docId,
    raw_payload: item as unknown as Record<string, unknown>,
    region_hint: opts.region_hint,
    domain_hint: opts.domain_hint,
  };
}

function parseFlexDate(raw?: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) return d.toISOString();
  return null;
}

// ─── Legacy scrapeWithFirecrawl ───────────────────────────────────────────────
// Kept for backward compatibility. New fetchers should use fetchPageSignals.

/**
 * @deprecated Use fetchPageSignals instead.
 */
export async function scrapeWithFirecrawl(
  url: string,
  sourceId: string
): Promise<{ title: string; content: string; url: string }[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn(`[fetcher:${sourceId}] FIRECRAWL_API_KEY not set, skipping`);
    return [];
  }

  await acquireFirecrawlSlot();
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.error(`[fetcher:${sourceId}] Firecrawl HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    const markdown: string = data?.data?.markdown || "";
    if (!markdown) return [];

    return [{ title: data?.data?.metadata?.title || "", content: markdown, url }];
  } catch (err) {
    console.error(`[fetcher:${sourceId}] Firecrawl error:`, err);
    return [];
  } finally {
    releaseFirecrawlSlot();
  }
}
