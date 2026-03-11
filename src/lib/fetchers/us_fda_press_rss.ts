import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchFDAPressRSS(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "us_fda_press_rss",
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml",
    authority: "FDA",
    region_hint: "US",
    domain_hint: null,
  });
}
