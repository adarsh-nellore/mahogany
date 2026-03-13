# Mahogany Production Launch Roadmap
## Complete Path: Supabase Setup → Auth → Deployment → Autonomous Agents
### (Payments Ready But Not Active)

**Goal:** Public SaaS with Supabase Auth, user preferences, autonomous background agents, and payment infrastructure (disabled until ready).

**Timeline:** 3–4 weeks (part-time in Claude Code)

**Constraint:** No payment gatekeeping yet. Everyone gets full access during beta.

---

## PHASE 0: Supabase Setup (Days 0–1)

**Why first:** Everything depends on having Supabase configured. Do this before any coding.

### 0.1: Create Supabase Project

**Manual setup (10 mins):**

1. Go to https://supabase.com
2. Sign up or log in
3. Create a new project:
   - Project name: `mahogany` (or any name)
   - Region: Pick closest to you (e.g., us-east-1)
   - Database password: Generate strong one, save it
4. Wait 2–3 mins for project to initialize

### 0.2: Get Connection Strings & Keys

**In Supabase Dashboard, navigate to:**

1. **Settings → Database**
   - Copy "Connection string (URI)" — this is your `DATABASE_URL`
   - Format: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`

2. **Settings → API**
   - Copy `Project URL` — this is `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon public` key — this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` secret key — this is `SUPABASE_SERVICE_ROLE_KEY` (keep private)

