import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchPRACHighlights(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/committees/prac/prac-agendas-minutes-highlights",
    "eu_prac_highlights",
    { authority: "EMA PRAC", region_hint: "EU", domain_hint: "pharma", maxItems: 20 }
  );
}
