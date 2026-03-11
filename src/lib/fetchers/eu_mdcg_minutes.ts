import { SignalDraft } from "../types";
import { fetchPageSignals } from "./helpers";

export async function fetchMDCGMinutes(): Promise<SignalDraft[]> {
  return fetchPageSignals(
    "https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en",
    "eu_mdcg_minutes",
    {
      authority: "MDCG",
      region_hint: "EU",
      domain_hint: "devices",
      maxItems: 10,
      extractPrompt:
        "Extract only meeting minutes, agendas, and meeting reports from this page. For each item return: title, url (direct link), date (meeting date).",
    }
  );
}
