import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/device/recall.json";

export async function fetchOpenFDADeviceRecall(): Promise<SignalDraft[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30); // 30-day window for recently initiated recalls
  const dateStr = since.toISOString().split("T")[0].replace(/-/g, "");
  const nowStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  try {
    const res = await fetch(
      // event_date_initiated = when recall was STARTED (not terminated/closed)
      `${ENDPOINT}?search=event_date_initiated:[${dateStr}+TO+${nowStr}]&limit=100`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_device_recall] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results = data.results || [];
    const drafts: SignalDraft[] = results.map(
      (r: Record<string, unknown>) => ({
        source_id: "us_openfda_device_recall",
        url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=${r.res_event_number}`,
        title: `Device Recall: ${(r.product_description as string || "").slice(0, 200)}`,
        summary: `${r.reason_for_recall || ""} — ${r.root_cause_description || ""}`.trim(),
        published_at: new Date().toISOString(),
        authority: "FDA CDRH / openFDA",
        document_id: (r.res_event_number as string) || null,
        raw_payload: r,
        region_hint: "US" as const,
        domain_hint: "devices" as const,
      })
    );

    console.log(`[fetcher:us_openfda_device_recall] fetched ${drafts.length} device recalls`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_device_recall] error:", err);
    return [];
  }
}
