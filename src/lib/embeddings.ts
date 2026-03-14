/**
 * Vector embedding service.
 *
 * Handles chunking signals, calling OpenAI embeddings API,
 * storing vectors in pgvector, and semantic search/retrieval.
 *
 * Model: text-embedding-3-small (1536 dims, ~$0.02/1M tokens)
 */

import OpenAI from "openai";
import { query } from "./db";
import { getDerivedProfileArrays } from "./profileUtils";
import type { Signal, Profile } from "./types";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── Embedding API ──────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const MAX_BATCH_SIZE = 2048;

/**
 * Embed a single text string.
 */
export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAI();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMS,
  });
  return res.data[0].embedding;
}

/**
 * Batch-embed multiple texts (up to 2048 per call).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getOpenAI();
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMS,
    });
    // OpenAI returns embeddings in the same order as input
    for (const item of res.data) {
      results.push(item.embedding);
    }
  }

  return results;
}

// ─── Chunking ───────────────────────────────────────────────────────

const CHUNK_TOKEN_TARGET = 500;
const CHUNK_OVERLAP_TOKENS = 50;

/**
 * Split a signal into embeddable chunks.
 * Chunk 0: title + summary + ai_analysis (always present)
 * Chunk 1+: body text if available (split at ~500 token boundaries)
 */
export function chunkSignal(signal: Signal): string[] {
  const chunks: string[] = [];

  // Chunk 0: core metadata
  const core = [signal.title, signal.summary, signal.ai_analysis]
    .filter(Boolean)
    .join(". ");
  chunks.push(core);

  // If there's substantial body text beyond what's in summary/analysis,
  // chunk it. For now, signals don't carry a separate body field from
  // ingestion — this is future-proofed for when Firecrawl body text
  // is stored alongside signals.
  // Body chunking would go here when raw body storage is added.

  return chunks;
}

/**
 * Split long text into overlapping chunks at word boundaries.
 * Approximate token count: words × 1.3
 */
export function chunkText(text: string): string[] {
  const words = text.split(/\s+/);
  const wordsPerChunk = Math.floor(CHUNK_TOKEN_TARGET / 1.3);
  const overlapWords = Math.floor(CHUNK_OVERLAP_TOKENS / 1.3);

  if (words.length <= wordsPerChunk) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    chunks.push(words.slice(start, end).join(" "));
    start = end - overlapWords;
    if (start >= words.length - overlapWords) break;
  }
  return chunks;
}

// ─── Storage ────────────────────────────────────────────────────────

/**
 * Embed and store all chunks for a signal.
 * Idempotent — deletes existing embeddings for the signal first.
 */
export async function storeSignalEmbeddings(
  signalId: string,
  chunks: string[]
): Promise<void> {
  if (chunks.length === 0) return;

  const embeddings = await embedBatch(chunks);

  // Delete existing embeddings for this signal (idempotent upsert)
  await query("DELETE FROM signal_embeddings WHERE signal_id = $1", [signalId]);

  // Batch insert
  const values: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  for (let i = 0; i < chunks.length; i++) {
    values.push(`($${pi}, $${pi + 1}, $${pi + 2}, $${pi + 3}, $${pi + 4})`);
    params.push(
      signalId,
      i,
      chunks[i],
      `[${embeddings[i].join(",")}]`,
      EMBEDDING_MODEL
    );
    pi += 5;
  }

  await query(
    `INSERT INTO signal_embeddings (signal_id, chunk_index, chunk_text, embedding, model)
     VALUES ${values.join(", ")}`,
    params
  );
}

const BODY_TRUNCATE_CHARS = 1500; // ~500 tokens when body included in chunk 0

/**
 * Extract body text from raw_payload when available (e.g. Firecrawl content/markdown).
 */
export function extractBodyFromRawPayload(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== "object") return "";
  const raw = (payload.content ?? payload.markdown ?? payload.body) as string | undefined;
  if (typeof raw !== "string" || !raw.trim()) return "";
  return raw.trim().slice(0, BODY_TRUNCATE_CHARS);
}

/**
 * Embed and store a batch of signals. Used by the ingestion pipeline and embed-backfill.
 * When body text exists (e.g. from Firecrawl raw_payload), include it for richer semantic search.
 */
