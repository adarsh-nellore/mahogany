# Mahogany Implementation Roadmap
## Production-Ready Autonomous Agents + Deployment

**Goal:** Get Mahogany running autonomously 24/7 on Railway, handling 100 users with safe API cost controls, scheduled ingestion & digests.

**Timeline:** 2-3 weeks (working in Claude Code)

---

## PHASE 1: Token Tracking + Cost Observability (Days 1–2)

### Step 1.1: Add Token Logging to agent_runs

**File:** `/src/lib/agentRuntime.ts` (new helper)

Create a function to log all agent costs:

```typescript
// Wrap every Claude API call
export async function logAgentRun(
  agentName: string,
  profileId: string,
  inputJson: Record<string, unknown>,
  fn: () => Promise<{ usage: { input_tokens: number; output_tokens: number } }>
): Promise<{ usage: { input_tokens: number; output_tokens: number } }> {
  const runId = await createAgentRun(agentName, profileId, inputJson);
  
  try {
    const result = await fn();
    await updateAgentRun(runId, {
      status: 'completed',
      output_tokens: result.usage.output_tokens,
      input_tokens: result.usage.input_tokens,
    });
    return result;
  } catch (err) {
    await updateAgentRun(runId, {
      status: 'failed',
      error: String(err),
    });
    throw err;
  }
}
```

**File:** `/src/app/api/agents/run.ts` (new endpoint)

Create endpoint to query costs:
```typescript
// GET /api/agents/cost-report?days=7
// Returns total tokens, cost breakdown by agent
```

**Why:** Full visibility into what you're spending. Dashboard metric.

---

## PHASE 2: Cron Job Endpoints (Days 2–3)

### Step 2.1: Daily Ingestion Cron

**File:** `/src/app/api/cron/start-daily-ingestion.ts` (new)

```typescript
// POST /api/cron/start-daily-ingestion
// Called daily at 2am UTC by Railway cron

export async function POST(req: NextRequest) {
  // Verify cron secret (Railway passes X-Cronitor header)
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all active sources
    const sources = await query('SELECT id FROM source_registry WHERE active = true');
    
    // Chunk into batches of 10
    const batches = chunk(sources, 10);
    
    for (const batch of batches) {
      const sourceIds = batch.map(s => s.id);
      // Spawn Temporal workflow for this batch
      await kickoffSourceBatchWorkflow(sourceIds);
      // Small delay to avoid overwhelming
      await sleep(500);
    }

    return NextResponse.json({ 
      status: 'success',
      batches_spawned: batches.length,
      sources_total: sources.length 
    });
  } catch (err) {
    // Log to agent_runs
    await logAgentRun('dailyIngestionCron', null, {}, async () => {
      throw err;
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

### Step 2.2: Digest Sending Cron

**File:** `/src/app/api/cron/send-pending-digests.ts` (new)

```typescript
// POST /api/cron/send-pending-digests
// Called hourly by Railway cron

