import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMAPrime(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/human-regulatory-overview/research-development/prime-priority-medicines",
    "eu_ema_prime",
    {
      authority: "EMA / PRIME",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 30,
      extractPrompt:
        "Extract all PRIME designation grants, applications, or updates listed on this page. For each item return: title (drug name and indication), url, date (designation date), summary.",
    }
  );
}
