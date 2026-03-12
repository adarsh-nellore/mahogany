/**
 * Fetch with retry + exponential backoff + jitter.
 *
 * Replaces raw fetch() calls in fetchers with resilient HTTP requests
 * that record diagnostics for every attempt.
 */

import { query } from "./db";

export interface FetchRetryOptions extends RequestInit {
  /** Max number of retries (default 2, total attempts = maxRetries + 1) */
  maxRetries?: number;
  /** Base delay in ms (default 1000). Actual delay = baseDelay * 2^attempt + jitter */
  baseDelayMs?: number;
  /** Timeout per attempt in ms (default 30000) */
  timeoutMs?: number;
  /** Source ID for diagnostics logging */
  sourceId?: string;
  /** Parser name for diagnostics (e.g. "rss", "firecrawl_extract", "firecrawl_markdown") */
  parserUsed?: string;
}

export interface FetchRetryResult {
  response: Response;
  attempts: number;
  totalTimeMs: number;
}

/**
 * Fetch with automatic retry on transient failures (5xx, 429, network errors).
 * Records diagnostics for each attempt.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchRetryOptions = {}
): Promise<FetchRetryResult> {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const sourceId = opts.sourceId ?? "unknown";
  const parserUsed = opts.parserUsed ?? null;

  const { maxRetries: _, baseDelayMs: __, timeoutMs: ___, sourceId: ____, parserUsed: _____, ...fetchOpts } = opts;
  const startTotal = Date.now();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startAttempt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const mergedSignal = opts.signal
        ? anySignal([opts.signal, controller.signal])
        : controller.signal;

      const response = await fetch(url, {
        ...fetchOpts,
        signal: mergedSignal,
      });

      clearTimeout(timeout);

      const responseTimeMs = Date.now() - startAttempt;

      // Record diagnostics (non-blocking)
      recordDiagnostic(sourceId, url, {
        http_status: response.status,
        final_url: response.url !== url ? response.url : null,
        response_time_ms: responseTimeMs,
        parser_used: parserUsed,
        error_code: response.ok ? null : `http_${response.status}`,
      }).catch(() => {});

      // Retry on transient errors
      if (isRetryable(response.status) && attempt < maxRetries) {
        const delay = backoffDelay(baseDelay, attempt);
        console.warn(
          `[fetchRetry:${sourceId}] HTTP ${response.status} on attempt ${attempt + 1}, retrying in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      return {
        response,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTotal,
      };
    } catch (err) {
      const responseTimeMs = Date.now() - startAttempt;
      lastError = err instanceof Error ? err : new Error(String(err));

      const errorCode = lastError.name === "AbortError" ? "timeout" : "network_error";
      recordDiagnostic(sourceId, url, {
        http_status: null,
        response_time_ms: responseTimeMs,
        parser_used: parserUsed,
        error_code: errorCode,
      }).catch(() => {});

      if (attempt < maxRetries) {
        const delay = backoffDelay(baseDelay, attempt);
        console.warn(
          `[fetchRetry:${sourceId}] ${errorCode} on attempt ${attempt + 1}, retrying in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }
    }
  }

  throw lastError || new Error(`fetchWithRetry failed after ${maxRetries + 1} attempts`);
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504 || status === 408;
}

function backoffDelay(baseMs: number, attempt: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, 10000); // cap at 10s
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Combine multiple AbortSignals into one */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// ─── Diagnostics recording ──────────────────────────────────────────

interface DiagnosticData {
  http_status: number | null;
  final_url?: string | null;
  response_time_ms: number;
  content_length?: number | null;
  extracted_text_length?: number | null;
  main_content_ratio?: number | null;
  parser_used: string | null;
  error_code: string | null;
  metadata_json?: Record<string, unknown>;
}

