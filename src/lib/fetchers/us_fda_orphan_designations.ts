import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchFDAOrphanDesignations(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.accessdata.fda.gov/scripts/opdlisting/oopd/",
    "us_fda_orphan_designations",
    {
      authority: "FDA / Orphan Products",
      region_hint: "US",
      domain_hint: "pharma",
      maxItems: 30,
      extractPrompt:
        "Extract all orphan drug designation entries. For each item return: title (drug name and designated indication), url (link to the designation record), date (designation date), summary (sponsor name and designation number).",
    }
  );
}