3. **Auth → Providers**
   - Enable "Email" provider
   - Optionally enable "Google" and "GitHub" OAuth (we'll support both)

### 0.3: Run Your Schema Against Supabase

**Terminal:**
```bash
# Connect to Supabase and run schema
psql $DATABASE_URL -f src/sql/schema.sql
```

Replace `$DATABASE_URL` with the connection string from 0.2.

**What this does:**
- Creates all tables (profiles, signals, digests, etc.) in Supabase
- Enables pgvector extension for embeddings
- Sets up indexes

### 0.4: Update .env.local

**File:** `/.env.local` (modify existing, replace database URL)

```bash
# OLD (local)
DATABASE_URL=postgresql://adarshnellore@localhost:5432/mahogany

# NEW (Supabase)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# NEW: Supabase Auth credentials
NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT_REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Keep existing
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
RESEND_API_KEY=re_...
FIRECRAWL_API_KEY=fc-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 0.5: Test Local Connection

**Terminal:**
```bash
npm run dev
```

Visit http://localhost:3000 — the app should load without database errors.

**Verification:**
- No "cannot connect to database" errors in console
- Pages load (landing, onboarding, etc.)
- Supabase is now your source of truth for all data

---

## High-Level Phases (After Supabase is Ready)

| Phase | What | Days | Blocking? |
|---|---|---|---|
| **0** | Supabase setup + schema migration | 1 | 🔴 YES |
| **1** | Supabase Auth (login/signup) | 2 | 🔴 YES |
| **2** | Protect routes + link auth to profiles | 1 | 🔴 YES |
| **3** | Stripe setup (infrastructure only) | 1 | 🟢 NO |
| **4** | Dockerfile + Railway deploy | 1 | 🔴 YES |
| **5** | Cron endpoints (ingestion + digests) | 2 | 🟢 NO |
| **6** | Cost tracking + safeguards | 1 | 🟢 NO |
| **7** | Testing + go live | 2 | 🔴 YES |
| **8** | Monitoring + observability | 1 | 🟢 NO |

**Build order:** 0 → 1 → 2 → 4 → 7 → 5 → 6 → 8 → 3 (payments last)

---

## PHASE 1: Supabase Auth (Days 2–3)

**Why after Phase 0:** Auth needs a live Supabase project to work.

### 1.1: Install Supabase Client Libraries

**Terminal:**
```bash
npm install @supabase/supabase-js
```

### 1.2: Create 9 Auth Files

When you open Claude Code, paste this prompt:

```
I'm building Mahogany, a regulatory intelligence SaaS with Next.js, TypeScript, and Supabase. 

Currently, the app uses a brittle UUID cookie for authentication. I need to replace it with Supabase Auth.

You have these Supabase credentials available:
- NEXT_PUBLIC_SUPABASE_URL: [from your .env.local]
- NEXT_PUBLIC_SUPABASE_ANON_KEY: [from your .env.local]
- SUPABASE_SERVICE_ROLE_KEY: [from your .env.local]

**Your Task: Implement Phase 1 of PRODUCTION_ROADMAP.md**

Build these 9 files for Supabase authentication:

1. src/lib/supabase-client.ts
   - Client-side Supabase instance
   - Export createBrowserClient() function
   - Handle session in localStorage
   - Export: signUp(email, password), signIn(email, password), signOut(), getSession()

2. src/lib/supabase-server.ts
   - Server-side Supabase instance using SUPABASE_SERVICE_ROLE_KEY
   - Export createServerClient()
   - Export getCurrentUser(req: NextRequest) to extract user from Authorization header

3. src/lib/auth-guards.ts
   - requireAuth(req: NextRequest) - validates session, throws 401 if missing
   - getCurrentUser(req: NextRequest) - returns user object
   - Both for protecting API routes

4. src/app/api/auth/sign-up.ts — POST /api/auth/sign-up
   - Accept { email, password }
   - Create Supabase user
   - Auto-create profile row in profiles table with id=supabase_user.id, email=supabase_user.email
   - Return { success: true, user }

5. src/app/api/auth/sign-in.ts — POST /api/auth/sign-in
   - Accept { email, password }
   - Authenticate with Supabase
   - Return session + user data

6. src/app/api/auth/sign-out.ts — POST /api/auth/sign-out
   - Clear session
   - Return { success: true }

7. src/app/login/page.tsx
   - Email + password form
   - POST to /api/auth/sign-in
   - Redirect to /feed on success
   - Show errors
   - Link to signup

8. src/app/signup/page.tsx
   - Email + password + name form
   - POST to /api/auth/sign-up
   - Redirect to /onboarding on success
   - Show errors
   - Link to login

9. src/middleware.ts
   - Replace UUID cookie with Supabase session validation
   - Protect routes: /feed, /digest, /profile, /settings, /signals
   - Allow: /, /login, /signup, /auth/callback

**Requirements:**
- Use @supabase/supabase-js
- Full TypeScript types
- Error handling with user-friendly messages
- Match existing code style (Tailwind CSS, DM Sans)
- Look at src/lib/db.ts for database patterns
- Look at src/app/page.tsx for UI patterns

Generate all 9 files now.
```

### 1.3: Test Locally

```bash
npm run dev
```

- Visit http://localhost:3000/signup
- Try signing up with an email
- Check that profile row was created in Supabase
- Try logging in with that email
- Should redirect to /onboarding

---

## PHASE 2: Protect Routes + Link Auth to Profiles (Day 4)

### 2.1: Update Protected Routes

Claude Code prompt:

```
Update all protected API routes to use Supabase Auth.

Files to update:
- src/app/api/signals/* 
- src/app/api/digest/*
- src/app/api/profile/*
- src/app/api/settings/*

For each file:
1. Import { getCurrentUser } from '@/lib/auth-guards'
2. At start of handler: const user = await getCurrentUser(req)
3. Use user.id as profile_id in queries

Example:
const user = await getCurrentUser(req);
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const profile = await query('SELECT * FROM profiles WHERE id = $1', [user.id]);
```

---

## PHASE 3: Stripe Setup (Infrastructure Only) (Day 5)

### 3.1: Create Stripe Account

1. Go to stripe.com → Sign up
2. In test mode, copy:
   - `STRIPE_SECRET_KEY` (sk_test_...)
   - `STRIPE_PUBLISHABLE_KEY` (pk_test_...)

### 3.2: Create Subscription Schema

**File:** `/src/sql/002_subscriptions.sql` (new)

```sql
ALTER TABLE profiles ADD COLUMN subscription_status TEXT DEFAULT 'trial';
ALTER TABLE profiles ADD COLUMN subscription_tier TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN trial_ends_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN subscription_ends_at TIMESTAMPTZ;
```

**Terminal:**
```bash
psql $DATABASE_URL -f src/sql/002_subscriptions.sql
```

### 3.3: Create Stripe API Stubs

Claude Code prompt:

```
Create Stripe payment infrastructure (stubs for now, no charging yet).

Files to create:

1. src/app/api/billing/create-checkout.ts
   - POST /api/billing/create-checkout
   - Accept { priceId: 'price_...' }
   - Return { message: 'Payments coming soon' }
   - (Later: create real Stripe checkout)

2. src/app/api/billing/manage-subscription.ts
   - POST /api/billing/manage-subscription
   - Return { message: 'Payments coming soon' }
   - (Later: handle upgrade/downgrade)

3. src/app/api/webhooks/stripe.ts
   - POST /api/webhooks/stripe
   - Accept Stripe webhook signature
   - Return 200
   - (Later: process checkout.session.completed, etc.)

Add to .env.local:
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## PHASE 4: Dockerfile + Railway Deploy (Day 5)

### 4.1: Create Dockerfile

**File:** `/Dockerfile` (new)

Claude Code prompt:

```
Create a Dockerfile for Mahogany that:
1. Starts with node:18-alpine
2. Copies all source code
3. Runs npm ci
4. Runs npm run build
5. Exposes port 3000
6. CMD: node start.js

Also create /start.js that:
1. Starts Next.js app with npm start
2. If TEMPORAL_ADDRESS env var is set, also starts Temporal worker
3. Handles SIGTERM gracefully
```

### 4.2: Create railway.json

**File:** `/railway.json` (new)

```json
{
  "builder": "dockerfile",
  "deploy": {
    "startCommand": "node start.js",
    "restartPolicyMaxRetries": 5
  }
}
```

### 4.3: Deploy to Railway

1. Go to railway.app → Create new project
2. Connect GitHub repo (Mahogany)
3. Railway auto-builds Dockerfile
4. Set environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=[from Supabase]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[from Supabase]
SUPABASE_SERVICE_ROLE_KEY=[from Supabase]
DATABASE_URL=[from Supabase]
ANTHROPIC_API_KEY=[from Anthropic console]
OPENAI_API_KEY=[from OpenAI]
RESEND_API_KEY=[from Resend]
CRON_SECRET=[generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"]
NEXT_PUBLIC_APP_URL=https://[railway-url].railway.app
```

5. Push to GitHub → Railway auto-deploys
6. Get public URL: `https://[name]-[random].railway.app`

**Result:** App is live publicly!

---

## PHASE 5: Cron Endpoints (Days 6–7)

### 5.1: Daily Ingestion Cron

Claude Code prompt:

```
Create src/app/api/cron/start-daily-ingestion.ts

POST /api/cron/start-daily-ingestion
- Validate Authorization header == CRON_SECRET
- Fetch all active sources from source_registry
- Chunk into batches of 10
- For each batch, spawn Temporal workflow: kickoffSourceBatchWorkflow(sourceIds)
- Add small delay between batches
- Return { status: 'success', batches_spawned, sources_total }
- Log errors to agent_runs table

Use existing: kickoffSourceBatchWorkflow from src/lib/orchestration.ts
```

### 5.2: Hourly Digest Sending Cron

Claude Code prompt:

```
Create src/app/api/cron/send-pending-digests.ts

POST /api/cron/send-pending-digests
- Validate Authorization header == CRON_SECRET
- Get current UTC hour
- Query: SELECT * FROM profiles WHERE digest_send_hour = current_hour AND (last_digest_at IS NULL OR last_digest_at < now() - interval '23 hours')
- For each profile:
  - Fetch signals from last 24h matching their regions
  - Call generateDigest(profile, signals)
  - Send email via Resend
  - Update last_digest_at = now()
  - Log tokens used to agent_runs
- Send in batches of 10 with 3s delay between batches
- Return { status: 'success', sent, failed, total }
```

### 5.3: Add Railway Cron Jobs

1. In Railway dashboard:
2. Add first cron job:
   - **Name:** Daily Ingestion
   - **Schedule:** `0 2 * * *` (2am UTC daily)
   - **Method:** POST
   - **URL:** `https://[your-railway-url]/api/cron/start-daily-ingestion`
   - **Headers:** `Authorization: Bearer $CRON_SECRET`

3. Add second cron job:
   - **Name:** Digest Sending
   - **Schedule:** `0 * * * *` (every hour)
   - **Method:** POST
   - **URL:** `https://[your-railway-url]/api/cron/send-pending-digests`
   - **Headers:** `Authorization: Bearer $CRON_SECRET`

---

## PHASE 6: Cost Tracking + Safeguards (Day 7)

### 6.1: Add Token Logging

Claude Code prompt:

```
Create src/lib/agent-runner.ts

Export function: runWithLogging(agentName, profileId, fnThatCallsClaude)

This wrapper:
1. Creates row in agent_runs table with status='running'
2. Calls the function
3. Extracts tokens from response.usage
4. Updates agent_runs with status='completed', input_tokens, output_tokens
5. On error: updates with status='failed', error_text

Use in digestAgent, ingestion, etc. to track all costs.
```

### 6.2: Set Anthropic Spending Limit

**Manual (5 mins):**
1. platform.anthropic.com → Billing
2. Click "Set spending limit"
3. Enter: `$500` (or your budget)
4. Save

This prevents runaway costs — API calls fail gracefully if you exceed limit.

### 6.3: Add Per-User Rate Limits

Claude Code prompt:

```
Create src/lib/rate-limits.ts

Export async function: canGenerateDigest(profileId: string): Promise<boolean>

Check:
1. Count digests generated today for user < 5
2. Sum tokens used today for user < 50000

If either exceeded, return false (skip digest for this user).

Use in send-pending-digests.ts before calling generateDigest().
```

---

## PHASE 7: Testing + Go Live (Days 8–9)

### 7.1: Local Testing

```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Test signup
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'

# Terminal 3: Check Supabase
# Login to Supabase dashboard → Table Editor → profiles
# You should see new row with email=test@example.com
```

### 7.2: Production Testing (Railway)

```bash
# Manually trigger ingestion cron
curl -X POST https://[your-railway-url]/api/cron/start-daily-ingestion \
  -H "Authorization: Bearer $CRON_SECRET"

# Check Railway logs
railway logs

# Sign up on live app
# Go to https://[your-railway-url]/signup
```

### 7.3: Go Live Checklist

- [ ] Sign-up works, profile created in Supabase
- [ ] Login works, redirects to /feed
- [ ] Logout works
- [ ] Protected routes redirect to login
- [ ] Ingestion cron fires on schedule (check logs)
- [ ] Digests generate + send
- [ ] Tokens logged to agent_runs
- [ ] No errors in Railway logs
- [ ] Spending limit set on Anthropic
- [ ] Custom domain (optional): DNS points to Railway

**You're live!**

---

## PHASE 8: Monitoring + Observability (Optional, Day 10+)

### 8.1: Add Cost Dashboard

Claude Code prompt:

```
Create src/app/admin/costs.tsx

Show:
1. Total tokens used today
2. Cost so far this month ($)
3. Estimated monthly cost if trend continues
4. Breakdown by agent (digestAgent, ingestionAgent, etc.)
5. Chart of last 7 days

Query: SELECT DATE(started_at), agent_name, COUNT(*), SUM(CAST(metadata_json->>'total_tokens' AS INT)) FROM agent_runs GROUP BY 1, 2
```

### 8.2: Add User Dashboard

Claude Code prompt:

```
Create src/app/admin/users.tsx

Show:
1. Total users signed up
2. Last 10 signups (email, created_at)
3. Users by subscription_status (all 'trial' for now)
4. Last digest sent to each user
```

---

## Environment Variables Checklist

**You need these before starting:**

### From Supabase (Phase 0)
- [ ] `DATABASE_URL` (PostgreSQL connection string)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (project URL)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (service role key)

### Existing (Keep)
- [ ] `ANTHROPIC_API_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `RESEND_API_KEY`
- [ ] `FIRECRAWL_API_KEY`

### New (Phase 3, 4, 5)
- [ ] `STRIPE_SECRET_KEY` (when Stripe is ready)
- [ ] `STRIPE_PUBLISHABLE_KEY` (when Stripe is ready)
- [ ] `CRON_SECRET` (generate locally)
- [ ] `NEXT_PUBLIC_APP_URL` (Railway URL when deployed)

---

## File Checklist

### Auth Files (Phase 1–2)
```
✓ src/lib/supabase-client.ts
✓ src/lib/supabase-server.ts
✓ src/lib/auth-guards.ts
✓ src/app/api/auth/sign-up.ts
✓ src/app/api/auth/sign-in.ts
✓ src/app/api/auth/sign-out.ts
✓ src/app/login/page.tsx
✓ src/app/signup/page.tsx
✓ src/app/auth/callback/page.tsx
✓ src/middleware.ts (modify)
```

### Deployment Files (Phase 4)
```
✓ Dockerfile
✓ start.js
✓ railway.json
✓ package.json (modify scripts)
```

### Crons + Agents (Phase 5–6)
```
✓ src/app/api/cron/start-daily-ingestion.ts
✓ src/app/api/cron/send-pending-digests.ts
✓ src/lib/agent-runner.ts
✓ src/lib/rate-limits.ts
```

### Stripe Stubs (Phase 3)
```
✓ src/app/api/billing/create-checkout.ts
✓ src/app/api/billing/manage-subscription.ts
✓ src/app/api/webhooks/stripe.ts
✓ src/sql/002_subscriptions.sql
```

### Admin (Phase 8, optional)
```
✓ src/app/admin/costs.tsx
✓ src/app/admin/users.tsx
```

---

## Timeline Summary

| Days | Phase | Outcome |
|---|---|---|
| 0–1 | Supabase setup | Live Supabase project + schema |
| 2–3 | Auth | Users can sign up + log in |
| 4 | Route protection | Only authed users access app |
| 5 | Docker + Railway | App is live publicly |
| 6–7 | Crons | Ingestion + digests run on schedule |
| 7 | Cost tracking | Token usage visible + logged |
| 8–9 | Testing + launch | Everything verified, go public beta |
| 10+ | Monitoring | Daily insights on costs + usage |

---

## Payment Integration (Later, Phase 9)

When you're ready to charge (after testing with 10–20 beta users):

1. **Enable Stripe checkout**
   - `/api/billing/create-checkout.ts` → real Stripe session
   - `/api/webhooks/stripe.ts` → handle `checkout.session.completed`

2. **Add paywall**
   - Dashboard shows "Upgrade to Pro" button
   - Clicking redirects to Stripe checkout
   - Free trial: 14 days, then requires subscription

3. **Enforce subscription checks**
   - Digest generation checks `subscription_status`
   - If `trial` expired and `subscription_status != 'active'`, refuse
   - Redirect to upgrade page

4. **No code changes needed now** — infrastructure already there.

---

## Key Principles

✅ **Phase 0 first** — Supabase setup is blocking everything else  
✅ **Auth early** — Users own their data  
✅ **Deploy to Railway** — Get live ASAP  
✅ **Autonomous agents** — Crons run without manual work  
✅ **Cost visibility** — Log every token, know your spend  
✅ **Payment ready** — Stubbed out, fill in later  
✅ **No gatekeeping yet** — Everyone gets full beta access  

---

## Next Step

**Start Phase 0: Supabase Setup**

1. Go to supabase.com, create project
2. Run your schema: `psql $DATABASE_URL -f src/sql/schema.sql`
3. Get credentials and update `.env.local`
4. Test: `npm run dev` — verify no database errors

Once Phase 0 is done, come back and we'll move to Phase 1 (auth).
