import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchDailyMedRSS(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "us_dailymed_rss",
    url: "https://dailymed.nlm.nih.gov/dailymed/rss.cfm",
    authority: "DailyMed / NIH",
    region_hint: "US",
    domain_hint: "pharma",
  });
}
