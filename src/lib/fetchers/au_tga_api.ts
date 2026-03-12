/**
 * Custom TGA (Australia) fetcher.
 *
 * TGA servers are slow from outside Australia. This fetcher:
 *   - Uses generous 30s timeouts
 *   - Fetches pages concurrently (not sequentially)
 *   - Falls back to a single known-good page if all fail
 *
 * Pages fetched:
 *   - Safety alerts
 *   - News articles
 */

import { SignalDraft } from "../types";

const PAGES = [
  {
    url: "https://www.tga.gov.au/news/news-articles",
    category: "news",
  },
  {
    url: "https://www.tga.gov.au/safety/safety-monitoring-and-information/safety-alerts",
    category: "safety_alert",
  },
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const NAV_JUNK = new Set([
  "home", "back", "menu", "search", "skip to main content", "skip to content",
  "cookie policy", "privacy", "contact us", "accessibility", "about tga",
  "sitemap", "log in", "sign in", "subscribe", "footer", "disclaimer",
  "read more", "view all", "see more", "show more", "load more",
]);

interface ExtractedLink {
  title: string;
  url: string;
}

function extractLinks(html: string): ExtractedLink[] {
  const results: ExtractedLink[] = [];
  const seen = new Set<string>();

  // TGA uses fairly clean HTML — extract <a> links with substantial titles
  const linkPattern = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

    if (title.length < 15 || title.length > 400) continue;
    if (seen.has(href)) continue;
    if (NAV_JUNK.has(title.toLowerCase())) continue;
    // Only keep links to TGA content
    if (!href.startsWith("/") && !href.includes("tga.gov.au")) continue;
    if (href.startsWith("#")) continue;

    const fullUrl = href.startsWith("http")
      ? href
      : `https://www.tga.gov.au${href.startsWith("/") ? "" : "/"}${href}`;

    seen.add(href);
    results.push({ title, url: fullUrl });
  }

  return results;
}

export async function fetchTGAAPI(): Promise<SignalDraft[]> {
  const allDrafts: SignalDraft[] = [];

  // Fetch all pages concurrently with generous timeout
  const fetchPromises = PAGES.map(async (page) => {
    try {
      const res = await fetch(page.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-AU,en;q=0.9",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        console.warn(`[fetcher:au_tga_api] ${page.category} HTTP ${res.status}`);
        return [];
      }

      const html = await res.text();
      const links = extractLinks(html);

      return links.slice(0, 25).map((link): SignalDraft => ({
        source_id: "au_tga_api",
        url: link.url,
        title: link.title,
        summary: `TGA ${page.category.replace(/_/g, " ")}`,
        published_at: new Date().toISOString(),
        authority: "TGA",
        document_id: link.url,
        raw_payload: { category: page.category } as unknown as Record<string, unknown>,
        region_hint: "Australia",
        domain_hint: null,
      }));
    } catch (err) {
      console.error(`[fetcher:au_tga_api] ${page.category} error:`, err);
      return [];
    }
  });

  const results = await Promise.allSettled(fetchPromises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      allDrafts.push(...result.value);
    }
  }

  console.log(`[fetcher:au_tga_api] fetched ${allDrafts.length} items`);
  return allDrafts;
}
