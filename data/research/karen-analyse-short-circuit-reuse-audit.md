# KAREN — Analyse short-circuit reuse (AUDIT ONLY)

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no trading-logic changes, no duplicate decision engines, no commit/push/deploy  
**Question:** Can the live **Analyse** path safely short-circuit to a recent valid decision result without rerunning the full pipeline?  
**Market:** CME/weekend may be closed — **no invented live measurements**. Live FREQUENCY / LATENCY for Analyse short-circuit = **UNAVAILABLE** unless cited from prior open-market evidence (chat reuse only).  
**Sources:** `karen-live-context-reuse.md`, `karen-continuous-state-speed-audit.md`, `karen-live-decision-freshness.md`, `karen-live-decision-recording-path-audit.md`, `karen-latency-by-request-type.md`, `lib/incremental-market-engine.ts`, `lib/market-intelligence.ts`, `lib/desk-pipeline.ts` (`getLastPipelineResult` / `runDeskPipeline`), `app/api/live-verdict/route.ts`, `lib/verdict-engine.ts` (`generateChartAnswer` / `generatePipelineVerdict`)  
**Related (absent):** `karen-analyse-chat-runtime-share-audit.md` — **not present** in repo at audit time; isolate dependency cross-ref’d from continuous-state + recording-path audits instead.

---

## SAFE SHORT-CIRCUIT POSSIBLE: CONDITIONAL

**Yes only when all of the following hold:**

1. **Same Node isolate** as the prior successful pipeline that produced the candidate result (`getLastPipelineResult` / LIVE ring / `liveIntelCache` are process-RAM).
2. **Live market reuse fingerprint HIT** (exact key below) — same coded truth as chat intel reuse.
3. **Prior result was produced under that fingerprint** (or equivalent `stateHash` + unchanged stance/thesis/invalidation — continuous-state audit).
4. **Data still deliverable** — chart quality usable; not missing/stale Yahoo; not `canConfidentlyAnalyse === false` class degradation if product requires fresh ticks for Analyse.
5. **Product allows** returning the prior panel/spoken briefs without re-running observation → interpretation → decision.

**Not unconditionally safe:** serverless multi-isolate, restart, fingerprint MISS, degraded/missing chart, or serving a prior envelope after a gap minute with no matching fingerprint.

---

## FINGERPRINT:

**Canonical key (already in code):** `buildLiveMarketReuseKey(feed, asOf, lastPrice)` → compared by `decideLiveMarketReuse` → string form `formatLiveMarketReuseFingerprint`.

| Component | Exact comparison | HIT / MISS |
|-----------|------------------|------------|
| **symbol** | exact string | mismatch → `cold` |
| **bars** | per series (m1 \|\| m5 \|\| m15 \|\| daily): `count\|firstTime\|lastTime` only | identity change → `bars` |
| **session** | `resolveSessionContext(asOf)` → `id\|amdPhase\|macroWindow` | change → `session` |
| **last print** | `\|Δpx\|` vs prior key; epsilon **`LIVE_CONTEXT_PRICE_EPS = 0.25` MNQ** (1 tick) | **≥ 0.25 → `price` MISS**; &lt; 0.25 → HIT |
| **lastM1Time** | included in formatted fingerprint | tied to bar identity |
| **cold** | no prior key | `cold` |

**Forming-bar OHLC is not in the key** (by design). Structure / MSS / FVG / liquidity are **not** separate cache fields — they invalidate only via bars / price / session (`karen-live-context-reuse.md`).

**Follow-up-only extra (chat `tryReuseLiveDeskIntelligence`):** same session **and** same wall-clock **1-minute** as snapshot `asOf` (`followUpClockAllowsReuse`). Analyse short-circuit should treat this as a **recommended** freshness gate if returning a cached envelope without re-fetching bars (UNKNOWN whether product wants stricter N-second TTL — continuous-state audit).

**Formatted example shape:**  
`sym=…|bars=<m1>||<m5>||<m15>||<daily>|session=<id>|<amd>|<macro>|px=<n.nn>|m1t=<ms>`

**Gap for Analyse:** `getLastPipelineResult()` today stores `DeskPipelineResult` only — **does not persist the reuse key**. A correct short-circuit must remember `reuseKey` (or equivalent) with the last pipeline, then `decideLiveMarketReuse(stored, next)`.

