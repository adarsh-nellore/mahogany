import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchRAPSPodcast(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "podcast_raps",
    url: "https://www.raps.org/rss/podcast",
    authority: "RAPS Podcast",
    region_hint: null,
    domain_hint: null,
    maxAge24h: false,
  });
}
