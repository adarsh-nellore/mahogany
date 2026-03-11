import { SignalDraft } from "../types";
import { fetchRSS, fetchPageSignals } from "./helpers";

export async function fetchRAPSRSS(): Promise<SignalDraft[]> {
  // Try RSS first; RAPS feed sometimes has malformed XML
  const rssDrafts = await fetchRSS({
    source_id: "industry_raps_rss",
    url: "https://www.raps.org/rss/news",
    authority: "RAPS Regulatory Focus",
    region_hint: null,
    domain_hint: null,
  });

  if (rssDrafts.length > 0) return rssDrafts;

  // Fallback to Firecrawl structured extraction
  return fetchPageSignals("https://www.raps.org/news", "industry_raps_rss", {
    authority: "RAPS Regulatory Focus",
    region_hint: null,
    domain_hint: null,
    maxItems: 15,
  });
}
