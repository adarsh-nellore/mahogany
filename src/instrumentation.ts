export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.SCHEDULER_ENABLED === 'false') return;
  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
  console.log('[scheduler] jobs registered');
}
