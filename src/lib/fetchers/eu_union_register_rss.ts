import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

/**
 * EU Community Register of medicinal products.
 * No valid RSS feed — uses Firecrawl structured extraction.
 */
export async function fetchEUUnionRegisterRSS(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://ec.europa.eu/health/documents/community-register/html/index_en.htm",
    "eu_union_register_rss",
    {
      authority: "EU Community Register",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 20,
      extractPrompt:
        "Extract all medicinal product authorisation decisions, referrals, or updates listed on this page. For each item return: title (product name and decision type), url, date, summary.",
    }
  );
}
