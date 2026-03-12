/**
 * Custom EMA fetcher.
 *
 * EMA's news page has a very specific HTML structure:
 *   <div class="teaser-title card-title bcl-heading">
 *     <a class="standalone" href="/en/news/...">Title text</a>
 *   </div>
 *
 * We target only these article links to avoid navigation chrome.
 * Also fetches CHMP highlights and referral procedures pages.
 */

import { SignalDraft } from "../types";

const PAGES = [
  {
    url: "https://www.ema.europa.eu/en/news",
    category: "news",
    // EMA news page uses teaser-title cards for article links
    pattern: /<a\s+class="standalone"\s+href="(\/en\/news\/[^"]+)"[^>]*>([^<]+)<\/a>/gi,
  },
  {
    url: "https://www.ema.europa.eu/en/committees/chmp/chmp-agendas-minutes-highlights",
    category: "chmp",
    // CHMP page uses same standalone link pattern
    pattern: /<a\s+class="standalone"\s+href="(\/en\/[^"]+)"[^>]*>([^<]{20,400})<\/a>/gi,
  },
  {
    url: "https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/referral-procedures-human-medicines",
    category: "referral",
    pattern: /<a\s+class="standalone"\s+href="(\/en\/[^"]+)"[^>]*>([^<]{20,400})<\/a>/gi,
  },
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Known navigation link titles to exclude
const EMA_NAV = new Set([
  "committees & working parties",
  "website data protection notice",
  "data protection at ema",
  "frequently asked questions",
  "ema service desk (system support)",
  "services and databases",
]);

export async function fetchEMAAPI(): Promise<SignalDraft[]> {
  const allDrafts: SignalDraft[] = [];

  for (const page of PAGES) {
    try {
      const res = await fetch(page.url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        console.warn(`[fetcher:eu_ema_api] ${page.category} HTTP ${res.status}`);
        continue;
      }

      const html = await res.text();
      const seen = new Set<string>();
      const drafts: SignalDraft[] = [];

      let match: RegExpExecArray | null;
      while ((match = page.pattern.exec(html)) !== null) {
        const href = match[1];
        const title = match[2].replace(/\s+/g, " ").trim();

        if (title.length < 20 || seen.has(href)) continue;
        if (EMA_NAV.has(title.toLowerCase())) continue;

        seen.add(href);
        const fullUrl = `https://www.ema.europa.eu${href}`;
        drafts.push({
          source_id: "eu_ema_api",
          url: fullUrl,
          title,
          summary: `EMA ${page.category}`,
          published_at: new Date().toISOString(),
          authority: "EMA",
          document_id: fullUrl,
          raw_payload: { category: page.category } as unknown as Record<string, unknown>,
          region_hint: "EU",
          domain_hint: null,
        });
      }
      // Reset regex lastIndex for next call
      page.pattern.lastIndex = 0;

      allDrafts.push(...drafts.slice(0, 30));
    } catch (err) {
      console.error(`[fetcher:eu_ema_api] ${page.category} error:`, err);
    }
  }

  console.log(`[fetcher:eu_ema_api] fetched ${allDrafts.length} items`);
  return allDrafts;
}
