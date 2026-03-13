import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-guards";
import { comparativeAlerts } from "@/lib/profileSearchAgent";
import { completeAgentRun, failAgentRun, logAgentAction, startAgentRun } from "@/lib/agentObservability";

export async function POST(request: NextRequest) {
  let runId: string | null = null;
  try {
    const body = (await request.json()) as { profile_id?: string };
    const authUser = await getAuthUser(request);
    const profileId = body.profile_id || authUser?.id;
    if (!profileId) {
      return NextResponse.json({ error: "profile_id is required" }, { status: 400 });
    }

    runId = await startAgentRun("ComparativeAlertsAgent", {}, profileId);
    const bundles = await comparativeAlerts(profileId);
    await logAgentAction(runId, "comparative_alerts", {}, { count: bundles.length });
    await completeAgentRun(runId, { count: bundles.length });

    return NextResponse.json({
      profile_id: profileId,
      bundles,
    });
  } catch (err) {
    if (runId) await failAgentRun(runId, err);
    console.error("[api/profile-search/comparative]", err);
    return NextResponse.json(
      { error: "Comparative alerts failed", details: String(err) },
      { status: 500 }
    );
  }
}

