import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchHCSafetyReviews(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "ca_hc_safety_reviews",
    url: "https://www.canada.ca/en/health-canada/services/drugs-health-products/medeffect-canada/safety-reviews.atom",
    authority: "Health Canada / MedEffect",
    region_hint: "Global",
    domain_hint: null,
  });
}
