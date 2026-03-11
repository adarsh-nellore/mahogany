import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchTUVSudStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.tuvsud.com/en/industries/healthcare-and-medical-devices/medical-devices-and-ivd",
    "standards_tuv_sud",
    { authority: "TÜV SÜD", region_hint: "EU", domain_hint: "devices", maxItems: 15 }
  );
}
