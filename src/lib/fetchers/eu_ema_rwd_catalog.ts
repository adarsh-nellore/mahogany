import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMARWDCatalog(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/about-us/how-we-work/big-data/real-world-evidence",
    "eu_ema_rwd",
    { authority: "EMA / RWD Catalog", region_hint: "EU", domain_hint: null, maxItems: 30 }
  );
}
