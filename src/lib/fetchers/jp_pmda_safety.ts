import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

const PAGE_URL =
  "https://www.pmda.go.jp/english/safety/info-services/drugs/esc-rsc/0001.html";

export async function fetchPMDASafety(): Promise<SignalDraft[]> {
  return fetchPageSignals(PAGE_URL, "jp_pmda_safety", {
    authority: "PMDA Japan",
    region_hint: "Global",
    domain_hint: null,
    maxItems: 30,
  });
}
