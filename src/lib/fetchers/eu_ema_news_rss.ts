import { SignalDraft } from "../types";
import { fetchRSS, fetchPageSignals } from "./helpers";

export async function fetchEMANewsRSS(): Promise<SignalDraft[]> {
  // EMA official feed: News and press releases (see ema.europa.eu/en/news-events/rss-feeds)
  const rss = await fetchRSS({
    source_id: "eu_ema_news_rss",
    url: "https://www.ema.europa.eu/en/news.xml",
    authority: "EMA",
    region_hint: "EU",
    domain_hint: null,
    maxAgeHours: 336,
  });
  if (rss.length > 0) return rss;

  return fetchPageSignals(
    "https://www.ema.europa.eu/en/news",
    "eu_ema_news_rss",
    { authority: "EMA", region_hint: "EU", domain_hint: null, maxItems: 30 }
  );
}
