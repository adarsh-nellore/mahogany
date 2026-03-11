import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchEmergoRadar(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://www.emergobyul.com/news/newsletters/radar-market-access-newsletter",
    "industry_emergo_radar",
    { authority: "Emergo by UL", region_hint: null, domain_hint: "devices", maxItems: 15 }
  );
}
