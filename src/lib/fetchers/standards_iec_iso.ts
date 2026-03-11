import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchIECISOStandards(): Promise<SignalDraft[]> {
  const [iec, iso] = await Promise.all([
    fetchPageSignals(
      "https://www.iec.ch/dyn/www/f?p=103:22:0::::FSP_ORG_ID:1248",
      "standards_iec_iso",
      {
        authority: "IEC TC 62",
        region_hint: "Global",
        domain_hint: "devices",
        maxItems: 15,
        extractPrompt:
          "Extract all IEC standards or publications listed on this page. For each item return: title (standard number and title), url, date (publication date), summary.",
      }
    ),
    fetchPageSignals(
      "https://www.iso.org/committee/51046.html",
      "standards_iec_iso",
      {
        authority: "ISO TC 210",
        region_hint: "Global",
        domain_hint: "devices",
        maxItems: 15,
        extractPrompt:
          "Extract all ISO standards or publications listed on this committee page. For each item return: title (standard number and title), url, date (publication date), summary.",
      }
    ),
  ]);
  return [...iec, ...iso];
}
