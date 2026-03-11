import { SignalDraft } from "../types";
import { fetchRSS, fetchPageSignals } from "./helpers";

export async function fetchEmergoPodcast(): Promise<SignalDraft[]> {
  // Try RSS feed first
  const rss = await fetchRSS({
    source_id: "podcast_emergo",
    url: "https://feeds.buzzsprout.com/1791064.rss",
    authority: "Emergo Podcast",
    region_hint: null,
    domain_hint: "devices",
  });
  if (rss.length > 0) return rss;

  return fetchPageSignals(
    "https://www.emergobyul.com/resources/podcasts",
    "podcast_emergo",
    { authority: "Emergo Podcast", region_hint: null, domain_hint: "devices", maxItems: 10 }
  );
}
