import { NextRequest, NextResponse } from "next/server";
import { parseIntakeText, persistIntakeMentions, persistIntakeSession } from "@/lib/intakeParser";
import { persistIntakeEntityMappings, resolveIntakeMentions } from "@/lib/entityResolver";
import { completeAgentRun, failAgentRun, logAgentAction, startAgentRun } from "@/lib/agentObservability";

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  try {
    const body = (await request.json()) as { text?: string; profile_id?: string };
    const text = body.text?.trim() || "";
    if (text.length < 3) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    runId = await startAgentRun("IntakeParserAgent", { text }, body.profile_id || null);
    const parsed = await parseIntakeText(text);
    await logAgentAction(runId, "parse_text", { text }, { mention_count: parsed.mentions.length });

    const session = await persistIntakeSession(text, parsed, body.profile_id || null);
    await persistIntakeMentions(session.id, parsed.mentions);
    await logAgentAction(runId, "persist_session", { session_id: session.id }, { ok: true });

    const resolved = await resolveIntakeMentions(parsed.mentions);
    await persistIntakeEntityMappings(session.id, resolved);
    await logAgentAction(runId, "resolve_entities", { session_id: session.id }, { resolved_count: resolved.length });

    await completeAgentRun(runId, {
      session_id: session.id,
      mention_count: parsed.mentions.length,
      resolved_count: resolved.length,
    });

    return NextResponse.json({
      session_id: session.id,
      parsed,
      resolved,
    });
  } catch (err) {
    if (runId) {
      await failAgentRun(runId, err);
    }
    console.error("[api/intake/parse]", err);
    return NextResponse.json(
      { error: "Failed to parse intake", details: String(err) },
      { status: 500 }
    );
  }
}

