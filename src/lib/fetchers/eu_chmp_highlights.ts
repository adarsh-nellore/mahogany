import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchCHMPHighlights(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/committees/chmp/chmp-agendas-minutes-highlights",
    "eu_chmp_highlights",
    { authority: "EMA CHMP", region_hint: "EU", domain_hint: "pharma", maxItems: 20 }
  );
}
