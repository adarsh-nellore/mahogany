import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/label.json";

export async function fetchOpenFDADrugLabels(): Promise<SignalDraft[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const url = `${ENDPOINT}?search=effective_time:[${sinceStr}+TO+${nowStr}]&limit=100&sort=effective_time:desc`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_drug_labels] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => {
      const openfda = r.openfda as Record<string, unknown> | undefined;
      const brandName = (openfda?.brand_name as string[])?.[0] || "Unknown";
      const genericName = (openfda?.generic_name as string[])?.[0] || "";
      const setId = r.set_id as string || "";

      return {
        source_id: "us_openfda_drug_labels",
        url: setId ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}` : "https://dailymed.nlm.nih.gov/dailymed/",
        title: `Label Update: ${brandName}${genericName ? ` (${genericName})` : ""}`.slice(0, 300),
        summary: `Drug label updated. Brand: ${brandName}. Generic: ${genericName || "N/A"}.`,
        published_at: formatOpenFDADate(r.effective_time as string),
        authority: "FDA / openFDA",
        document_id: setId || null,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "pharma" as const,
      };
    });

    console.log(`[fetcher:us_openfda_drug_labels] fetched ${drafts.length} label updates`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_drug_labels] error:", err);
    return [];
  }
}

function formatOpenFDADate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
