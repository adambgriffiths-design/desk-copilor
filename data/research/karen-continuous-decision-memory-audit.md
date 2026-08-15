# KAREN — Continuous Decision Memory (FULL ARCHITECTURE AUDIT)

**Date:** 2026-08-15  
**Mode:** AUDIT / DESIGN ONLY — no implementation, no code changes, no new DB/cache/tick engine, no replay rewrite, no full historical study, no performance marathon, no commit/push/deploy  
**Objective:** Continuous **decision memory**, not continuous expensive rebuilding  
**Continuous recorder:** **NOT BUILT** (SPEC READY)  
**History retrieval (separate):** recorded-only + verdict+why — `test:decision-history-time-travel` **92/92** (cite speed audit / recorded-vs-pit lineage; do not treat as continuous-writer proof)  
**CME:** closed at audit time — **no fabricated live measurements**; post-opt live latency = **UNAVAILABLE**  
**Latency citation rule:** Old live MISS medians **~28–40s are STALE** (pre-reuse / pre-HTF-append / pre-structureFacts). Warm HIT chat: context **1–16 ms**, LLM **~3.7–4.8 s** (`karen-live-context-reuse.md`).  

**Primary sources:**  
`karen-continuous-live-decision-recording-audit.md`, `karen-continuous-state-speed-audit.md`, `karen-decision-memory-storage-design.md`, `karen-live-context-reuse.md`, `karen-live-decision-freshness.md`, `karen-live-decision-recording-path-audit.md`, `karen-recorded-vs-pit-fix.md`, `karen-live-decision-history-integrity-audit.md`, `karen-live-decision-history-session-boundary-audit.md`, `karen-historical-why-not-integrity-audit.md`, `karen-analyse-short-circuit-reuse-audit.md`, `karen-llm-payload-size-audit.md`, `karen-htf-append-only.md`, `karen-structure-facts-incremental.md`, `lib/decision-envelope-history.ts`, `lib/decision-time-travel.ts`, `lib/desk-pipeline.ts`, `lib/analysis-triggers.ts`

**Supersedes / folds:** prior continuous recording drafts and cost/retention questions into this single file. Speed deep-dive remains in `karen-continuous-state-speed-audit.md` (cross-ref §SPEED below).

---

## Design principle (non-negotiable)

```
FAST CURRENT STATE
  → meaningful change detection
  → authoritative decision evaluation ONLY when justified
  → compact DecisionEnvelope recording
  = CONTINUOUS DECISION MEMORY
```

**Not:**

```
EVERY TICK / EVERY MINUTE
  → fullRebuild
  → LLM
  → store everything
```

Statuses remain exactly: **`LONG | SHORT | WAIT | NO_TRADE`**. No new status system.

---

## 1. Current architecture

### Manual Analyse (authoritative live envelope)

```
extension (TV chartSnapshot + chartLastPrice)
  → POST /api/live-verdict
  → generateChartAnswer (lib/verdict-engine.ts)
  → generatePipelineVerdict          // structured — deterministic, no LLM reasoning
  → runDecisionPipeline → runDeskPipeline
  → analysis_contract.decision (DecisionEnvelope)
  → recordDecisionEnvelopeHistory({ dataMode: "LIVE", … })
```

### Chat “Give me the read” (same envelope engine, mentor LLM on top)

```
/api/chat/stream → streamChatReply / chat-engine
  → buildDeskMarketIntelligence (+ live context reuse)
  → evaluateAnalysisQualityGate → runDecisionPipeline → runDeskPipeline
  → mentor LLM rewrite of gated read (~3.7–4.8 s warm HIT)
```

**Single envelope authority:** `runDeskPipeline` → `analysis_contract.decision`.  
Vision / `generateLiveVerdict` is fallback when snapshot missing — **forbidden** for continuous memory.

### Freshness model today

Karen is **request-current**, not tick-current (`karen-live-decision-freshness.md`). There is no continuous writer. Between requests, cached envelopes can go stale by design on some follow-ups.

### Retrieval today (already fixed; not the continuous feature)

