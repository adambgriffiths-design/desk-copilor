# KAREN — Real Redis Integration Audit

**Date:** 2026-08-15  
**Mode:** AUDIT / VERIFY ONLY — no product code changes, no deploy, no commit/push  
**Secrets:** never printed (CONFIGURED yes/no + shape metadata only)  
**Label:** SYNTHETIC / INTEGRATION AUDIT — **NOT** live-market verification

---

## Gate summary (return block)

```
ENV CONFIGURED: YES
REAL REDIS CONTACTED: NO
WRITE PATH: UNVERIFIED
HYDRATE PATH: UNVERIFIED
L1 MASKING RISK: YES (same-isolate L1 survives Redis persist failure; Chat cold-isolate hydrate clears L1 on Redis error — honest miss there)
CROSS-ISOLATE: UNVERIFIED
SINGLE BLOCKER: Vercel Sensitive UPSTASH_* values pull as unusable `[SENSITIVE]` placeholders (len=11) — no local usable REST URL/token to contact real Redis; prove write→cold-hydrate inside a runtime that receives real injected secrets (or add Development/non-Sensitive local credentials).
```

---

## 1. Environment configuration

| Source | UPSTASH_REDIS_REST_URL | UPSTASH_REDIS_REST_TOKEN | KV_REST_API_* | Verdict |
|--------|------------------------|--------------------------|---------------|---------|
| Local `process.env` (this audit shell) | no | no | no | not loaded |
| `.env.local` (key names only) | absent | absent | absent | not configured locally |
| `npx vercel env ls` Production/Preview | present (Hidden/Sensitive) | present (Hidden/Sensitive) | absent | **names configured** |
| `vercel env pull` production / preview | present but **placeholder** | present but **placeholder** | — | **unusable for contact** |

Pulled value shape (no secrets printed): both URL and TOKEN `len=11`, `placeholder=yes`, URL `parse_ok=no` — matches literal `[SENSITIVE]` redaction from Vercel Sensitive env pull.

**App read path (code):** `lib/decision-memory-backend.ts` → `readUpstashRestConfig()`:

- URL: `UPSTASH_REDIS_REST_URL || KV_REST_API_URL`
- Token: `UPSTASH_REDIS_REST_TOKEN || KV_REST_API_TOKEN`
- `isDecisionMemoryRedisConfigured()` / `getDecisionMemoryBackend()` / `decisionMemoryStoreMode()` (`"redis"` vs `"ram-only"`)

**ENV CONFIGURED: YES** for Vercel Production/Preview (Upstash pair present).  
**Usable secrets in this audit workspace: NO** → real Redis HTTP not possible here.

---

## 2. Complete path trace (code)

### Analyse → DecisionEnvelope → record → Redis

1. **Analyse / verdict / deep chat** builds market state and runs pipeline:
   - `lib/verdict-engine.ts` → `runDecisionPipeline` → `runDeskPipeline` → `await flushDecisionMemoryWrites()`
   - `lib/analysis-quality-gate.ts` → `evaluateAnalysisQualityGate` → `runDecisionPipeline` (envelope on gate)
   - `lib/chat-engine.ts` (rich/DEEP) → quality gate → `await flushDecisionMemoryWrites()` after envelope build
2. **DecisionEnvelope** produced on `DeskPipelineResult.analysis_contract.decision` inside `lib/desk-pipeline.ts`.
3. **Record:** `runDeskPipeline` calls `recordDecisionEnvelopeHistory({ dataMode: "LIVE", envelope, verdict, decisionKey, entryStatus, ... })` when not suppressed.
4. **Persist:** `recordDecisionEnvelopeHistory` always appends **L1 RAM**, then if backend present calls `persistEntry` → async `enqueuePersist` → Upstash `appendTrimExpire` on `karen:decision:LIVE` (`DECISION_MEMORY_LIVE_KEY`).
5. **Flush:** Analyse paths await `flushDecisionMemoryWrites()` so the persist chain can finish before request end (best-effort; failures set `redisUnavailable`).

### Independent Chat → hydrate → LIVE history lookup

1. `app/api/chat/stream/route.ts`: on LIVE decision-history time query →  
   `await hydrateDecisionMemoryFromStore({ lane: "LIVE" })` →  
   `answerLiveDecisionHistoryQuery(lastUser)` (`lib/decision-time-travel.ts`).
2. Hydrate uses Redis `LRANGE` of LIVE key into L1 when mode is `redis`.
3. Lookup reads **L1 only** via `getDecisionEnvelopeHistory("LIVE")` / `latestDecisionEnvelope` / clock helpers — so hydrate must succeed for cold isolates.

**LIVE / HISTORICAL isolation (code):** separate keys `karen:decision:LIVE` vs `karen:decision:HISTORICAL:{fixtureId}`; Chat history path hydrates `lane: "LIVE"` only; lanes do not mix in record API.

---

## 3. L1 masking risk

**L1 MASKING RISK: YES**

Evidence in `lib/decision-envelope-history.ts`:

| Behavior | Effect |
|----------|--------|
| Record writes L1 **before** Redis | Same-isolate read succeeds even if Redis never runs |
| `enqueuePersist` `.catch` sets `redisUnavailable` but **does not clear L1** | Failed Redis write still leaves L1 populated |
| Explicit comment | “Same-isolate L1 after a local write remains readable even if a background persist failed” |
| Chat hydrate on Redis **failure** | Clears target lane L1 → honest empty miss (`ok: false`) |
| `answerLiveDecisionHistoryQuery` | Does **not** check `isDecisionMemoryMarkedUnavailable()`; trusts L1 contents after hydrate attempt |

**Implication:** A same-process Analyse→Chat success can look like shared memory while Redis never persisted — that must **not** be claimed as cross-isolate PASS. Cold Chat isolate after hydrate failure correctly misses. Production serverless usually separates Analyse/Chat isolates, so Redis is required for Chat history — but this audit **did not** prove that path live.

---

## 4. Real Redis contact / write / hydrate

| Check | Result |
|-------|--------|
| Real Upstash HTTP PING | **NOT RUN with usable credentials** |
| Synthetic LIVE `recordDecisionEnvelopeHistory` → Redis | **UNVERIFIED** |
| Clear L1 / independent hydrate LIVE | **UNVERIFIED** |
| Field integrity (decisionKey, stance, verdict, thesis/what, whyNow, invalidation, entryStatus) | **UNVERIFIED** |
| Marker cleanup | N/A (no write) |
| Mock used for PASS claim | **NO** — no mock PASS |

Attempted `vercel env pull` + PING earlier failed with `Invalid URL` because pulled URL was the `[SENSITIVE]` placeholder.

---

## 5. Cross-isolate claim

**CROSS-ISOLATE: UNVERIFIED**

Do not treat unit/mock adapter tests (`scripts/test-decision-memory-adapter.ts`) as production Redis proof.

`data/research/karen-redis-production-cross-isolate-verification.md` updated to match: env names YES on Vercel; real write/hydrate still not proven.

---

## 6. What would unlock PASS

1. Provide usable local Development credentials (non-Sensitive or `.env.local` with real URL+token), **or**
2. Run the synthetic marker write→cold-hydrate probe inside a Vercel serverless invocation where Sensitive env is injected for real, then cleanup marker.

Then re-run: unique LIVE marker → flush → empty L1 / second process → hydrate LIVE → integrity asserts → LIVE/HIST isolation → safe marker cleanup → latency.

---

## Stop

Audit complete. No product code changes. No deploy. No commit/push. No live-market data. No mock PASS claims.
