# Cron & digest log reference

## Log prefixes by endpoint

| Log prefix | Endpoint | Trigger |
|------------|----------|---------|
| `[send-digests]` | `/api/send-digests` | **Cron** (cron-send-digests) – sends email digests |
| `[generate-feed]` | `/api/generate-feed` | **Cron** (cron-generate-feed) – creates feed stories from signals |
| `[generate-feed-morning]` | `/api/generate-feed-morning` | Cron – morning feed for profiles in digest hour window |
| `[feed/generate]` | `/api/feed/generate` | **User** – profile save, "Generate Briefing" button |
| `[feed-agent]` | (used by both) | Feed story generation agent |
| `[digest]` | (used by send-digests) | Digest content generation (from feed stories) |

## Important

- **`[feed/generate]`** = user-triggered, *not* the cron. The cron hits `/api/generate-feed`, which logs **`[generate-feed]`**.
- **`[digest]`** = digest content is being built. It appears when `/api/send-digests` runs and processes each profile.

## Email delivery debugging

When send-digests runs, look for:

1. `[send-digests] running at ...` – route was hit
2. `[send-digests] X profile(s) in digest hour window` – how many will be processed
3. `[digest] using feed_stories for X` – digest content generated for profile X
4. `[send-digests] sending to X (from: Y)` – about to call Resend
5. `[send-digests] Resend accepted: id=... for X` – Resend accepted the send
6. **or** `[send-digests] Resend error for X: ...` – Resend rejected

If you see (4) but not (5) or an error, check:
- `RESEND_API_KEY` set on Railway
- `RESEND_FROM_EMAIL` – with `onboarding@resend.dev` (sandbox), only your Resend signup email receives
- Add/verify your domain in Resend for production delivery
