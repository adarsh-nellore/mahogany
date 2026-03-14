import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { REGISTRY } from "@/lib/fetchers/sourceRegistry";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "7d";
  const intervalDays = period === "30d" ? 30 : 7;

  try {
    const [sourceMetrics, agentRuns, exceptions, freshness, sourceHealth, totals] = await Promise.all([
      // Source-level fetch metrics
      query<{
        source_id: string;
        total_fetches: number;
        successful: number;
        failed: number;
        success_rate: number;
        avg_response_ms: number;
        avg_extracted_length: number;
        last_fetch_at: string | null;
      }>(
        `SELECT
          source_id,
          COUNT(*)::int AS total_fetches,
          COUNT(*) FILTER (WHERE error_code IS NULL)::int AS successful,
          COUNT(*) FILTER (WHERE error_code IS NOT NULL)::int AS failed,
          ROUND(COUNT(*) FILTER (WHERE error_code IS NULL)::numeric / GREATEST(COUNT(*), 1), 3) AS success_rate,
          ROUND(AVG(response_time_ms))::int AS avg_response_ms,
          ROUND(AVG(COALESCE(extracted_text_length, 0)))::int AS avg_extracted_length,
          MAX(created_at)::text AS last_fetch_at
        FROM ingestion_diagnostics
        WHERE created_at > now() - interval '1 day' * $1
        GROUP BY source_id
        ORDER BY success_rate ASC, total_fetches DESC`,
        [intervalDays]
      ),

      // Agent run summaries
      query<{
        agent_name: string;
        total_runs: number;
        completed: number;
        failed: number;
        avg_actions: number;
      }>(
        `SELECT
          ar.agent_name,
          COUNT(*)::int AS total_runs,
          COUNT(*) FILTER (WHERE ar.status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE ar.status = 'failed')::int AS failed,
          ROUND(AVG((SELECT COUNT(*) FROM agent_actions aa WHERE aa.run_id = ar.id)))::int AS avg_actions
        FROM agent_runs ar
        WHERE ar.started_at > now() - interval '1 day' * $1
        GROUP BY ar.agent_name
        ORDER BY total_runs DESC`,
        [intervalDays]
      ),

      // Exception breakdown
      query<{
        reason_code: string;
        count: number;
        top_sources: string[];
      }>(
        `SELECT
          reason_code,
          COUNT(*)::int AS count,
          ARRAY(
            SELECT source_id FROM (
              SELECT source_id, COUNT(*) AS cnt
              FROM ingestion_exceptions ie2
              WHERE ie2.reason_code = ie.reason_code
                AND ie2.created_at > now() - interval '1 day' * $1
              GROUP BY source_id
              ORDER BY cnt DESC
              LIMIT 3
            ) sub
          ) AS top_sources
        FROM ingestion_exceptions ie
        WHERE created_at > now() - interval '1 day' * $1
        GROUP BY reason_code
        ORDER BY count DESC`,
        [intervalDays]
      ),

      // Freshness lag per source
      query<{
        source_id: string;
        hours_since_last: number;
        signal_count_7d: number;
      }>(
        `SELECT
          source_id,
          EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 3600 AS hours_since_last,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS signal_count_7d
        FROM signals
        GROUP BY source_id
        ORDER BY hours_since_last DESC`
      ),

      // Source health (70% minimum)
      (async () => {
        const enabledSources = REGISTRY.filter((s) => s.enabled !== false);
        const rows = await query<{
          source_id: string;
          signal_count_14d: number;
          last_signal_at: string | null;
        }>(
          `SELECT source_id, count(*)::int as signal_count_14d, max(created_at)::text as last_signal_at
           FROM signals WHERE created_at > now() - interval '14 days'
           GROUP BY source_id`
        );
        const statsMap = new Map(rows.map((r) => [r.source_id, r]));
        let activeCount = 0;
        const darkSources: string[] = [];
        const warningSources: string[] = [];
        for (const s of enabledSources) {
          const stats = statsMap.get(s.source_id);
          const tier = s.tier === "firecrawl" ? "scrape" : s.tier;
          const warningThresholdHours = tier === "scrape" ? 168 : 72;
          const darkThresholdHours = tier === "scrape" ? 336 : 168;
          if (!stats?.last_signal_at) {
            darkSources.push(s.source_id);
            continue;
          }
          const ageHours = (Date.now() - new Date(stats.last_signal_at).getTime()) / 3_600_000;
          if (ageHours < warningThresholdHours) activeCount++;
          else if (ageHours < darkThresholdHours) warningSources.push(s.source_id);
          else darkSources.push(s.source_id);
        }
        const totalSources = enabledSources.length;
        const activeRatio = totalSources > 0 ? activeCount / totalSources : 0;
        return {
          active_count: activeCount,
          total_sources: totalSources,
          active_ratio: Math.round(activeRatio * 1000) / 1000,
          below_70_minimum: activeRatio < 0.7,
          dark_sources: darkSources,
          warning_sources: warningSources,
        };
      })(),

      // 24h totals
      query<{
        total_diagnostics_24h: number;
        total_exceptions_24h: number;
        total_signals_24h: number;
        total_agent_runs_24h: number;
      }>(
        `SELECT
          (SELECT COUNT(*)::int FROM ingestion_diagnostics WHERE created_at > now() - interval '24 hours') AS total_diagnostics_24h,
          (SELECT COUNT(*)::int FROM ingestion_exceptions WHERE created_at > now() - interval '24 hours') AS total_exceptions_24h,
          (SELECT COUNT(*)::int FROM signals WHERE created_at > now() - interval '24 hours') AS total_signals_24h,
          (SELECT COUNT(*)::int FROM agent_runs WHERE started_at > now() - interval '24 hours') AS total_agent_runs_24h`
      ),
    ]);

    return NextResponse.json({
      source_metrics: sourceMetrics,
      agent_runs: agentRuns,
      exceptions,
      freshness,
      source_health: sourceHealth,
      totals: totals[0] || {
        total_diagnostics_24h: 0,
        total_exceptions_24h: 0,
        total_signals_24h: 0,
        total_agent_runs_24h: 0,
      },
    });
  } catch (err) {
    console.error("[admin/metrics] error:", err);
    return NextResponse.json(
      { error: "Failed to load metrics", details: String(err) },
      { status: 500 }
    );
  }
}
