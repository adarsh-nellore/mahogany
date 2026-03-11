import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchMHRAAlerts(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "uk_mhra_alerts",
    url: "https://www.gov.uk/drug-device-alerts.atom",
    authority: "MHRA",
    region_hint: "UK",
    domain_hint: null,
  });
}
