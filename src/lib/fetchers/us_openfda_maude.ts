import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/device/event.json";

export async function fetchOpenFDAMAUDE(): Promise<SignalDraft[]> {
  const now = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = now.toISOString().split("T")[0].replace(/-/g, "");

  const url = `${ENDPOINT}?search=date_received:[${sinceStr}+TO+${nowStr}]&limit=100`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_maude] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => {
      const devices = (r.device || []) as Record<string, unknown>[];
      const brandName = (devices[0]?.brand_name as string) || "Unknown Device";
      const eventType = (r.event_type as string) || "Unknown";
      const mdrTexts = (r.mdr_text || []) as Record<string, unknown>[];
      const narrativeText = ((mdrTexts[0]?.text as string) || "").slice(0, 500);

      return {
        source_id: "us_openfda_maude",
        url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/detail.cfm?mdrfoi__id=${r.mdr_report_key}`,
        title: `Device Event: ${brandName} — ${eventType}`,
        summary: narrativeText,
        published_at: formatOpenFDADate(r.date_received as string),
        authority: "FDA CDRH / MAUDE",
        document_id: (r.mdr_report_key as string) || null,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "devices" as const,
      };
    });

    console.log(`[fetcher:us_openfda_maude] fetched ${drafts.length} adverse events`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_maude] error:", err);
    return [];
  }
}

function formatOpenFDADate(d: string | undefined): string {
  if (!d || d.length !== 8) return new Date().toISOString();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
