# KAREN — Continuous Recorder Adversarial Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no commit / push / deploy  
**Label:** HISTORICAL / SYNTHETIC — NOT LIVE MARKET DATA  
**LIVE MARKET VERIFICATION:** NOT PERFORMED — CME closed; no fabricated live results  

**Scope:** `lib/continuous-decision-recorder.ts` + `lib/decision-memory-material.ts` (material gate) + Redis persist/hydrate path via `lib/decision-envelope-history.ts` / `lib/decision-memory-backend.ts`  

**Method:** In-process synthetic probes + `synthetic-ny-am` fixture load. Probe: `.tmp-continuous-recorder-adversarial-probe.ts` (mock Redis / ram-only; production UPSTASH/KV env **ABSENT**).  

**Cross-ref:** `data/research/karen-continuous-decision-memory-implementation.md` (event-driven recorder; 71 fixture steps → 10 material records; Redis cross-isolate FAIL in impl; LLM=0). Prior foundation: `karen-continuous-decision-memory-final-safety-audit.md`.

---

## Verdict (short)

Core material gate, Analyse yield, fingerprint skip, lane isolation, cap/TTL wiring, and mock Redis failure modes hold under adversarial synthetic attacks. **Two trust-boundary failures remain:** the recorder will append if a caller feeds **stale** or **bad-quality** envelopes — there is no freshness / `data_quality` guard on the tick itself. **OVERALL: FAIL** until callers are gated or the tick rejects insufficient quality.

---

## Attack matrix

| # | Attack | Result | Evidence (SYNTHETIC) |
|---|--------|--------|----------------------|
| 1 | Repeated identical evaluations | **PASS** | 20 identical WAIT ticks → `recorded=1`, `skipped_not_material=19`, hist=1 |
| 2 | Rapid repeated events | **PASS** | 50 bursts same fingerprint → `recorded=1`, `fpSkip=49`, wall≈1.7ms, all `llmCalls=0` |
| 3 | Stale market data | **FAIL** | No stale/freshness check on tick; ancient `asOf` + envelope → `recorded` |
| 4 | Bad data quality | **FAIL** | No `data_quality` / quality-gate input; insufficient upstream still → `recorded` |
| 5 | Redis outage | **PASS** | Tick records L1; persist marks unavailable; hydrate `ok=false` + L1 cleared (honest miss, no invent) |
| 6 | Redis slow response | **PASS** | Tick wall≈0.5ms (does not await persist); Analyse sync path unblocked |
| 7 | Analyse simultaneous | **PASS** | Background → `skipped_yield_manual`; `manual-analyse` source still records |
| 8 | Opposite stance changes | **PASS** | LONG→SHORT both `recorded`; reasons include `stance` (+ verdict/thesis) |
| 9 | Same stance material thesis change | **PASS** | confidence-only skip; `thesis.whyNow` change → `recorded` |
| 10 | Session transition | **PASS** | Distinct CME session keys; LIVE appends both; HH:MM lookup did **not** leak prior session |
| 11 | Weekend / holiday | **PASS** | Fri→Mon keys differ; Friday marker not returned on Monday-session clock query |
| 12 | Cold isolate | **PASS*** | Mock Redis: L1 wipe + hydrate recovers marker; ram-only cold → `first_entry` again (*see risks*) |
| 13 | Duplicate isolate evaluation | **PASS** | Isolate B hydrates then identical WAIT → `skipped_not_material`; Redis list length=1 |
| 14 | 80-entry cap | **PASS** | 95 material-distinct appends → L1 hist length **80** (`DECISION_MEMORY_MAX_ENTRIES`) |
| 15 | TTL | **PASS** | Default 86400s; `expire` invoked with 86400 on append (mock cannot wall-clock expire) |
| 16 | LIVE / HISTORICAL contamination | **PASS** | Separate lanes; HIST marker absent from LIVE and vice versa |

\*Cold-isolate **PASS** assumes shared-store hydrate (mock). Production Redis env is **ABSENT** in this workspace — real multi-isolate SoT still blocked (matches implementation report).

---

## Cross-cutting invariants

| Invariant | Result | Evidence |
|-----------|--------|----------|
| 0 LLM | **PASS** | `llmCalls` typed `0`; metrics stay 0; no LLM imports on recorder path |
| No fabricated decisions | **PASS** | Appends only caller-supplied `DecisionEnvelope`; fixture/synthetic labels |
| No PIT reconstruction | **PASS** | Recorder = fingerprint → material gate → `recordDecisionEnvelopeHistory` only (no time-travel/PIT) |
| No blocking Analyse | **PASS** | Yield while manual Analyse active (~0.03ms); Redis persist async |
| No excessive Redis writes | **PASS** | 25 identical ticks → **1** Redis append / `redisWritesQueued=1` |
| No cross-session retrieval | **PASS** | LIVE clock lookup session-bound (`lookupLiveAtClock`); weekend leak probe false |

---

## OVERALL

| Gate | Result |
|------|--------|
| **OVERALL** | **FAIL** |
| Attack PASS | 14 / 16 |
| Attack FAIL | 2 (`stale market data`, `bad data quality`) |
| Invariants | 6 / 6 PASS |
| Redis env (this host) | **ABSENT** — mock path only |
| LIVE market | **NOT PERFORMED** |

**Interpretation:** Append spam, stance/thesis materiality, Analyse priority, lane isolation, and Redis degrade paths are solid for the event-driven design described in the implementation note. The recorder is **not** a quality/freshness authority — poisoning the tick input still writes memory. That is enough to fail this adversarial brief for continuous LIVE readiness.

---

## Alignment with implementation report

| Implementation claim | Adversarial check |
|----------------------|-------------------|
| Event-driven only / no fake `setInterval` | Confirmed — tick API only; runtime constant unchanged |
| 0 LLM | Confirmed under all attacks |
| Material gate (Model B) | Confirmed — identical / confidence-only skip; stance + thesis record |
| Analyse priority | Confirmed — yield + manual source proceeds |
| Duplicate / fingerprint control | Confirmed — rapid + identical cases |
| Cap 80 / TTL 24h | Confirmed (cap L1+trim; TTL expire wiring) |
| Redis cross-isolate | Mock **PASS**; production env still **ABSENT** (impl FAIL stands) |
| Fixture-step `synthetic-ny-am` | Fixture loads (120 m1 bars); this audit used unit envelopes + fixture presence, not a full 71-step re-bench |

---

## Remaining risks

1. **Caller trust boundary (FAIL drivers):** Continuous ticks will persist stale or quality-insufficient envelopes if upstream feeds them. Need explicit reject/skip on `data_quality` ∈ {stale, missing} / freshness miss **before** `runContinuousDecisionRecorderTick`, or inside the tick.
2. **Production Redis ABSENT:** Without UPSTASH/KV, cold isolates re-see `first_entry` and can duplicate records across isolates (ram-only). Impl already flagged; adversarial cold/dup tests only green under **mock** shared store.
3. **No continuous background on Vercel:** Event-driven / extension-poll still required; not re-attacked here beyond runtime constant honesty.
4. **TTL wall-clock:** `EXPIRE` wired; mock cannot prove eviction after 24h. Residual until prod Redis soak.
5. **LIVE session list is single-key:** Correctness depends on session-bound **retrieval** (PASS here). Wrong `asOf` at record time can still write into the LIVE ring under the wrong session identity.
6. **LIVE MARKET VERIFICATION not performed** — do not claim live continuous safety from this audit.

---

## Stop

Audit complete. No code changes. No commit / push / deploy.
