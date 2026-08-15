# KAREN — Redis Production Cross-Isolate Verification

**Date:** 2026-08-15  
**Mode:** AUDIT / VERIFICATION ONLY — no product code changes, no recorder changes, no TTL/cap changes, no LLM, no commit / push / deploy  
**Secrets:** never printed (names / booleans / shape only)  
**Label:** SYNTHETIC REDIS CROSS-ISOLATE VERIFICATION — **NOT** live-market verification  
**Cross-ref:** `karen-real-redis-integration-audit.md`, `karen-redis-production-readiness-audit.md`

---

## SYNTHETIC REDIS CROSS-ISOLATE VERIFICATION

**NOT live-market verification.**

```
REAL REDIS WRITE: FAIL
REAL REDIS COLD HYDRATE: FAIL
DECISION INTEGRITY: FAIL
LIVE/HISTORICAL ISOLATION: UNVERIFIED
WRITE LATENCY: UNKNOWN
HYDRATE LATENCY: UNKNOWN
CLEANUP: PASS
```

**Cleanup note:** No synthetic marker was written to Redis (contact impossible); nothing to remove — cleanup treated as PASS (no leftover marker from this run).

---

## Why FAIL (honest)

| Check | Result |
|-------|--------|
| Vercel Production/Preview env **names** | **YES** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (Sensitive, ~20m old at audit) |
| Local `process.env` / `.env.local` | **NO** usable Redis pair |
| `vercel env pull` (prod + preview) | Values are **`[SENSITIVE]` placeholders** (len=11) — not real URL/token |
| Real Upstash HTTP | **NOT CONTACTED** (Invalid URL on placeholder) |
| Mock used for PASS | **NO** |

**ENV on Vercel: CONFIGURED.**  
**Usable credentials in this workspace: NOT AVAILABLE.**  
Therefore write / cold-hydrate / integrity / isolation round-trip **cannot** be claimed PASS.

---

## Path confirmed in code (not a live PASS)

1. Analyse / verdict / deep chat → `runDeskPipeline` → `DecisionEnvelope` → `recordDecisionEnvelopeHistory(LIVE)` → Redis append on `karen:decision:LIVE` when env present → `flushDecisionMemoryWrites()`.
2. Chat stream history query → `hydrateDecisionMemoryFromStore({ lane: "LIVE" })` → `answerLiveDecisionHistoryQuery`.
3. App reads `UPSTASH_REDIS_REST_*` with `KV_REST_API_*` aliases (`readUpstashRestConfig`).

**L1 masking:** YES — same-isolate L1 can succeed after Redis persist failure; do not treat same-process success as cross-isolate proof. See integration audit.

---

## Return block (this run)

```
ENV CONFIGURED: YES
REAL REDIS CONTACTED: NO
WRITE PATH: UNVERIFIED
HYDRATE PATH: UNVERIFIED
L1 MASKING RISK: YES
CROSS-ISOLATE: UNVERIFIED
SINGLE BLOCKER: Sensitive UPSTASH_* pull as [SENSITIVE] — run probe where real secrets are injected, or add usable local Development credentials.
```

---

## Stop

Verification attempt complete. No product code changes. No mock PASS. No commit. No push. No deploy.