NL “decision at HH:MM?” / what-changed / last recorded → **recorded envelopes only** (`karen-recorded-vs-pit-fix.md`). Miss → `No decision was recorded at HH:MM.` / `NO DECISION AVAILABLE`. Continuous work only ensures LIVE rows exist to retrieve.

---

## 2. Existing reusable components

| Component | Role | Continuous use |
|-----------|------|----------------|
| `generatePipelineVerdict` → `runDeskPipeline` | Authoritative live Analyse path | **Only** decision evaluator |
| Live reuse fingerprint (`bars` / `price≥0.25` / `session`) | HIT/MISS for intel | Gate expensive work |
| Yahoo `fetchAllTimeframesCached` (45s + in-flight coalesce) + `/api/warm` | Feed warm | Keep-warm, not new cache architecture |
| Incremental engine + HTF m5/m15 append-only + structureFacts | Cheap closed-bar path | Prefer over fullRebuild |
| `analysis-triggers.ts` | Event/user gated analysis; ticks alone do not analyse | Align recorder with `bar_close` + structural events |
| LIVE ring (`decision-envelope-history`, max 80) | Authoritative LIVE history | Append target |
| `compareDecisionSnapshots` | What-changed dimensions | Material-change / append rules |
| `getLastPipelineResult` / `tryReuseLiveDeskIntelligence` | In-process reuse | Manual speed hook (not wired for Analyse short-circuit today) |
| Extension `verdictBusy` | Single-flight Analyse vs chat | Must share with background |

**Do not invent:** second decision engine, tick engine, new speculative cache layer, Postgres for this slice.

---

## 3. Recommended trigger model

**Primary:** new closed **1m** bar identity change (reuse `bars` MISS — count|first|lastTime on m1/m5/m15/daily).

**Also allow (existing freshness / triggers):**

| Trigger | Source | Expensive decision? |
|---------|--------|---------------------|
| Last print ≥ **0.25 MNQ** | `LIVE_CONTEXT_PRICE_EPS` | Yes if fingerprint MISS |
| Session / AMD / macro transition | reuse `session` MISS | Yes |
| 5m / 15m / daily identity change | included in bar fingerprint | Yes (same MISS) |
| Structural events in `ANALYSIS_KINDS` (MSS/BOS/FVG/liquidity/level_interaction/bias_change/…) | `analysis-triggers.ts` | Candidate coalesce into one eval |
| Manual Analyse / user chart read | existing | Yes (already records) |

**Who invokes:** **Extension-side** poll / m1-close observer calling the same structured `/api/live-verdict` path. Serverless cannot own a reliable continuous timer across isolates.

**Do NOT independently trigger expensive decision:**

- every raw tick  
- every chat message  
- duplicate same-state poll  
- repeated UI refresh  
- forming-bar OHLC noise (not in reuse key)  
- blind wall-clock full rebuild every minute  
- mentor LLM / vision loops  

Wall-clock 15–30s (or minute) is fine only as a **cheap fingerprint poll** that no-ops on HIT.

---

## 4. Recommended evaluation frequency

| Layer | Cadence |
|-------|---------|
| Cheap poll / fingerprint check | ~15–30s or on clock minute while market open |
| Yahoo warm | ≤ ~1× / 45s TTL when open (coalesced) |
| Engine sync | On reuse MISS only (prefer incremental / append-only) |
| `generatePipelineVerdict` / `runDeskPipeline` | On meaningful MISS / structural decision trigger / user Analyse |
| LIVE ring append | Only on **material** decision/why change (+ existing 60s hash+stance dedup) |

Expected tape: **sparse** decision shifts (tens per session), not 390 rows/RTH day.

---

## 5. Event coalescing strategy

1. Poll detects fingerprint MISS or structural event batch.  
2. **Single-flight** in-flight coalesce (extension `verdictBusy` / backgroundInFlight + Yahoo `marketFetchInFlight`).  
3. Collapse multiple triggers that land in the same poll window into **one** pipeline run.  
4. After eval, compare to last LIVE entry; append only if material.  
5. During high volatility: still one-in-flight; drop/skip overlapping background; never queue-explode.

---

## 6. LLM call policy

