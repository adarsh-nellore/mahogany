import { SignalDraft } from "../types";
import { fetchWithRetry, recordDiagnostic, updateSourceState } from "../fetchRetry";

const SOURCE_ID = "us_congress_gov";
const API_BASE = "https://api.congress.gov/v3";

interface CongressBill {
  number: number;
  title: string;
  type: string;
  url: string;
  latestAction?: { actionDate: string; text: string };
  originChamber: string;
}

/**
 * Fetch recent health-related bills from Congress.gov API.
 * Requires CONGRESS_API_KEY env var (free from api.congress.gov).
 */
export async function fetchCongressGov(): Promise<SignalDraft[]> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    console.warn(`[fetcher:${SOURCE_ID}] CONGRESS_API_KEY not set, skipping`);
    return [];
  }

  const startMs = Date.now();
  try {
    // Search for health/FDA/drug/device-related bills from this Congress session
    const { response } = await fetchWithRetry(
      `${API_BASE}/bill?limit=50&sort=updateDate+desc&api_key=${apiKey}`,
      {
        sourceId: SOURCE_ID,
        parserUsed: "congress_api",
        timeoutMs: 15000,
        maxRetries: 1,
        headers: { Accept: "application/json" },
      }
    );

    if (!response.ok) {
      recordDiagnostic(SOURCE_ID, API_BASE, {
        http_status: response.status,
        response_time_ms: Date.now() - startMs,
        parser_used: "congress_api",
        error_code: `http_${response.status}`,
      }).catch(() => {});
      return [];
    }

    const data = await response.json();
    const bills: CongressBill[] = data?.bills || [];

    // Filter for health/FDA/drug/device keywords
    const healthKeywords = /\b(fda|drug|device|medical|health|pharma|biologic|vaccine|clinical trial|patient safety|opioid|medicaid|medicare)\b/i;
    const healthBills = bills.filter((b) => healthKeywords.test(b.title));

    const drafts: SignalDraft[] = healthBills.map((bill) => ({
      source_id: SOURCE_ID,
      url: bill.url || `https://www.congress.gov/bill/${bill.type.toLowerCase()}/${bill.number}`,
      title: `${bill.type} ${bill.number}: ${bill.title}`.slice(0, 300),
      summary: bill.latestAction?.text || "",
      published_at: bill.latestAction?.actionDate || new Date().toISOString(),
      authority: "Congress.gov",
      document_id: `congress_${bill.type}_${bill.number}`,
      raw_payload: bill as unknown as Record<string, unknown>,
      region_hint: "US",
      domain_hint: null,
    }));

    updateSourceState(SOURCE_ID, {}).catch(() => {});
    console.log(`[fetcher:${SOURCE_ID}] fetched ${drafts.length} health-related bills`);
    return drafts;
  } catch (err) {
    console.error(`[fetcher:${SOURCE_ID}] error:`, err);
    updateSourceState(SOURCE_ID, { failure: true }).catch(() => {});
    return [];
  }
}
