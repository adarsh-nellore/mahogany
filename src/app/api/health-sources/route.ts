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
import { REGISTRY, SOURCE_CHECK_URLS } from "@/lib/fetchers/sourceRegistry";
import { checkMultipleSources, getFailingSourceAlerts } from "@/lib/sourceHealthChecker";
import { getRecentSchemaChanges } from "@/lib/sourceChangeDetector";

export const maxDuration = 120;

// Derive the source list from REGISTRY (single source of truth)
const ALL_SOURCES: { id: string; label: string; tier: "api" | "rss" | "scrape" }[] =
  REGISTRY.map((s) => ({
    id: s.source_id,
    label: s.label,
    tier: s.tier === "firecrawl" ? "scrape" as const : s.tier,
  }));

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

    // Optional live connectivity test (now using enhanced health checker)
    let liveTests: unknown[] = [];
    if (runLiveTestAll) {
      const healthResults = await checkMultipleSources(
        SOURCE_CHECK_URLS.map(({ source_id, check_url }) => ({ source_id, check_url }))
      );
      liveTests = healthResults;
      Object.assign(summary, {
        reliability_ok: healthResults.filter((r) => r.reachable).length,
        reliability_fail: healthResults.filter((r) => !r.reachable).length,
        reliability_total: healthResults.length,
        challenge_pages: healthResults.filter((r) => r.is_challenge_page).length,
        has_403_spikes: healthResults.filter((r) => r.has_403_spike).length,
      });
    } else if (runLiveTestCritical) {
      const criticalSources = [
        { source_id: "us_openfda_device_recall", check_url: "https://api.fda.gov/device/recall.json?limit=1" },
        { source_id: "clinicaltrials", check_url: "https://clinicaltrials.gov/api/v2/studies?pageSize=1&format=json" },
        { source_id: "us_fda_medwatch_rss", check_url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml" },
        { source_id: "eu_ema_news_rss", check_url: "https://www.ema.europa.eu/en/news.xml" },
        { source_id: "uk_mhra_alerts", check_url: "https://www.gov.uk/drug-device-alerts.atom" },
        { source_id: "global_who_news_rss", check_url: "https://www.who.int/rss-feeds/news-english.xml" },
        { source_id: "global_imdrf_documents", check_url: "https://www.imdrf.org/documents.xml" },
        { source_id: "ca_hc_recalls", check_url: "https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls" },
      ];
      liveTests = await checkMultipleSources(criticalSources);
    }

    // Get alerts: failing sources + schema changes
    const [failingAlerts, schemaChanges] = await Promise.all([
      getFailingSourceAlerts(0.5),
      getRecentSchemaChanges(24),
    ]);

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      summary,
      sources: sources.sort((a, b) => {
        const order: Record<string, number> = { dark: 0, warning: 1, active: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      }),
      ...(liveTests.length > 0 ? { live_tests: liveTests } : {}),
      ...(failingAlerts.length > 0 ? { failing_sources: failingAlerts } : {}),
      ...(schemaChanges.length > 0 ? { schema_changes: schemaChanges } : {}),
    });
  } catch (err) {
    console.error("[health-sources] error:", err);
    return NextResponse.json(
      { error: "Health check failed", details: String(err) },
      { status: 500 }
    );
  }
}
