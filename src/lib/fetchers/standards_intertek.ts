import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchIntertekStandards(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.intertek.com/medical/regulatory-updates/",
    "standards_intertek",
    { authority: "Intertek", region_hint: "Global", domain_hint: "devices", maxItems: 15 }
  );
}
