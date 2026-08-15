# KAREN — Continuous Decision Memory FINAL SAFETY AUDIT

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no code changes, no commit / push / deploy  
**Objective:** Decide whether Redis + session-safe recorded history is a safe foundation for continuous LIVE decision memory **before** building a recorder.  
**Continuous recorder:** **NOT BUILT** (architecture SPEC READY in prior audits)

---

## Completed-state verification (brief vs repo)


| Claim                                            | Evidence                                                                                                           | Status                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Upstash Redis REST + L1 + LIVE / HISTORICAL keys | `lib/decision-memory-backend.ts`, `lib/decision-envelope-history.ts`, `karen-decision-memory-implementation.md`    | **PASS** (code + mock tests)                      |
| Adapter 49/49; history 127; wait 142; intent 135 | Implementation report (not re-run this audit)                                                                      | **Cited PASS** — not re-measured here             |
| LIVE session-boundary fix                        | `lookupLiveAtClock` + `cmeSessionDateKeyFromDate`; `karen-live-decision-history-session-boundary-fix.md`; suite §9 | **PASS**                                          |
| Recorded-only clock queries                      | `karen-recorded-vs-pit-fix.md`; NL at_time never PIT-manufactures                                                  | **PASS**                                          |
| QUALITY GATE envelope dedupe 2209→1580           | Prior audits / brief                                                                                               | **Cited** — orthogonal to continuous write safety |
| Warm Chat ~3.7–4.8s LLM-bound                    | `karen-live-context-reuse.md` / instant-read audit                                                                 | **Cited**                                         |
| `karen-redis-production-readiness-audit.md`      | **Not present** in repo                                                                                            | **MISSING**                                       |
| Production Redis env configured                  | Implementation remaining risk #2: credentials not set; no readiness audit; DEPLOY.md has no UPSTASH/KV vars        | **NOT CONFIGURED / UNVERIFIED**                   |


---



## 1. Continuous recording safety

**Recorder status:** not implemented. Safety judgment is about whether the **foundation** can support a safe recorder.

### Can it record meaningful triggers without every-minute spam?


| Trigger class                | Existing reuse / pipeline hook          | Safe for continuous eval? | Safe for history **append**?                |
| ---------------------------- | --------------------------------------- | ------------------------- | ------------------------------------------- |
| New closed 1m                | Live reuse `bars` MISS                  | Yes (preferred)           | Only if decision/why **material**           |
| Meaningful price (≥0.25 MNQ) | `price` MISS                            | Yes                       | Only if material                            |
| Structure / HTF / FVG/MSS    | Fingerprint / analysis-triggers         | Yes if coalesced          | Only if material                            |
| Session transition           | `session` MISS                          | Yes                       | Usually material (or eval then skip append) |
| Material decision change     | `compareDecisionSnapshots` dims         | Yes                       | **Yes — required append rule**              |
| Unchanged WAIT every minute  | No material gate beyond 60s hash+stance | Eval optional             | **No — would spam**                         |


**A vs B distinction today:**

- **A (new information):** reuse fingerprint MISS / structural triggers — **exists**.
- **B (unchanged → no new history row):** only LIVE dedup `stateHash` + `stance` within **< 60s** (`liveDedupHit`). Minute-spaced identical WAIT is **outside** that window.

**Verdict:** Architecture can support fingerprint-gated **evaluation**. It **cannot** yet safely gate **append** for continuous minute cadence without a material-change rule stricter than 60s hash+stance. Shipping continuous append on current dedup alone is **unsafe** (ring fill with duplicate WAIT rows).

**CONTINUOUS RECORDING SAFE → BLOCKED** until (at minimum) prod Redis SoT is live **and** material-change append is specified/implemented with the recorder.

---



## 2. Decision identity (09:30 / 09:31 / 09:32 WAIT)



### Fields available


| Field                | Role today                                                                                  | Sufficient alone?                                     |
| -------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `decisionKey`        | Now **persisted** on record (`desk-pipeline` + synthesize fallback)                         | Identity / display — **not** used for LIVE dedup      |
| `stateHash`          | LIVE dedup + market identity                                                                | Partial                                               |
| `asOf`               | Timeline index (ISO)                                                                        | Required                                              |
| `recordedAt`         | Write wall clock                                                                            | Not decision identity                                 |
| `sessionKey`         | **Not stored** on entry; derived at LIVE clock lookup via `cmeSessionDateKeyFromDate(asOf)` | Retrieval session bind OK; no persisted session field |
| `stance` / `verdict` | Dedup + answers                                                                             | Partial                                               |
| `thesis` / envelope  | WHY frozen append-only                                                                      | Material-change signal — **not** in 60s dedup         |




