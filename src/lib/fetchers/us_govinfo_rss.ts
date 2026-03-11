import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchGovInfoRSS(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "us_govinfo_rss",
    url: "https://www.govinfo.gov/rss/bills",
    authority: "GovInfo",
    region_hint: "US",
    domain_hint: null,
    maxAgeHours: 336,
  });
}
