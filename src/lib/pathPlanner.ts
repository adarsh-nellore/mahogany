import { query } from "./db";
import { ProfileFocusType } from "./types";

export interface PlannedPolicy {
  focus_type: ProfileFocusType;
  weights: Record<ProfileFocusType, number>;
  retrieval_policy_json: Record<string, unknown>;
  rationale: string[];
}

interface MentionSummary {
  productCount: number;
  taCount: number;
  frameworkCount: number;
}

function inferFocus(summary: MentionSummary): ProfileFocusType {
  if (summary.productCount > 0) return "product";
  if (summary.taCount > 0) return "ta";
  if (summary.frameworkCount > 0) return "framework";
  return "broad";
}

export function buildQueryPolicy(summary: MentionSummary): PlannedPolicy {
  const focus = inferFocus(summary);
  const weights: Record<ProfileFocusType, number> = {
    product: focus === "product" ? 1 : 0.2,
    ta: focus === "ta" ? 1 : 0.2,
    framework: focus === "framework" ? 1 : 0.2,
    broad: focus === "broad" ? 1 : 0.2,
  };

  const rationale = [`Selected ${focus}-centric path based on parsed intake mentions.`];
  const retrieval_policy_json = {
    focus,
    tiers: ["exact_code", "alias_entity", "relation_hop"],
    max_hops: focus === "product" ? 2 : 1,
    include_competitors: summary.productCount > 0,
    include_framework_context: summary.frameworkCount > 0,
  };

  return {
    focus_type: focus,
    weights,
    retrieval_policy_json,
    rationale,
  };
}

export async function buildPolicyFromSession(sessionId: string): Promise<PlannedPolicy> {
  const rows = await query<{ mention_type: string; c: string }>(
    `SELECT mention_type, count(*)::text AS c
     FROM intake_mentions
     WHERE session_id = $1
     GROUP BY mention_type`,
    [sessionId]
  );
  const summary: MentionSummary = { productCount: 0, taCount: 0, frameworkCount: 0 };
  for (const row of rows) {
    const count = parseInt(row.c, 10);
    if (row.mention_type === "product_name" || row.mention_type === "product_code") {
      summary.productCount += count;
    } else if (row.mention_type === "ta") {
      summary.taCount += count;
    } else if (row.mention_type === "framework") {
      summary.frameworkCount += count;
    }
  }
  return buildQueryPolicy(summary);
}

export async function persistProfilePolicy(
  profileId: string,
  policy: PlannedPolicy
): Promise<void> {
  await query(
    `INSERT INTO profile_query_policies (profile_id, retrieval_policy_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (profile_id)
     DO UPDATE SET retrieval_policy_json = EXCLUDED.retrieval_policy_json, updated_at = now()`,
    [profileId, policy.retrieval_policy_json]
  );

  for (const [focusType, weight] of Object.entries(policy.weights)) {
    await query(
      `INSERT INTO profile_focus (profile_id, focus_type, weight, derived_from, updated_at)
       VALUES ($1, $2, $3, 'inferred', now())
       ON CONFLICT (profile_id, focus_type)
       DO UPDATE SET weight = EXCLUDED.weight, derived_from = EXCLUDED.derived_from, updated_at = now()`,
      [profileId, focusType, weight]
    );
  }
}

