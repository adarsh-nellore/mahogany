/**
 * Custom PMDA (Japan) fetcher.
 *
 * PMDA's English review reports page has a large HTML table with columns:
 *   Brand Name | Active Ingredient | Date | English PDF | Japanese PDF
 *
 * We parse this table to extract individual drug approvals. The safety
 * information page similarly has structured content we can extract.
 */

import { SignalDraft } from "../types";

interface PMDAEntry {
  brandName: string;
  ingredient: string;
  date: string;
  pdfUrl: string | null;
}

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Parse PMDA's review reports table.
 * Table rows contain: <td>BrandName</td><td>Ingredient</td><td>Date</td><td><a href="pdf">...</a></td>
 */
function parseReviewTable(html: string): PMDAEntry[] {
  const entries: PMDAEntry[] = [];

  // Match table rows with at least 3 <td> elements
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    // Extract all <td> contents
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdPattern.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
    }

    // We need at least 3 cells: brand name, ingredient, date
    if (cells.length < 3) continue;

    const brandName = cells[0].replace(/\(.*?\)/g, "").trim();
    const ingredient = cells[1].trim();
    const date = cells[2].trim();

    // Skip header rows, alphabet index rows, and empty rows
    if (!brandName || brandName.length < 3 || brandName.length > 100) continue;
    if (/^(brand|product|name|no\.?|#|\d+)$/i.test(brandName)) continue;
    if (/^[A-Z]$/.test(brandName)) continue; // alphabet index

    // Extract PDF link if present
    const pdfMatch = rowHtml.match(/<a[^>]+href="([^"]+\.pdf)"/i);
    const pdfUrl = pdfMatch
      ? pdfMatch[1].startsWith("http") ? pdfMatch[1] : `https://www.pmda.go.jp${pdfMatch[1]}`
      : null;

    entries.push({ brandName, ingredient, date, pdfUrl });
  }

  return entries;
}

/**
 * Parse PMDA's safety information page for alert/letter links.
 */
function parseSafetyLinks(html: string): { title: string; url: string }[] {
  const results: { title: string; url: string }[] = [];
  const seen = new Set<string>();

  // Look for links to specific safety information pages (not navigation)
  const linkPattern = /<a[^>]+href="(\/english\/safety\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

    if (title.length < 15 || title.length > 300) continue;
    if (seen.has(href)) continue;
    // Skip general navigation
    if (/^(outline|regulatory|public comments|faq)$/i.test(title)) continue;

    seen.add(href);
    results.push({ title, url: `https://www.pmda.go.jp${href}` });
  }

  return results;
}

export async function fetchPMDAAPI(): Promise<SignalDraft[]> {
  const allDrafts: SignalDraft[] = [];

  // Fetch review reports page (drug approvals table)
  try {
    const res = await fetch(
      "https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0001.html",
      {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "en" },
        signal: AbortSignal.timeout(25000),
      }
    );

    if (res.ok) {
      const html = await res.text();
      const entries = parseReviewTable(html);

      // Take most recent entries (table is sorted alphabetically, not by date)
      // Sort by date descending to get newest approvals
      const sorted = entries
        .filter((e) => e.date && /\d{4}/.test(e.date))
        .sort((a, b) => {
          const da = new Date(a.date);
          const db = new Date(b.date);
          return db.getTime() - da.getTime();
        });

      for (const entry of sorted.slice(0, 40)) {
        allDrafts.push({
          source_id: "jp_pmda_api",
          url: entry.pdfUrl || "https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0001.html",
          title: `PMDA Review Report: ${entry.brandName} (${entry.ingredient})`,
          summary: `Approved ${entry.date}`,
          published_at: new Date(entry.date).toISOString() || new Date().toISOString(),
          authority: "PMDA",
          document_id: entry.pdfUrl || `pmda_${entry.brandName}`,
          raw_payload: entry as unknown as Record<string, unknown>,
          region_hint: "Japan",
          domain_hint: "pharma",
        });
      }
    }
  } catch (err) {
    console.error("[fetcher:jp_pmda_api] review reports error:", err);
  }

  // Fetch safety information page
  try {
    const res = await fetch(
      "https://www.pmda.go.jp/english/safety/info-services/drugs/esc-rsc/0001.html",
      {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "en" },
        signal: AbortSignal.timeout(25000),
      }
    );

    if (res.ok) {
      const html = await res.text();
      const links = parseSafetyLinks(html);

      for (const link of links.slice(0, 20)) {
        allDrafts.push({
          source_id: "jp_pmda_api",
          url: link.url,
          title: link.title,
          summary: "PMDA safety information",
          published_at: new Date().toISOString(),
          authority: "PMDA",
          document_id: link.url,
          raw_payload: { category: "safety" } as unknown as Record<string, unknown>,
          region_hint: "Japan",
          domain_hint: "pharma",
        });
      }
    }
  } catch (err) {
    console.error("[fetcher:jp_pmda_api] safety info error:", err);
  }

  console.log(`[fetcher:jp_pmda_api] fetched ${allDrafts.length} items`);
  return allDrafts;
}
