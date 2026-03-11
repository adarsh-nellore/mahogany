import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

/**
 * FDA guidance documents.
 *
 * FDA does not provide a unified RSS for guidance documents.
 * We scrape the FDA guidance search page using Firecrawl extract mode
 * to get recently published/updated guidance documents.
 */
export async function fetchFDAGuidanceRSS(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.fda.gov/regulatory-information/search-fda-guidance-documents",
    "us_fda_guidance_rss",
    {
      authority: "FDA",
      region_hint: "US",
      domain_hint: null,
      maxItems: 30,
      extractPrompt:
        "Extract all FDA guidance documents listed on this page. For each guidance document return: title (guidance document name), url (direct link to the guidance on fda.gov), date (issue or revision date), summary (brief scope description if available). Focus on actual guidance documents, not navigation or header elements.",
    }
  );
}