| Path | LLM? |
|------|------|
| Background structured pipeline (`generatePipelineVerdict`) | **Never** — $0 OpenAI for decision |
| Background “Give me the read” mentor | **Forbidden** |
| Manual Analyse structured | No LLM today |
| Manual chat warm HIT read | **1 LLM** (~3.7–4.8 s; ~6.6k tokens) |
| Why / why-not follow-up (structured HIT) | No LLM when deterministic mentor hits |

**Estimates (background structured-only policy):**

| Scenario | LLM calls |
|----------|-----------|
| Per hour background | **0** |
| Normal ~6h session background | **0** |
| Worst volatility background | Still **0** if policy holds |
| Naïve mentor every minute | Up to ~60/hour — **rejected** |

~640-token QUALITY GATE envelope duplicate cut (`karen-llm-payload-size-audit.md`): estimated **~50–150 ms** TTFT if shipped — **UNKNOWN** whether shipped at audit time; ≪ decode wall; irrelevant to background (background must not call LLM).

---

## 7. Market-context reuse strategy

Reuse existing infrastructure only:

- Fingerprint HIT → skip engine rebuild (chat already does).  
- Yahoo 45s pin/coalesce + `/api/warm` → avoid duplicate fetches.  
- On MISS: incremental closed-bar / HTF append-only / structureFacts — **not** fullRebuild every minute.  
- Post-opt live new-bar wall-clock: **UNAVAILABLE** (CME closed). Fixture class wins exist (HTF m5 append-only ~2.7s vs ~11s full; structureFacts ~3× class) — do **not** quote STALE 28–40s as current.

Do **not** weaken PIT. Do **not** weaken ICT. Do **not** invent a second cache architecture.

---

## 8. Decision change / deduplication rules

**Evaluate** on freshness miss; **append** only when material vs last LIVE entry.

Reuse compare dimensions already in `compareDecisionSnapshots` (+ product material rule from continuous recording audit).

| Case | New DecisionEnvelope record? | Notes |
|------|------------------------------|-------|
| **A.** WAIT→WAIT, same reasoning | **No** (dedup / no append) | Existing 60s same `stateHash`+stance keep-first also applies |
| **B.** WAIT→WAIT, materially different thesis/whyNow | **Yes** | WHY matters; not status-only |
| **C.** WAIT→LONG | **Yes** | |
| **D.** WAIT→SHORT | **Yes** | |
| **E.** LONG→WAIT | **Yes** | |
| **F.** SHORT→WAIT | **Yes** | |
| **G.** LONG→LONG, invalidation changed | **Yes** | |
| **H.** SHORT→SHORT, invalidation changed | **Yes** | |
| **I.** confidence only | **Prefer no** unless product later treats confidence as decision-material — **UNKNOWN** product preference; default omit spam |
| **J.** price changes, decision unchanged | **Evaluate** if ≥0.25 / bars MISS; **append only if** decision/thesis/invalidation material |
| **K.** structure changes, decision unchanged | Same as J — structure invalidates via bars/price/session; append only if envelope material |
| **L.** session changes, decision unchanged | **Evaluate** (session MISS); append only if material |

**Never update/mutate** an existing historical row (append-only).  
**Do not** create a parallel “lightweight market-state event stream” in this slice — optional future; not required for decision-at-time / why / what-changed.

**Known gap:** LIVE 60s `stateHash`+stance dedup can drop thesis drift within the window (`karen-live-decision-history-integrity-audit.md`) — continuous material-change gate should be **stricter about WHY** than hash+stance alone when implementing.

---

## 9. Minimum stored record

**Store:** full `DecisionEnvelopeHistoryEntry` already used by the LIVE ring (not raw Yahoo/Tickstream payloads).

**Must preserve (available today):**

| Field | Purpose |
|-------|---------|
| `asOf`, `recordedAt` | Timeline identity |
| `decisionKey`, `entryStatus` | Frozen identity / scaffold (desk-pipeline now passes these) |
| `stance`, `verdict` / status, `confidence` | Answer “what was the decision” |
| `thesis` (+ full `envelope.thesis`) | Why |
| `envelope.conflictLog`, `layers`, `reasoningChain` | Why / why-not evidence |
| `invalidation` | Invalidation Q |
| `stateHash` + compact `marketState` (price, HTF, structure, optional snapshotId) | Identity / what-changed market section |
| Lane `LIVE` | Isolation |

