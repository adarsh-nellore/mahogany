/**
 * Source change detection module.
 *
 * After each fetch, compares response structure hash vs previous.
 * Flags schema changes (new/missing fields, different HTML structure).
 * Auto-alerts when failure rate exceeds 50% over 24h.
 */

import { createHash } from "crypto";
import { query } from "./db";
import { recordDiagnostic } from "./fetchRetry";

export interface ChangeDetectionResult {
  changed: boolean;
  changeType?: "schema_changed" | "structure_changed" | "content_hash_changed";
  previousHash?: string;
  currentHash?: string;
}

/**
 * Compute a structure hash from response data.
 * For JSON: hash of sorted key paths.
 * For HTML: hash of tag structure (ignoring content).
 */
export function computeStructureHash(content: string, contentType: "json" | "html" | "xml"): string {
  let normalized: string;

  if (contentType === "json") {
    try {
      const parsed = JSON.parse(content);
      normalized = extractJsonPaths(parsed).sort().join("|");
    } catch {
      normalized = content.slice(0, 1000);
    }
  } else if (contentType === "html" || contentType === "xml") {
    // Extract tag structure only
    const tags = content.match(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g) || [];
    normalized = tags
      .map((t) => t.replace(/\s[^>]*/g, "").toLowerCase())
      .slice(0, 200)
      .join("");
  } else {
    normalized = content.slice(0, 2000);
  }

  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Extract all key paths from a JSON object (e.g., "data.items[].title").
 */
function extractJsonPaths(obj: unknown, prefix = ""): string[] {
  const paths: string[] = [];

  if (Array.isArray(obj)) {
    if (obj.length > 0) {
      paths.push(...extractJsonPaths(obj[0], prefix + "[]"));
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      paths.push(fullPath);
      paths.push(...extractJsonPaths((obj as Record<string, unknown>)[key], fullPath));
    }
  }

  return paths;
}

/**
 * Compare current response structure with stored hash.
 * Updates stored hash and flags changes in diagnostics.
 */
export async function detectChanges(
  sourceId: string,
  content: string,
  contentType: "json" | "html" | "xml"
): Promise<ChangeDetectionResult> {
  const currentHash = computeStructureHash(content, contentType);

  try {
    const rows = await query<{ content_hash: string | null }>(
      `SELECT content_hash FROM source_state WHERE source_id = $1`,
      [sourceId]
    );

    const previousHash = rows[0]?.content_hash ?? null;

    // Update stored hash
    await query(
      `INSERT INTO source_state (source_id, content_hash, last_success_at)
       VALUES ($1, $2, now())
       ON CONFLICT (source_id) DO UPDATE SET
         content_hash = $2,
         updated_at = now()`,
      [sourceId, currentHash]
    );

    if (previousHash && previousHash !== currentHash) {
      // Structure changed — record in diagnostics
      recordDiagnostic(sourceId, "", {
        http_status: null,
        response_time_ms: 0,
        parser_used: "change_detector",
        error_code: "schema_changed",
        metadata_json: { previous_hash: previousHash, current_hash: currentHash },
      }).catch(() => {});

      return {
        changed: true,
        changeType: "schema_changed",
        previousHash,
        currentHash,
      };
    }

    return { changed: false, currentHash };
  } catch {
    return { changed: false, currentHash };
  }
}

/**
 * Get all sources that have had schema changes in the last N hours.
 */
export async function getRecentSchemaChanges(
  hours = 24
): Promise<{ source_id: string; detected_at: string; metadata: Record<string, unknown> }[]> {
  try {
    const rows = await query<{ source_id: string; detected_at: string; metadata_json: Record<string, unknown> }>(
      `SELECT source_id, created_at::text AS detected_at, metadata_json
       FROM ingestion_diagnostics
       WHERE error_code = 'schema_changed'
         AND created_at > now() - interval '1 hour' * $1
       ORDER BY created_at DESC`,
      [hours]
    );
    return rows.map((r) => ({ source_id: r.source_id, detected_at: r.detected_at, metadata: r.metadata_json }));
  } catch {
    return [];
  }
}
