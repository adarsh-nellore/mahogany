import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchMHRADevices(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "uk_mhra_publications",
    url: "https://www.gov.uk/government/publications.atom?departments%5B%5D=medicines-and-healthcare-products-regulatory-agency",
    authority: "MHRA",
    region_hint: "UK",
    domain_hint: null,
  });
}
