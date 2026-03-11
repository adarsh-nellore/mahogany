import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMAGuidelinesRSS(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-guidelines",
    "eu_ema_guidelines_rss",
    {
      authority: "EMA",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 20,
      extractPrompt:
        "Extract all EMA scientific guidelines listed on this page. For each guideline return: title (guideline name and reference number), url (direct link to the guideline document on ema.europa.eu), date (adoption or revision date), summary.",
    }
  );
}
