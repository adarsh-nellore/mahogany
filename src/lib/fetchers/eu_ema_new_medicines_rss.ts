import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMANewMedicinesRSS(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/medicines/recently-authorised-medicines",
    "eu_ema_new_medicines_rss",
    {
      authority: "EMA",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 30,
      extractPrompt:
        "Extract all recently authorised medicines listed on this EMA page. For each medicine return: title (medicine name and active substance), url (link to the medicine's EMA page), date (authorisation date), summary (indication and authorisation type).",
    }
  );
}
