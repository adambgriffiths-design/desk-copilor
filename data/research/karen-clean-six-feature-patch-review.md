# KAREN — Clean Six-Feature Patch Review (AUDIT ONLY)

**Date:** 2026-08-15  
**Mode:** REVIEW ONLY — no patch apply; primary WT untouched; no git add / commit / push / deploy  
**Artifacts reviewed:**
- `.tmp/karen-six-feature-clean.patch`
- `.tmp/karen-six-feature-clean/` (detached at `74183b24553757a22fd71d79d0f8954d7c72872f`)
- `data/research/karen-clean-six-feature-patch-build-report.md`
- Cross-check vs primary dirty WT sources and HEAD baseline types  

**Stop:** This file is the only write from this review.

---

## Verdict (executive)

Patch assembly matches the plan’s carve (12 adds + 7 surgical mixed edits; recorder/latency absent; `tsc` PASS). **Not production-ready to apply without acceptance of three risks:** (1) **+4 transitive libs**, two of which inject **real trading-presentation behavior** into DecisionEnvelope; (2) HEAD-compat casts/stubs are type-only for Analyse verdicts but session-liquidity logic **does** change envelope stance/conflict copy; (3) **feature regression coverage is incomplete** — only memory-adapter ran; four harnesses blocked; and `conversational-intent.ts` is **orphaned** in the clean tree (no product importer).

---

## 1. EXTRA TRANSITIVE LIBS

All four are absent from HEAD; all four appear in the patch; none import recorder / latency / `market-data-errors` / `verdict-engine`. Import graph stays inside HEAD-baseline types plus other shipset libs.

### 1.1 `lib/mtf-horizons.ts` (~134 lines)

| Question | Answer |
|----------|--------|
| **Which feature imports it?** | Features **1 / 2 / 5** via `lib/decision-envelope.ts` → `buildDecisionEnvelope` |
| **Which symbol?** | `buildMtfHorizonSummaries` only (helpers `normalizeChartTimeframe` / `resolveHorizonLabels` are internal) |
| **Entire file necessary?** | **Mostly yes** for that one export — file is a single cohesive builder. Unused *exports* beyond the builder are minimal (types + label helpers used only inside). |
| **Unrelated trading/market behavior?** | **Yes, market-presentation.** Builds short/medium/long horizon prose from observation + ctx ranges/PDH. Not a separate detector, but it **feeds envelope horizon summaries** shipped into QG / history. |
| **Imports outside approved graph?** | **No** — `./types`, `./market-state`, `./desk-schema` only (type/value from HEAD baseline). |
| **Replace with smaller stub?** | **Possible but lossy.** A stub returning empty/fixed strings would typecheck and shrink surface, but would **gut** envelope HTF/primary summaries (features 2/5 prompt + history integrity). Prefer keep whole file or inline the single function into `decision-envelope.ts` (same behavior, fewer paths — not meaningfully smaller logic). |

### 1.2 `lib/session-liquidity.ts` (~101 lines)

| Question | Answer |
|----------|--------|
| **Which feature imports it?** | Features **1 / 2 / 5** via `lib/decision-envelope.ts` |
| **Which symbols?** | `shouldBlockLongFromSessionLiquidity`, `sessionLiquidityStayFlatReason` (call chain uses `takenLevels`, `classifyLevelSide`, `bslTaken`/`sslTaken`, `isBslOnlyRaid`, `isLondonAsiaHighRaid`, `isAsiaHighLevel`) |
| **Entire file necessary?** | **Core yes.** Unused *exports* for this shipset: `describeSweptLevel`, `describeSweepFact`, `sweptStatusNote` (and `LiquidityPoolSide` helpers only as types). Could trim those three formatters without breaking compile of envelope. |
| **Unrelated trading/market behavior?** | **Yes — ICT BSL/SSL / London–Asia raid stay-flat policy.** This is **not** incidental plumbing; it changes envelope stance/conflict when highs are swept (`resolveStance` wait→flat path, conflict `session_stay_out`, stay-flat reason text). |
| **Imports outside approved graph?** | **No** — `./desk-schema` only. Note: module’s `LiquidityLevelLike.side?` is richer than HEAD `obs.liquidity.levels` (`label`/`price`/`taken` only); classification falls back to label heuristics — fine at HEAD. |
| **Replace with smaller stub?** | **Technically yes** (`shouldBlock…` → `false`, `sessionLiquidityStayFlatReason` → `null`) for a thinner patch, but that **changes DecisionEnvelope behavior** vs the intended dirty-WT feature libs. **Do not stub** if envelope parity with designed feature-1/2/5 libs is required. |

