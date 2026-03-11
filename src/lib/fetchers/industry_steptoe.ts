import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchSteptoe(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.steptoe.com/en/news-publications/regulatory-pulse-pharma-and-medical-devices-newsletter.html",
    "industry_steptoe",
    { authority: "Steptoe LLP", region_hint: null, domain_hint: null, maxItems: 15 }
  );
}
