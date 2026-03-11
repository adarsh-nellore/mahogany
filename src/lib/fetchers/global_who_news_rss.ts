import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchWHONewsRSS(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "global_who_news_rss",
    url: "https://www.who.int/rss-feeds/news-english.xml",
    authority: "WHO",
    region_hint: "Global",
    domain_hint: null,
  });
}
