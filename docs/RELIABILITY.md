# Source reliability and accessibility

## How we confirm reliability

### 1. Health dashboard (signal-based)

**GET /api/health-sources** (no query)

- Uses **existing signal data** from the last 14 days.
- Each source gets a status:
  - **active** — recent signals (within 3 days for API/RSS, 7 days for scrape).
  - **warning** — no signals in 3–7 days (or 7–14 days for scrape).
  - **dark** — no signals in the threshold window or never seen.
- Response includes `summary.active`, `summary.warning`, `summary.dark` and per-source `signal_count_14d`, `last_signal_at`.
- **Limitation:** Only reflects sources that have already produced signals. A broken URL will show as "dark" after the threshold, not immediately.

### 2. Live connectivity (critical subset)

**GET /api/health-sources?test=1**

- Sends a real HTTP request to **8 critical sources** (openFDA, ClinicalTrials, FDA MedWatch, EMA News, MHRA, WHO, IMDRF, Canada recalls).
- Returns `live_tests[]` with `ok`, `status`, `ms` per URL.
- Use to quickly confirm that core APIs and feeds are reachable **right now**.

### 3. Full connectivity check (all sources)

**GET /api/health-sources?test=all**

- Sends a real HTTP request to **every URL** in the source registry (see `src/lib/fetchers/sourceRegistry.ts`).
- Returns `live_tests[]` for every source and adds to `summary`:
  - `reliability_ok` — count of sources that returned 2xx.
  - `reliability_fail` — count that failed or timed out.
  - `reliability_total` — total checked.
- Takes ~30–90 seconds (parallel requests, 10s timeout per URL).
- Use to **confirm reliability** and **find inaccessible sources** in one run.

### 4. Ingestion run

**POST /api/poll-signals** (or GET)

- Runs all fetchers for all profiles. Each fetcher catches errors and returns `[]` on failure; errors are logged.
- After a run, check **GET /api/health-sources** again: newly successful sources will show as active; failed ones stay dark or show no new signals.
- Combining **test=all** (which URLs respond?) with **poll-signals** (which URLs actually return parseable content?) gives the full picture.

---

## How to get all sources accessible

### 1. Fix broken or moved URLs

- Run **GET /api/health-sources?test=all** and inspect `live_tests` for `ok: false` or non-2xx `status`.
- Update the URL in the **fetcher** file (e.g. `src/lib/fetchers/eu_ema_news_rss.ts`) and in **`src/lib/fetchers/sourceRegistry.ts`** so the registry stays the single source of truth for connectivity checks.
- Re-run `?test=all` to confirm.

### 2. Scrape-tier sources (Firecrawl)

- Sources that use **Firecrawl** (e.g. FDA guidance page, EMA guidelines, MDCG, industry blogs) need **FIRECRAWL_API_KEY** set.
- Without it, those fetchers return `[]` and log a warning. They still count as "reachable" in **test=all** if the **page URL** returns 200 (we only GET the page for the connectivity check; actual extraction uses Firecrawl).
- To get them to **produce signals**: set `FIRECRAWL_API_KEY`, then run **POST /api/poll-signals**.

### 3. Keep the registry in sync

- **`src/lib/fetchers/sourceRegistry.ts`** lists every source’s `check_url` and `tier`.
- When adding a new fetcher, add a corresponding entry to `SOURCE_CHECK_URLS` so **test=all** includes it.
- When changing a fetcher’s URL, update the registry so the health check tests the same URL.

### 4. Optional: scheduled reliability check

- Call **GET /api/health-sources?test=all** on a schedule (e.g. cron or Vercel cron) and log or store `reliability_ok` / `reliability_fail` and the list of failing `source_id`s.
- Alert when `reliability_fail` exceeds a threshold or when a previously OK source starts failing.

---

## Summary

| Goal                         | Action |
|-----------------------------|--------|
| See which sources have data | GET /api/health-sources |
| Quick check of 8 key URLs   | GET /api/health-sources?test=1 |
| Check every source URL      | GET /api/health-sources?test=all |
| Fix inaccessible sources    | Update fetcher + sourceRegistry.ts, re-run test=all |
| Get scrape sources working  | Set FIRECRAWL_API_KEY, run poll-signals |
