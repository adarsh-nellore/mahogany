import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/drugsfda.json";

export async function fetchOrangeBook(): Promise<SignalDraft[]> {
  const url = `${ENDPOINT}?search=products.active_ingredients.name:*&limit=50&sort=submissions.submission_status_date:desc`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_fda_orange_book] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => {
      const products = (r.products || []) as Record<string, unknown>[];
      const first = products[0] || {};
      const ingredients = (first.active_ingredients || []) as Record<string, string>[];
      const brandName = (first.brand_name as string) || "Unknown";
      const ingredientName = ingredients[0]?.name || "Unknown";

      return {
        source_id: "us_fda_orange_book",
        url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${r.application_number}`,
        title: `Drug Approval: ${brandName} (${ingredientName})`,
        summary: `Application ${r.application_number || "N/A"}, sponsor: ${r.sponsor_name || "N/A"}`,
        published_at: new Date().toISOString(),
        authority: "FDA / Orange Book",
        document_id: (r.application_number as string) || null,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "pharma" as const,
      };
    });

    console.log(`[fetcher:us_fda_orange_book] fetched ${drafts.length} drug records`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_fda_orange_book] error:", err);
    return [];
  }
}
