import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMAConsultationsRSS(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/scientific-advice-and-protocol-assistance/scientific-advice",
    "eu_ema_consultations_rss",
    {
      authority: "EMA",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 30,
      extractPrompt:
        "Extract all scientific advice procedures, consultations, or guidance documents listed on this EMA page. For each item return: title, url (direct link), date, summary.",
    }
  );
}
