import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/drugsfda.json";

export async function fetchOpenFDADrugSubmissions(): Promise<SignalDraft[]> {
  // Query recent submissions including CRLs (Complete Response Letters)
  const url = `${ENDPOINT}?search=submissions.submission_status_date:[${dateRange()}]&limit=100`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_drug_submissions] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = [];

    for (const r of results) {
      const openfda = r.openfda as Record<string, unknown> | undefined;
      const brandName = (openfda?.brand_name as string[])?.[0] || "";
      const genericName = (openfda?.generic_name as string[])?.[0] || "";
      const appNo = r.application_number as string || "";
      const submissions = r.submissions as Record<string, unknown>[] | undefined;

      // Focus on the most recent submission
      const sub = submissions?.[0];
      if (!sub) continue;

      const subType = sub.submission_type as string || "";
      const subStatus = sub.submission_status as string || "";
      const subDate = sub.submission_status_date as string || "";
      const isCRL = subStatus?.toUpperCase().includes("TENTATIVE") ||
                    subStatus?.toUpperCase().includes("COMPLETE RESPONSE");

      const label = isCRL ? "CRL" : subStatus || subType;
      const drugLabel = brandName || genericName || appNo || "Unknown";

      drafts.push({
        source_id: "us_openfda_drug_submissions",
        url: `https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appNo.replace(/\D/g, "")}`,
        title: `${label}: ${drugLabel} (${appNo})`.slice(0, 300),
        summary: `Submission: ${subType} ${subStatus}. Drug: ${drugLabel}. Application: ${appNo}.`,
        published_at: formatDate(subDate),
        authority: "FDA / openFDA",
        document_id: `${appNo}-${subType}-${subDate}`,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "pharma" as const,
      });
    }

    console.log(`[fetcher:us_openfda_drug_submissions] fetched ${drafts.length} submissions`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_drug_submissions] error:", err);
    return [];
  }
}

function dateRange(): string {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  return `${sinceStr}+TO+${nowStr}`;
}

function formatDate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