### Mental case: 09:30 WAIT → 09:31 WAIT → 09:32 WAIT, identical state

`liveDedupHit` requires same `stateHash` + `stance` **and** `|ΔasOf| < 60_000` ms.


| Pair           | ΔasOf     | Dedup?                                |
| -------------- | --------- | ------------------------------------- |
| 09:30 vs 09:31 | 60 000 ms | **No** (`< 60_000` fails at equality) |
| 09:31 vs 09:32 | 60 000 ms | **No**                                |


**Current behaviour:** **3 DecisionEnvelope history rows** (fills toward max 80).  
**Safest desired behaviour for continuous memory:** **1 decision row** (keep first WHY) + optional separate **current observation** / freshness — not three identical WAIT identities.

**Duplicate decision risk under naïve continuous minute recording:** **HIGH**.

---



## 3. Session transitions

Retrieval (already fixed):


| Transition                     | Session-bound LIVE clock?          | Evidence      |
| ------------------------------ | ---------------------------------- | ------------- |
| RTH → overnight                | Yes — prior RTH HH:MM not returned | Fix report §9 |
| Overnight → RTH                | Yes                                | Fix report    |
| Friday → Monday / weekend      | Yes — no Friday leak               | Fix report    |
| Holiday gap                    | Yes                                | Fix report    |
| DST                            | Yes — no pre-DST leak              | Fix report    |
| Duplicate HH:MM two days       | Same-session only; Day 2 wins      | Fix report    |
| Nearest-previous cross-session | **Blocked**                        | Fix report    |


**Continuous append session risk:** entries carry ISO `asOf`; session is derived from `asOf`, not from a mutable “active session” bucket. Wrong-session append requires **wrong** `asOf` **at record time** (pipeline skew), not Redis key mixup. LIVE Redis key is a single list (`karen:decision:LIVE`) spanning sessions — **correctness depends on session-bound retrieval** (now PASS), not per-session keys.

**CROSS-SESSION RISK (retrieval):** **LOW** after fix.  
**CROSS-SESSION RISK (naïve continuous + wrong asOf):** residual **UNKNOWN** live — not re-measured here.

**SESSION SAFETY → PASS** (retrieval foundation).

---



## 4. Redis load / races


| Topic                 | Finding                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Write path            | `record` → L1 → queue `appendTrimExpire` (LINDEX tail dedup → RPUSH → LTRIM -80 → EXPIRE) → `flushDecisionMemoryWrites`  |
| Read path             | Chat stream hydrates LIVE before history Q (`hydrateDecisionMemoryFromStore`)                                            |
| L1                    | Same-isolate cache; Redis SoT when configured; ram-only when env absent                                                  |
| Fallback / outage     | Hydrate fail → clear L1 → honest miss; persist fail → same-isolate L1 may retain, other isolates miss — **no invent**    |
| Latency               | Mock: write~2.0 ms, hydrate sample~0.3 ms (`karen-decision-memory-implementation.md`). **Prod Upstash RTT: UNKNOWN**     |
| Cap                   | **80** — do not increase (per brief)                                                                                     |
| TTL                   | Default **86400** — do not change (per brief)                                                                            |
| Duplicate writes      | L1 + Redis tail `shouldSkip`; **dual-isolate race** still documented (both pass tail check → duplicate appends possible) |
| Ordering              | Append-only RPUSH; newest at end                                                                                         |
| Continuous write load | Model A (~1/min) → hundreds RPUSH/day + EXPIRE churn → **HIGH** relative to material-only. Model B → **LOW**             |


**Without prod env:** adapter is dormant (`ram-only`); continuous memory **cannot** be production-correct across Vercel isolates.

---



## 5. LIVE / HISTORICAL


| Rule                                                                                              | Status                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Separate L1 rings + Redis keys (`karen:decision:LIVE` vs `karen:decision:HISTORICAL:{fixtureId}`) | **PASS**                                                                                                  |
| `withDecisionHistorySuppressed` blocks LIVE auto-record during historical builds                  | **PASS** (prior integrity audit)                                                                          |
| HISTORICAL `force` for explicit PIT capture into HISTORICAL lane                                  | **PASS**                                                                                                  |
| Continuous writer must touch **LIVE only**                                                        | Spec requirement — **not built**; no evidence of cross-write in current Analyse path (`dataMode: "LIVE"`) |
| PIT must never persist as LIVE unless explicit product path                                       | NL recorded-only; PIT research path is HISTORICAL — **PASS** for current product paths                    |


