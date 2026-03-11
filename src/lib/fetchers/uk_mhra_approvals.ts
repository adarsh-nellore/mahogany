import { SignalDraft } from "../types";
import { fetchRSS, fetchPageSignals } from "./helpers";

/**
 * MHRA product approvals. Try the gov.uk publications Atom feed first;
 * fall back to Firecrawl extraction of the MHRA products portal.
 */
export async function fetchMHRAApprovals(): Promise<SignalDraft[]> {
  const rss = await fetchRSS({
    source_id: "uk_mhra_approvals",
    url: "https://www.gov.uk/search/all.atom?keywords=mhra+approval&order=updated-newest",
    authority: "MHRA",
    region_hint: "UK",
    domain_hint: null,
    maxAgeHours: 336, // 2 weeks — MHRA approvals are infrequent
  });
  if (rss.length > 0) return rss;

  return fetchPageSignals(
    "https://products.mhra.gov.uk/",
    "uk_mhra_approvals",
    {
      authority: "MHRA",
      region_hint: "UK",
      domain_hint: null,
      maxItems: 30,
      extractPrompt:
        "Extract all approved medicines and medical devices listed or linked on this page. For each item return: title (product name), url (product page link), date (approval date), summary.",
    }
  );
}
