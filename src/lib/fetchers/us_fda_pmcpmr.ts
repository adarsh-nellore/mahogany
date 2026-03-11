import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchFDAPMCPMR(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.accessdata.fda.gov/scripts/cder/pmc/index.cfm",
    "us_fda_pmcpmr",
    {
      authority: "FDA / PMC-PMR Database",
      region_hint: "US",
      domain_hint: null,
      maxItems: 30,
      extractPrompt:
        "Extract all post-market commitment (PMC) and post-market requirement (PMR) entries. For each item return: title (drug name and commitment description), url, date (due date or last updated), summary (status and sponsor).",
    }
  );
}
