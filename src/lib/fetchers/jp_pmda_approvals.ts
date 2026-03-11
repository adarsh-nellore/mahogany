import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

const PAGE_URL =
  "https://www.pmda.go.jp/english/review-services/reviews/approved-information/drugs/0002.html";

export async function fetchPMDAApprovals(): Promise<SignalDraft[]> {
  return fetchPageSignals(PAGE_URL, "jp_pmda_approvals", {
    authority: "PMDA Japan",
    region_hint: "Global",
    domain_hint: "pharma",
    maxItems: 30,
    extractPrompt:
      "Extract all drug approval entries listed on this PMDA page. For each item return: title (drug name and approval year/number), url (direct link to the approval record), date (approval date), summary (therapeutic category or indication).",
  });
}
