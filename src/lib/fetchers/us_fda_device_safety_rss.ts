import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchFDADeviceSafetyRSS(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "us_fda_device_safety_rss",
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medical-devices/rss.xml",
    authority: "FDA CDRH",
    region_hint: "US",
    domain_hint: "devices",
  });
}
