import cron from 'node-cron';

function buildBaseUrl() {
  return process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${process.env.PORT || 3000}`;
}

function buildHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

async function callEndpoint(path: string, label: string) {
  const url = `${buildBaseUrl()}${path}`;
  console.log(`[scheduler] ${label} starting`);
  try {
    const res = await fetch(url, { method: 'GET', headers: buildHeaders() });
    console.log(`[scheduler] ${label} → ${res.status}`);
  } catch (err) {
    console.error(`[scheduler] ${label} error:`, err);
  }
}

const running: Record<string, boolean> = {};

function guardedJob(label: string, fn: () => Promise<void>) {
  return async () => {
    if (running[label]) {
      console.log(`[scheduler] ${label} skipped (still running)`);
      return;
    }
    running[label] = true;
    try {
      await fn();
    } finally {
      running[label] = false;
    }
  };
}

export function scheduleJobs() {
  cron.schedule('0 */4 * * *', guardedJob('poll-fast', () => callEndpoint('/api/poll-signals/fast', 'poll-signals/fast')));
  cron.schedule('0 6 * * *', guardedJob('poll-deep', () => callEndpoint('/api/poll-signals/deep', 'poll-signals/deep')));
  cron.schedule('15 7 * * *', guardedJob('generate-feed', () => callEndpoint('/api/generate-feed-daily', 'generate-feed-daily')));
  cron.schedule('0 * * * *', guardedJob('send-digests', () => callEndpoint('/api/send-digests', 'send-digests')));
  console.log('[scheduler] 4 jobs registered');
}

let _schedulerStarted = false;

export function isSchedulerRunning(): boolean {
  return _schedulerStarted;
}

export function startScheduler() {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  scheduleJobs();
  if (process.env.DIGEST_TEST_ON_BOOT === 'true') {
    const delayMs = 3 * 60 * 1000;
    console.log(`[scheduler] test digest scheduled in 3 minutes`);
    setTimeout(
      guardedJob('send-digests-test', () =>
        callEndpoint('/api/send-digests?force=1', 'send-digests (test/force)')
      ),
      delayMs
    );
  }
}
