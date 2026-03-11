import { isTemporalEnabled, startWorkflow } from "./temporal/client";

export async function kickoffIntakeWorkflow(profileId: string | null, rawText: string): Promise<void> {
  if (!isTemporalEnabled()) return;
  await startWorkflow(
    "intakeIntelligenceWorkflow",
    `intake-${profileId || "anon"}-${Date.now()}`,
    [{ profileId, rawText }]
  );
}

export async function kickoffProfileRefreshWorkflow(profileId: string): Promise<void> {
  if (!isTemporalEnabled()) return;
  await startWorkflow("profileRefreshWorkflow", `profile-refresh-${profileId}-${Date.now()}`, [{ profileId }]);
}

