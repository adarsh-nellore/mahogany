import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchSGSStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.sgs.com/en/our-services/life-sciences/medical-devices",
    "standards_sgs",
    { authority: "SGS", region_hint: "Global", domain_hint: "devices", maxItems: 15 }
  );
}
