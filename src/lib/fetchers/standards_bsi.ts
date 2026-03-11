import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchBSIStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.bsigroup.com/en-GB/insights-and-media/insights/medical-devices/",
    "standards_bsi",
    { authority: "BSI Group", region_hint: "UK", domain_hint: "devices", maxItems: 15 }
  );
}