**Safe to omit from ring:** full multi-TF OHLCV dumps, raw Yahoo/Tickstream bodies, mentor LLM prose, duplicate full market-intelligence blobs every minute.

**Fixture size probe (bullish-wait):** full entry ~**8.3 KB**; envelope ~**6.8 KB**; compact projection ~**0.9 KB** (`karen-continuous-state-speed-audit.md` / storage design).

---

## 10. Memory / retention estimate

| Policy | Rough size | Notes |
|--------|------------|-------|
| Ring max 80 × ~8.3 KB | ~**0.6 MB** | Current LIVE cap — negligible vs engine RSS |
| Every RTH minute × 390 × 8.3 KB | ~**3.2 MB**/day | Rejected spam policy |
| Material-only (~tens/session) | ≪ 0.6 MB/day | Preferred |
| 5 trading days material (assume ~40/day × 5) | ~**1.6 MB** class | Still small if durable later; **not built** |
| Engine process RSS with warm engine | **UNKNOWN** live | Need open-market sample |

**Recommendation this slice:** keep **session / process memory** (max 80), material-change gating. Long-term journal / Redis shared store = **separate workstream** (`karen-decision-memory-storage-design.md`) — **do not build DB now**.

---

## 11. Restart behaviour

| Event | Behaviour |
|-------|-----------|
| Process restart / new serverless isolate | LIVE ring **empty** |
| Query after restart | Honest miss (`NO DECISION AVAILABLE` / no-recorded-decision) — **must not** imply history exists |
| First decision after restart | New append; no synthetic bridge of the gap |
| Gap visibility | Missing minutes have no rows → miss language |
| LIVE vs HISTORICAL | Remain isolated; restart does not mix lanes |

Do **not** invent persistence in the continuous recorder slice. Production cross-isolate durability is a **known gap** (storage design recommends future Redis append-lists — out of scope here).

---

## 12. Failure / stale-data behaviour

| Condition | Record? |
|-----------|---------|
| Yahoo/Tickstream unavailable / timeout / stale / partial | **C. Skip recording** (or honest existing no-call / quality-blocked path that does **not** fabricate LONG/SHORT) |
| Chart quality unusable | No fake envelope |
| Pipeline throw | Catch; log; **no ring write** |
| Background cancelled by manual Analyse | Discard background; do not overwrite manual |
| Weekend stale tape labeled LIVE | Skip; never seed HISTORICAL into LIVE |

**Do not:** fabricate a fresh decision from stale data; **do not** reuse last valid decision as a **new** timestamped row for a failed minute; **do not** let failure create “WAIT at 09:32” for later retrieval.

Optional future: explicit DEGRADED marker — **not required** now; skip is safer than fake history.

---

## 13. Manual / background concurrency strategy

| Rule | Detail |
|------|--------|
| Manual / voice chart-read **always wins** | Share `verdictBusy`; do not start background if busy |
| Single-flight background | Skip if `backgroundInFlight` |
| Mid-flight user Analyse | Cancel/discard background; do not steal panel UI |
| Yahoo | Existing in-flight coalesce |
| SSE / stale results | Background silent; never publish old result over newer manual |
| Serverless isolates | Warm on A does not help Analyse on B — wasted CPU risk |

---

## 14. Historical retrieval semantics

Already established:

- “What was your decision at HH:MM?” = **exact recorded DecisionEnvelope**  
- No PIT rebuild of missing decisions  
- Miss → `No decision was recorded at HH:MM.`  
- Hit → original status, stance, thesis, WHY, invalidation, decisionKey (`fromStore: true` on HISTORICAL recorded path)  
- “What changed?” = `compareDecisionSnapshots` on **two recorded** entries  
- Counterfactual “what would Karen have decided…” = **separate explicit intent** if ever built — not this feature  

