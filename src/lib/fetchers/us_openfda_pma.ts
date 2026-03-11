import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/device/pma.json";

export async function fetchOpenFDAPMA(): Promise<SignalDraft[]> {
  const now = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = now.toISOString().split("T")[0].replace(/-/g, "");

  const url = `${ENDPOINT}?search=decision_date:[${sinceStr}+TO+${nowStr}]&limit=100`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_pma] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => {
      const reason = (r.supplement_reason_for_supplement as string) || "Approval";
      const name = (r.generic_name as string) || (r.trade_name as string) || "Unknown";
      const advisory = (r.advisory_committee_description as string) || "";

      return {
        source_id: "us_openfda_pma",
        url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm?id=${r.pma_number}`,
        title: `PMA ${reason}: ${name}`,
        summary: advisory
          ? `Advisory Committee: ${advisory}. Decision: ${r.decision_code || "N/A"}`
          : `Decision: ${r.decision_code || "N/A"}`,
        published_at: formatOpenFDADate(r.decision_date as string),
        authority: "FDA CDRH / openFDA",
        document_id: (r.pma_number as string) || null,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "devices" as const,
      };
    });

    console.log(`[fetcher:us_openfda_pma] fetched ${drafts.length} PMA records`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_pma] error:", err);
    return [];
  }
}

function formatOpenFDADate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