export async function recordDiagnostic(
  sourceId: string,
  url: string,
  data: DiagnosticData
): Promise<void> {
  try {
    await query(
      `INSERT INTO ingestion_diagnostics
        (source_id, url, http_status, final_url, response_time_ms, content_length,
         extracted_text_length, main_content_ratio, parser_used, error_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        sourceId,
        url.slice(0, 2000),
        data.http_status,
        data.final_url || null,
        data.response_time_ms,
        data.content_length ?? null,
        data.extracted_text_length ?? null,
        data.main_content_ratio ?? null,
        data.parser_used,
        data.error_code,
        data.metadata_json ?? {},
      ]
    );
  } catch {
    // Diagnostics recording should never break the pipeline
  }
}

// ─── Source state management (ETags / Last-Modified) ─────────────────

export interface ConditionalFetchResult {
  notModified: boolean;
  response: Response | null;
  etag: string | null;
  lastModified: string | null;
}

/**
 * Performs a conditional fetch using stored ETag/Last-Modified headers.
 * Returns notModified=true if the resource hasn't changed (304).
 */
export async function conditionalFetch(
  url: string,
  sourceId: string,
  fetchOpts: RequestInit = {}
): Promise<ConditionalFetchResult> {
  // Load stored state
  const rows = await query<{ etag: string | null; last_modified: string | null }>(
    `SELECT etag, last_modified FROM source_state WHERE source_id = $1`,
    [sourceId]
  ).catch(() => []);

  const stored = rows[0];
  const headers = new Headers(fetchOpts.headers);

  if (stored?.etag) {
    headers.set("If-None-Match", stored.etag);
  }
  if (stored?.last_modified) {
    headers.set("If-Modified-Since", stored.last_modified);
  }

  const { response } = await fetchWithRetry(url, {
    ...fetchOpts,
    headers,
    sourceId,
    parserUsed: "conditional",
  });

  if (response.status === 304) {
    // Update last_success_at
    await updateSourceState(sourceId, {}).catch(() => {});
    return { notModified: true, response: null, etag: stored?.etag ?? null, lastModified: stored?.last_modified ?? null };
  }

  // Store new ETag/Last-Modified
  const newEtag = response.headers.get("ETag");
  const newLastModified = response.headers.get("Last-Modified");
  if (newEtag || newLastModified) {
    await updateSourceState(sourceId, {
      etag: newEtag,
      last_modified: newLastModified,
    }).catch(() => {});
  }

  return { notModified: false, response, etag: newEtag, lastModified: newLastModified };
}

export async function updateSourceState(
  sourceId: string,
  updates: {
    etag?: string | null;
    last_modified?: string | null;
    last_cursor?: string | null;
    content_hash?: string | null;
    access_method?: string | null;
    failure?: boolean;
  }
): Promise<void> {
  if (updates.failure) {
    await query(
      `INSERT INTO source_state (source_id, last_failure_at, consecutive_failures)
       VALUES ($1, now(), 1)
       ON CONFLICT (source_id) DO UPDATE SET
         last_failure_at = now(),
         consecutive_failures = source_state.consecutive_failures + 1,
         updated_at = now()`,
      [sourceId]
    );
    return;
  }

  await query(
    `INSERT INTO source_state (source_id, etag, last_modified, last_cursor, content_hash, access_method, last_success_at, consecutive_failures)
     VALUES ($1, $2, $3, $4, $5, $6, now(), 0)
     ON CONFLICT (source_id) DO UPDATE SET
       etag = COALESCE($2, source_state.etag),
       last_modified = COALESCE($3, source_state.last_modified),
       last_cursor = COALESCE($4, source_state.last_cursor),
       content_hash = COALESCE($5, source_state.content_hash),
       access_method = COALESCE($6, source_state.access_method),
       last_success_at = now(),
       consecutive_failures = 0,
       degraded_until = NULL,
       updated_at = now()`,
    [
      sourceId,
      updates.etag ?? null,
      updates.last_modified ?? null,
      updates.last_cursor ?? null,
      updates.content_hash ?? null,
      updates.access_method ?? null,
    ]
  );
}
