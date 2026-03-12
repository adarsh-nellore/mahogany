import { Client, Connection, WorkflowHandle } from "@temporalio/client";

let cachedClient: Client | null = null;

async function getClient(): Promise<Client> {
  if (cachedClient) return cachedClient;
  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const connection = await Connection.connect({ address });
  cachedClient = new Client({ connection, namespace });
  return cachedClient;
}

export async function startWorkflow(
  workflow: string,
  workflowId: string,
  args: unknown[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<WorkflowHandle<any>> {
  const client = await getClient();
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "mahogany-agents";
  return client.workflow.start(workflow, {
    taskQueue,
    workflowId,
    args,
  });
}

export function isTemporalEnabled(): boolean {
  return !!process.env.TEMPORAL_ADDRESS;
}

