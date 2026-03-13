# Mahogany — Railway Deployment Execution Plan

**Goal:** Deploy publicly via Railway and reach 100 users.

**Why Railway over Vercel:** Long-running cron jobs (poll-signals, generate-feed, send-digests) hit Vercel's 300s limit. `runFeedAgent` can take 10+ minutes; Railway has no HTTP timeout. Persistent Node process + `pg.Pool` avoids cold starts. Predictable cost for a 24/7 app.

---

## Current State (from codebase analysis)

| Component | Status |
|-----------|--------|
| Supabase + Auth | Done — sign-up, sign-in, middleware, profiles |
| Cron endpoints | Exist, no auth — poll-signals/fast, deep, generate-feed, generate-feed-morning, send-digests, recover-sources |
| Temporal | Optional — only used when `TEMPORAL_ADDRESS` set; skip for initial deploy |
| Dockerfile | Missing |
| railway.json | Missing |
| CRON_SECRET | Not used — endpoints are publicly callable |
| PORT handling | `next start` defaults to 3000 — Railway needs `PORT` |

---

## Phase 1: Code Changes (required before deploy)

### 1.1 Fix profile feed-generation trigger for Railway

**File:** `src/app/api/profiles/route.ts` (lines 134–136)

Profile save fires a fetch to `/api/feed/generate`. It uses `VERCEL_URL`, which Railway does not set.

**Change:**
```ts
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "http://localhost:3000";
```

### 1.2 Add CRON_SECRET to cron routes

Generate secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Add at the top of each cron handler (after imports):

**Files:**  
`poll-signals/fast/route.ts`, `poll-signals/deep/route.ts`, `generate-feed/route.ts`,  
`generate-feed-morning/route.ts`, `send-digests/route.ts`, `recover-sources/route.ts`

```ts
function requireCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // Allow if not configured (local dev)
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
// In GET/POST: if (!requireCronAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

### 1.3 Ensure Next.js uses PORT on Railway

**File:** `package.json`

**Change start script:**
```json
"start": "next start -p ${PORT:-3000}"
```

On Unix this works. Windows may need a different approach; Railway runs Linux.

Alternative (cross-platform): create `server.js`:
```js
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const app = next({ dev: false });
const handle = app.getRequestHandler();
app.prepare().then(() => {
  createServer((req, res) => handle(req, res, parse(req.url, true))).listen(process.env.PORT || 3000);
});
```

Simpler approach: use `next start --port ${PORT:-3000}` — Railway’s shell should expand `${PORT:-3000}`.

### 1.4 Node version for Next.js 16

**File:** `package.json` — add:
```json
"engines": { "node": ">=20" }
```

---

## Phase 2: Docker and Railway Config

### 2.1 Create Dockerfile

**File:** `Dockerfile`

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
CMD ["node", "server.js"]
```

**Note:** Next.js standalone output requires `output: 'standalone'` in `next.config.ts`. If not using standalone, use:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
```

And ensure `package.json` has: `"start": "next start -p ${PORT:-3000}"`

### 2.2 Next.js standalone (recommended for smaller image)

**File:** `next.config.ts`

```ts
const nextConfig: NextConfig = {
  output: "standalone",
};
```

Then the first Dockerfile (with standalone) works. The `server.js` is auto-generated in `.next/standalone/`.

### 2.3 Create .dockerignore

**File:** `.dockerignore`

```
node_modules
.next
.git
.env*.local
*.md
e2e
test-results
playwright-report
```

### 2.4 Create railway.json

**File:** `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

If not using standalone, `startCommand` should be `npm start`.

---

## Phase 3: Environment Variables (Railway Dashboard)

