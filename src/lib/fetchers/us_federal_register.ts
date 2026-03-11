import { SignalDraft } from "../types";

const FR_API_BASE = "https://www.federalregister.gov/api/v1/articles.json";

interface FRArticle {
  document_number: string;
  title: string;
  abstract: string | null;
  html_url: string;
  publication_date: string;
  type: string;
  agencies: { name: string; raw_name: string; id: number }[];
  subtype: string | null;
  action: string | null;
  docket_ids: string[];
  citation: string | null;
  excerpts?: string;
}

interface FRResponse {
  count: number;
  results: FRArticle[];
  next_page_url: string | null;
}

const FIELDS = [
  "document_number", "title", "abstract", "html_url",
  "publication_date", "type", "agencies", "subtype",
  "action", "docket_ids", "citation", "excerpts",
];

/**
 * Reference fetcher: Federal Register API.
 * Pulls FDA-related documents published in the last 24 hours.
 */
export async function fetchFederalRegister(): Promise<SignalDraft[]> {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  const dateStr = since.toISOString().split("T")[0];

  // Build URL manually because the FR API uses PHP-style bracket params
  // that URLSearchParams double-encodes
  const fieldParams = FIELDS.map((f) => `fields[]=${f}`).join("&");
  const url =
    `${FR_API_BASE}?conditions[agencies][]=food-and-drug-administration` +
    `&conditions[publication_date][gte]=${dateStr}` +
    `&per_page=100&order=newest&${fieldParams}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(
        `[fetcher:us_federal_register] HTTP ${res.status}: ${res.statusText}`
      );
      return [];
    }

    const data: FRResponse = await res.json();
    const drafts: SignalDraft[] = data.results.map((article) => ({
      source_id: "us_federal_register",
      url: article.html_url,
      title: article.title,
      summary: article.abstract || article.excerpts || "",
      published_at: article.publication_date,
      authority: "Federal Register / FDA",
      document_id: article.document_number,
      raw_payload: article as unknown as Record<string, unknown>,
      region_hint: "US",
      domain_hint: null,
    }));

    console.log(
      `[fetcher:us_federal_register] fetched ${drafts.length} articles since ${dateStr}`
    );
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_federal_register] error:", err);
    return [];
  }
}