**Cite:** `lib/incremental-market-engine.ts` (`LIVE_CONTEXT_PRICE_EPS`, `liveMarketBarFingerprint`, `decideLiveMarketReuse`); evidence pack `karen-live-context-reuse.md`.

---

## INVALIDATION TRIGGERS:

| Trigger | Reason code / mechanism | Already in code? |
|---------|-------------------------|------------------|
| New closed 1m / 5m / 15m / daily identity (count or first/last time) | `bars` | Yes |
| Last print move **≥ 0.25 MNQ** | `price` | Yes |
| Session / AMD / macro change | `session` | Yes |
| No prior snapshot / symbol change | `cold` | Yes |
| `forceFresh` | `forced` / bypass | Yes (intel path) |
| Wall-clock minute flip (follow-up fast path) | `followUpClockAllowsReuse` false | Yes (chat follow-up) |
| Chart quality unusable / export missing | Analyse → `noCallResult` (must not serve prior call) | Yes (`isChartQualityUsable`) |
| Market data unavailable (`loadMarketContext` throws) | warning / no context | Yes |
| Observation / audit `data_quality` missing/stale → cannot decide | pipeline NO_TRADE / uncertainty | Yes (`auditDataQuality`) |
| Market hop not CONNECTED (`canConfidentlyAnalyse` false) | product confidence gate (fresh ticks) | Yes (`connection-state`) — extension/online path; not wired into fingerprint |
| Process restart / **different serverless isolate** | empty `lastPipeline` / empty intel cache / empty LIVE ring | Documented (recording-path, continuous-state) |
| Yahoo 45s TTL alone | **does not** invalidate reuse key; may serve stale bars until overlay/bar identity changes | Yes (`fetchAllTimeframesCached`) |

**Known residual risk (freshness audit):** forming wick / HTF forming OHLC / unseen intra-bar extreme can change structure without a fingerprint MISS if last print never showed the extreme — same as current chat reuse contract, not a new Analyse-only rule.

---

## CURRENT BEHAVIOUR (does Analyse short-circuit today?):

**NO.**

| Step | What happens today |
|------|--------------------|
| Extension Analyse | `POST /api/live-verdict` |
| Route | Always `generateChartAnswer` — **no** fingerprint / `getLastPipelineResult` check |
| Structured full read | `generatePipelineVerdict` → `loadMarketContext` (`fetchAllTimeframesCached` + `buildMarketContext`) → `buildMarketState` → **`runDecisionPipeline` → `runDeskPipeline` every time** |
| Intel reuse | **Not used** on Analyse — that is chat/`buildDeskMarketIntelligence` only |
| `getLastPipelineResult` | **Written** by `runDeskPipeline`; **not read** to skip Analyse |

**Partial reuse only:** Yahoo multi-TF **45s TTL + in-flight coalesce** (and request pin) can avoid a second Yahoo network fetch — still rebuilds context/pipeline.  
**Chat already short-circuits** intel on fingerprint HIT (`tryReuseLiveDeskIntelligence` / `decideLiveMarketReuse`); Analyse does not.

Evidence: `karen-continuous-state-speed-audit.md` (“Gap: Analyse Market does **not** today short-circuit…”); code paths above.

---

## EXPECTED LATENCY ON HIT:

| Class | Number | Status |
|-------|--------|--------|
| Hypothetical Analyse return of last pipeline / envelope (not built) | Near in-process object return | **Speculative** — win size **UNKNOWN** live |
| Chat intel HIT context (proxy for fingerprint check class) | **1–16 ms** warm HIT | Measured (`karen-live-context-reuse.md` Bench A) |
| `tryReuseLiveDeskIntelligence` unit | **0.29–0.55 ms** | Measured |
| Follow-up HIT (Why?) | **6–153 ms** live; **0.8–1.5 ms** unit | Measured |
| Decision envelope stage on chat benches | ~**1–63 ms** | Prior request-type benches — not Analyse short-circuit |

**Do not claim** open-market Analyse HIT wall-clock — **UNAVAILABLE** (feature not wired; market closed for this audit).

---

## EXPECTED LATENCY ON MISS:

