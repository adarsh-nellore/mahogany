import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/enforcement.json";

export async function fetchOpenFDADrugEnforcement(): Promise<SignalDraft[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  // openFDA uses Lucene-style range queries; brackets must not be double-encoded
  const url = `${ENDPOINT}?search=report_date:[${sinceStr}+TO+${nowStr}]&limit=100`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_drug_enforcement] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => ({
      source_id: "us_openfda_drug_enforcement",
      url: `https://api.fda.gov/drug/enforcement.json?search=recall_number:"${r.recall_number}"`,
      title: `Drug Recall: ${((r.product_description as string) || (r.reason_for_recall as string) || "Unknown").slice(0, 200)}`,
      summary: `${r.reason_for_recall || ""} — Classification: ${r.classification || "N/A"}, Status: ${r.status || "N/A"}`,
      published_at: formatOpenFDADate(r.report_date as string),
      authority: "FDA / openFDA",
      document_id: (r.recall_number as string) || null,
      raw_payload: r,
      region_hint: "US" as const,
      domain_hint: "pharma" as const,
    }));

    console.log(`[fetcher:us_openfda_drug_enforcement] fetched ${drafts.length} recalls`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_drug_enforcement] error:", err);
    return [];
  }
}

function formatOpenFDADate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
