/**
 * Source health checker module.
 *
 * Reusable health checking with:
 * - Connectivity checks (HTTP GET/HEAD with timeout)
 * - CAPTCHA/challenge page detection
 * - 403 spike detection (current vs rolling 7-day average)
 * - Consecutive failure tracking
 */

import { query } from "./db";
import { fetchWithRetry } from "./fetchRetry";

export interface HealthCheckResult {
  source_id: string;
  reachable: boolean;
  http_status: number;
  response_time_ms: number;
  is_challenge_page: boolean;
  has_403_spike: boolean;
  consecutive_failures: number;
  details?: string;
}

const CHALLENGE_PATTERNS = [
  /cloudflare/i,
  /captcha/i,
  /challenge/i,
  /hCaptcha/i,
  /recaptcha/i,
  /just a moment/i,
  /checking your browser/i,
  /please verify you are human/i,
  /attention required/i,
  /ddos-guard/i,
  /access denied.*bot/i,
  /please enable javascript/i,
  /ray id/i,
];

/**
 * Check a single source URL for reachability, challenge pages, and health metrics.
 */
export async function checkSourceHealth(
  sourceId: string,
  checkUrl: string,
  timeoutMs = 10000
): Promise<HealthCheckResult> {
  const start = Date.now();

  try {
    const { response } = await fetchWithRetry(checkUrl, {
      sourceId,
      parserUsed: "health_check",
      timeoutMs,
      maxRetries: 0, // No retry for health checks — just report the status
      headers: { "User-Agent": "MahoganyRI/1.0" },
    });

    const responseTimeMs = Date.now() - start;
    let isChallengePage = false;

    // Check for challenge pages on successful responses
    if (response.ok || response.status === 403) {
      try {
        const body = await response.text();
        isChallengePage = CHALLENGE_PATTERNS.some((p) => p.test(body.slice(0, 5000)));
      } catch {
        // Can't read body — not a challenge page concern
      }
    }

    // Check for 403 spike
    const has403Spike = response.status === 403
      ? await detect403Spike(sourceId)
      : false;

    // Get consecutive failure count
    const failures = await getConsecutiveFailures(sourceId);

    return {
      source_id: sourceId,
      reachable: response.ok && !isChallengePage,
      http_status: response.status,
      response_time_ms: responseTimeMs,
      is_challenge_page: isChallengePage,
      has_403_spike: has403Spike,
      consecutive_failures: failures,
    };
  } catch (err) {
    const failures = await getConsecutiveFailures(sourceId);
    return {
      source_id: sourceId,
      reachable: false,
      http_status: 0,
      response_time_ms: Date.now() - start,
      is_challenge_page: false,
      has_403_spike: false,
      consecutive_failures: failures,
      details: String(err),
    };
  }
}

/**
 * Check multiple sources in parallel.
 */
export async function checkMultipleSources(
  sources: { source_id: string; check_url: string }[],
  timeoutMs = 10000
): Promise<HealthCheckResult[]> {
  return Promise.all(
    sources.map(({ source_id, check_url }) =>
      checkSourceHealth(source_id, check_url, timeoutMs)
    )
  );
}

/**
 * Detect if a source has a 403 spike compared to its rolling 7-day average.
 */
async function detect403Spike(sourceId: string): Promise<boolean> {
  try {
    const rows = await query<{ recent_403s: number; avg_daily_403s: number }>(
      `WITH recent AS (
        SELECT COUNT(*) AS cnt
        FROM ingestion_diagnostics
        WHERE source_id = $1
          AND http_status = 403
          AND created_at > now() - interval '24 hours'
      ),
      rolling AS (
        SELECT COUNT(*) / 7.0 AS avg
        FROM ingestion_diagnostics
        WHERE source_id = $1
          AND http_status = 403
          AND created_at > now() - interval '7 days'
      )
      SELECT recent.cnt::int AS recent_403s, rolling.avg::numeric AS avg_daily_403s
      FROM recent, rolling`,
      [sourceId]
    );

    if (rows.length === 0) return false;
    const { recent_403s, avg_daily_403s } = rows[0];
    // Spike = current 24h count is > 2x the 7-day daily average (and at least 3)
    return recent_403s >= 3 && recent_403s > avg_daily_403s * 2;
  } catch {
    return false;
  }
}

async function getConsecutiveFailures(sourceId: string): Promise<number> {
  try {
    const rows = await query<{ consecutive_failures: number }>(
      `SELECT consecutive_failures FROM source_state WHERE source_id = $1`,
      [sourceId]
    );
    return rows[0]?.consecutive_failures ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Get sources with failure rate exceeding threshold over the last 24h.
 */
export async function getFailingSourceAlerts(
  failureRateThreshold = 0.5
): Promise<{ source_id: string; total: number; failures: number; failure_rate: number }[]> {
  try {
    const rows = await query<{ source_id: string; total: number; failures: number; failure_rate: number }>(
      `SELECT
        source_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE error_code IS NOT NULL)::int AS failures,
        ROUND(COUNT(*) FILTER (WHERE error_code IS NOT NULL)::numeric / GREATEST(COUNT(*), 1), 3) AS failure_rate
      FROM ingestion_diagnostics
      WHERE created_at > now() - interval '24 hours'
      GROUP BY source_id
      HAVING COUNT(*) FILTER (WHERE error_code IS NOT NULL)::numeric / GREATEST(COUNT(*), 1) > $1
      ORDER BY failure_rate DESC`,
      [failureRateThreshold]
    );
    return rows;
  } catch {
    return [];
  }
}
