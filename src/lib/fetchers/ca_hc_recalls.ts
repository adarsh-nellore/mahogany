import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

// Health products recalls (see recalls-rappels.canada.ca/en/rss-feeds for category feeds)
export async function fetchHCRecalls(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "ca_hc_recalls",
    url: "https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls",
    authority: "Health Canada / Recalls",
    region_hint: "Global",
    domain_hint: null,
  });
}