**LIVE/HISTORICAL ISOLATION → PASS**

---



## 6. Current state vs recorded decision


| Concept      | Mechanism today                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **CURRENT**  | Request-time pipeline / live intel fingerprint HIT; Analyse is request-current (`karen-live-decision-freshness.md`) |
| **RECORDED** | LIVE ring / Redis history; NL clock Q = recorded-only; miss = `No decision was recorded…`                           |


**Safe:** Missing minute ≠ invented decision (recorded-only + session bind).  
**Ambiguous / unsafe if misused:** Serving last LIVE ring / `lastPipeline` as “what Karen currently thinks” without fingerprint HIT (instant-read audit: **HIGH** stale risk on Vercel). Analyse short-circuit **not wired**. No separate “current observation” store distinct from decision history.

**CURRENT STATE VS RECORDED DECISION → AMBIGUOUS** (history path SAFE; current vs latest-recorded not product-hardened).

---



## 7. Speed (must not LLM every minute)

Preferred:

```
market update → cheap freshness → optional deterministic pipeline → envelope → Redis append
```

Forbidden:

```
market update → LLM → Redis → every minute
```


| Check                                          | Status                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Structured Analyse / `generatePipelineVerdict` | No LLM for decision (prior audits)                            |
| Background mentor LLM                          | **Must remain 0** — policy from continuous architecture audit |
| Warm Chat                                      | Still **1 LLM** ~3.7–4.8 s — unchanged by continuous memory   |
| Continuous solves warm chat speed?             | **No**                                                        |


**Manual Analyse latency impact of continuous:** **UNKNOWN** (not built). Contention if background shares isolate without single-flight → risk documented, unmeasured. Redis flush alone (when configured): mock **BOUNDED** ~ms; prod RTT **UNKNOWN**.

---



## 8. Memory growth table

Assumptions: ~**8.3 KB**/full `DecisionEnvelopeHistoryEntry` (fixture probe). Redis/L1 **cap 80** ⇒ stored ceiling ≈ **0.65 MB**/key regardless of write spam (evicts useful history). TTL 24h may empty earlier.


| Policy                                   | 1 session       | 1 RTH day       | 1 week (5 sessions)  | 1 month (~20 sessions) | Notes                                |
| ---------------------------------------- | --------------- | --------------- | -------------------- | ---------------------- | ------------------------------------ |
| Cap 80 (any policy)                      | ≤ ~0.65 MB      | ≤ ~0.65 MB      | ≤ ~0.65 MB live key* | ≤ ~0.65 MB*            | *Plus TTL expiry                     |
| 1 decision / minute (~390/RTH)           | ~3.2 MB written | ~3.2 MB written | ~16 MB written       | ~64 MB written         | Rejected; cap still 0.65 MB retained |
| 1 decision / 5 minutes (~78/RTH)         | ~0.65 MB        | ~0.65 MB        | ~3.2 MB written      | ~13 MB written         | Still chatty                         |
| Material-change only (~40/session class) | ~0.33 MB        | ~0.33 MB        | ~1.7 MB              | ~6.6 MB                | Preferred; usually < cap             |


Do **not** expand retention/cap without justification. Prefer material-only within 80 + 24h TTL.

---



## 9. Failure modes (no invented recovery)


| Failure                              | Expected behaviour (code / prior audits)                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Redis unavailable / env absent       | `ram-only` or hydrate clear → honest miss; no invent                                              |
| Market feed stale / disconnected     | Continuous spec: **skip record** — not implemented; today manual path uses existing quality gates |
| Pipeline / envelope validation fail  | No ring write on throw / blocked path                                                             |
| Duplicate identical state            | Within 60s: keep first; beyond 60s: **new row** (gap for continuous)                              |
| Two isolates evaluate simultaneously | Possible duplicate Redis appends (documented race); append-only (no WHY overwrite)                |
| Server restart / new isolate         | L1 empty; Redis retains if configured+TTL; else honest miss                                       |
| Local HMR                            | Process RAM reset; same as restart for L1                                                         |
| Session changes                      | Eval allowed; append only if material (spec); retrieval session-bound                             |
| Price moves, structure not           | May fingerprint MISS → eval; append only if envelope material                                     |
| Structure moves, price barely        | Same                                                                                              |


**Do not:** backfill gap minutes with last WAIT; fabricate LIVE from HISTORICAL; LLM-rewrite past WHY.

