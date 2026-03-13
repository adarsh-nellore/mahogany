# How to Find Supabase Database Connection String

## Step 1: Login to Supabase Dashboard
Go to https://app.supabase.com

## Step 2: Navigate to Settings → Database
- Left sidebar → Click "Settings" (gear icon)
- Then click "Database" 

## Step 3: Find Connection String Section
Look for a section titled **"Connection string"**

It should show several tabs:
- URI ← Click this one
- Connection pooling
- psycopg2
- Golang
- etc.

## Step 4: Copy the URI
The URI tab will show a long string that starts with:
```
postgresql://postgres:PASSWORD@db.PROJECTID.supabase.co:5432/postgres
```

Copy the **entire string** starting with `postgresql://` and ending with `/postgres`

## If You Can't Find It:

Try this alternative:
1. Go to Supabase Dashboard
2. Click your project name at the top
3. Look for "Connect" button
4. Select "Postgres" 
5. Copy the connection string

Or:

1. Go to Supabase Dashboard
2. Top right corner → "Connect" button
3. Select "PostgreSQL"
4. Copy "Connection string"
