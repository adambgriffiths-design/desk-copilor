# KAREN — Redis Production Readiness / Memory Integration Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no commit / push / deploy  
**Sources:** `karen-decision-memory-implementation.md`, `karen-decision-memory-storage-design.md`, `karen-continuous-decision-memory-audit.md`, `karen-live-decision-history-session-boundary-fix.md`, `lib/decision-memory-backend.ts`, `lib/decision-envelope-history.ts`, `lib/chat-engine.ts`, `lib/verdict-engine.ts`, `app/api/chat/stream/route.ts`, `scripts/test-decision-memory-adapter.ts`  
**Env check:** `.env.local` inspected for **variable name presence only** (no secret values logged). Vercel production env listing **not verified** (CLI option failed).

---

REDIS IMPLEMENTATION:
PASS

ENVIRONMENT VARIABLES:
NOT CONFIGURED

LOCAL FALLBACK:
PASS

PRODUCTION READINESS:
BLOCKED

CROSS-ISOLATE MEMORY:
NOT VERIFIED

LIVE/HISTORICAL ISOLATION:
PASS

DECISION INTEGRITY:
PASS

OUTAGE BEHAVIOUR:
PASS

TTL:
86400

CAP:
80

MEMORY ESTIMATE:
~0.6 MB / lane (80 × ~8.3 KB)

REDIS OPERATIONS:
write ~4 cmds (1 HTTP + 1 pipeline); LIVE hydrate 1 LRANGE

CONTINUOUS-RECORDING READINESS:
NOT READY

REMAINING BLOCKERS:
- UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL + KV_REST_API_TOKEN) not set in `.env.local`; production Vercel env not confirmed configured
- No live Upstash / multi-isolate production round-trip verification possible without credentials
- Continuous background recorder still NOT BUILT (SPEC READY only)
- Known dual-isolate dedup race (possible duplicate appends; append-only, no WHY overwrite)
- HISTORICAL Redis hydrate not wired on every historical chat path (LIVE hydrate is; HISTORICAL still persists when Redis configured)

SINGLE NEXT ACTION:
Configure Upstash (or Vercel KV) REST URL+token in Vercel production, then verify Analyse write → cold-isolate Chat history read returns the same DecisionEnvelope.

---

## Audit items 1–20

### 1. Environment variables the implementation reads

From `lib/decision-memory-backend.ts` → `readUpstashRestConfig()` / `resolveDecisionMemoryTtlSeconds()`:

| Variable | Role |
|----------|------|
| `UPSTASH_REDIS_REST_URL` | Primary REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Primary bearer token |
| `KV_REST_API_URL` | Alternate URL (Vercel KV alias) |
| `KV_REST_API_TOKEN` | Alternate token |
| `KAREN_DECISION_MEMORY_TTL_SECONDS` | Optional TTL override (default 86400) |

Both URL **and** token must be non-empty; either Upstash pair **or** KV pair. No other Redis env names are read.

### 2. Names vs Upstash / Vercel integration

**PASS / match.** Upstash Redis REST uses `UPSTASH_REDIS_REST_*`. Vercel KV is the same REST surface under `KV_REST_API_*`. Implementation accepts both. No `@upstash/redis` / `@vercel/kv` package — zero-dep `fetch` to REST/pipeline endpoints.

### 3. Behaviour when Redis variables are missing

**PASS / safe.** `readUpstashRestConfig()` → `null` → `getDecisionMemoryBackend()` → `null` → `decisionMemoryStoreMode() === "ram-only"`. No throw, no invent. L1 rings only (pre-Redis behaviour).

### 4. Local RAM fallback

**PASS.** Confirmed in code + adapter test 15 (`setDecisionMemoryBackendForTests(null)` / unset env → ram-only record/read). `.env.local` has **none** of the Redis-related names above → local runs are ram-only today.

### 5. Production Analyse → Redis → Chat path (when configured)

**Code path PASS; production runtime BLOCKED / unverified.**

| Step | Wiring |
|------|--------|
| Analyse / pipeline record | `runDeskPipeline` → `recordDecisionEnvelopeHistory` → L1 + `persistEntry` (`RPUSH`/`LTRIM`/`EXPIRE` via `appendTrimExpire`) |
| Flush | `flushDecisionMemoryWrites()` in `verdict-engine` and `chat-engine` |
| Chat history read | `/api/chat/stream` → `hydrateDecisionMemoryFromStore({ lane: "LIVE" })` before `answerLiveDecisionHistoryQuery` |

Without configured env, production remains **RAM-affinity broken** (same as pre-adapter). Adapter test 17 simulates cross-isolate with **in-memory mock Redis only** — not live Upstash.

### 6. L1 must not be accidental production SoT

**PASS (when Redis configured).** Mode `redis`: hydrate replaces L1 from Redis; hydrate failure **clears** target lane L1 → empty → honest miss. L1 is same-isolate cache after local write/hydrate. Doc/code: never treat L1 as SoT when Redis env present. Residual: same-isolate L1 can still serve a just-written entry if background persist fails (other isolates miss) — correct honesty policy, not invention.

### 7. Redis miss fallback

**PASS.** Empty list / failed parse entries filtered → empty ring → existing miss strings (`NO DECISION AVAILABLE` / `live_decision_missing`). No PIT rebuild on Redis miss.

### 8. Redis outage must not invent / PIT / LLM-history / mix / false-claim

**PASS** (adapter test 14 + hydrate catch path):

