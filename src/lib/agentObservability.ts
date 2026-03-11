import { query } from "./db";

export async function startAgentRun(
  agentName: string,
  input: Record<string, unknown>,
  profileId?: string | null
): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO agent_runs (agent_name, profile_id, status, input_json)
     VALUES ($1, $2, 'running', $3)
     RETURNING id`,
    [agentName, profileId || null, input]
  );
  return rows[0].id;
}

export async function logAgentAction(
  runId: string,
  actionName: string,
  actionInput: Record<string, unknown>,
  actionOutput: Record<string, unknown>,
  status: "queued" | "running" | "completed" | "failed" = "completed"
): Promise<void> {
  await query(
    `INSERT INTO agent_actions (run_id, action_name, action_input, action_output, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [runId, actionName, actionInput, actionOutput, status]
  );
}

export async function completeAgentRun(
  runId: string,
  output: Record<string, unknown>
): Promise<void> {
  await query(
    `UPDATE agent_runs
     SET status = 'completed', output_json = $2, completed_at = now()
     WHERE id = $1`,
    [runId, output]
  );
}

export async function failAgentRun(runId: string, error: unknown): Promise<void> {
  await query(
    `UPDATE agent_runs
     SET status = 'failed', error_text = $2, completed_at = now()
     WHERE id = $1`,
    [runId, String(error)]
  );
}

