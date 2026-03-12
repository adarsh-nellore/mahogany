# Mahogany — Update Tracker

> Source: `Mahogany-UpdateList.pdf` | Created: 2026-03-11

---

## A) Source Ingestion Quality + Link Integrity

### A1. Link Health & Extraction Validation
- [x] Add automated link-checking for all configured sources (API, RSS, scraped)
- [x] Detect and flag failure modes: 404/410, redirect loops, 403, 429, timeouts
- [x] Detect "soft failures" (empty page, boilerplate-only, irrelevant content)
- [x] Store extraction diagnostics per item: HTTP status, final URL, response time, content length, extracted text length, main-content ratio, parser used

### A2. "Junk" Prevention / Content Sanity Checks
- [x] Minimum extracted text threshold quality gate
- [x] Duplicate detection (hashing + similarity)
- [x] Boilerplate detection (nav-heavy, cookie banners, login pages)
- [x] Language detection + expected-domain checks
- [x] Route failed items to "ingestion exceptions" queue with reason codes + remediation

### A3. Fallback Strategies When Extraction Fails
- [x] RSS fails → attempt HTML fetch + extraction
- [x] Firecrawl fails/thin → alternate extraction or direct fetch + readability parsing
- [x] API returns partial → retry, then degrade gracefully (store metadata, mark incomplete)
- [x] "Source change detection" (structure/schema changed) + auto-alert on failure rate spike

---

## B) Agent Reliability: Access, Blocking, Observability

### B1. Connectivity and Block Detection
- [x] Agent "ping" checks to confirm sources reachable and not blocked
- [x] Track bot mitigation signals (CAPTCHA, challenge pages, 403 spikes)
- [ ] Document recommended mitigation knobs (user-agent rotation, backoff, caching, alternate endpoints)

### B2. Agent Run Monitoring
- [x] Record per agent run: inputs, sources touched, outputs, failures, latency
- [x] Dashboard/internal page: success rate by source, freshness lag, top failing sources + reason codes, extraction quality distribution

---

## C) Freshness / Real-Time Updates

### C1. Freshness Targets by Source Class
- [ ] APIs: near real-time or hourly
- [ ] RSS: frequent polling (10-30 min) with backoff
- [ ] Scraped pages: scheduled by importance + volatility

### C2. Scheduling + Incremental Updates
- [x] Incremental pulls (ETags, Last-Modified, feed GUIDs, API cursors)
- [x] Retries with exponential backoff + jitter
- [x] Store "last successful ingestion" timestamps + alert when stale beyond SLA

---

## D) Knowledge Graph Completeness

### D1. Coverage Strategy
- [x] Source map with coverage goals (target: 100 sources)
- [x] Ensure coverage: core regulators, standards bodies, legislative trackers, enforcement/recalls/safety, industry updates tied to profile

### D2. Normalization + Entity Linking
- [x] Normalize into consistent entities (product codes, regulation IDs, guidance docs, legislation, standards, manufacturers, devices, indications)
- [x] Improve deduplication and linking logic (aggregate across sources, not fragment)

---

## E) Feed + Email Digest: Relevance, Recall, "Not Slop"

### E1. Success Metrics
- [x] Target recall: ~80% of "things user cares about"
- [x] Precision guardrails: minimize irrelevant, cap near-duplicates
- [x] Lightweight user feedback loops ("relevant / not relevant" signals → ranking)

### E2. Ranking and Filtering Based on User Profile
- [x] Profile filter tuning: not too aggressive (missing updates), not too loose (slop)
- [x] Implement tiering: must-see alerts (high-impact), weekly digest (lower urgency), optional exploratory (labeled)

---

## F) Search + Semantic / NL Chat Quality

### F1. Validate Retrieval Pipeline End-to-End
- [x] Chat retrieves correct documents/graph nodes
- [x] Chat cites right sources and timestamps
- [x] Chat answers with expected specificity (not generic summaries)

### F2. Evaluation Tests
- [x] Build "golden questions" test set tied to real user needs
- [x] Measure response correctness, citation accuracy, coverage

---

## G) User Tracking: Product Codes, Regs, Legislation + Update Delivery

### G1. Tracking Objects
- [x] Users can track: product codes, regulation IDs, legislative bills, guidance docs, keywords/entities
- [x] Track subscriptions with state: active, paused, frequency preferences, alert thresholds

### G2. Delivery Guarantees
- [x] Email digest sends on schedule
- [x] High-priority alerts delivered
- [x] Backfill behavior when ingestion was temporarily down

---

## H) UX / Design System Polish

### H1. Visual Hierarchy and Credibility
- [x] Upgrade typography, spacing, component consistency
- [x] Improve information hierarchy in feed/digest: what changed, why it matters, impacted entities, source credibility

### H2. Product Feel Improvements
- [x] Faster perceived performance, clearer loading/empty/error states
- [x] Better "trust" indicators (timestamps, sources, last updated, extraction status)

---

## Coverage Milestone
- [x] Map to 100 data sources (tracked with ownership, ingestion method, freshness SLA, current health status)