**Known LIVE clock gap (orthogonal but must not ignore):** session-boundary audit **FAIL** — LIVE HH:MM lookup is minute-of-day only (can leak prior calendar/CME session). Continuous writer does not fix this; fix is retrieval-side day/session bind (`karen-live-decision-history-session-boundary-audit.md`).

---

## 15. WHY / WHY-NOT retrieval

Recorded envelope must preserve enough for:

- Why?  
- Why not long?  
- Why not short?  

**Evidence:** `karen-historical-why-not-integrity-audit.md` — core Why / Why-not **PASS** on LIVE+HISTORICAL for LONG/SHORT/WAIT/NO_TRADE when bound to original envelope; answers from original thesis/evidence; no hindsight rewrite; no invented execution. Past-tense “What **were** you waiting for?” routing **FAIL** (intent gap — not continuous-recorder scope).

Policy: explain from **original** record only; if fields insufficient, say so — never regenerate from today’s tape.

---

## 16. Live vs historical isolation

| Rule | Status |
|------|--------|
| Continuous writer touches **LIVE ring only** | Required |
| Fixture / PIT stays HISTORICAL | Required |
| Never mix banners / rings | Existing invariant; keep |
| Historical queries identify data source | LIVE vs HISTORICAL banners |

---

## 17. Market-hours behaviour

| Period | Continuous loop |
|--------|-----------------|
| CME open (incl. overnight Globex when product treats as open) | Allowed: cheap poll + event-gated eval |
| RTH | Same |
| Premarket / session transition | Session MISS → eval allowed |
| Market close / weekend / holiday | **Idle** — no Yahoo burn, **0** background LLM |
| DST / timezone transition | Use existing `America/New_York` helpers; do not add competing clocks |

Use existing session resolver / extension off-hours detection. Weekend validation stays HISTORICAL/FIXTURE (`karen-weekend-offmarket-test-audit.md`).

---

## 18. Timezone / DST handling

- Internal: unambiguous ISO `asOf`  
- Display / NL clocks: **America/New_York** session time (`formatEst` / `getEstMinutes`)  
- DST: helpers map minutes correctly; **session/day gate still missing** on LIVE clock queries (audit FAIL)  
- Do not create multiple competing timestamp conventions  

Continuous memory must record full ISO `asOf`; retrieval fix for day/session bind remains a **prerequisite** for trustworthy multi-day LIVE “at 09:30” answers.

---

## 19. Automation boundary

| Layer | Continuous decision memory |
|-------|----------------------------|
| Chat copilot awareness / timeline Q&A | **In scope** (when built) |
| Automated execution / risk | **Out of scope** — **not sufficient** |
| Tick-current execution state (stops, level crosses, risk events) | **Separate future** — investigate only; do not build |

Preserve: MARKET OBSERVATION ≠ DECISION ≠ EXECUTION ≠ OUTCOME.

---

## 20. Top 10 failure modes

1. Blind every-minute fullRebuild + LLM → CPU/API blowup (policy reject).  
2. Background competes with manual Analyse → latency / wrong UI winner.  
3. Fake ring row on Yahoo/quality failure → dishonest history.  
4. Filling gap minutes with last-known decision → false “decision at 09:32”.  
5. Serverless isolate warm unused by manual path → wasted work, no reuse.  
6. LIVE HH:MM session leak → wrong day’s decision (existing retrieval bug).  
7. 60s hash+stance dedup drops material WHY change.  
8. Mixing HISTORICAL fixture into LIVE continuous memory.  
9. Treating DecisionEnvelope history as trade ledger / P&L.  
10. Claiming speed “solved” while warm chat remains LLM-bound (~3.7–4.8 s).

---

## 21. Expected CPU cost

| Work | Expectation |
|------|-------------|
| Fingerprint poll | Negligible |
| Yahoo warm ≤1/45s | Network; coalesced |
| Incremental new-bar / append-only | Fixture-proven cheaper than full; **live post-opt UNAVAILABLE** |
| Deterministic pipeline on miss | CPU; typically ≪ LLM on warm chat historically |
| FullRebuild every minute | **Rejected** — would dominate |
| Process RSS warm | **UNKNOWN** live |