### 1.3 `lib/conversational-normalize.ts` (~35 lines)

| Question | Answer |
|----------|--------|
| **Which feature imports it?** | Feature **6** via `mentor-intent.ts` and `turn-category.ts`; also `conversational-intent.ts` (see orphan note) |
| **Which symbols?** | `repairConversationalStt` (mentor-intent, turn-category); `normalizeConversationalText` + `repairConversationalStt` (conversational-intent) |
| **Entire file necessary?** | **Yes** — already a minimal contraction/STT repair module; both exports used in the feature-6 graph. |
| **Unrelated trading/market behavior?** | **No** — text normalization only. |
| **Imports outside approved graph?** | **No** — zero imports. |
| **Replace with smaller stub?** | **Not useful** — file is already the stub-sized implementation. Identity stubs would degrade STT/informal classification for wait/routing phrases. |

### 1.4 `lib/turn-category.ts` (~98 lines)

| Question | Answer |
|----------|--------|
| **Which feature imports it?** | Feature **6** via `mentor-intent.ts` (`inferLastTurnCategory`, `assistantLooksLikeMarket`, `lastTurnWasMarketCategory` / `lastTurnWasGeneralCategory`, type `TurnCategory`); also `conversational-intent.ts` |
| **Which symbols?** | As above; `HistoryMsg` type supporting `inferLastTurnCategory` |
| **Entire file necessary?** | **Mostly yes** for sticky-mentor vs general-turn isolation. Heuristic body is the product. |
| **Unrelated trading/market behavior?** | **Routing-only**, but heuristics *detect* market-looking assistant text (verdict markers, FVG/MSS, etc.). Does not compute trades. |
| **Imports outside approved graph?** | **No** — only `@/lib/conversational-normalize`. |
| **Replace with smaller stub?** | **Risky.** Stubbing `inferLastTurnCategory` → `UNKNOWN` / `assistantLooksLikeMarket` → `false` would weaken feature-6 follow-up isolation (stale mentor intent overriding general turns). Keep whole file. |

### Extra-libs summary

| Lib | Keep? | Risk if shipped |
|-----|-------|-----------------|
| `mtf-horizons` | Keep (or inline) | Envelope copy richness |
| `session-liquidity` | Keep (optional trim of unused formatters) | **Envelope stance/conflict policy** |
| `conversational-normalize` | Keep | Low |
| `turn-category` | Keep | Low (routing) |

**Orphan coupling:** In the clean tree, **`conversational-intent.ts` has zero product importers** (dirty WT wires it from `chat-engine`, `app/api/chat/stream/route.ts`, routing helpers — those call sites were **omitted** in surgical mixed edits). Transitive deps of conversational-intent (`normalize` / `turn-category`) remain **justified** because **`mentor-intent.ts` is wired** from clean `chat-engine` (instant-read / `classifyMentorIntent`).

---

## 2. HEAD-COMPAT MICRO-FIXES

Baseline: dirty WT feature libs assume WT `MarketState.snapshotId` and richer liquidity level fields, plus `connection-state` messaging helpers. Clean tree targets **HEAD** without shipping WT `market-state` / `desk-schema` / `connection-state` churn. Diffs below are **dirty WT → clean** (the micro-adaptations). vs HEAD: these files are **new adds** (`decision-envelope`, `conversational-intent`) or surgical edits (`desk-pipeline`); the casts exist so the new code typechecks at HEAD.

