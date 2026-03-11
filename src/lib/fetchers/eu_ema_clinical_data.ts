import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMAClinicalData(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://clinicaldata.ema.europa.eu/web/cdp/home",
    "eu_ema_clinical_data",
    { authority: "EMA / Clinical Data", region_hint: "EU", domain_hint: "pharma", maxItems: 30 }
  );
}
