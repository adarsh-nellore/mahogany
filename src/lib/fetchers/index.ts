import { SignalDraft } from "../types";
import { recordDiagnostic } from "../fetchRetry";
import { DISABLE_US_SOURCES } from "../experimentFlags";

// ─── Registry-driven fetchers (RSS + Firecrawl) ─────────────────────────────
import { registryRSSFetchers, registryFirecrawlFetchers } from "./registryFetcher";

// ─── Custom API fetchers (hand-written logic) ──────────────────────────────
import { fetchFederalRegister } from "./us_federal_register";
import { fetchOpenFDADrugEnforcement } from "./us_openfda_drug_enforcement";
import { fetchOpenFDADeviceRecall } from "./us_openfda_device_recall";
import { fetchOpenFDADrugsFDA } from "./us_openfda_drugsfda";
import { fetchOpenFDA510k } from "./us_openfda_510k";
import { fetchOpenFDAPMA } from "./us_openfda_pma";
import { fetchOpenFDAMAUDE } from "./us_openfda_maude";
import { fetchOpenFDADeviceClassification } from "./us_openfda_classification";
import { fetchOpenFDADrugEvents } from "./us_openfda_drug_events";
import { fetchOpenFDADrugLabels } from "./us_openfda_drug_labels";
import { fetchOpenFDADrugSubmissions } from "./us_openfda_drug_submissions";
import { fetchOrangeBook } from "./us_fda_orange_book";
import { fetchFDANDC } from "./us_fda_ndc";
import { fetchClinicalTrials } from "./clinicaltrials";
import { fetchCongressGov } from "./us_congress_gov";
import { fetchHCDrugProduct } from "./ca_hc_drug_product";
import { fetchEMAAPI } from "./eu_ema_api";
import { fetchMHRAAPI } from "./uk_mhra_api";
import { fetchTGAAPI } from "./au_tga_api";
import { fetchPMDAAPI } from "./jp_pmda_api";
import { fetchWHOAPI } from "./global_who_api";

// ─── Fetcher tier definitions ────────────────────────────────────────
// RSS tier: auto-generated from REGISTRY (free, fast)
// API tier: custom fetchers with hand-written logic (free/cheap, fast)
// Firecrawl tier: auto-generated from REGISTRY (paid, slow)

interface NamedFetcher {
  name: string;
  fn: () => Promise<SignalDraft[]>;
}

const RSS_FETCHERS: NamedFetcher[] = registryRSSFetchers();

const API_FETCHERS_RAW: NamedFetcher[] = [
  { name: "us_federal_register", fn: fetchFederalRegister },
  { name: "us_openfda_drug_enforcement", fn: fetchOpenFDADrugEnforcement },
  { name: "us_openfda_device_recall", fn: fetchOpenFDADeviceRecall },
  { name: "us_openfda_drugsfda", fn: fetchOpenFDADrugsFDA },
  { name: "us_openfda_510k", fn: fetchOpenFDA510k },
  { name: "us_openfda_pma", fn: fetchOpenFDAPMA },
  { name: "us_openfda_maude", fn: fetchOpenFDAMAUDE },
  { name: "us_openfda_classification", fn: fetchOpenFDADeviceClassification },
  { name: "us_openfda_drug_events", fn: fetchOpenFDADrugEvents },
  { name: "us_openfda_drug_labels", fn: fetchOpenFDADrugLabels },
  { name: "us_openfda_drug_submissions", fn: fetchOpenFDADrugSubmissions },
  { name: "us_fda_orange_book", fn: fetchOrangeBook },
  { name: "us_fda_ndc", fn: fetchFDANDC },
  { name: "clinicaltrials", fn: fetchClinicalTrials },
  { name: "us_congress_gov", fn: fetchCongressGov },
  { name: "ca_hc_drug_product", fn: fetchHCDrugProduct },
  // International custom API fetchers
  { name: "eu_ema_api", fn: fetchEMAAPI },
  { name: "uk_mhra_api", fn: fetchMHRAAPI },
  { name: "au_tga_api", fn: fetchTGAAPI },
  { name: "jp_pmda_api", fn: fetchPMDAAPI },
  { name: "global_who_api", fn: fetchWHOAPI },
];

const API_FETCHERS: NamedFetcher[] = DISABLE_US_SOURCES
  ? API_FETCHERS_RAW.filter((f) => !f.name.startsWith("us_") && f.name !== "clinicaltrials")
  : API_FETCHERS_RAW;

const FIRECRAWL_FETCHERS: NamedFetcher[] = registryFirecrawlFetchers();

// ─── Orchestrator ────────────────────────────────────────────────────

const FETCHER_TIMEOUT_MS = 90_000;

async function runFetchers(fetchers: NamedFetcher[]): Promise<SignalDraft[]> {
  const timedFetchers = fetchers.map((f) =>
    Promise.race([
      f.fn(),
      new Promise<SignalDraft[]>((_, reject) =>
        setTimeout(() => reject(new Error("fetcher timeout")), FETCHER_TIMEOUT_MS)
      ),
    ])
  );

  const results = await Promise.allSettled(timedFetchers);
  const drafts: SignalDraft[] = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      drafts.push(...result.value);
      successCount++;
    } else {
      failCount++;
      const reason = (result as PromiseRejectedResult).reason;
      const fetcherName = fetchers[i].name;
      if (String(reason).includes("timeout")) {
        console.warn(`[fetcher-orchestrator] ${fetcherName} timed out (>90s), skipped`);
        recordDiagnostic(fetcherName, "", {
          http_status: null,
          response_time_ms: FETCHER_TIMEOUT_MS,
          parser_used: "orchestrator",
          error_code: "timeout",
        }).catch(() => {});
      } else {
        console.error(`[fetcher-orchestrator] ${fetcherName} failed:`, reason);
        recordDiagnostic(fetcherName, "", {
          http_status: null,
          response_time_ms: 0,
          parser_used: "orchestrator",
          error_code: "fetcher_error",
        }).catch(() => {});
      }
    }
  }

  console.log(
    `[fetcher-orchestrator] ${drafts.length} total drafts from ${fetchers.length} fetchers (${successCount} ok, ${failCount} failed)`
  );

  return drafts;
}

/** Fetch all RSS-based sources (free, fast — runs every 4h) */
export async function fetchAllRSS(): Promise<SignalDraft[]> {
  return runFetchers(RSS_FETCHERS);
}

/** Fetch all direct API sources (free/cheap, fast — runs every 4h) */
export async function fetchAllAPI(): Promise<SignalDraft[]> {
  return runFetchers(API_FETCHERS);
}

/** Fetch all Firecrawl-based sources (paid, slow — runs once daily) */
export async function fetchAllFirecrawl(): Promise<SignalDraft[]> {
  return runFetchers(FIRECRAWL_FETCHERS);
}

/** Fetch RSS + API sources together (fast tier) */
export async function fetchAllFast(): Promise<SignalDraft[]> {
  return runFetchers([...RSS_FETCHERS, ...API_FETCHERS]);
}

/** Fetch all sources unconditionally (all tiers) */
export async function fetchAllSignals(): Promise<SignalDraft[]> {
  return runFetchers([...RSS_FETCHERS, ...API_FETCHERS, ...FIRECRAWL_FETCHERS]);
}
