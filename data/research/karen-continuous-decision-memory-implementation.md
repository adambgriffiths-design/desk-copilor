# KAREN — Continuous Decision Memory Implementation

**Date:** 2026-08-15  
**Mode:** IMPLEMENTATION — event-driven recorder + synthetic fixture validation  
**No commit / push / deploy**  
**Label:** HISTORICAL / SYNTHETIC — NOT LIVE MARKET DATA  
**LIVE MARKET VERIFICATION:** NOT PERFORMED — CME CLOSED (no fabricated live results)

Cross-ref: `karen-continuous-decision-memory-final-safety-audit.md`, `karen-decision-memory-implementation.md`, `karen-redis-production-cross-isolate-verification.md`

---

## Runtime limitation (FIRST)

| Check | Result |
|-------|--------|
| Vercel continuous background (`setInterval` / long-lived worker) | **NOT SUPPORTED** — serverless isolates are request-scoped; `vercel.json` has no cron |
| Fake `setInterval` on server | **REJECTED** (would be dishonest) |
| Implemented path | **Event-driven** `runContinuousDecisionRecorderTick` + **fixture-step driver** on `synthetic-ny-am` |
| Claiming live continuous while CME closed | **FORBIDDEN** — not claimed |

Runtime constant: `event-driven-only — Vercel serverless cannot host continuous background timers`

---

## What was built

| Piece | Role |
|-------|------|
| `lib/decision-memory-material.ts` | Model B material-change gate (stance/verdict/thesis.what/whyNow/invalidation; confidence-only = no) |
| `lib/continuous-decision-recorder.ts` | Event-driven tick; 0 LLM; Analyse priority; fingerprint skip; Redis only after gate via existing `recordDecisionEnvelopeHistory` |
| `lib/verdict-engine.ts` | `generatePipelineVerdict` wrapped in `withManualAnalysePriority` |
| `scripts/test-continuous-decision-memory.ts` | Unit + synthetic-ny-am fixture-step validation |

**Reused:** deterministic `runDeskPipeline`, `ResearchContextSession` OPTIMIZED incremental engine, `DecisionEnvelope`, Redis decision-memory backend, existing record/hydrate APIs.

**Not changed:** trading/ICT/envelope schema; TTL (24h); cap (80); no second engine; no background LLM; no DB.

---

## Test results

Assertions: **33 passed**, **0 failed**

### Fixture-step (`synthetic-ny-am`)

| Metric | Value |
|--------|-------|
| Bar range | 40 → 110 (71 steps) |
| Pipeline evals (deterministic) | 71 |
| Material records | **10** |
| LLM calls | **0** |
| Incremental fullRebuilds | 2 |
| Avg recorder gate latency | 0.064 ms |
| Max recorder gate latency | 0.298 ms |
| Pipeline wall (sum, fixture) | 6091.0 ms |
| Memory footprint (HISTORICAL JSON) | 89.2 KB |

All fixture records labeled **HISTORICAL / SYNTHETIC**.

### Redis

| Check | Result |
|-------|--------|
| Env UPSTASH_*/KV_REST_* | **ABSENT / NOT CONFIGURED** |
| REDIS CROSS-ISOLATE SYNTHETIC VERIFICATION | **FAIL** |
| Mock write latency (architecture) | 0.096 ms |
| Mock hydrate latency | 0.185 ms |

---

## Gates

```
RECORDER: PASS
LLM CALLS: 0
REDIS SYNTHETIC CROSS-ISOLATE: FAIL
MATERIAL CHANGE GATE: PASS
DUPLICATE CONTROL: PASS
ANALYSE PRIORITY: PASS
MEMORY: 91305 bytes (~89.2 KB) fixture HISTORICAL ring sample
REDIS WRITES: 11 queued (mock/metrics; production Redis NOT CONFIGURED)
LATENCY: gate avg 0.064 ms / max 0.298 ms; mock redis write 0.096 ms; hydrate 0.185 ms
LIVE MARKET VERIFICATION: NOT PERFORMED
REMAINING BLOCKERS:
1. Production/local UPSTASH_* / KV_REST_* Redis env ABSENT — cross-isolate SoT unavailable (ram-only).
2. Vercel serverless cannot host continuous background timers — event-driven / fixture-step only; live continuous requires extension (or external) poll while CME open.
3. LIVE MARKET VERIFICATION not performed — CME closed; no fabricated live results.
```

---

## Stop

Implementation complete for event-driven + synthetic validation. No commit / push / deploy. No live-market fabrication.