| Class | Number | Status |
|-------|--------|--------|
| Post-optimization live Analyse / context MISS | — | **UNAVAILABLE** (CME closed / no new live bench this audit) |
| Historical chat MARKET CONTEXT MISS medians ~28–40s | STALE pre-reuse / pre-HTF-append | **Do not use as current** (`karen-continuous-state-speed-audit.md`) |
| Deterministic pipeline math alone (research/fixture class) | ≪ LLM; often tens of ms class for decision stage | Offline / chat-stage evidence — not live Analyse total |
| Structured Analyse MISS must still pay | Yahoo (or TV snapshot) + `buildMarketContext` / state + full `runDeskPipeline` | Current code path |

On MISS, short-circuit must **not** fire — fall through to today’s `generatePipelineVerdict`.

---

## LIVE FREQUENCY OF SAFE REUSE:

**UNAVAILABLE** for Analyse short-circuit (not implemented; no open-market Analyse HIT/MISS counter this audit).

**Directional (chat reuse, open market 2026-08-14 — not Analyse):**

- Bench A rapid “Give me the read”: **2/5 (40%) HIT** once two reads shared the same 1m; others correctly MISS on `cold` / `price` / `bars`.
- Bench B every read crossed new 1m / 0.25 print: **0/5 HIT** (correct).
- Theoretical max window during RTH: roughly **within the same closed-bar identity** while **\|Δ last print\| &lt; 0.25** and **session unchanged**, **and** same isolate still holds `lastPipeline`.

**Implication:** safe Analyse reuse is **burst / same-minute / same-print** reuse, not “every Analyse for the hour.” Frequency collapses whenever the trader waits for a new 1m or a ≥0.25 print.

---

## MEASUREMENT STILL NEEDED:

**Protocol (run during RTH / CME open; local single Node or known-same isolate):**

1. Confirm process identity (pid / instance id) shared across warm + Analyse.
2. Warm: one successful structured Analyse (or chat intel that shares the same pipeline write path once wired).
3. Within same 1m and &lt;0.25 print move: fire Analyse again; log wall time of **full** `generatePipelineVerdict` today (baseline MISS-or-full path).
4. Separately (probe only): time fingerprint build + `decideLiveMarketReuse` + `getLastPipelineResult` read — **do not ship** until baseline proves win.
5. Force MISS cases: wait for new 1m; nudge print ≥0.25; session boundary — assert no short-circuit.
6. Cross-route: warm via `/api/chat/stream`, Analyse via `/api/live-verdict` — count HIT rate = 0 when isolates differ (prod serverless).
7. Record: hit rate, p50/p95 HIT vs MISS totals, Yahoo age, `barIdentity`, `canConfidentlyAnalyse`.

Until that runs: FREQUENCY = **UNAVAILABLE**, Analyse HIT/MISS latency = **UNAVAILABLE**.

---

## RISKS:

| Risk | Why it matters |
|------|----------------|
| **Isolate mismatch** | In-memory short-circuit only works in the **same Node isolate**. Prod Analyse vs prior chat often miss each other’s RAM (`karen-live-decision-recording-path-audit.md`; continuous-state isolate gap). `karen-analyse-chat-runtime-share-audit.md` **missing** — treat as open dependency. |
| **Fingerprint not stored on `lastPipeline`** | Returning last result without comparing reuse key → stale call. |
| **Analyse ≠ intel path** | Even warm `liveIntelCache` is unused by `generatePipelineVerdict` today. |
| **Degraded / noCall** | Must not recycle a prior LONG/SHORT when chart quality or feeds fail. |
| **Forming-wick / unseen extreme** | Same residual staleness as chat reuse (freshness audit). |
| **False speed claims** | Pipeline ≪ LLM historically; Analyse is already LLM-free — HIT win may be small vs Yahoo+context cost; measure before wiring. |
| **Duplicate engines** | Any short-circuit must return the **same** `runDeskPipeline` artifact — never a second ICT/decision path. |

---

## SINGLE SAFEST NEXT STEP:

**During next RTH, measure same-isolate Analyse double-press (fingerprint HIT window) wall time of full `generatePipelineVerdict` vs a probe-only fingerprint + `getLastPipelineResult` read — and measure chat→Analyse cross-route HIT rate on the deploy target — before implementing any Analyse short-circuit.**

Do not implement until isolate hit rate and MISS baseline justify the gate; prefer completing / citing a runtime-share audit if Analyse and chat do not share one process in prod.

---

## Stop

Audit complete. No code changes, no live invented numbers, no commit / push / deploy.
