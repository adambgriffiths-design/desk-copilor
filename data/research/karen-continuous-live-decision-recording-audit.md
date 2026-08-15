# KAREN — DESIGN/AUDIT: Continuous Live Decision Recording

**Date:** 2026-08-15  
**Mode:** DESIGN / AUDIT ONLY — no implementation, no code changes, no commit/push/deploy, no benchmark marathon, no tick engine, no second analysis engine, no new DB/cache  
**Related:** `karen-live-decision-recording-path-audit.md`, `karen-recorded-vs-pit-fix.md` (88/88 recorded-only retrieval), `karen-live-context-reuse.md`, `karen-live-decision-freshness.md`, `karen-decision-timeline-view-audit.md`  
**Overall feature status:** **SPEC READY / NOT BUILT**

---

## CURRENT AUTHORITATIVE LIVE ANALYSIS:

**Single envelope authority:** `runDeskPipeline(ctx, state)` in `lib/desk-pipeline.ts` builds `analysis_contract.decision` (`DecisionEnvelope`) and, when not suppressed, calls `recordDecisionEnvelopeHistory({ dataMode: "LIVE", … })`.

**Product entry that Analyse Market uses today:**

```
extension (TV chartSnapshot + chartLastPrice)
  → POST /api/live-verdict
  → generateChartAnswer (lib/verdict-engine.ts)
  → generatePipelineVerdict   // structured chart path — deterministic, no LLM reasoning
  → runDecisionPipeline → runDeskPipeline
  → LIVE ring record
```

`generatePipelineVerdict` is the authoritative **live Analyse** path when structured chart data exists. Vision/`generateLiveVerdict` is fallback only when snapshot is missing — **do not** use vision for background memory.

**Parallel chat path (same envelope engine, different entry):**

```
/api/chat/stream → streamChatReply / chat-engine
  → buildDeskMarketIntelligence (reuse fingerprint + Yahoo coalesce)
  → evaluateAnalysisQualityGate → runDecisionPipeline → runDeskPipeline
```

Both converge on **`runDeskPipeline`**. Continuous recording must call this same pipeline — never a second ICT/decision engine.

**Retrieval already fixed (separate from continuous writer):** NL “decision at HH:MM?” / what-changed / last recorded use **recorded envelopes only** (`karen-recorded-vs-pit-fix.md`; `test:decision-history-time-travel` **88 passed**). Continuous feature only ensures LIVE ring entries exist to retrieve.

---

## BEST TRIGGER:

**Preferred: new closed 1m bar identity change** (reuse key `bars` miss — count/first/lastTime on m1/m5/m15/daily), evaluated while market is open and the panel/session is connected.

**Also allow (same existing freshness rules as live context reuse):**

| Trigger | Why safe |
|---------|----------|
| New closed 1m (bar identity) | Matches engine `applyClosedBar` path; not forming-bar OHLC noise |
| Last print move ≥ **0.25 MNQ** (`LIVE_CONTEXT_PRICE_EPS`) | Existing reuse MISS `price` |
| Session / AMD / macro transition | Existing reuse MISS `session` |
| Manual Analyse / user chart read | Already records today |

**Align with existing policy** in `lib/analysis-triggers.ts`: ticks update state; analysis is **event/user gated** (`shouldRunKarenAnalysis("tick")` is false unless structural events). Continuous recorder should behave like **`bar_close` + reuse-key miss**, not a wall-clock hammer.

**Do NOT use as primary:** blind `setInterval(60s)` that always full-rebuilds — wastes CPU when fingerprint would HIT; still fine as a **poll shell** that *checks* freshness and no-ops on HIT.

**Who invokes:** **Extension-side poll** (or m1-close observer) calling the **same** `/api/live-verdict` + structured `chartSnapshot` path as Analyse — Next/Vercel serverless cannot own a reliable continuous timer across isolates. Server only runs pipeline when invoked.

---

## BACKGROUND COST:

| Path | Cost shape | Notes |
|------|------------|--------|
| Structured Analyse / `generatePipelineVerdict` | **No LLM** for decision | Deterministic observation → interpretation → decision |
| Mentor chat “Give me the read” | LLM + intel | **Out of scope** for background memory; do not spin mentor LLM every minute |
| Yahoo `fetchAllTimeframesCached` | Coalesced; **45s TTL**; in-flight dedupe | Warm via `/api/warm` |
| Live context reuse HIT | ~1–72ms intel | Same fingerprint → skip engine rebuild |
| New closed 1m MISS | Incremental 1m structure (not full history rebuild) | Per freshness audit — avoid “full rebuild every minute” |
| Cold / first request | Tens of seconds possible (Yahoo + engine) | Existing live latency profile |

**If naïvely every wall-clock minute with always-miss:** ~1 structured pipeline/min + Yahoo at most ~1–2×/min under 45s cache — **CPU-bound on Node**, not OpenAI $.  
**If fingerprint-gated:** most polls are no-ops or HIT; real work ≈ once per new closed 1m (and occasional ≥0.25 print / session change).