### 2.1 `lib/decision-envelope.ts` (vs dirty WT)

```diff
 function snapshotId(state?: MarketState, obs?: ReadonlyMarketObservation): string | undefined {
-  return state?.snapshotId || obs?.state_hash || state?.stateHash;
+  const sid = (state as { snapshotId?: string } | undefined)?.snapshotId;
+  return sid || obs?.state_hash || state?.stateHash;
 }

-function levelByLabel(obs: ReadonlyMarketObservation, label: string) {
-  return obs.liquidity.levels.find((l) => l.label === label || l.id === label.toLowerCase());
+type ObsLiquidityLevel = {
+  label: string;
+  price: number;
+  taken: boolean | "unknown";
+  id?: string;
+  qualifyingTickAt?: number;
+  qualifyingTickPrice?: number;
+  candleId?: string;
+  status?: string;
+};
+
+function levelByLabel(obs: ReadonlyMarketObservation, label: string): ObsLiquidityLevel | undefined {
+  return (obs.liquidity.levels as ObsLiquidityLevel[]).find(
+    (l) => l.label === label || l.id === label.toLowerCase()
+  );
 }
```

| Question | Answer |
|----------|--------|
| **Why needed?** | HEAD `MarketState` has **no** `snapshotId`; HEAD liquidity levels are `{ label, price, taken }` only (no `id` / `qualifyingTickAt` / …). Dirty WT types include those fields. Casts satisfy `tsc` without widening HEAD schemas. |
| **Runtime behavior change?** | **vs dirty WT at runtime with same inputs: negligible.** At HEAD, `snapshotId` cast always yields `undefined` → falls back to `state_hash` / `stateHash` (same effective path). Optional level fields remain undefined on HEAD observations → evidence timestamps stay empty/`missing` as they would without those fields. |
| **Required for six features?** | **Yes for typecheck/ship of envelope** (features 1/2/5). Not a separate product feature. |
| **Could alter Analyse?** | **Does not change `TradingDecision` / verdict-engine.** May only affect envelope evidence metadata strings. **Separate from this micro-fix:** shipping `session-liquidity` *into* envelope **can** alter envelope stance/conflict (presentation / QG), still without changing raw pipeline verdict computation. |

### 2.2 `lib/conversational-intent.ts` (vs dirty WT)

```diff
-import {
-  classifyExtensionMessagingFailure,
-  isExtensionMessagingFailure,
-} from "@/lib/connection-state";
+/** HEAD-compatible stubs — WT connection-state helpers are out of six-feature shipset. */
+function classifyExtensionMessagingFailure(
+  err: unknown
+): "invalidated" | "receiving_end" | null {
+  const msg = err instanceof Error ? err.message : String(err ?? "");
+  if (/Extension context invalidated/i.test(msg)) return "invalidated";
+  if (/Receiving end does not exist/i.test(msg)) return "receiving_end";
+  return null;
+}
+
+function isExtensionMessagingFailure(err: unknown): boolean {
+  return classifyExtensionMessagingFailure(err) != null;
+}
```

(Re-exported via `connectionFailureKind` / `isConnectionFailureNotIntentMiss`.)

| Question | Answer |
|----------|--------|
| **Why needed?** | HEAD `connection-state.ts` **does not export** those helpers (dirty WT does). Avoids pulling WT connection-state churn. |
| **Runtime behavior change?** | Stubs mirror the two common extension error strings. **In clean tree this file is currently unwired** — no Analyse/chat call site imports it — so **shipset runtime impact is none** until call sites are added. |
| **Required for six features?** | Required only to keep plan’s feature-6 lib compiling **as a whole file**. Past-tense wait routing that *is* wired goes through **`mentor-intent` + `extension/casual-chat.js`**, not these stubs. |
| **Could alter Analyse?** | **No.** |

### 2.3 `lib/desk-pipeline.ts` (vs dirty WT; new block vs HEAD)

