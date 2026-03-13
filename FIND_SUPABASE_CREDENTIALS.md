# Finding Supabase Credentials - Step by Step

## Where to Find Each Value

### 1. DATABASE_URL (Connection String)

Location: **Supabase Dashboard → Settings (gear icon) → Database**

What you'll see:
```
Connection string
[Tabs: URI | Connection pooling | psycopg2 | etc]

URI tab should be selected by default
You'll see a long string starting with:
postgresql://postgres:[YOUR_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
```

**Copy the entire URI string** → Put in `.env.local` as `DATABASE_URL=`

---

### 2. NEXT_PUBLIC_SUPABASE_URL (Project URL)

Location: **Supabase Dashboard → Settings (gear icon) → API**

What you'll see:
```
Project API keys section
┌─────────────────────────┐
│ Project URL             │
│ https://[abc123].supabase.co  ← COPY THIS
│ (copy button on right)  │
└─────────────────────────┘
```

**Copy just the URL** (https://[abc123].supabase.co) → Put in `.env.local` as `NEXT_PUBLIC_SUPABASE_URL=`

---

### 3. NEXT_PUBLIC_SUPABASE_ANON_KEY (Already have)

Location: **Supabase Dashboard → Settings (gear icon) → API**

Same "Project API keys" section below Project URL:
```
anon public
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9... ← COPY THIS
```

---

### 4. SUPABASE_SERVICE_ROLE_KEY (Already have)

Location: **Supabase Dashboard → Settings (gear icon) → API**

Same "Project API keys" section:
```
service_role secret
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9... ← COPY THIS (different from anon)
```

---

## Final .env.local

Once you have all 4, your file should look like:

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...

ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
RESEND_API_KEY=re_...
FIRECRAWL_API_KEY=fc-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

That's it!
