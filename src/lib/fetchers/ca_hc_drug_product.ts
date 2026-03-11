import { SignalDraft } from "../types";

const ENDPOINT =
  "https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json&status=1";

interface HCDrugProduct {
  drug_code: number;
  brand_name: string;
  descriptor: string;
  company_name: string;
  ai_group_no: string;
  class_name: string;
  last_update_date: string;
  [key: string]: unknown;
}

export async function fetchHCDrugProduct(): Promise<SignalDraft[]> {
  try {
    const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error(`[fetcher:ca_hc_drug_product] HTTP ${res.status}`);
      return [];
    }

    const data: HCDrugProduct[] = await res.json();
    const results = Array.isArray(data) ? data.slice(0, 50) : [];

    const drafts: SignalDraft[] = results.map((r) => ({
      source_id: "ca_hc_drug_product",
      url: `https://health-products.canada.ca/dpd-bdpp/info?lang=en&code=${r.drug_code}`,
      title: `HC Drug Product: ${r.brand_name || "Unknown"} (${r.descriptor || "N/A"})`,
      summary: `Company: ${r.company_name || "N/A"} — AI Group: ${r.ai_group_no || "N/A"} — Class: ${r.class_name || "N/A"}`,
      published_at: r.last_update_date || new Date().toISOString(),
      authority: "Health Canada",
      document_id: r.drug_code != null ? String(r.drug_code) : null,
      raw_payload: r as unknown as Record<string, unknown>,
      region_hint: "Global",
      domain_hint: "pharma",
    }));

    console.log(`[fetcher:ca_hc_drug_product] fetched ${drafts.length} products`);
    return drafts;
  } catch (err) {
    console.error("[fetcher:ca_hc_drug_product] error:", err);
    return [];
  }
}
