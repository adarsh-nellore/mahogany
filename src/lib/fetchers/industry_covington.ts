import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchCovington(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.cov.com/en/news-and-insights/topics/fda-and-life-sciences",
    "industry_covington",
    { authority: "Covington & Burling", region_hint: "US", domain_hint: null, maxItems: 15 }
  );
}