```diff
-        snapshotId: state.snapshotId ?? null,
+        snapshotId: (state as { snapshotId?: string | null }).snapshotId ?? null,
```

(Inside new LIVE `recordDecisionEnvelopeHistory({… marketState …})` payload.)

| Question | Answer |
|----------|--------|
| **Why needed?** | Same HEAD `MarketState` gap as envelope. Dirty WT can read `state.snapshotId` directly. |
| **Runtime behavior change?** | At HEAD always records `snapshotId: null`; history still keys off stance/verdict/`asOf`/`stateHash`. |
| **Required for six features?** | **Yes** for feature-1 LIVE history recording to typecheck. |
| **Could alter Analyse?** | **No verdict change.** Adds envelope history side effect after Analyse/pipeline (feature 1). Cast itself does not change decisions. |

---

## 3. TEST COVERAGE GAP

Build report: `test-decision-memory-adapter` **PASS**; four harnesses **SKIP/FAIL** under exclusion rules. Classification **A** = harness-only dependency on excluded / non-shipped modules; **B** = product path under test is missing or unreachable in the clean shipset.

### 3.1 `scripts/test-quality-gate-envelope-dedupe.ts` (feature 2)

| | |
|--|--|
| **A vs B** | **Mostly A**, with a harness API gap tied to intentional omit. |
| **Excluded / missing deps** | (1) `lib/research/replay/historical-ui` — used only in section 7 historical fixture path; (2) `resetQualityGateCache` — harness imports it from `analysis-quality-gate`, but clean surgical QG **omitted** latency/`lastGateCache` / `resetQualityGateCache`. |
| **Product under test** | `formatCanonicalEnvelopeForPrompt` + `evaluateAnalysisQualityGate` / `formatQualityGateForPrompt` envelope append — **present** in clean libs. Replay-fixture sections 1–6 can run without `historical-ui` if cache reset is no-op’d. |
| **Minimum production dependency to run** | Clean `analysis-quality-gate` + `decision-contract-output` + `decision-envelope` + desk pipeline/fixtures. **Plus either:** a local no-op `resetQualityGateCache` in the harness **or** a tiny export on QG; **and** skip/stub section 7 **or** add `historical-ui` (excluded from shipset — prefer harness rewrite). |

### 3.2 `scripts/test-karen-instant-read-llm-skip.ts` (feature 3)

| | |
|--|--|
| **A vs B** | **A** (measurement tail only). |
| **Excluded dep** | `lib/live-latency-profile` (`beginLiveLatency` / `clearLiveLatency` / `snapshotLiveLatency`) — used for fixture timing JSON at end, not for asserting skip correctness. |
| **Product under test** | `isInstantReadLlmSkipEnabled`, `tryInstantReadFromQualityGate`, mentor `CURRENT_MARKET_READ` gating — **present** in clean `chat-engine` / `mentor-intent`. |
| **Minimum production dependency to run** | Clean chat-engine + QG + decision-contract-output + mentor-intent + fixtures. **Drop or stub** latency imports for the timing block. |

### 3.3 `scripts/test-decision-history-time-travel.ts` (features 4 / 5)

| | |
|--|--|
| **A vs B** | **A** for fixture session helpers; product libs themselves do **not** import `historical-ui`. |
| **Excluded dep** | `lib/research/replay/historical-ui` (`buildHistoricalFixtureIntelligence`, `clearHistoricalFixtureSession`) — used to build/clear historical intel sessions in multiple cases. Also uses HEAD-present replay cutoff/fixtures + clean `decision-time-travel` / history / `cmeSessionDateKeyFromDate`. |
| **Product under test** | `decision-time-travel`, `decision-history-query`, `decision-envelope-history`, desk-pipeline `replaceLastPipelineResult` — **present** in patch. |
| **Minimum production dependency to run** | Those product libs + replay cutoff/fixtures + market-data session key helpers. **Harness needs** either a slim fixture-intel helper in-test (build intel from `runDeskPipeline` like QG dedupe’s `intelFromFixture`) **or** shipping `historical-ui` (not in six-feature approve set). |

