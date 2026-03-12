import { query } from "@/lib/db";
import { classifySignal } from "@/lib/classifier";
import { filterWithExceptions, resetContentHashCache } from "@/lib/contentQualityGate";
import { embedAndStoreSignals } from "@/lib/embeddings";
import { SignalDraft, IngestionSummary } from "@/lib/types";

/**
 * Shared classify-and-store pipeline.
 * Takes raw SignalDraft[] from any fetcher tier, deduplicates,
 * classifies via AI, and upserts into the signals table.
 */
export async function classifyAndStore(
  drafts: SignalDraft[]
): Promise<IngestionSummary> {
  const summary: IngestionSummary = {
    total_raw_events: 0,
    total_signals: 0,
    by_source: {},
    errors: [],
  };

  if (drafts.length === 0) return summary;

  // Reset dedup hash cache at the start of each ingestion run
  resetContentHashCache();

  const cleanDrafts = await filterWithExceptions(drafts);
  console.log(
    `[ingestion] ${drafts.length} drafts → ${cleanDrafts.length} after quality filter`
  );

  // #region agent log
  fetch('http://127.0.0.1:7908/ingest/de110b46-3463-4525-b451-26fba311e03c', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'c2cecf',
    },
    body: JSON.stringify({
      sessionId: 'c2cecf',
      runId: 'pre-fix',
      hypothesisId: 'H1',
      location: 'src/lib/ingestion.ts:26',
      message: 'ingestion_clean_drafts_by_source',
      data: {
        total_raw_drafts: drafts.length,
        total_clean_drafts: cleanDrafts.length,
        by_source: cleanDrafts.reduce<Record<string, number>>((acc, d) => {
          acc[d.source_id] = (acc[d.source_id] || 0) + 1;
          return acc;
        }, {}),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  for (const draft of cleanDrafts) {
    try {
      const existing = await query(
        `SELECT id FROM raw_events WHERE url = $1 LIMIT 1`,
        [draft.url]
      );

      let rawEventId: string;

      if (existing.length > 0) {
        rawEventId = existing[0].id;
      } else {
        const inserted = await query<{ id: string }>(
          `INSERT INTO raw_events (source_id, url, title, raw_payload)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [draft.source_id, draft.url, draft.title, JSON.stringify(draft.raw_payload)]
        );
        rawEventId = inserted[0].id;
        summary.total_raw_events++;
      }

      const existingSignal = await query(
        `SELECT id FROM signals WHERE raw_event_id = $1 LIMIT 1`,
        [rawEventId]
      );
      if (existingSignal.length > 0) continue;

      const signal = await classifySignal(draft, rawEventId);

      await query(
        `INSERT INTO signals (
          raw_event_id, source_id, url, title, summary, published_at,
          authority, document_id, region, domains, therapeutic_areas,
          product_types, product_classes, lifecycle_stage, impact_type,
          impact_severity, ai_analysis
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
        ON CONFLICT (document_id, authority)
          WHERE document_id IS NOT NULL
        DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          impact_severity = EXCLUDED.impact_severity,
          ai_analysis = EXCLUDED.ai_analysis`,
        [
          rawEventId, signal.source_id, signal.url, signal.title,
          signal.summary, signal.published_at, signal.authority,
          signal.document_id, signal.region, signal.domains,
          signal.therapeutic_areas, signal.product_types, signal.product_classes,
          signal.lifecycle_stage, signal.impact_type, signal.impact_severity,
          signal.ai_analysis,
        ]
      );

      summary.total_signals++;
      summary.by_source[draft.source_id] = (summary.by_source[draft.source_id] || 0) + 1;
    } catch (draftErr) {
      const msg = `Draft error (${draft.source_id}): ${draftErr}`;
      console.error(`[ingestion] ${msg}`);
      summary.errors.push(msg);
    }
  }

  // Embed newly ingested signals (non-blocking, batched)
  if (summary.total_signals > 0 && process.env.OPENAI_API_KEY) {
    try {
      const recentSignals = await query<{
        id: string; title: string; summary: string; ai_analysis: string;
      }>(
        `SELECT id, title, summary, ai_analysis FROM signals
         ORDER BY created_at DESC LIMIT $1`,
        [summary.total_signals]
      );
      const embedded = await embedAndStoreSignals(recentSignals);
      console.log(`[ingestion] embedded ${embedded} signals`);
    } catch (embedErr) {
      console.error(`[ingestion] embedding failed (non-fatal): ${embedErr}`);
    }
  }

  console.log(
    `[ingestion] done: ${summary.total_raw_events} raw events, ${summary.total_signals} signals`
  );
  return summary;
}
