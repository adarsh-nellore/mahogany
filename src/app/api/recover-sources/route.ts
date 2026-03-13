/**
 * Source recovery agent endpoint.
 *
 * POST /api/recover-sources
 *   Resets degraded or high-failure sources so the next poll will try
 *   the primary method again. Called periodically by cron.
 *
 * Run every 12h (e.g. 0 0,12 * * *) so broken sources get a fresh chance.
 */

import { NextResponse } from "next/server";
import { resetRecoverableSources } from "@/lib/sourceRecovery";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 60;

async function recover() {
  const recovered = await resetRecoverableSources();

  if (recovered.length === 0) {
    return { ok: true, message: "No sources needed recovery", recovered: [] };
  }

  console.log(
    `[recover-sources] reset ${recovered.length} sources:`,
    recovered.map((r) => `${r.source_id} (${r.reason}, was ${r.previous_failures} failures)`).join(", ")
  );

  return {
    ok: true,
    message: `Reset ${recovered.length} source(s) for retry`,
    recovered,
  };
}

export async function GET(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await recover();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[recover-sources] error:", err);
    return NextResponse.json(
      { error: "Source recovery failed", details: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!requireCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await recover();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[recover-sources] error:", err);
    return NextResponse.json(
      { error: "Source recovery failed", details: String(err) },
      { status: 500 }
    );
  }
}
