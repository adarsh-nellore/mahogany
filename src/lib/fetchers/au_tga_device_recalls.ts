import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchTGADeviceRecalls(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "au_tga_device_recalls",
    url: "https://www.tga.gov.au/safety/shortages-and-recalls/recall-actions/feed",
    authority: "TGA Australia",
    region_hint: "Global",
    domain_hint: "devices",
  });
}