export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const currentHour = new Date().getUTCHours();

    // Find users where digest_send_hour == currentHour AND last_digest_at < yesterday
    const profiles = await query<Profile>(
      `SELECT * FROM profiles 
       WHERE digest_send_hour = $1 
       AND (last_digest_at IS NULL OR last_digest_at < now() - interval '23 hours')
       AND active = true`,
      [currentHour]
    );

    let sentCount = 0;
    let failedCount = 0;

    // Send in batches of 10 with delays to avoid rate limits
    const batches = chunk(profiles, 10);
    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(p => sendDigestForProfile(p))
      );
      
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') sentCount++;
        else failedCount++;
      });

      // Wait 3 seconds before next batch
      await sleep(3000);
    }

    return NextResponse.json({
      status: 'success',
      sent: sentCount,
      failed: failedCount,
      total: profiles.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function sendDigestForProfile(profile: Profile): Promise<void> {
  const signals = await query<Signal>(
    `SELECT s.* FROM signals s
     WHERE s.created_at > now() - interval '24 hours'
     AND s.region = ANY($1)
     LIMIT 100`,
    [profile.regions]
  );

  const digest = await generateDigest(profile, signals);

  // Send email
  await resend.emails.send({
    from: 'digest@mahogany-ri.com',
    to: profile.email,
    subject: `Regulatory Intelligence – ${new Date().toLocaleDateString()}`,
    html: markdownToHtml(digest),
  });

  // Update last_digest_at
  await query(
    'UPDATE profiles SET last_digest_at = now() WHERE id = $1',
    [profile.id]
  );

  // Log to agent_runs
  const tokens = estimateTokens(digest);
  await updateAgentRun(
    // ... log with token count
  );
}
```

**Why:** Autonomous, scheduled digest delivery. No manual intervention needed.

---

## PHASE 3: Dockerfile + Railway Setup (Days 3–4)

### Step 3.1: Create Dockerfile

**File:** `/Dockerfile` (new)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy everything
COPY . .

# Install dependencies
RUN npm ci

# Build Next.js
RUN npm run build

# Expose port
EXPOSE 3000

# Start both Next.js app and Temporal worker
CMD ["node", "start.js"]
```

### Step 3.2: Create Start Script

**File:** `/start.js` (new)

```javascript
const { spawn } = require('child_process');

// Start Next.js server
const app = spawn('npm', ['run', 'start'], {
  stdio: 'inherit',
  env: process.env,
});

// Start Temporal worker (if TEMPORAL_ADDRESS is set locally)
if (process.env.TEMPORAL_ADDRESS) {
  const worker = spawn('npm', ['run', 'temporal:worker'], {
    stdio: 'inherit',
    env: process.env,
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  app.kill();
  process.exit(0);
});
```

### Step 3.3: Update vercel.json → railway.json

**File:** `/railway.json` (new)

```json
{
  "builder": "dockerfile",
  "deploy": {
    "startCommand": "node start.js",
    "restartPolicyMaxRetries": 5,
    "restartPolicyWindowSeconds": 600
  }
}
```

### Step 3.4: Update package.json scripts

Add to scripts section:
```json
"start": "next start",
"temporal:worker": "tsx src/lib/temporal/worker.ts"
```

---

## PHASE 4: Environment Variables + Secrets (Days 4)

### Step 4.1: Update .env.example

**File:** `/.env.local.example`

Add:
```bash
# Cron job secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CRON_SECRET=your_secret_here

# Temporal (local for now)
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=mahogany-agents

# Anthropic API key
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI API key (for embeddings)
OPENAI_API_KEY=sk-proj-...

# Resend API key
RESEND_API_KEY=re_...

# Database
DATABASE_URL=postgresql://...

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4.2: Set Secrets in Railway

When you push to Railway, configure:
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `DATABASE_URL`
- `CRON_SECRET` (generate locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `TEMPORAL_ADDRESS` (empty for now — local testing)

---

## PHASE 5: Railway Cron Setup (Days 4–5)

### Step 5.1: Add Cron Jobs in Railway

In Railway dashboard:
1. Navigate to your Mahogany project
2. Add two cron jobs:

**Cron Job 1: Daily Ingestion**
- **Schedule:** `0 2 * * *` (2am UTC daily)
- **HTTP Method:** POST
- **URL:** `https://your-railway-url.railway.app/api/cron/start-daily-ingestion`
- **Headers:** `Authorization: Bearer $CRON_SECRET`

**Cron Job 2: Hourly Digest Send**
- **Schedule:** `0 * * * *` (every hour)
- **HTTP Method:** POST
- **URL:** `https://your-railway-url.railway.app/api/cron/send-pending-digests`
- **Headers:** `Authorization: Bearer $CRON_SECRET`

---

## PHASE 6: Cost Controls + Safeguards (Days 5–6)

### Step 6.1: Set Anthropic Spending Limit

**Action (manual):**
1. Go to platform.anthropic.com → Billing
2. Set monthly limit: $500
3. This prevents runaway costs

### Step 6.2: Add Rate Limiting per User

**File:** `/src/lib/digestAgent.ts`

```typescript
const MAX_DIGESTS_PER_USER_PER_DAY = 3;
const MAX_TOKENS_PER_USER_PER_DAY = 50000;

async function canGenerateDigest(profileId: string): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  
  const runs = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM agent_runs 
     WHERE profile_id = $1 
     AND agent_name = 'digestAgent'
     AND DATE(started_at) = $2`,
    [profileId, today]
  );

  if (runs[0].count >= MAX_DIGESTS_PER_USER_PER_DAY) {
    return false; // Skip
  }

  const tokens = await query<{ total: number }>(
    `SELECT COALESCE(SUM((metadata_json->>'total_tokens')::int), 0) as total
     FROM agent_runs
     WHERE profile_id = $1 AND DATE(started_at) = $2`,
    [profileId, today]
  );

  return tokens[0].total < MAX_TOKENS_PER_USER_PER_DAY;
}
```

### Step 6.3: Add Monitoring Dashboard

**File:** `/src/app/admin/costs.tsx` (new)

```typescript
// GET /admin/costs — shows daily/weekly cost breakdown
// Query agent_runs, sum tokens, calculate cost
```

---

## PHASE 7: Testing + Deployment (Days 6–7)

### Step 7.1: Local Testing

```bash
# Terminal 1: Start Temporal server (if testing locally)
temporal server start-dev

