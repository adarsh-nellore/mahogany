import { Worker } from "@temporalio/worker";
import * as activities from "./activities";
import path from "node:path";

async function run() {
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "mahogany-agents";
  const worker = await Worker.create({
    workflowsPath: path.resolve(__dirname, "workflows.ts"),
    activities,
    taskQueue,
  });
  await worker.run();
}

run().catch((err) => {
  console.error("[temporal-worker] failed", err);
  process.exit(1);
});

