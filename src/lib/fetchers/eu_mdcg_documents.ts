import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchMDCGDocuments(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en",
    "eu_mdcg_documents",
    {
      authority: "MDCG / European Commission",
      region_hint: "EU",
      domain_hint: "devices",
      maxItems: 30,
      extractPrompt:
        "Extract all MDCG guidance documents, endorsed documents, and related publications listed on this page. For each item return: title (document name/number), url (direct link), date (publication date), summary (scope or brief description).",
    }
  );
}
