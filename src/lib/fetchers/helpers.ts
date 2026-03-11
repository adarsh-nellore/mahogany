import Parser from "rss-parser";
import { Region, Domain, SignalDraft } from "../types";

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Mahogany-RI/1.0",
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
 * Generic RSS/Atom fetcher. Parses the feed and maps every item to a SignalDraft.
 * Used by ~15 fetchers that all follow the same pattern.
 * Defaults to a 7-day lookback window so infrequent feeds aren't filtered to zero.
 */
export async function fetchRSS(opts: RSSFetcherOptions): Promise<SignalDraft[]> {
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

    console.log(`[fetcher:${opts.source_id}] fetched ${drafts.length} items from RSS`);
    return drafts;
  } catch (err) {
    console.error(`[fetcher:${opts.source_id}] RSS error:`, err);
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

  console.warn(`[fetcher:${sourceId}] no items extracted from ${url}`);
  return [];
}

async function firecrawlExtract(
  url: string,
  sourceId: string,
  apiKey: string,
  prompt?: string
): Promise<ExtractedItem[]> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
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
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const items: ExtractedItem[] = data?.data?.extract?.items || [];
    // Filter out obviously empty/junk items
    return items.filter(
      (i) => i.title && i.title.trim().length >= 10 && i.title.trim().length <= 500
    );
  } catch {
    return [];
  }
}

async function firecrawlMarkdown(
  url: string,
  sourceId: string,
  apiKey: string
): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return (data?.data?.markdown as string) || "";
  } catch (err) {
    console.error(`[fetcher:${sourceId}] Firecrawl markdown error:`, err);
    return "";
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
  }
}
