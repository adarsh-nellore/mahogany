import { query } from "./db";
import { ParsedMention } from "./intakeParser";
import { EntityType } from "./types";

// ─── Company suffixes to strip for normalization ────────────────────
const COMPANY_SUFFIXES = /\b(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|plc\.?|gmbh|ag|sa|s\.?a\.?|n\.?v\.?|b\.?v\.?|pty\.?|limited|incorporated)\s*$/i;

// ─── Known abbreviation map ────────────────────────────────────────
const ABBREVIATION_MAP: Record<string, string> = {
  fda: "food and drug administration",
  ema: "european medicines agency",
  mhra: "medicines and healthcare products regulatory agency",
  tga: "therapeutic goods administration",
  pmda: "pharmaceuticals and medical devices agency",
  who: "world health organization",
  ich: "international council for harmonisation",
  imdrf: "international medical device regulators forum",
  cder: "center for drug evaluation and research",
  cdrh: "center for devices and radiological health",
  cber: "center for biologics evaluation and research",
  hc: "health canada",
  mdr: "medical device regulation",
  ivdr: "in vitro diagnostic regulation",
  cgmp: "current good manufacturing practice",
  qms: "quality management system",
};

function normalizeToken(input: string): string {
  let text = input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Strip company suffixes
  text = text.replace(COMPANY_SUFFIXES, "").trim();
  return text;
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function mentionTypeToEntityType(mentionType: ParsedMention["mention_type"]): EntityType {
  if (mentionType === "company") return "company";
  if (mentionType === "ta") return "therapeutic_area";
  if (mentionType === "framework") return "framework";
  return "product";
}

async function upsertEntity(
  entityType: EntityType,
  rawText: string,
  source: string
): Promise<{ entity_id: string; canonical_name: string; via: "exact" | "alias" | "created" | "fuzzy" }> {
  const normalized = normalizeToken(rawText);
  if (!normalized) {
    throw new Error("Cannot resolve empty entity token");
  }

  // Also try expanding known abbreviations
  const expanded = ABBREVIATION_MAP[normalized] || null;

  // 1. Exact match on normalized name
  const exact = await query<{ id: string; canonical_name: string }>(
    `SELECT id, canonical_name
     FROM entities
     WHERE entity_type = $1 AND normalized_name = $2
     LIMIT 1`,
    [entityType, normalized]
  );
  if (exact.length > 0) {
    return { entity_id: exact[0].id, canonical_name: exact[0].canonical_name, via: "exact" };
  }

  // 1b. Try expanded abbreviation
  if (expanded) {
    const expandedMatch = await query<{ id: string; canonical_name: string }>(
      `SELECT id, canonical_name
       FROM entities
       WHERE entity_type = $1 AND normalized_name = $2
       LIMIT 1`,
      [entityType, expanded]
    );
    if (expandedMatch.length > 0) {
      // Also register the abbreviation as an alias
      await query(
        `INSERT INTO entity_aliases (entity_id, alias_text, alias_type, normalized_alias, source)
         VALUES ($1, $2, 'abbreviation', $3, $4)
         ON CONFLICT (entity_id, normalized_alias) DO NOTHING`,
        [expandedMatch[0].id, rawText.trim(), normalized, source]
      ).catch(() => {});
      return { entity_id: expandedMatch[0].id, canonical_name: expandedMatch[0].canonical_name, via: "alias" };
    }
  }

  // 2. Alias lookup
  const alias = await query<{ id: string; canonical_name: string }>(
    `SELECT e.id, e.canonical_name
     FROM entity_aliases a
     JOIN entities e ON e.id = a.entity_id
     WHERE e.entity_type = $1 AND a.normalized_alias = $2
     LIMIT 1`,
    [entityType, normalized]
  );
  if (alias.length > 0) {
    return { entity_id: alias[0].id, canonical_name: alias[0].canonical_name, via: "alias" };
  }

  // 3. Fuzzy match: find near-duplicates (Levenshtein distance < 3)
  if (normalized.length >= 5) {
    const candidates = await query<{ id: string; canonical_name: string; normalized_name: string }>(
      `SELECT id, canonical_name, normalized_name
       FROM entities
       WHERE entity_type = $1
         AND ABS(LENGTH(normalized_name) - LENGTH($2)) <= 3
       LIMIT 50`,
      [entityType, normalized]
    );

    for (const candidate of candidates) {
      const dist = levenshteinDistance(normalized, candidate.normalized_name);
      if (dist <= 2 && dist < normalized.length * 0.3) {
        // Close enough — merge by creating an alias
        await query(
          `INSERT INTO entity_aliases (entity_id, alias_text, alias_type, normalized_alias, source)
           VALUES ($1, $2, 'fuzzy_match', $3, $4)
           ON CONFLICT (entity_id, normalized_alias) DO NOTHING`,
          [candidate.id, rawText.trim(), normalized, source]
        ).catch(() => {});
        return { entity_id: candidate.id, canonical_name: candidate.canonical_name, via: "fuzzy" };
      }
    }
  }

  // 4. Create new entity
  const created = await query<{ id: string; canonical_name: string }>(
    `INSERT INTO entities (entity_type, canonical_name, normalized_name, metadata_json)
     VALUES ($1, $2, $3, $4)
     RETURNING id, canonical_name`,
    [entityType, rawText.trim(), normalized, { source }]
  );

  await query(
    `INSERT INTO entity_aliases (entity_id, alias_text, alias_type, normalized_alias, source)
     VALUES ($1, $2, 'intake', $3, $4)
     ON CONFLICT (entity_id, normalized_alias) DO NOTHING`,
    [created[0].id, rawText.trim(), normalized, source]
  );

  return { entity_id: created[0].id, canonical_name: created[0].canonical_name, via: "created" };
}

export interface ResolvedMention {
  mention_text: string;
  mention_type: ParsedMention["mention_type"];
  confidence: number;
  entity_id: string;
  canonical_name: string;
  resolution: "exact" | "alias" | "created" | "fuzzy";
}

export async function resolveIntakeMentions(
  mentions: ParsedMention[],
  source = "intake"
): Promise<ResolvedMention[]> {
  const resolved: ResolvedMention[] = [];
  for (const mention of mentions) {
    const entityType = mentionTypeToEntityType(mention.mention_type);
    const entity = await upsertEntity(entityType, mention.mention_text, source);
    resolved.push({
      mention_text: mention.mention_text,
      mention_type: mention.mention_type,
      confidence: mention.confidence,
      entity_id: entity.entity_id,
      canonical_name: entity.canonical_name,
      resolution: entity.via,
    });
  }
  return resolved;
}

export async function persistIntakeEntityMappings(
  sessionId: string,
  resolved: ResolvedMention[]
): Promise<void> {
  const mentionRows = await query<{ id: string; mention_text: string; mention_type: string }>(
    `SELECT id, mention_text, mention_type
     FROM intake_mentions
     WHERE session_id = $1`,
    [sessionId]
  );

  for (const rm of resolved) {
    const mention = mentionRows.find(
      (m) =>
        m.mention_text.toLowerCase() === rm.mention_text.toLowerCase() &&
        m.mention_type === rm.mention_type
    );
    await query(
      `INSERT INTO entity_mentions (entity_id, intake_mention_id, provenance_type, confidence, metadata_json)
       VALUES ($1, $2, 'intake', $3, $4)`,
      [rm.entity_id, mention?.id || null, rm.confidence, { resolution: rm.resolution, session_id: sessionId }]
    );
  }
}

