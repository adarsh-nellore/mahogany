import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchULStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ul.com/insights?topics=medical-devices",
    "standards_ul",
    { authority: "UL Solutions", region_hint: "Global", domain_hint: "devices", maxItems: 15 }
  );
}
