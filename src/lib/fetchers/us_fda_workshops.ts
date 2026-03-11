import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchFDAWorkshops(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.fda.gov/science-research/fda-meetings-conferences-and-workshops",
    "us_fda_workshops",
    {
      authority: "FDA",
      region_hint: "US",
      domain_hint: null,
      maxItems: 20,
      extractPrompt:
        "Extract all upcoming or recent FDA meetings, conferences, and workshops. For each item return: title (event name), url (event page link), date (event date), summary (topic and registration info if available).",
    }
  );
}
