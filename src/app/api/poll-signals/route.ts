import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchSignalsForProfile } from "@/lib/fetchers";
import { classifySignal } from "@/lib/classifier";
import { Profile, SignalDraft, IngestionSummary } from "@/lib/types";

export const maxDuration = 300;

const GARBAGE_PATTERNS = [
  // Navigation / UI elements
  /^cookie/i, /^accept all/i, /^skip to/i, /^consent/i,
  /^navigation/i, /^menu/i, /^sign in/i, /^log ?in/i, /^sign up/i,
  /^search$/i, /^home$/i, /^back$/i, /^close$/i, /^subscribe/i,
  /^share this/i, /^follow us/i, /^copyright/i, /^privacy policy/i,
  /^terms of/i, /^contact us/i, /^\d+$/,
  // Error / 404 pages
  /^404/i, /^page not found/i, /^error/i, /^loading/i,
  /^not found/i, /^resource not found/i, /^file not found/i,
  /couldn'?t find/i, /^we couldn'?t/i, /^the page you/i,
  /^sorry.*not found/i, /^oops/i, /^something went wrong/i,
  /^access denied/i, /^unauthorized/i, /^forbidden/i,
  // Cookie / GDPR banners
  /needs your.*consent/i, /explicit consent/i, /store.*cookie/i,
  /^this site uses cookies/i, /^we use cookies/i, /^by (continuing|using)/i,
  /^your privacy/i, /^manage (your )?cookies/i,
  // Generic web chrome
  /^(read|learn) more$/i, /^click here/i, /^view (all|more)/i,
  /^see (all|more)/i, /^download( now)?$/i,
];

// Minimum content quality for a signal title
const REGULATORY_SIGNAL_WORDS = /\b(fda|ema|mhra|recall|guidance|approval|clinical|trial|drug|device|regulation|safety|warning|alert|review|authorization|licence|clearance|designation|submission|inspection|enforcement|compliance|standard|directive|regulation)\b/i;

function isGarbageSignal(draft: SignalDraft): boolean {
  const title = draft.title.trim();
  if (title.length < 10) return true;
  if (title.length > 500) return true;
  if (!title.match(/[a-zA-Z]{3,}/)) return true;
  if (GARBAGE_PATTERNS.some((p) => p.test(title))) return true;
  const wordCount = title.split(/\s+/).length;
  if (wordCount < 3) return true;

  // For very short titles (< 8 words), require at least one regulatory keyword
  // to avoid ingesting generic text fragments from scraped pages
  if (wordCount < 8 && !REGULATORY_SIGNAL_WORDS.test(title)) return true;

  return false;
}

async function ingest(): Promise<IngestionSummary> {
  const summary: IngestionSummary = {
    total_raw_events: 0,
    total_signals: 0,
    by_source: {},
    errors: [],
  };

  const profiles = await query<Profile>(`SELECT * FROM profiles`);

  if (profiles.length === 0) {
    return summary;
  }

  for (const profile of profiles) {
    try {
      const drafts = await fetchSignalsForProfile(profile);
      console.log(`[poll-signals] profile ${profile.id}: ${drafts.length} drafts`);

      const cleanDrafts = drafts.filter((d) => !isGarbageSignal(d));
      console.log(`[poll-signals] profile ${profile.id}: ${drafts.length} drafts → ${cleanDrafts.length} after quality filter`);

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
          console.error(`[poll-signals] ${msg}`);
          summary.errors.push(msg);
        }
      }
    } catch (profileErr) {
      const msg = `Profile ${profile.id} error: ${profileErr}`;
      console.error(`[poll-signals] ${msg}`);
      summary.errors.push(msg);
    }
  }

  console.log(`[poll-signals] done: ${summary.total_raw_events} raw events, ${summary.total_signals} signals`);
  return summary;
}

export async function GET() {
  try {
    const summary = await ingest();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals] fatal error:", err);
    return NextResponse.json({ error: "Ingestion failed", details: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const summary = await ingest();
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[poll-signals] fatal error:", err);
    return NextResponse.json({ error: "Ingestion failed", details: String(err) }, { status: 500 });
  }
}
