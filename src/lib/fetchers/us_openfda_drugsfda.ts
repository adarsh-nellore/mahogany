import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/drugsfda.json";

export async function fetchOpenFDADrugsFDA(): Promise<SignalDraft[]> {
  try {
    const res = await fetch(`${ENDPOINT}?limit=15&sort=submissions.submission_status_date:desc`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_drugsfda] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results = data.results || [];
    const drafts: SignalDraft[] = results.map(
      (r: Record<string, unknown>) => {
        const openfda = (r.openfda || {}) as Record<string, string[]>;
        const brandName = openfda.brand_name?.[0] || "Unknown";
        const genericName = openfda.generic_name?.[0] || "";
        const submissions = (r.submissions || []) as Record<string, unknown>[];
        const latest = submissions[0] || {};

        return {
          source_id: "us_openfda_drugsfda",
          url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${r.application_number}`,
          title: `Drug Approval: ${brandName} (${genericName}) — ${latest.submission_type || ""} ${latest.submission_number || ""}`.trim(),
          summary: `Application ${r.application_number}, sponsor: ${r.sponsor_name || "N/A"}`,
          published_at: new Date().toISOString(),
          authority: "FDA CDER / Drugs@FDA",
          document_id: (r.application_number as string) || null,
          raw_payload: r,
          region_hint: "US" as const,
          domain_hint: "pharma" as const,
        };
      }
    );

    console.log(`[fetcher:us_openfda_drugsfda] fetched ${drafts.length} drug records`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_drugsfda] error:", err);
    return [];
  }
}