---



## 10. Vercel multi-isolate


| Requirement                          | Status                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Redis = shared SoT when configured   | **Designed + coded**                                                            |
| L1 = optimisation only when Redis on | **Coded**                                                                       |
| Prod env configured                  | **NO / UNVERIFIED** → production still **RAM-affinity broken** for Analyse→Chat |
| Continuous without Redis             | **Unsafe** on Vercel (same gap as today)                                        |


---



## 11. Recording models A / B / C / D


| Model                                                                 | Description                                                              | Safety                                                               | Fit             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------- |
| **A.** Record every minute                                            | Always append DecisionEnvelope                                           | **Unsafe** — spam, HIGH Redis write, duplicate WAIT identity         | Reject          |
| **B.** Record only material decision changes                          | Eval on freshness; append on stance/thesis/invalidation/material compare | **Safest for history ring**                                          | **Recommended** |
| **C.** Minute observations + DecisionEnvelope only on material change | Needs a second observation channel                                       | Safer than A; more surface than B                                    | Optional later  |
| **D.** Hybrid current-state + decision-history                        | Explicit CURRENT vs RECORDED stores                                      | Best long-term clarity; larger scope (short-circuit / current cache) | Not first slice |


**BEST RECORDING MODEL → B** (material decision-change append only; fingerprint-gated deterministic eval; **0** background LLM). Model D later if product needs explicit current-state ≠ latest history row.

---



## Top remaining risks (ordered)

1. **Production Redis env not configured** — continuous / cross-isolate memory blocked.
2. **No continuous recorder** + **no material-change append beyond 60s** — minute WAIT spam if naïvely built.
3. **Dual-isolate Redis dedup race** — duplicate appends possible.
4. **CURRENT vs RECORDED** still ambiguous for “latest ring = current”.
5. Warm Chat remains LLM-bound — continuous does not fix speed.
6. `karen-redis-production-readiness-audit.md` absent — no signed-off prod checklist.

---



## RETURN

```
CONTINUOUS RECORDING SAFE:
BLOCKED

REDIS READY:
BLOCKED

SESSION SAFETY:
PASS

DUPLICATE DECISION RISK:
HIGH

CROSS-SESSION RISK:
LOW

LIVE/HISTORICAL ISOLATION:
PASS

CURRENT STATE VS RECORDED DECISION:
AMBIGUOUS

REDIS WRITE LOAD:
LOW

MEMORY GROWTH:
| Policy | 1 session | 1 RTH day | 1 week (5d) | 1 month (~20d) | Retained (cap 80) |
|--------|-----------|-----------|-------------|----------------|-------------------|
| Cap 80 ceiling | ≤~0.65 MB | ≤~0.65 MB | ≤~0.65 MB | ≤~0.65 MB | ~0.65 MB |
| 1/min (~390/d) | ~3.2 MB written | ~3.2 MB | ~16 MB written | ~64 MB written | ~0.65 MB |
| 1/5min (~78/d) | ~0.65 MB | ~0.65 MB | ~3.2 MB written | ~13 MB written | ~0.65 MB |
| Material-only (~40/session) | ~0.33 MB | ~0.33 MB | ~1.7 MB | ~6.6 MB | usually <0.65 MB |

(Entry size ~8.3 KB; TTL 24h may expire earlier. WRITE LOAD rating = LOW assumes model B; model A would be HIGH.)

BEST RECORDING MODEL:
B

MANUAL ANALYSE LATENCY IMPACT:
UNKNOWN

LLM BACKGROUND CALLS:
MUST REMAIN ZERO

REMAINING BLOCKERS:
1. Production Upstash/KV Redis env NOT CONFIGURED / UNVERIFIED (no karen-redis-production-readiness-audit.md; adapter remains ram-only in prod until set).
2. Continuous recorder NOT BUILT.
3. Material-change append gate missing beyond 60s stateHash+stance (09:30/31/32 identical WAIT → 3 rows today).
4. Cross-isolate Redis tail-dedup race (duplicate appends possible).
5. CURRENT vs RECORDED product boundary not hardened (latest LIVE ≠ proven current without fingerprint).
6. Prod Redis RTT / open-market continuous contention UNMEASURED.

SINGLE SAFEST NEXT IMPLEMENTATION:
Configure and verify production UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV aliases), prove Analyse RPUSH → cold-isolate Chat hydrate LIVE — do not build the continuous recorder yet.
```

---



## Stop

Final safety audit complete. No code changes, commit, push, or deploy. Continuous recorder remains **not implemented**.