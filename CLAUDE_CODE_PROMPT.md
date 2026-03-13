# Claude Code: Mahogany Production Launch

## Phase 1: Supabase Auth Infrastructure

You are building a regulatory intelligence SaaS called Mahogany. Follow the PRODUCTION_ROADMAP.md file in this repo, starting with Phase 1.

**Current State:**
- Next.js 16 app with TypeScript
- Supabase PostgreSQL database (connection string available)
- Currently uses UUID cookie for auth (brittle)
- Need to replace with Supabase Auth

**Phase 1 Goal:** Implement Supabase Authentication so users can sign up and log in.

**What to Build:**

1. **src/lib/supabase-client.ts** — Client-side Supabase instance
   - Export `createBrowserClient()` function
   - Handle session persistence in localStorage
   - Export auth functions: `signUp()`, `signIn()`, `signOut()`, `getSession()`

2. **src/lib/supabase-server.ts** — Server-side Supabase instance
   - Export `createServerClient()` using SUPABASE_SERVICE_ROLE_KEY
   - Used only in API routes (server components)
   - Export `getCurrentUser()` function to extract user from request

3. **src/lib/auth-guards.ts** — Middleware helpers
   - `requireAuth(req: NextRequest)` - validates session, throws 401 if missing
   - `getCurrentUser(req: NextRequest)` - returns user object or null
   - Both used in protected API routes

4. **src/app/api/auth/sign-up.ts** — POST /api/auth/sign-up
   - Accept: `{ email: string, password: string }`
   - Create Supabase user
   - Auto-create profile row in profiles table
   - Return: `{ success: true, user: {...} }`
   - Error handling for duplicate email, weak password, etc.

5. **src/app/api/auth/sign-in.ts** — POST /api/auth/sign-in
   - Accept: `{ email: string, password: string }`
   - Authenticate with Supabase
   - Return session + user data
   - Error handling for invalid credentials

6. **src/app/api/auth/sign-out.ts** — POST /api/auth/sign-out
   - Clear session
   - Return success

7. **src/app/login/page.tsx** — Login UI
   - Email + password form
   - POST to /api/auth/sign-in
   - On success, redirect to /feed
   - Show errors from server
   - Link to signup

8. **src/app/signup/page.tsx** — Signup UI
   - Email + password form + optional name field
   - POST to /api/auth/sign-up
   - On success, redirect to /onboarding (or /feed)
   - Show errors from server
   - Link to login

9. **src/middleware.ts** — Update existing middleware
   - Replace UUID cookie check with Supabase session validation
   - Verify Authorization header or extract from Supabase session
   - Protect routes: /feed, /digest, /profile, /settings, /signals
   - Allow: /, /login, /signup, /auth/callback

**Implementation Details:**

- Use `@supabase/supabase-js` (already in package.json)
- Install `@supabase/auth-helpers-nextjs` if needed
- For sign-up, use `supabase.auth.signUp()` which sends magic link OR password auth (choose one)
- Store Supabase user ID → profile.id relationship (1:1)
- When sign-up completes, create row in profiles table with:
  - id: supabase_user.id
  - email: supabase_user.email
  - name: (from form)
  - Default values for regions, domains, etc. (user customizes in onboarding)

**Environment Variables Needed:**
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

**Output:**
Generate all 9 files. For each file:
- TypeScript with full type safety
- Error handling + user-friendly messages
- Comments explaining key sections
- Follow existing code style in repo (DM Sans font, Tailwind CSS)

**Reference:**
- Look at existing src/lib/db.ts for database query patterns
- Look at existing src/app/page.tsx for UI component patterns
- Look at .env.local.example for env var names