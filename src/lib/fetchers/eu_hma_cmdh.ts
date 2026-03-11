import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchHMACMDh(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.hma.eu/human-medicines/cmdh.html",
    "eu_hma_cmdh",
    { authority: "HMA CMDh", region_hint: "EU", domain_hint: "pharma", maxItems: 15 }
  );
}
