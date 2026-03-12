import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/ndc.json";

export async function fetchFDANDC(): Promise<SignalDraft[]> {
  const now = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = now.toISOString().split("T")[0].replace(/-/g, "");

  const url = `${ENDPOINT}?search=marketing_start_date:[${sinceStr}+TO+${nowStr}]&limit=10&sort=marketing_start_date:desc`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_fda_ndc] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => ({
      source_id: "us_fda_ndc",
      url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${r.product_ndc}`,
      title: `New Drug Listing: ${r.brand_name || "Unknown"} (${r.generic_name || "Unknown"})`,
      summary: `NDC: ${r.product_ndc || "N/A"}, Route: ${r.route || "N/A"}, Dosage form: ${r.dosage_form || "N/A"}`,
      published_at: formatOpenFDADate(r.marketing_start_date as string),
      authority: "FDA / NDC Directory",
      document_id: (r.product_ndc as string) || null,
      raw_payload: r,
      region_hint: "US" as const,
      domain_hint: "pharma" as const,
    }));

    console.log(`[fetcher:us_fda_ndc] fetched ${drafts.length} drug listings`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_fda_ndc] error:", err);
    return [];
  }
}

function formatOpenFDADate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
