import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMAMedicinesUnderEval(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/medicines/medicines-human-use-under-evaluation",
    "eu_ema_medicines_eval",
    {
      authority: "EMA / CHMP",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 30,
      extractPrompt:
        "Extract all medicines currently under evaluation by the EMA. For each item return: title (medicine/drug name and indication), url (link to the medicine's EMA page), date (submission or opinion date), summary.",
    }
  );
}
