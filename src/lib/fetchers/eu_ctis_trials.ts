import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

/**
 * EU Clinical Trials Information System (CTIS).
 * The public search is a JS SPA — Firecrawl extract mode is needed to pull structured results.
 * Falls back to the public CTIS search page via link extraction.
 */
export async function fetchEUCTISTrials(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://euclinicaltrials.eu/ctis-public/search",
    "eu_ctis_trials",
    {
      authority: "EU CTIS",
      region_hint: "EU",
      domain_hint: null,
      maxItems: 30,
      extractPrompt:
        "Extract all clinical trial listings visible on this page. For each trial return: title (trial title or protocol number), url (link to the trial record), date (start or last updated date), summary (indication, phase, sponsor if shown).",
    }
  );
}
