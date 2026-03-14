# Cron setup — handoff for new chat

**Deployment:** Railway (mahogany2). DB: Supabase. Email: Resend. NOT Vercel.

**Two crons:** `cron-send-digests` (hourly) and `cron-generate-feed` (daily) → curl `POST /api/send-digests` and `/api/generate-feed` with `Authorization: Bearer $CRON_SECRET`.

---

## Send-digests flow

Cron → app checks auth → queries profiles in `digest_send_hour ± 1` + cadence → for each: build digest from feed_stories → LLM header (~15s/profile) → send via Resend → record in `digests`. Returns `{ total_sent, profiles, errors }`.

---

## Testing

```bash
CRON_SECRET=<from Railway> ./scripts/test-cron.sh send-digests
```

Or curl: `curl -X POST "https://mahogany2-production.up.railway.app/api/send-digests" -H "Authorization: Bearer $CRON_SECRET"`. 200 + JSON = success. 401 = auth failed.

**Logs (mahogany2):** `[send-digests] running at...` → `X profile(s) in digest hour window` → `Resend accepted` or `Resend error`.

---

## Auth

`src/lib/cron-auth.ts` — requires `Bearer <CRON_SECRET>` when set. `CRON_AUTH_DISABLED=true` bypasses (remove when fixed). CRON_SECRET = 64-char hex. Use raw value on cron service, not `${{...}}` reference.

---

## Common issues

- **401** — CRON_SECRET mismatch or empty on cron
- **0 profiles** — Wrong `digest_send_hour` / timezone / cadence for current time
- **No email** — Resend sandbox only delivers to account email; verify domain
- **4+ min** — Normal (LLM per profile). `maxDuration=600`, curl `--max-time 600`

---

## Files

`src/app/api/send-digests/route.ts`, `src/app/api/generate-feed/route.ts`, `src/lib/cron-auth.ts`, `src/lib/digestAgent.ts`, `docs/CRON_LOGS.md`
