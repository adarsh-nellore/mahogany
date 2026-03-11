import { SignalDraft } from "../types";
import { fetchRSS } from "./helpers";

export async function fetchIMDRFConsultations(): Promise<SignalDraft[]> {
  return fetchRSS({
    source_id: "global_imdrf_consultations",
    url: "https://www.imdrf.org/consultations.xml",
    authority: "IMDRF",
    region_hint: "Global",
    domain_hint: "devices",
  });
}
