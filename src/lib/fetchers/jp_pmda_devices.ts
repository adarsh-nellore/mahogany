import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

const PAGE_URL =
  "https://www.pmda.go.jp/english/review-services/reviews/approved-information/devices/0001.html";

export async function fetchPMDADevices(): Promise<SignalDraft[]> {
  return fetchPageSignals(PAGE_URL, "jp_pmda_devices", {
    authority: "PMDA Japan",
    region_hint: "Global",
    domain_hint: "devices",
    maxItems: 30,
  });
}