| Forbidden | Observed |
|-----------|----------|
| Invent decision | No — empty L1 after failed hydrate |
| PIT-rebuild because Redis down | No — history Q stays ring/recorded-only |
| LLM recreate history | No — stream path answers from ring APIs before mentor invent |
| Mix LIVE / HISTORICAL | No — separate keys / arrays |
| Stale as “current invented history” | Cold isolate: empty. Same-isolate post-write L1 may still hold the **actually recorded** entry if persist failed — not fabricated |
| Silently claim history exists | Miss wording / missing `responseSource` |

### 9. LIVE / HISTORICAL keys cannot cross

**PASS.** Keys: `karen:decision:LIVE` vs `karen:decision:HISTORICAL:{fixtureId}` (+ `__index` SET). Separate L1 arrays. Adapter tests 6–7.

### 10. Fixture IDs cannot cross

**PASS.** Per-fixture HISTORICAL keys; hydrate by `fixtureId` merges only that fixture’s list. Test 7 (fixture A/B isolation).

### 11. decisionKey round-trip

**PASS** (code + adapter test 8 / 17). Full entry `JSON.stringify` / `JSON.parse`; `desk-pipeline` passes `decisionKey` into `recordDecisionEnvelopeHistory`; field stored on entry.

### 12. Original envelope fields survive serialization

**PASS** (implementation gates C–D; adapter tests 8–11). Stored value is full `DecisionEnvelopeHistoryEntry` JSON including `envelope` (thesis / whyNow / conflictLog / invalidation / confidence), top-level stance/verdict, `entryStatus`. Append-only — no UPDATE of prior list elements.

### 13. Recorded-only historical rule intact

**PASS.** Redis is a shared store for the same recorded entries; unavailability → empty → miss. Session-boundary / time-travel path does not PIT-rebuild LIVE clock answers because Redis is down. Continuous-audit / recorded-vs-PIT policy unchanged.

### 14. LIVE session-boundary fix still required / applied

**PASS (applied).** `karen-live-decision-history-session-boundary-fix.md`: `lookupLiveAtClock` binds to `cmeSessionDateKeyFromDate(latest.asOf)`; prior-session HH:MM leak blocked; suite §9 tests 1–12 green (127 total). Still a **prerequisite** for trusting multi-session continuous LIVE tape — Redis persistence alone does not replace session bind. Continuous recorder remains unbuilt.

### 15. Cap and TTL

| Control | Value | Mechanism |
|---------|-------|-----------|
| Cap | **80** | `DECISION_MEMORY_MAX_ENTRIES` / `LTRIM -80 -1` + L1 `.slice(-80)` |
| TTL | **86400 s (24h)** default | `EXPIRE` on append; override `KAREN_DECISION_MEMORY_TTL_SECONDS` |

After expiry → empty list → honest miss.

### 16. Maximum theoretical memory at current cap

**~0.6 MB per lane** (80 × ~8.3 KB full entry fixture probe from continuous / storage audits). Two lanes worst-case class ~1.2 MB Redis payload (+ negligible index SET). Negligible vs engine RSS.

### 17. Expected Redis operations per write / read

| Path | Ops |
|------|-----|
| LIVE append | `LINDEX -1` then pipeline `RPUSH` + `LTRIM` + `EXPIRE` → **4 commands**, **2 HTTP** calls |
| HISTORICAL append | above + `SADD` on `__index` → **5 commands** |
| LIVE hydrate (chat history Q) | **1× `LRANGE` 0 -1** |
| HISTORICAL hydrate-all | `SMEMBERS` + `LRANGE` per fixture |

L1 hit after hydrate/write: **0** Redis.

### 18. Continuous recording → unnecessary Redis writes?

**Risk if naïve; design expects material gate.** Continuous recorder is **NOT BUILT**. If every-minute eval appended without material-change / existing 60s hash+stance dedup, Redis would fill to 80 quickly and churn TTL/EXPIRE — rejected by continuous-memory audit. Storage layer is suitable **only** with sparse material appends (tens/session). Dedup race across isolates can still duplicate near-identical rows.

### 19. Suitability for target use cases

| Use case | Suitability |
|----------|-------------|
| Manual Analyse | **Yes** (code) — blocked in prod until env + verify |
| Chat history | **Yes** (LIVE hydrate wired) — same blocker |
| Continuous material recording | **Storage OK; recorder NOT READY** |
| Cross-isolate retrieval | **Supported in design/tests; NOT VERIFIED on real Redis/prod** |

### 20. Production readiness claim discipline

**Do not claim READY.** `.env.local`: Redis-related vars **absent** (`NOT CONFIGURED`). Vercel production env listing could not be confirmed in this audit. Implementation report already states credentials were not set by that work. Without configured env **and** a production-safe Analyse→Chat verification, status is **BLOCKED**.

---

## Evidence summary

| Gate | Result | Notes |
|------|--------|-------|
| Adapter implementation present | PASS | `decision-memory-backend.ts` + history adapter |
| Focused adapter tests (cited) | PASS | 49 assertions / items 1–17 in implementation report |
| Decision history / intent / wait suites (cited) | PASS | 127 / 135 / 142 |
| Local Redis env | NOT CONFIGURED | name-presence only |
| Prod Redis env | NOT VERIFIED | CLI list failed; treat as not ready |
| Cross-isolate real Redis | NOT VERIFIED | mock-only isolate sim |
| Continuous recorder | NOT READY | architecture SPEC; not implemented |

---

## Stop

Audit complete. No code changes. No commit. No push. No deploy.
