import { SignalDraft } from "../types";

const ENDPOINT = "https://clinicaltrials.gov/api/v2/studies";

export async function fetchClinicalTrials(): Promise<SignalDraft[]> {
  const since = new Date();
  since.setDate(since.getDate() - 3);
  const minDate = since.toISOString().split("T")[0];

  // ClinicalTrials.gov v2 uses filter.advanced with AREA[field]RANGE[min,MAX] syntax
  const filterExpr = `AREA[LastUpdatePostDate]RANGE[${minDate},MAX]`;

  const params = new URLSearchParams({
    "filter.advanced": filterExpr,
    pageSize: "50",
    format: "json",
  });

  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[fetcher:clinicaltrials] HTTP ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }

    const data = await res.json();
    const studies = data.studies || [];
    const drafts: SignalDraft[] = studies.map(
      (study: Record<string, unknown>) => {
        const proto = (study.protocolSection || {}) as Record<string, unknown>;
        const idMod = (proto.identificationModule || {}) as Record<string, unknown>;
        const statusMod = (proto.statusModule || {}) as Record<string, unknown>;
        const designMod = (proto.designModule || {}) as Record<string, unknown>;
        const sponsorMod = (proto.sponsorCollaboratorsModule || {}) as Record<string, unknown>;
        const leadSponsor = (sponsorMod.leadSponsor || {}) as Record<string, string>;
        const condMod = (proto.conditionsModule || {}) as Record<string, string[]>;

        const nctId = (idMod.nctId as string) || "";
        const title = (idMod.briefTitle as string) || "(no title)";
        const status = (statusMod.overallStatus as string) || "";
        const phases = ((designMod.phases as string[]) || []).join(", ");
        const conditions = (condMod.conditions || []).join(", ");
        const lastUpdate = (statusMod.lastUpdatePostDateStruct as Record<string, string>)?.date || "";

        return {
          source_id: "clinicaltrials",
          url: `https://clinicaltrials.gov/study/${nctId}`,
          title,
          summary: `Status: ${status}. Phase: ${phases || "N/A"}. Conditions: ${conditions || "N/A"}. Sponsor: ${leadSponsor.name || "N/A"}.`,
          published_at: lastUpdate || new Date().toISOString(),
          authority: "ClinicalTrials.gov",
          document_id: nctId,
          raw_payload: study,
          region_hint: null,
          domain_hint: null,
        };
      }
    );

    console.log(`[fetcher:clinicaltrials] fetched ${drafts.length} studies`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:clinicaltrials] error:", err);
    return [];
  }
}