# Terminal 2: Start Next.js + Temporal worker
npm run dev

# Terminal 3: Manual test
curl -X POST http://localhost:3000/api/cron/start-daily-ingestion \
  -H "Authorization: Bearer test_secret"
```

### Step 7.2: Deploy to Railway

```bash
# Connect Railway repo (one-time)
railway link

# Push
git add .
git commit -m "Add cron jobs + Docker setup"
git push

# Railway auto-deploys
# Check logs: railway logs
```

### Step 7.3: Verify Crons Are Running

In Railway dashboard:
- See recent cron executions
- Check logs for success/failure
- Monitor costs in agent_runs table

---

## PHASE 8: Supabase Auth (Optional but Recommended) (Days 7+)

### Step 8.1: Enable Supabase Auth

**In Supabase Dashboard:**
1. Authentication → Providers → Enable Email
2. Get JWT secret from Settings → API

### Step 8.2: Add Auth Routes

**File:** `/src/app/api/auth/callback.ts` (new)

Handle Supabase OAuth callback for GitHub/Google login.

### Step 8.3: Protect Routes

Replace UUID cookie auth with Supabase session.

---

## Key Files to Create/Modify

| File | Purpose | Status |
|---|---|---|
| `Dockerfile` | Container image | CREATE |
| `start.js` | Startup script | CREATE |
| `src/app/api/cron/start-daily-ingestion.ts` | Ingestion trigger | CREATE |
| `src/app/api/cron/send-pending-digests.ts` | Digest sending | CREATE |
| `src/app/api/agents/run.ts` | Cost reporting | CREATE |
| `src/lib/agentRuntime.ts` | Token logging | MODIFY |
| `src/lib/digestAgent.ts` | Rate limiting | MODIFY |
| `.env.local.example` | Env template | MODIFY |
| `package.json` | Scripts | MODIFY |
| `vercel.json` → `railway.json` | Railway config | CREATE |

---

## Success Criteria

✅ Cron jobs fire on schedule (visible in Railway logs)  
✅ Ingestion completes daily without timeouts  
✅ Digests sent to 100 users in ~7 seconds  
✅ All costs logged to agent_runs  
✅ Spending stays under $500/month  
✅ Zero manual intervention needed  

---

## Next: Build in Claude Code

Start with **Phase 1** (token tracking), then move sequentially to Phase 7 (deployment).

Each phase is 1–2 files, ~100 lines of code.

Ready?
