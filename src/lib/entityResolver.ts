import { query } from "./db";
import { ParsedMention } from "./intakeParser";
import { EntityType } from "./types";

function normalizeToken(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
): Promise<{ entity_id: string; canonical_name: string; via: "exact" | "alias" | "created" }> {
  const normalized = normalizeToken(rawText);
  if (!normalized) {
    throw new Error("Cannot resolve empty entity token");
  }

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
  resolution: "exact" | "alias" | "created";
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

