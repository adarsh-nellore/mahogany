import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchIMDRFNews(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "global_imdrf_news",
    url: "https://www.imdrf.org/news-events/news.xml",
    authority: "IMDRF",
    region_hint: "Global",
    domain_hint: "devices",
  });
}
