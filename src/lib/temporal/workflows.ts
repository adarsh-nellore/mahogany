import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";

const a = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3 },
});

export async function intakeIntelligenceWorkflow(input: {
  profileId?: string | null;
  rawText: string;
}) {
  const parseResult = await a.intakeParseAndResolveActivity({
    profileId: input.profileId || null,
    rawText: input.rawText,
  });

  if (input.profileId) {
    await a.buildProfilePolicyActivity({
      profileId: input.profileId,
      sessionId: parseResult.sessionId,
    });
  }

  return parseResult;
}

export async function profileRefreshWorkflow(input: { profileId: string }) {
  return a.profileEvidenceRefreshActivity({ profileId: input.profileId });
}