export async function embedAndStoreSignals(
  signals: {
    id: string;
    title: string;
    summary: string;
    ai_analysis: string;
    body?: string;
  }[]
): Promise<number> {
  if (signals.length === 0) return 0;

  // Build chunk 0 for each signal: title + summary + ai_analysis + optional body
  const texts = signals.map((s) => {
    const parts = [s.title, s.summary, s.ai_analysis].filter(Boolean);
    if (s.body && s.body.trim()) {
      parts.push(s.body.trim().slice(0, BODY_TRUNCATE_CHARS));
    }
    return parts.join(". ");
  });

  const embeddings = await embedBatch(texts);

  // Batch insert all at once
  const values: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  for (let i = 0; i < signals.length; i++) {
    values.push(`($${pi}, $${pi + 1}, $${pi + 2}, $${pi + 3}, $${pi + 4})`);
    params.push(
      signals[i].id,
      0,
      texts[i],
      `[${embeddings[i].join(",")}]`,
      EMBEDDING_MODEL
    );
    pi += 5;
  }

  await query(
    `INSERT INTO signal_embeddings (signal_id, chunk_index, chunk_text, embedding, model)
     VALUES ${values.join(", ")}
     ON CONFLICT DO NOTHING`,
    params
  );

  return signals.length;
}

// ─── Semantic Search ────────────────────────────────────────────────

interface SemanticSearchOptions {
  limit?: number;
  region?: string;
  domain?: string;
}

/**
 * Find signals semantically similar to a query string.
 * Uses pgvector cosine distance with optional region/domain filters.
 */
export async function findSimilarSignals(
  queryText: string,
  options: SemanticSearchOptions = {}
): Promise<Signal[]> {
  const { limit = 10, region, domain } = options;

  const queryEmbedding = await embedText(queryText);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  let sql = `
    SELECT s.*, se.embedding <=> $1::vector AS distance
    FROM signal_embeddings se
    JOIN signals s ON s.id = se.signal_id
    WHERE se.chunk_index = 0
  `;
  const params: unknown[] = [embeddingStr];
  let pi = 2;

  if (region) {
    sql += ` AND s.region = $${pi}`;
    params.push(region);
    pi++;
  }
  if (domain) {
    sql += ` AND $${pi} = ANY(s.domains)`;
    params.push(domain);
    pi++;
  }

  sql += ` ORDER BY distance ASC LIMIT $${pi}`;
  params.push(limit);

  return query<Signal>(sql, params);
}

// ─── Profile Interest Embeddings ────────────────────────────────────

/**
 * Build and store a single embedding vector for a profile's interests.
 * Concatenates all profile context into one text and embeds it.
 */
export async function buildProfileVector(profile: Profile): Promise<void> {
  const derived = await getDerivedProfileArrays(profile.id);
  const interestParts: string[] = [];

  if (profile.therapeutic_areas.length > 0) {
    interestParts.push(`Therapeutic areas: ${profile.therapeutic_areas.join(", ")}`);
  }
  if (derived.tracked_products.length > 0) {
    interestParts.push(`Products: ${derived.tracked_products.join(", ")}`);
  }
  if (derived.competitors.length > 0) {
    interestParts.push(`Competitors: ${derived.competitors.join(", ")}`);
  }
  if (profile.active_submissions.length > 0) {
    interestParts.push(`Submissions: ${profile.active_submissions.join(", ")}`);
  }
  if (profile.domains.length > 0) {
    interestParts.push(`Domains: ${profile.domains.join(", ")}`);
  }
  if (profile.regions.length > 0) {
    interestParts.push(`Regions: ${profile.regions.join(", ")}`);
  }
  if (profile.regulatory_frameworks.length > 0) {
    interestParts.push(`Frameworks: ${profile.regulatory_frameworks.join(", ")}`);
  }
  if (profile.analysis_preferences) {
    interestParts.push(profile.analysis_preferences);
  }

  const interestText = interestParts.join(". ");
  if (!interestText) return;

  const embedding = await embedText(interestText);
  const embeddingStr = `[${embedding.join(",")}]`;

  await query(
    `INSERT INTO profile_interest_embeddings (profile_id, interest_text, embedding)
     VALUES ($1, $2, $3::vector)
     ON CONFLICT (profile_id)
     DO UPDATE SET
       interest_text = EXCLUDED.interest_text,
       embedding = EXCLUDED.embedding,
       updated_at = now()`,
    [profile.id, interestText, embeddingStr]
  );
}

/**
 * Rank signals by semantic similarity to a profile's interest vector.
 * Returns signal IDs ordered by relevance.
 */
export async function rankSignalsForProfile(
  profileId: string,
  signalIds: string[],
  limit = 50
): Promise<string[]> {
  if (signalIds.length === 0) return [];

  const rows = await query<{ signal_id: string }>(
    `SELECT se.signal_id
     FROM signal_embeddings se
     JOIN profile_interest_embeddings pie ON pie.profile_id = $1
     WHERE se.signal_id = ANY($2)
       AND se.chunk_index = 0
     ORDER BY se.embedding <=> pie.embedding ASC
     LIMIT $3`,
    [profileId, signalIds, limit]
  );

  return rows.map((r) => r.signal_id);
}