---

## 22. Expected LLM / API cost

| Item | Expectation |
|------|-------------|
| Background DecisionEnvelope path | **$0 LLM** |
| Yahoo | Bounded by 45s cache + open-hours only |
| Manual chat reads | Unchanged unless product adds skip-LLM |
| Mentor-every-minute | Rejected |

---

## 23. Safest implementation shape

1. **Feature-flagged extension silent recorder** while market open + backend online + `!verdictBusy`.  
2. Cheap fingerprint poll; on **new closed 1m / reuse miss / session**, call same structured `/api/live-verdict` → `generatePipelineVerdict` → `runDeskPipeline` as Analyse.  
3. No vision, no mentor LLM, no tick engine, no second decision engine, no new DB.  
4. Reuse Yahoo coalesce, `/api/warm`, live context reuse.  
5. Append LIVE ring only on material verdict/stance/thesis/invalidation change (+ keep existing 60s dedup awareness).  
6. Failures skip record; gaps stay gaps; restart clears RAM.  
7. Optional later: Analyse/panel short-circuit on fingerprint HIT (`karen-analyse-short-circuit-reuse-audit.md` — **not wired**).  
8. Retrieval unchanged (recorded-only). Fix LIVE session-bound clock as **separate** correctness fix.

**Overall feature status:** **SPEC READY / NOT BUILT.**

---

## 24. What should NOT be built (this workstream)

- Second decision / ICT / trading-logic engine  
- Tick-current execution / risk engine  
- New speculative cache architecture  
- New database (Redis durability = separate future design already audited)  
- Replay rewrite / PIT as “recorded decision”  
- Background mentor LLM loop  
- FullRebuild every minute  
- Storing full market context / raw feeds every evaluation  
- Claiming continuous memory solves warm-read speed without skip-LLM product change  

---

## 25. Open questions requiring measurement

1. Post-opt live MARKET CONTEXT on new 1m MISS (replace STALE 28–40s).  
2. Background + manual overlap wall times / contention on 8GB host.  
3. Whether Analyse short-circuit wins meaningful ms vs re-running `generatePipelineVerdict` (live **UNAVAILABLE**).  
4. Whether users accept LLM-skip “read” from `spokenBrief` / envelope.  
5. Extra wall-clock “envelope younger than N seconds” beyond fingerprint — **UNKNOWN** need.  
6. Cross-isolate warm failure rate on production Vercel.  
7. Material-change rate per live session (how fast ring of 80 fills).  
8. Confidence-only changes: record or not (product).  
9. LIVE session-boundary retrieval fix before multi-day continuous tape is trustworthy.  
10. Process RSS with engine warm under continuous keep-warm.

---

## Explicit answers A–J

### A. Should Karen evaluate every minute?

**No** as unconditional full evaluation. Wall-clock minute may **poll** freshness; **evaluate** only on reuse MISS / meaningful event / user Analyse.

### B. Should she evaluate only on new 1m bars?

**Primarily yes** (new closed 1m is the best default), **but not only** — also ≥0.25 price, session/AMD/macro, and coalesced structural triggers. Not ticks/chat spam.

### C. Should meaningful price/structure/session events trigger evaluation?

**Yes**, aligned with existing reuse MISS + `analysis-triggers` kinds — coalesced, single-flight, not every raw structure flicker without fingerprint pressure.

### D. How many LLM calls per hour should be expected?

**Background: 0** under the safe policy. Manual chat remains user-driven (~1 LLM per “Give me the read” on deliverable path). Mentor-every-minute would be ~60/hour — rejected.

### E. How much memory should one trading day consume?

Under material-change + max-80 ring: **≪ ~0.6 MB** for envelopes (80 × ~8.3 KB ceiling). Naïve every-minute full entries ~**3.2 MB**/RTH day — rejected. Engine RSS: **UNKNOWN** live.

### F. How long should decisions remain available?

**This slice:** process/session memory until restart or ring eviction (max 80). Multi-day durable journal = **future separate workstream** (storage design). Do not build DB now.

### G. What happens when she misses a minute?