**8GB / overlap:** overlapping cold builds compete with manual Analyse — concurrency control is mandatory (see below).

---

## OVERLAP/CONCURRENCY RISK:

| Risk | Existing mitigations | Gap for continuous |
|------|----------------------|--------------------|
| Double Yahoo fetch | `marketFetchInFlight` coalesce + 45s cache | OK to reuse |
| Manual Analyse vs chat | Extension `verdictBusy` | Background must **share** this flag |
| Server multi-isolate | LIVE ring is **process-RAM** | Analyse vs later chat may miss history (recording-path audit) — continuous does **not** fix durability |
| Two background jobs | None | Need **single-flight**: skip if `verdictBusy` / backgroundInFlight |
| Competing with “Give me the read” | User cancels prior chart read on Analyse | Background must **yield**: never start if busy; if user starts mid-job, cancel or discard background result without stealing UI |

**Policy:** Manual / voice chart-read **always wins**. Background is silent, best-effort, and must not update the panel brief unless product later opts in.

---

## LIVE HISTORY STORAGE:

| Store | Role |
|-------|------|
| `lib/decision-envelope-history.ts` → `liveHistory` | **Authoritative LIVE DecisionEnvelope history** |
| Max **80** entries | Oldest dropped; material-change gating stretches useful window |
| Process-local RAM | Restart / new serverless isolate → empty ring → honest miss |
| `data/session-log.jsonl` | Verdict text only — **not** time-travel store |
| HISTORICAL ring | Fixture/PIT lane — **never mix** with LIVE |

**Existing LIVE dedup (today):** same `stateHash` + `stance` within **60s** → keep first.  

**Proposed continuous append rule (spec only):** always **evaluate** on trigger; **append** only if material vs last LIVE entry:

- verdict or stance changed, **or**
- thesis `what` / `whyNow` changed, **or**
- invalidation condition changed  

(Reuse dimensions already compared in `compareDecisionSnapshots`.) Same-state polls: run optional, **no new ring row**.

**Do not propose a second DB in this slice.** Prefer ring reuse; note shared durable store as **future** only if isolate loss blocks product.

**Fields already recorded:** `asOf`, `recordedAt`, stance, verdict, confidence, thesis, invalidation, full envelope, `stateHash`, optional `snapshotId` / marketState, `decisionKey`, `entryStatus` (desk-pipeline now passes these).

---

## FAILURE BEHAVIOUR:

| Failure | Required behaviour |
|---------|-------------------|
| Yahoo / Tickstream unavailable / timeout | **Do not invent** a decision; skip record (or honest existing `noCall` / quality-blocked path that does **not** fabricate LONG/SHORT) |
| Chart snapshot quality unusable | Same as Analyse: `noCallResult` — **no fake envelope** for memory |
| Pipeline throws | Catch; log; **no ring write** |
| Background cancelled by user Analyse | Discard background result; do not overwrite manual envelope |
| Empty / stale weekend feed while labeled LIVE | Treat as unavailable — skip; do not seed HISTORICAL into LIVE |

Failed background eval **must not** create a synthetic “WAIT at 09:30” for later retrieval. Miss language stays: `No decision was recorded at HH:MM.`

---

## MARKET-CLOSED BEHAVIOUR:

- **Idle the continuous loop** when CME Globex / session resolver says closed (or extension detects off-hours).
- Do **not** burn Yahoo every minute on weekend stale tape.
- Weekend validation stays **HISTORICAL / FIXTURE** (`karen-weekend-offmarket-test-audit.md`) — never label fixture as LIVE continuous memory.
- If a closed-session poll somehow runs and data is stale/missing → failure behaviour above (no fake record).

---

## RECOMMENDED RECORDING FREQUENCY:

| Layer | Cadence |
|-------|---------|
| **Poll / freshness check** | ~every 15–30s or on clock minute — cheap fingerprint / bar-identity check only |
| **Run pipeline** | Only on reuse MISS: new closed 1m, price ≥ 0.25, session change, or user Analyse |
| **Append LIVE ring** | Only on **material** decision/reasoning change vs last recorded (plus existing 60s hash+stance dedup) |

**Not:** every tick · every chat message · every wall-clock minute full rebuild · duplicate LLM mentor pipeline.

Expected tape shape: sparse timeline of real decision shifts (tens per session), not 390 rows/day. Cap 80 remains viable for a session of material changes.

---

## SINGLE SAFEST IMPLEMENTATION SHAPE:

1. **Extension-gated silent recorder** (feature flag): while market open + backend online + `!verdictBusy`, on **new closed 1m / reuse miss**, call the **same** structured path as Analyse (`POST /api/live-verdict` with `chartSnapshot` + `chartLastPrice`; question = full_read intent).  
2. Server runs **`generatePipelineVerdict` → `runDeskPipeline`** only — no vision, no mentor LLM, no second engine, no tick loop.  
3. Reuse **Yahoo coalesce**, **`/api/warm`**, and **live context reuse fingerprint** so non-miss polls are cheap.  
4. **Single-flight** with manual Analyse (`verdictBusy`); background yields; failures skip record.  
5. **Append** to existing LIVE ring only on material change; lanes stay LIVE-only.  
6. Retrieval unchanged: `answerLiveDecisionHistoryQuery` / recorded HISTORICAL path already return original envelope + why; what-changed = `compareDecisionSnapshots` on two recorded entries.  
7. **Out of scope this slice:** new DB, tick engine, durable cross-isolate store, timeline UI, ICT rule changes.

**Overall:** **SPEC READY / NOT BUILT.**

---

## APPENDIX — Answers to the 14 questions

1. **Authoritative live analysis function?**  
   `generatePipelineVerdict` → `runDecisionPipeline` → **`runDeskPipeline`** (Analyse / live-verdict structured path). Chat uses `buildDeskMarketIntelligence` + `evaluateAnalysisQualityGate` → same `runDecisionPipeline` / `runDeskPipeline`.

2. **Callable periodically without a second engine?**  
   **Yes.** Invoke the same entry (`generatePipelineVerdict` or intel+gate) on a schedule/event; no new analysis engine.

3. **Best trigger?**  
   **New closed 1m bar** (primary), plus existing reuse misses: **≥0.25 price**, **session transition**. Wall-clock 1m only as a poll that checks freshness — not an unconditional rebuild.

4. **What should NOT trigger?**  
   Every tick; every chat message; duplicate same-state appends; vision/LLM mentor loops; blind full rebuild every minute.

5. **Prevent overlapping analysis jobs?**  
   Extension single-flight (`verdictBusy` + backgroundInFlight); skip if busy; rely on Yahoo in-flight coalesce server-side.

6. **Prevent background competing with manual “Give me the read”?**  
   Manual/voice chart-read wins; do not start background while busy; cancel/discard background if user starts Analyse; background stays silent (no panel steal).

7. **Same DecisionEnvelope pipeline?**  
   **Yes** — only `runDeskPipeline` / `analysis_contract.decision`.

8. **LIVE vs HISTORICAL/FIXTURE separation?**  
   Continuous writer touches **LIVE ring only**. HISTORICAL remains fixture/PIT research; lanes never mix (existing invariant).

9. **Yahoo/Tickstream unavailable?**  
   Skip record / honest no-call; do not invent. Coalesce/warm still apply when feeds recover.

10. **Failed background must not create fake decision?**  
    **Yes** — no ring write on throw/timeout/unusable quality; retrieval stays honest miss.

11. **Market closed?**  
    Stop/idle continuous loop; no LIVE claims from weekend stale feeds; fixture tests stay HISTORICAL.

12. **CPU/LLM cost if every minute?**  
    Structured path ≈ **$0 LLM**; cost is Yahoo + engine CPU. Fingerprint-gated ≈ ~1 real eval per new 1m. Naïve every-minute always-run is wasteful but still non-LLM; avoid it.

13. **Existing warm context/reuse?**  
    `/api/warm` → `warmMarketDataCache`; `fetchAllTimeframesCached` (45s + coalesce); `tryReuseLiveDeskIntelligence` / bar+price+session fingerprint (`karen-live-context-reuse.md`).

14. **Record every minute vs only material change?**  
    **Evaluate** on freshness miss; **record** only when verdict/stance/thesis/invalidation **materially** changes (plus existing 60s hash+stance dedup). Not every minute blindly.

---

## SAFE NEXT IMPLEMENTATION SLICE (when user asks — not now)

Flag-gated extension poll → freshness check → single-flight silent `live-verdict` structured call → material-change gate on LIVE ring append → unit tests for skip-on-busy / skip-on-failure / no HISTORICAL bleed. No ICT changes, no tick engine, no new DB, no commit/deploy unless requested.

### Cursor implement prompt (copy-paste when ready)

Implement Karen continuous LIVE decision recording per `data/research/karen-continuous-live-decision-recording-audit.md`: extension flag-gated silent poll while market open; on new closed 1m / reuse-key miss only, single-flight call the same structured `/api/live-verdict` → `generatePipelineVerdict` → `runDeskPipeline` path as Analyse Market (no vision, no mentor LLM, no tick engine, no second analysis engine, no new DB); share `verdictBusy` so manual Analyse always wins; on Yahoo/quality failure skip ring write; append LIVE ring only on material verdict/stance/thesis/invalidation change (keep existing 60s stateHash+stance dedup); never write HISTORICAL; add unit tests for overlap skip, failure no-record, and material dedup; no ICT/trading-logic changes; no commit/push/deploy unless asked.

---

## Stop

Design/audit complete. No continuous logger implemented. No code changes, commit, push, or deploy.
