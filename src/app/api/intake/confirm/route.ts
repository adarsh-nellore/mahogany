import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { buildPolicyFromSession, persistProfilePolicy } from "@/lib/pathPlanner";
import { completeAgentRun, failAgentRun, logAgentAction, startAgentRun } from "@/lib/agentObservability";

interface ConfirmWatchItem {
  mention_text: string;
  watch_type?: "exact" | "competitor" | "adjacent";
  priority?: number;
}

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  try {
    const body = (await request.json()) as {
      session_id?: string;
      profile_id?: string;
      watch_items?: ConfirmWatchItem[];
    };
    if (!body.session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    runId = await startAgentRun("IntakeConfirmAgent", body as Record<string, unknown>, body.profile_id || null);

    const sessionRows = await query<{ profile_id: string | null }>(
      `SELECT profile_id FROM intake_sessions WHERE id = $1 LIMIT 1`,
      [body.session_id]
    );
    if (sessionRows.length === 0) {
      return NextResponse.json({ error: "intake session not found" }, { status: 404 });
    }

    const profileId = body.profile_id || sessionRows[0].profile_id;
    if (!profileId) {
      return NextResponse.json({ error: "profile_id is required to confirm intake" }, { status: 400 });
    }

    await query(
      `UPDATE intake_sessions SET profile_id = $2, status = 'confirmed' WHERE id = $1`,
      [body.session_id, profileId]
    );

    const resolvedRows = await query<{ entity_id: string; mention_text: string }>(
      `SELECT DISTINCT em.entity_id, im.mention_text
       FROM intake_mentions im
       JOIN entity_mentions em ON em.intake_mention_id = im.id
       WHERE im.session_id = $1`,
      [body.session_id]
    );

    const selectedWatchItems = body.watch_items?.length
      ? body.watch_items
      : resolvedRows.map((r) => ({ mention_text: r.mention_text, watch_type: "exact" as const, priority: 80 }));

    for (const item of selectedWatchItems) {
      const entity = resolvedRows.find(
        (r) => r.mention_text.toLowerCase() === item.mention_text.toLowerCase()
      );
      if (!entity) continue;
      await query(
        `INSERT INTO profile_watch_items (profile_id, entity_id, watch_type, priority)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (profile_id, entity_id, watch_type) DO UPDATE
         SET priority = EXCLUDED.priority`,
        [profileId, entity.entity_id, item.watch_type || "exact", item.priority ?? 80]
      );
      await query(
        `INSERT INTO profile_entity_interest (profile_id, entity_id, interest_score, source)
         VALUES ($1, $2, $3, 'intake')
         ON CONFLICT (profile_id, entity_id) DO UPDATE
         SET interest_score = GREATEST(profile_entity_interest.interest_score, EXCLUDED.interest_score), updated_at = now()`,
        [profileId, entity.entity_id, (item.priority ?? 80) / 100]
      );
    }
    await logAgentAction(runId, "persist_watch_items", { count: selectedWatchItems.length }, { ok: true });

    const policy = await buildPolicyFromSession(body.session_id);
    await persistProfilePolicy(profileId, policy);
    await logAgentAction(runId, "persist_policy", { profile_id: profileId }, { focus: policy.focus_type });

    await completeAgentRun(runId, { profile_id: profileId, focus: policy.focus_type });

    return NextResponse.json({
      ok: true,
      profile_id: profileId,
      focus: policy.focus_type,
      policy: policy.retrieval_policy_json,
      rationale: policy.rationale,
    });
  } catch (err) {
    if (runId) {
      await failAgentRun(runId, err);
    }
    console.error("[api/intake/confirm]", err);
    return NextResponse.json(
      { error: "Failed to confirm intake", details: String(err) },
      { status: 500 }
    );
  }
}

