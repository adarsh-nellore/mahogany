import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

const NOC_URL = "https://health-products.canada.ca/noc-ac/index-eng.jsp";

export async function fetchHCNoticeOfCompliance(): Promise<SignalDraft[]> {
  return fetchPageSignals(NOC_URL, "ca_hc_noc", {
    authority: "Health Canada / NOC",
    region_hint: "Global",
    domain_hint: "pharma",
    maxItems: 50,
    extractPrompt:
      "Extract all Notice of Compliance (NOC) drug approval entries listed on this page. For each entry return: title (drug brand name, DIN, and manufacturer), url (link to the NOC record), date (approval date), summary (indication or drug class).",
  });
}
