/**
 * Custom WHO fetcher.
 *
 * Fetches WHO news releases and disease outbreak news using direct HTTP.
 * WHO pages are JavaScript-heavy but the article listing HTML is present
 * in the initial response. We look specifically for article-like links
 * (containing /news/, /detail/, or date patterns in the URL).
 */

import { SignalDraft } from "../types";

const PAGES = [
  {
    url: "https://www.who.int/news",
    category: "news",
  },
  {
    url: "https://www.who.int/emergencies/disease-outbreak-news",
    category: "disease_outbreak",
  },
  {
    url: "https://www.who.int/news-room/releases",
    category: "press_release",
  },
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// WHO nav/section elements to filter out
const WHO_JUNK = new Set([
  "feature stories", "disease outbreak news", "situation reports",
  "news releases", "statements", "commentaries", "speeches", "events",
  "questions and answers", "fact sheets", "photo stories", "multimedia",
  "home", "about", "contact", "privacy", "terms of use", "accessibility",
  "subscribe", "all news", "more news", "read more", "view all",
  "show more", "load more", "see all stories", "back to top",
  "who headquarters", "regional offices", "countries",
]);

function isJunk(title: string): boolean {
  const lower = title.toLowerCase().trim();
  if (lower.length < 20) return true;
  if (WHO_JUNK.has(lower)) return true;
  // Generic section headers
  if (/^(about|topics|health|data|news|media|get involved|governance)$/i.test(lower)) return true;
  // Regional office names
  if (/^who\s+(regional\s+office|headquarters)/i.test(lower)) return true;
  return false;
}

interface ExtractedLink {
  title: string;
  url: string;
  date?: string;
}

function extractArticleLinks(html: string): ExtractedLink[] {
  const results: ExtractedLink[] = [];
  const seen = new Set<string>();

  // Look for links that contain article-like URL patterns
  // WHO article URLs typically contain: /detail/, /news-room/, date segments (YYYY-MM-DD),
  // or /item/ patterns
  const linkPattern = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

    if (title.length < 20 || title.length > 400) continue;
    if (seen.has(href)) continue;
    if (isJunk(title)) continue;

    // Only consider WHO links
    const isWhoLink = href.startsWith("/") || href.includes("who.int");
    if (!isWhoLink) continue;
    if (href.startsWith("#") || href.startsWith("javascript:")) continue;

    // Filter for article-like URLs — must have substance indicators
    const isArticle =
      /\/detail\//.test(href) ||
      /\/item\//.test(href) ||
      /\/releases\//.test(href) ||
      /\/\d{4}\/\d{2}/.test(href) || // date patterns in URL
      /\/\d{2}-\d{2}-\d{4}/.test(href) ||
      /disease-outbreak-news/.test(href) ||
      /news-room\/[a-z]/.test(href);

    if (!isArticle) continue;

    const fullUrl = href.startsWith("http")
      ? href
      : `https://www.who.int${href}`;

    // Try extracting date from URL path
    let date: string | undefined;
    const dateMatch = href.match(/\/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
    if (dateMatch) {
      date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }

    seen.add(href);
    results.push({ title, url: fullUrl, date });
  }

  return results;
}

export async function fetchWHOAPI(): Promise<SignalDraft[]> {
  const allDrafts: SignalDraft[] = [];

  // Fetch all pages concurrently
  const fetchPromises = PAGES.map(async (page) => {
    try {
      const res = await fetch(page.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        console.warn(`[fetcher:global_who_api] ${page.category} HTTP ${res.status}`);
        return [];
      }

      const html = await res.text();
      const links = extractArticleLinks(html);

      return links.slice(0, 25).map((link): SignalDraft => ({
        source_id: "global_who_api",
        url: link.url,
        title: link.title,
        summary: `WHO ${page.category.replace(/_/g, " ")}`,
        published_at: link.date ? new Date(link.date).toISOString() : new Date().toISOString(),
        authority: "WHO",
        document_id: link.url,
        raw_payload: { category: page.category } as unknown as Record<string, unknown>,
        region_hint: "Global",
        domain_hint: null,
      }));
    } catch (err) {
      console.error(`[fetcher:global_who_api] ${page.category} error:`, err);
      return [];
    }
  });

  const results = await Promise.allSettled(fetchPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      allDrafts.push(...result.value);
    }
  }

  console.log(`[fetcher:global_who_api] fetched ${allDrafts.length} items`);
  return allDrafts;
}
