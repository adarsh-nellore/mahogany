import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchTGAAusPAR(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.tga.gov.au/resources/auspar",
    "au_tga_auspar",
    {
      authority: "TGA Australia / AusPAR",
      region_hint: "Global",
      domain_hint: null,
      maxItems: 30,
      extractPrompt:
        "Extract all Australian Public Assessment Report (AusPAR) entries. For each item return: title (medicine name and indication), url (link to the AusPAR document), date (publication date), summary.",
    }
  );
}
