import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchFDAMedWatchRSS(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "us_fda_medwatch_rss",
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml",
    authority: "FDA MedWatch",
    region_hint: "US",
    domain_hint: null,
  });
}
