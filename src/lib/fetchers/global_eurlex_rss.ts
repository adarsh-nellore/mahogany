import { SignalDraft } from "../types";
import { fetchRSS, fetchPageSignals } from "./helpers";

export async function fetchEURLexRSS(): Promise<SignalDraft[]> {
  // EUR-Lex provides an RSS/Atom feed for the Official Journal
  const rss = await fetchRSS({
    source_id: "global_eurlex_rss",
    url: "https://eur-lex.europa.eu/oj/direct-access.html?locale=en&ojId=OJ_L_rss.xml",
    authority: "EUR-Lex / Official Journal",
    region_hint: "EU",
    domain_hint: null,
    maxAgeHours: 336,
  });
  if (rss.length > 0) return rss;

  return fetchPageSignals(
    "https://eur-lex.europa.eu/oj/direct-access.html",
    "global_eurlex_rss",
    {
      authority: "EUR-Lex / Official Journal",
      region_hint: "EU",
      domain_hint: null,
      maxItems: 20,
      extractPrompt:
        "Extract all Official Journal (OJ) acts, regulations, or directives listed on this EUR-Lex page. For each item return: title (act name/number), url (direct link), date (publication date), summary.",
    }
  );
}