### 3.4 `scripts/test-karen-wait-followup.ts` (feature 6 + structured wait UX)

| | |
|--|--|
| **A vs B** | **Mixed — A and B.** |
| **A (harness-only)** | `lib/mentor-coaching` (`answerMentorCoaching`); `lib/live-latency-profile` (timing around explain-last). Neither is in the clean patch; product feature-6 wait **routing** does not require them. |
| **B (product untestable / not in shipset)** | Harness also imports `needsStructuredWaitFollowUp` / `tryDeterministicMentorFollowUp` from `chat-engine`. **Those exports exist on dirty WT but were not surgically included in clean `chat-engine.ts`.** `formatStructuredWaitFollowUp` exists in clean `decision-contract-output`, but the **chat-engine wiring** that would call it on wait follow-ups is absent. Separately, clean tree does not import `conversational-intent` anywhere — past-tense coverage in-process is mainly `mentor-intent` regexes + extension `casual-chat.js`. |
| **Minimum production dependency to run (full harness as written)** | Would need mentor-coaching + live-latency **and** the dirty WT chat-engine wait-followup helpers — i.e. **beyond** current clean shipset. |
| **Minimum to cover feature 6 as shipped** | Direct unit tests on `mentor-intent` (`isPriorReadFollowUpPhrase` / `isWaitExplanation` with `were you waiting`) + casual-chat regex; optional formatter tests on `formatStructuredWaitFollowUp` **without** chat-engine/coaching. |

---

## 4. FINAL RISK

### EXTRA LIBS — **ACCEPT WITH EYES OPEN**

- Compile-required and feature-pure (no forbidden imports).  
- **`session-liquidity` + `mtf-horizons` are not inert glue** — they shape DecisionEnvelope (stance/conflict/horizon text) used by QG, history, and spoken/contract formatters.  
- `conversational-normalize` / `turn-category` are appropriate for feature 6 via `mentor-intent`.

### HEAD-COMPAT FIXES — **LOW RISK / REQUIRED FOR HEAD tsc**

- Casts/stubs are appropriate; Analyse **verdict** path unchanged by the casts.  
- Do not confuse casts with session-liquidity **policy** inside envelope (that is behavioral, from the transitive lib, not from the cast).

### FEATURE REGRESSION COVERAGE — **INCOMPLETE / NOT GREEN**

| Feature | Clean coverage status |
|---------|----------------------|
| 1 Redis / memory | **PASS** (adapter suite) |
| 2 QG envelope dedupe | **Untested** in clean tree (harness A) |
| 3 Instant LLM skip | **Untested** (harness A — easily restorable) |
| 4 Session-boundary / LIVE history | **Untested** (harness A) |
| 5 Historical whyNow / time-travel | **Untested** (harness A) |
| 6 Past-tense wait routing | **Untested**; product surface **partial** (mentor-intent + casual-chat yes; conversational-intent **orphaned**; structured wait chat-engine helpers **not carved**) |

### PRODUCTION READY TO APPLY PATCH — **NO (conditional hold)**

**Do not apply to primary WT yet** unless explicitly accepting:

1. Shipping **session-liquidity / mtf-horizons** behavior into envelopes without the four feature harnesses green.  
2. Feature 6 delivering **mentor-intent + casual were-form only**, with `conversational-intent.ts` present but **unwired**, and without dirty WT `tryDeterministicMentorFollowUp` path.  
3. Post-apply follow-up to rewrite harnesses (A) and/or add missing surgical call sites (B) before calling the six features “verified.”

**Safer gate before apply:** (optional) trim unused `session-liquidity` formatters; rewrite/skip blocked harness sections so features 2–5 have at least one green focused run in the clean tree; decide whether to wire or drop orphaned `conversational-intent` from the patch.

---

## Confirmation

- Primary worktree product sources: **not modified** by this review.  
- Patch / clean tree: **not applied / not altered**.  
- Only new artifact: `data/research/karen-clean-six-feature-patch-review.md`.  
- **STOP.**
