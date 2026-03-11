/**
 * Source health monitor.
 *
 * GET /api/health-sources
 *   Returns the status of every ingestion source: last signal time,
 *   signal count (14 days), and a health status (active / warning / dark).
 *
 * GET /api/health-sources?test=1
 *   Runs a live connectivity check on a small subset of critical sources.
 *
 * GET /api/health-sources?test=all
 *   Runs a connectivity check on every source in the registry (API + RSS + scrape URLs).
 *   Use to confirm reliability and find inaccessible sources. May take 30–90s.
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SOURCE_CHECK_URLS } from "@/lib/fetchers/sourceRegistry";

export const maxDuration = 120;

// Complete list of source IDs, grouped by reliability tier
const ALL_SOURCES: { id: string; label: string; tier: "api" | "rss" | "scrape" }[] = [
  // ── Tier 1: Official APIs ──────────────────────────────────────────────
  { id: "us_openfda_device_recall",    label: "openFDA Device Recalls",      tier: "api" },
  { id: "us_openfda_drug_enforcement", label: "openFDA Drug Enforcement",    tier: "api" },
  { id: "us_openfda_drugsfda",         label: "openFDA Drugs@FDA",           tier: "api" },
  { id: "us_openfda_510k",             label: "openFDA 510(k)",              tier: "api" },
  { id: "us_openfda_pma",              label: "openFDA PMA",                 tier: "api" },
  { id: "us_openfda_maude",            label: "openFDA MAUDE",               tier: "api" },
  { id: "us_openfda_classification",   label: "openFDA Device Classification",tier: "api" },
  { id: "us_fda_orange_book",          label: "FDA Orange Book (API)",       tier: "api" },
  { id: "us_fda_ndc",                  label: "FDA NDC Directory (API)",     tier: "api" },
  { id: "clinicaltrials",              label: "ClinicalTrials.gov API",      tier: "api" },
  { id: "ca_hc_drug_product",          label: "Health Canada Drug Product API", tier: "api" },

  // ── Tier 2: RSS / Atom feeds ───────────────────────────────────────────
  { id: "us_fda_medwatch_rss",         label: "FDA MedWatch RSS",            tier: "rss" },
  { id: "us_fda_guidance_rss",         label: "FDA Guidance RSS (all centers)", tier: "rss" },
  { id: "us_fda_press_rss",            label: "FDA Press RSS",               tier: "rss" },
  { id: "us_fda_device_safety_rss",    label: "FDA Device Safety RSS",       tier: "rss" },
  { id: "us_federal_register",         label: "Federal Register API",        tier: "rss" },
  { id: "us_govinfo_rss",              label: "GovInfo RSS",                 tier: "rss" },
  { id: "us_dailymed_rss",             label: "DailyMed RSS",                tier: "rss" },
  { id: "eu_ema_news_rss",             label: "EMA News RSS",                tier: "rss" },
  { id: "eu_ema_guidelines_rss",       label: "EMA Guidelines",              tier: "rss" },
  { id: "eu_ema_new_medicines_rss",    label: "EMA New Medicines",           tier: "rss" },
  { id: "eu_ema_consultations_rss",    label: "EMA Scientific Advice",       tier: "rss" },
  { id: "eu_ema_orphan_rss",           label: "EMA Orphan Medicines",        tier: "rss" },
  { id: "uk_mhra_alerts",              label: "MHRA Alerts (Atom)",          tier: "rss" },
  { id: "uk_mhra_approvals",           label: "MHRA Approvals",              tier: "rss" },
  { id: "uk_mhra_publications",        label: "MHRA Publications (gov.uk)",  tier: "rss" },
  { id: "ca_hc_recalls",               label: "Health Canada Recalls RSS",   tier: "rss" },
  { id: "ca_hc_safety_reviews",        label: "Health Canada Safety Reviews",tier: "rss" },
  { id: "au_tga_alerts",               label: "TGA Safety Alerts RSS",       tier: "rss" },
  { id: "global_imdrf_documents",      label: "IMDRF Documents RSS",         tier: "rss" },
  { id: "global_imdrf_consultations",  label: "IMDRF Consultations RSS",     tier: "rss" },
  { id: "global_imdrf_news",           label: "IMDRF News RSS",              tier: "rss" },
  { id: "global_who_news_rss",         label: "WHO News RSS",                tier: "rss" },
  { id: "global_eurlex_rss",           label: "EUR-Lex Official Journal",    tier: "rss" },
  { id: "industry_raps_rss",           label: "RAPS Regulatory Focus",       tier: "rss" },
  { id: "podcast_fda_voices",          label: "FDA Voices Podcast",          tier: "rss" },
  { id: "podcast_raps",                label: "RAPS Podcast",                tier: "rss" },

  // ── Tier 3: Firecrawl scraping ─────────────────────────────────────────
  { id: "eu_ema_medicines_eval",       label: "EMA Medicines Under Evaluation", tier: "scrape" },
  { id: "eu_ema_prime",                label: "EMA PRIME Designations",      tier: "scrape" },
  { id: "eu_ema_rwd",                  label: "EMA Real World Data",         tier: "scrape" },
  { id: "eu_ema_clinical_data",        label: "EMA Clinical Data Portal",    tier: "scrape" },
  { id: "eu_chmp_highlights",          label: "EMA CHMP Highlights",         tier: "scrape" },
  { id: "eu_prac_highlights",          label: "EMA PRAC Highlights",         tier: "scrape" },
  { id: "eu_mdcg_documents",           label: "MDCG Documents",              tier: "scrape" },
  { id: "eu_mdcg_minutes",             label: "MDCG Minutes",                tier: "scrape" },
  { id: "eu_hma_cmdh",                 label: "HMA CMDh",                    tier: "scrape" },
  { id: "eu_union_register_rss",       label: "EU Community Register",       tier: "scrape" },
  { id: "eu_ctis_trials",              label: "EU CTIS Trials",              tier: "scrape" },
  { id: "ca_hc_noc",                   label: "Health Canada NOC",           tier: "scrape" },
  { id: "ca_hc_medical_devices",       label: "Health Canada MDALL",         tier: "scrape" },
  { id: "au_tga_auspar",               label: "TGA AusPAR",                  tier: "scrape" },
  { id: "au_tga_rx_eval",              label: "TGA Rx Under Evaluation",     tier: "scrape" },
  { id: "au_tga_device_recalls",       label: "TGA Device Recalls",          tier: "scrape" },
  { id: "jp_pmda_approvals",           label: "PMDA Drug Approvals",         tier: "scrape" },
  { id: "jp_pmda_safety",              label: "PMDA Safety Info",            tier: "scrape" },
  { id: "jp_pmda_devices",             label: "PMDA Device Approvals",       tier: "scrape" },
  { id: "us_fda_advisory_calendar",    label: "FDA Advisory Calendar",       tier: "scrape" },
  { id: "us_fda_workshops",            label: "FDA Workshops & Conferences", tier: "scrape" },
  { id: "us_fda_pmcpmr",               label: "FDA PMC/PMR Database",        tier: "scrape" },
  { id: "us_fda_orphan_designations",  label: "FDA Orphan Designations",     tier: "scrape" },
  { id: "standards_eu_harmonised",     label: "EU Harmonised Standards",     tier: "scrape" },
  { id: "standards_iec_iso",           label: "IEC/ISO TC Standards",        tier: "scrape" },
  { id: "standards_bsi",               label: "BSI Medical Devices",         tier: "scrape" },
  { id: "standards_tuv_sud",           label: "TÜV SÜD Medical Devices",     tier: "scrape" },
  { id: "standards_dekra",             label: "DEKRA Medical Devices",       tier: "scrape" },
  { id: "standards_sgs",               label: "SGS Medical Devices",         tier: "scrape" },
  { id: "standards_ul",                label: "UL Solutions Insights",       tier: "scrape" },
  { id: "standards_intertek",          label: "Intertek Regulatory Updates", tier: "scrape" },
  { id: "industry_emergo_radar",       label: "Emergo Radar Newsletter",     tier: "scrape" },
  { id: "industry_covington",          label: "Covington FDA Blog",          tier: "scrape" },
  { id: "industry_steptoe",            label: "Steptoe Regulatory Pulse",    tier: "scrape" },
  { id: "podcast_emergo",              label: "Emergo Podcast",              tier: "scrape" },
];

interface SourceStats {
  source_id: string;
  signal_count_14d: number;
  last_signal_at: string | null;
}

type HealthStatus = "active" | "warning" | "dark" | "unknown";

function getStatus(stats: SourceStats | undefined, tier: string): HealthStatus {
  if (!stats) return "dark";
  if (!stats.last_signal_at) return "dark";

  const lastSeen = new Date(stats.last_signal_at).getTime();
  const ageHours = (Date.now() - lastSeen) / 3_600_000;

  // Tier 3 (scraping) sources are expected to be slower/less frequent
  const warningThresholdHours = tier === "scrape" ? 168 : 72; // 7 days vs 3 days
  const darkThresholdHours = tier === "scrape" ? 336 : 168;   // 14 days vs 7 days

  if (ageHours < warningThresholdHours) return "active";
  if (ageHours < darkThresholdHours) return "warning";
  return "dark";
}

const CONNECTIVITY_TIMEOUT_MS = 10_000;

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(CONNECTIVITY_TIMEOUT_MS),
      headers: { "User-Agent": "MahoganyRI/1.0" },
    });
    return { ok: res.ok, status: res.status, ms: Date.now() - start };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - start };
  }
}

export async function GET(request: NextRequest) {
  const testParam = request.nextUrl.searchParams.get("test");
  const runLiveTestCritical = testParam === "1";
  const runLiveTestAll = testParam === "all";

  try {
    // Query signal counts per source over last 14 days
    const rows = await query<SourceStats>(
      `SELECT
         source_id,
         count(*)::int as signal_count_14d,
         max(created_at)::text as last_signal_at
       FROM signals
       WHERE created_at > now() - interval '14 days'
       GROUP BY source_id`
    );

    const statsMap = new Map<string, SourceStats>(rows.map((r) => [r.source_id, r]));

    // Cross-reference with full source list
    const sources = ALL_SOURCES.map((src) => {
      const stats = statsMap.get(src.id);
      return {
        source_id: src.id,
        label: src.label,
        tier: src.tier,
        status: getStatus(stats, src.tier),
        signal_count_14d: stats?.signal_count_14d ?? 0,
        last_signal_at: stats?.last_signal_at ?? null,
      };
    });

    // Summary counts
    const summary = {
      total: sources.length,
      active: sources.filter((s) => s.status === "active").length,
      warning: sources.filter((s) => s.status === "warning").length,
      dark: sources.filter((s) => s.status === "dark").length,
      firecrawl_configured: !!process.env.FIRECRAWL_API_KEY,
      // Count sources that need Firecrawl but it's not configured
      scrape_sources_at_risk: !process.env.FIRECRAWL_API_KEY
        ? sources.filter((s) => s.tier === "scrape").length
        : 0,
    };

    // Optional live connectivity test
    let liveTests: { source_id: string; tier: string; url: string; ok: boolean; status: number; ms: number }[] = [];
    if (runLiveTestAll) {
      // Check every source in the registry (parallel, each with timeout)
      const results = await Promise.all(
        SOURCE_CHECK_URLS.map(async ({ source_id, check_url, tier }) => {
          const { ok, status, ms } = await checkUrl(check_url);
          return { source_id, tier, url: check_url, ok, status, ms };
        })
      );
      liveTests = results;
      Object.assign(summary, {
        reliability_ok: results.filter((r) => r.ok).length,
        reliability_fail: results.filter((r) => !r.ok).length,
        reliability_total: results.length,
      });
    } else if (runLiveTestCritical) {
      const criticalUrls = [
        { source_id: "us_openfda_device_recall", url: "https://api.fda.gov/device/recall.json?limit=1" },
        { source_id: "clinicaltrials", url: "https://clinicaltrials.gov/api/v2/studies?pageSize=1&format=json" },
        { source_id: "us_fda_medwatch_rss", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml" },
        { source_id: "eu_ema_news_rss", url: "https://www.ema.europa.eu/en/news.xml" },
        { source_id: "uk_mhra_alerts", url: "https://www.gov.uk/drug-device-alerts.atom" },
        { source_id: "global_who_news_rss", url: "https://www.who.int/rss-feeds/news-english.xml" },
        { source_id: "global_imdrf_documents", url: "https://www.imdrf.org/documents.xml" },
        { source_id: "ca_hc_recalls", url: "https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls" },
      ];
      liveTests = await Promise.all(
        criticalUrls.map(async ({ source_id, url }) => {
          const { ok, status, ms } = await checkUrl(url);
          return { source_id, tier: "rss", url, ok, status, ms };
        })
      );
    }

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      summary,
      sources: sources.sort((a, b) => {
        const order = { dark: 0, warning: 1, active: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      }),
      ...(liveTests.length > 0 ? { live_tests: liveTests } : {}),
    });
  } catch (err) {
    console.error("[health-sources] error:", err);
    return NextResponse.json(
      { error: "Health check failed", details: String(err) },
      { status: 500 }
    );
  }
}
