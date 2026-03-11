import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchFDAVoicesPodcast(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "podcast_fda_voices",
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml",
    authority: "FDA Voices Podcast",
    region_hint: "US",
    domain_hint: null,
    maxAge24h: false,
  });
}
