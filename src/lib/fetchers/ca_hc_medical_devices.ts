import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

const MDALL_URL = "https://health-products.canada.ca/mdall-limh/index-eng.jsp";

export async function fetchHCMedicalDevices(): Promise<SignalDraft[]> {
  return fetchPageSignals(MDALL_URL, "ca_hc_medical_devices", {
    authority: "Health Canada / MDALL",
    region_hint: "Global",
    domain_hint: "devices",
    maxItems: 50,
    extractPrompt:
      "Extract all medical device licence entries listed on this page. For each item return: title (device name and licence number), url (direct link to licence record), date (issue or amendment date), summary (device class and manufacturer).",
  });
}
