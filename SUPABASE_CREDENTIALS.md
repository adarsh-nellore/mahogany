# Supabase Credentials Checklist

**Go to your Supabase Dashboard and copy these exact values:**

## Step 1: Get Database Connection String
- Dashboard → Settings → Database
- Find the section "Connection String"
- Copy the **URI** version (looks like: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`)
- This goes in `.env.local` as: `DATABASE_URL=postgresql://...`

## Step 2: Get Authentication Keys
- Dashboard → Settings → API
- Under "Project API keys" section, copy:

  1. **Project URL** (e.g., `https://xyzabc.supabase.co`)
     → goes in `.env.local` as: `NEXT_PUBLIC_SUPABASE_URL=https://...`

  2. **anon public** key (long string starting with `eyJ...`)
     → goes in `.env.local` as: `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`

  3. **service_role** secret key (long string starting with `eyJ...` - different from above)
     → goes in `.env.local` as: `SUPABASE_SERVICE_ROLE_KEY=eyJ...`

## Step 3: Update .env.local

Your `.env.local` should now look like:

```bash
# Database
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...

# Keep your existing keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
RESEND_API_KEY=re_...
FIRECRAWL_API_KEY=fc-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## That's it!

You now have 4 Supabase credentials ready for Claude Code Phase 1.
