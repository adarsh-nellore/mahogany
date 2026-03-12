/**
 * Custom MHRA fetcher via GOV.UK Content API.
 *
 * MHRA publishes via GOV.UK search API which is public, fast, and reliable.
 * Much better than Atom feeds which sometimes block non-browser user agents.
 *
 * Fetches drug alerts, device alerts, and guidance updates.
 */

import { SignalDraft } from "../types";

const SEARCH_URL =
  "https://www.gov.uk/api/search.json?filter_organisations=medicines-and-healthcare-products-regulatory-agency&count=40&order=-public_timestamp";

interface GovUKResult {
  title: string;
  link: string;
  description?: string;
  public_timestamp?: string;
  document_type?: string;
  [key: string]: unknown;
}

interface GovUKResponse {
  results: GovUKResult[];
  total: number;
}

export async function fetchMHRAAPI(): Promise<SignalDraft[]> {
  try {
    const res = await fetch(SEARCH_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mahogany-RI/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[fetcher:uk_mhra_api] HTTP ${res.status}`);
      return [];
    }

    const data: GovUKResponse = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    const drafts: SignalDraft[] = results
      .filter((r) => r.title && r.link)
      .slice(0, 40)
      .map((r) => ({
        source_id: "uk_mhra_api",
        url: r.link.startsWith("http") ? r.link : `https://www.gov.uk${r.link}`,
        title: r.title,
        summary: r.description || "",
        published_at: r.public_timestamp || new Date().toISOString(),
        authority: "MHRA",
        document_id: r.link,
        raw_payload: r as unknown as Record<string, unknown>,
        region_hint: "UK",
        domain_hint: null,
      }));

    console.log(`[fetcher:uk_mhra_api] fetched ${drafts.length} items`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:uk_mhra_api] error:", err);
    return [];
  }
}
