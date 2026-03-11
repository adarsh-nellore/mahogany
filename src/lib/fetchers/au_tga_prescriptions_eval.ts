import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

const PAGE_URL =
  "https://www.tga.gov.au/prescription-medicines-applications-under-evaluation";

export async function fetchTGARxUnderEvaluation(): Promise<SignalDraft[]> {
  return fetchPageSignals(PAGE_URL, "au_tga_rx_eval", {
    authority: "TGA Australia",
    region_hint: "Global",
    domain_hint: "pharma",
    maxItems: 30,
    extractPrompt:
      "Extract all prescription medicine applications currently under evaluation by the TGA. For each entry return: title (medicine name and applicant), url, date (submission date), summary (indication).",
  });
}