No row for that minute. Query → **`No decision was recorded at HH:MM.`** Never backfill from neighbours.

### H. What happens after restart?

LIVE ring empty; honest miss; first new eval starts a new tape; gap not fabricated; lanes stay isolated.

### I. How does manual analysis reuse background state?

**Today:** chat can reuse warm intel via fingerprint HIT; Analyse does **not** short-circuit to last pipeline/envelope.  
**Possible:** if same isolate + fingerprint HIT + envelope from that fingerprint → return last result (Analyse CPU skip); chat still LLM-bound unless product skips LLM. Details: §SPEED + `karen-continuous-state-speed-audit.md`.

### J. How do we guarantee historical decisions are never rewritten?

Append-only ring; retrieval returns stored envelope/thesis (`fromStore`); what-changed compares two stored snapshots; no PIT under recorded wording; never mutate prior rows; failures skip write rather than overwrite.

---

## SPEED OPTIMIZATION / MANUAL REUSE OF BACKGROUND STATE

**Cross-ref (mandatory deep-dive):** [`karen-continuous-state-speed-audit.md`](./karen-continuous-state-speed-audit.md)

Continuous decision memory is a **conditional** speed opportunity **only if** it reuses existing market context and avoids unnecessary LLM calls. It does **not** by itself solve warm “Give me the read” latency.

### Reuse conditions / freshness threshold

Reuse background market context / DecisionEnvelope only when the **existing** live reuse key would HIT:

- same 1m/5m/15m/daily bar identity  
- last print **&lt; 0.25 MNQ** of cached overlay  
- same session / AMD / macro  
- same isolate  
- recommended: same wall-clock minute rule used by follow-up reuse  

Extra N-second envelope age threshold: **UNKNOWN** (unmeasured); fingerprint is coded truth today (`karen-live-context-reuse.md`, `karen-analyse-short-circuit-reuse-audit.md`).

### When SAFE vs must recompute

| SAFE | Must recompute |
|------|----------------|
| Fingerprint HIT + quality OK + same isolate + envelope from that fingerprint | Bars / price≥0.25 / session MISS |
| Follow-ups already on HIT path (Why / why-not) | Degraded/missing feeds; restart; other isolate |
| Product explicitly allows short-circuit | Presenting gap minute as “current recorded” |

### Estimated latency win if envelope + context reused

| Path | If reused | Evidence |
|------|-----------|----------|
| Context already warm HIT | Context **1–16 ms** already | Measured |
| Skip LLM on chat read | Drop **~3.7–4.8 s** → ms–tens ms assembly + UI | Only if product accepts non-LLM narration — **not current** |
| Analyse short-circuit skip pipeline | Speculative CPU save; live win size **UNKNOWN** | Not wired |
| Already warm HIT + no LLM skip | **Little/no** chat speed win | Warm bottleneck is LLM |

Do **not** invent post-opt live context numbers; STALE 28–40s must not be used as “before.”

### Risks of serving stale background envelope as current

- Wrong decision after bar/price/session move  
- Isolate A warm, isolate B cold → false confidence  
- Filling unrecorded minutes with last WAIT  
- Background holding `verdictBusy` → manual slower  
- Claiming mentor freshness while serving old `spokenBrief`

### Speed verdict (folded)

Background keep-warm + rare deterministic eval + optional manual short-circuit can help **cold→warm** and Analyse CPU. It **cannot** remove warm-HIT LLM wall without a product skip-LLM path. If already warm, added background work is **neutral to negative** (contention). **Do not claim continuous memory solves the speed problem.**

---

## SINGLE SAFEST IMPLEMENTATION SHAPE (executive)

Extension-gated, market-open, fingerprint-gated silent calls to the **same** structured Analyse pipeline (`generatePipelineVerdict` → `runDeskPipeline`); **0** background LLM; material-change LIVE append only; manual always wins single-flight; failures and missed minutes stay honest gaps; no tick engine / second engine / new DB. Speed win is optional and conditional — see speed audit.

---

## Stop

Full architecture audit complete. Continuous recorder **not implemented**. No code changes, live fabrication, commit, push, or deploy.
