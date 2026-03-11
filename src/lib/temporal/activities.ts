import { parseIntakeText, persistIntakeMentions, persistIntakeSession } from "../intakeParser";
import { persistIntakeEntityMappings, resolveIntakeMentions } from "../entityResolver";
import { buildPolicyFromSession, persistProfilePolicy } from "../pathPlanner";
import { searchProfileEvidence } from "../profileSearchAgent";

export async function intakeParseAndResolveActivity(input: {
  profileId?: string | null;
  rawText: string;
}) {
  const parsed = await parseIntakeText(input.rawText);
  const session = await persistIntakeSession(input.rawText, parsed, input.profileId || null);
  await persistIntakeMentions(session.id, parsed.mentions);
  const resolved = await resolveIntakeMentions(parsed.mentions, "temporal");
  await persistIntakeEntityMappings(session.id, resolved);
  return {
    sessionId: session.id,
    mentionCount: parsed.mentions.length,
    resolvedCount: resolved.length,
  };
}

export async function buildProfilePolicyActivity(input: {
  profileId: string;
  sessionId: string;
}) {
  const policy = await buildPolicyFromSession(input.sessionId);
  await persistProfilePolicy(input.profileId, policy);
  return {
    focus: policy.focus_type,
    retrievalPolicy: policy.retrieval_policy_json,
  };
}

export async function profileEvidenceRefreshActivity(input: { profileId: string }) {
  const evidence = await searchProfileEvidence(input.profileId, 60);
  return {
    evidenceCount: evidence.length,
  };
}

