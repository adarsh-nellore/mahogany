import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchDEKRAStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.dekra.com/en/medical-devices/",
    "standards_dekra",
    { authority: "DEKRA", region_hint: "EU", domain_hint: "devices", maxItems: 15 }
  );
}
