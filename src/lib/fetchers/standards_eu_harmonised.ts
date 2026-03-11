import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEUHarmonisedStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://ec.europa.eu/growth/single-market/european-standards/harmonised-standards/medical-devices_en",
    "standards_eu_harmonised",
    {
      authority: "European Commission",
      region_hint: "EU",
      domain_hint: "devices",
      maxItems: 20,
      extractPrompt:
        "Extract all harmonised standards listed for medical devices. For each standard return: title (standard number and title), url (link to the standard), date (publication date in the Official Journal).",
    }
  );
}
