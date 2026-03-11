import { SignalDraft } from "../types";

const ENDPOINT = "https://api.fda.gov/device/classification.json";

export async function fetchOpenFDADeviceClassification(): Promise<SignalDraft[]> {
  const url = `${ENDPOINT}?search=regulation_number:*&limit=50&sort=date_premarket_notification:desc`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:us_openfda_classification] HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = data.results || [];
    const drafts: SignalDraft[] = results.map((r) => ({
      source_id: "us_openfda_classification",
      url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm?id=${r.product_code}`,
      title: `Device Classification: ${r.device_name || "Unknown Device"}`,
      summary: `Product code: ${r.product_code || "N/A"}, Class: ${r.device_class || "N/A"}, Regulation: ${r.regulation_number || "N/A"}`,
      published_at: new Date().toISOString(),
      authority: "FDA CDRH / openFDA",
      document_id: (r.product_code as string) || null,
      raw_payload: r,
      region_hint: "US" as const,
      domain_hint: "devices" as const,
    }));

    console.log(`[fetcher:us_openfda_classification] fetched ${drafts.length} classifications`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:us_openfda_classification] error:", err);
    return [];
  }
}
