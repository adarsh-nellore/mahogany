import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchTGAAlerts(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "au_tga_alerts",
    url: "https://www.tga.gov.au/safety/safety-alerts-medicine/feed",
    authority: "TGA Australia",
    region_hint: "Global",
    domain_hint: null,
  });
}
