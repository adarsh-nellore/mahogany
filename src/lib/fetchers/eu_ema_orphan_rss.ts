import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEMAOrphanRSS(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.ema.europa.eu/en/human-regulatory-overview/marketing-authorisation/orphan-medicines",
    "eu_ema_orphan_rss",
    {
      authority: "EMA",
      region_hint: "EU",
      domain_hint: "pharma",
      maxItems: 30,
      extractPrompt:
        "Extract all orphan medicine designations or recently authorised orphan medicines listed on this EMA page. For each item return: title (medicine name and indication), url (EMA product page link), date (designation or authorisation date), summary.",
    }
  );
}
