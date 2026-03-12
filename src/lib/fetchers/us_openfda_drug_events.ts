import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/drug/event.json";

export async function fetchOpenFDADrugEvents(): Promise<SignalDraft[]> {
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const url = `${ENDPOINT}?search=receivedate:[${sinceStr}+TO+${nowStr}]&limit=100&sort=receivedate:desc`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_drug_events] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => {
      const drugs = (r.patient as Record<string, unknown>)?.drug as Record<string, unknown>[] | undefined;
      const drugName = drugs?.[0]?.medicinalproduct as string || "Unknown drug";
      const reactions = ((r.patient as Record<string, unknown>)?.reaction as Record<string, unknown>[] | undefined)
        ?.map((rx) => rx.reactionmeddrapt as string)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ") || "N/A";
      const serious = r.serious === "1" ? "Serious" : "Non-serious";

      return {
        source_id: "us_openfda_drug_events",
        url: "https://www.fda.gov/drugs/drug-safety-and-availability",
        title: `Adverse Event: ${drugName} — ${reactions}`.slice(0, 300),
        summary: `${serious} adverse event report. Drug: ${drugName}. Reactions: ${reactions}.`,
        published_at: formatOpenFDADate(r.receivedate as string),
        authority: "FDA / openFDA",
        document_id: (r.safetyreportid as string) || null,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "pharma" as const,
      };
    });

    console.log(`[fetcher:us_openfda_drug_events] fetched ${drafts.length} adverse events`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_drug_events] error:", err);
    return [];
  }
}

function formatOpenFDADate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
