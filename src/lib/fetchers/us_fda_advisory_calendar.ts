import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchFDAAdvisoryCalendar(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.fda.gov/advisory-committees/advisory-committee-calendar",
    "us_fda_advisory_calendar",
    {
      authority: "FDA Advisory Committees",
      region_hint: "US",
      domain_hint: null,
      maxItems: 20,
      extractPrompt:
        "Extract all upcoming FDA advisory committee meetings from this calendar. For each meeting return: title (committee name and topic/drug under review), url (meeting page link), date (meeting date), summary (agenda or drug being reviewed).",
    }
  );
}