| Variable | Required | Notes |
|----------|----------|------|
| `DATABASE_URL` | Yes | Supabase → Settings → Database (URI) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase → Settings → API |
| `ANTHROPIC_API_KEY` | Yes | Anthropic Console |
| `RESEND_API_KEY` | Yes | Resend |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://<your-app>.railway.app` (set after first deploy) |
| `CRON_SECRET` | Yes | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `RESEND_FROM_EMAIL` | Recommended | Verified domain, e.g. `Mahogany <digest@yourdomain.com>`; defaults to `onboarding@resend.dev` |
| `FIRECRAWL_API_KEY` | Optional | For deep ingestion |
| `OPENAI_API_KEY` | Optional | For embeddings |

---

## Phase 4: Supabase Auth Config

1. Supabase Dashboard → Authentication → URL Configuration
2. **Site URL:** `https://<your-railway-app>.railway.app`
3. **Redirect URLs (add):**
   - `https://<your-railway-app>.railway.app/auth/callback`
   - `https://<your-railway-app>.railway.app/**`

---

## Phase 5: External Cron Setup

Railway has no built-in cron. Use [cron-job.org](https://cron-job.org), [Upstash QStash](https://upstash.com/qstash), or [GitHub Actions](https://github.com/features/actions).

### cron-job.org example

Create 6 cron jobs, each with:

- **URL:** `https://<your-app>.railway.app/api/<path>`
- **Method:** POST (or GET if that’s what the route supports)
- **Header:** `Authorization: Bearer <CRON_SECRET>`

| Path | Schedule (cron) |
|------|-----------------|
| `/api/poll-signals/fast` | `0 */4 * * *` (every 4h) |
| `/api/poll-signals/deep` | `0 6 * * *` (6:00 UTC daily) |
| `/api/generate-feed` | `30 */4 * * *` (30 min after fast) |
| `/api/generate-feed-morning` | `0 * * * *` (hourly) |
| `/api/send-digests` | `0 * * * *` (hourly) |
| `/api/recover-sources` | `30 2,14 * * *` (2:30 and 14:30 UTC) |

---

## Phase 6: Deploy

1. Push code to GitHub (include Dockerfile, railway.json, code changes)
2. Railway.app → New Project → Deploy from GitHub
3. Select repo, branch
4. Set all env vars in Railway dashboard
5. First deploy will fail until `NEXT_PUBLIC_APP_URL` is set — use the Railway-provided URL, then redeploy
6. Copy public URL (e.g. `https://mahogany-production.up.railway.app`)

---

## Phase 7: Post-Deploy Verification

1. **Homepage:** `https://<app>`
2. **Sign up** → confirm email (if enabled) → onboarding
3. **Login** → `/feed` loads
4. **Manual cron test:**
   ```bash
   curl -X POST "https://<app>/api/poll-signals/fast" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
5. **Feed seed (one-time):**
   ```bash
   curl -X POST "https://<app>/api/generate-feed" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
6. **Digest:** Create profile with `digest_send_hour` = current UTC hour; trigger `send-digests` or wait for cron; check inbox

---

## Phase 8: Path to 100 Users

| Stage | Actions |
|-------|---------|
| 0→10 | Personal network, LinkedIn, 1–2 regulatory/RA communities |
| 10→30 | Refine onboarding, fix top friction points, collect feedback |
| 30→100 | Light content/SEO, simple referral or “invite a colleague” |

---

## File Checklist

| Action | File |
|--------|------|
| Create | `Dockerfile` |
| Create | `.dockerignore` |
| Create | `railway.json` |
| Modify | `next.config.ts` — add `output: "standalone"` if using standalone Dockerfile |
| Modify | `package.json` — `start` script + `engines` |
| Modify | `src/app/api/profiles/route.ts` — baseUrl for Railway |
| Modify | 6 cron route files — add `CRON_SECRET` check |

---

## Execution Order

1. Code changes (1.1–1.4)
2. Dockerfile + next.config + .dockerignore + railway.json
3. Railway project + env vars + deploy
4. Supabase redirect URLs
5. External cron setup
6. Verification + feed seed
7. Invite first users
