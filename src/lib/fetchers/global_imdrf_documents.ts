import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchIMDRFDocuments(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "global_imdrf_documents",
    url: "https://www.imdrf.org/documents.xml",
    authority: "IMDRF",
    region_hint: "Global",
    domain_hint: "devices",
  });
}
