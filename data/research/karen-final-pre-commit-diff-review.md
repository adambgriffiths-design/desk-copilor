# KAREN — Final Pre-Commit Diff Review

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no product edits beyond this report; no git add / commit / push / deploy  
**Branch:** `cursor/extension-v1.4.62-fixes`  
**HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Sources of truth:** `karen-clean-six-feature-shipset.md`, `karen-pre-commit-shipset-audit.md`  
**Dirty tree:** 646 paths (123 modified, 523 untracked)  
**Deleted tracked files:** none  
**Renames:** none (`git status` / `git diff --name-status -M` show no `D` / `R`)

**Approved features only:** (1) Redis decision memory (2) QG envelope dedupe (3) CURRENT_MARKET_READ instant LLM skip (4) LIVE session-boundary (5) Historical verdict + whyNow (6) Past-tense wait routing  
**Excluded by task:** continuous recorder entirely (`continuous-decision-recorder.ts`, `decision-memory-material.ts`, recorder tests/docs, WT `verdict-engine.ts`, recorder-only `package.json` scripts)

---

## FINAL COMMIT FILES:

Whole-file include (feature-pure **new** libs — safe to `git add` as entire files):

| path | feature(s) | status vs HEAD |
|------|------------|----------------|
| `lib/decision-memory-backend.ts` | 1 | untracked new |
| `lib/decision-envelope-history.ts` | 1 | untracked new |
| `lib/decision-envelope.ts` | 1, 2, 5 | untracked new |
| `lib/decision-contract-output.ts` | 2 (+3, 5) | untracked new |
| `lib/decision-time-travel.ts` | 4, 5 | untracked new |
| `lib/decision-history-query.ts` | 4, 5 | untracked new |
| `lib/mentor-intent.ts` | 6 | untracked new |
| `lib/conversational-intent.ts` | 6 | untracked new |

**Ideal wire-up patch (not whole-file):** only the feature hunks listed under MIXED below. Do **not** whole-file stage any mixed path.

Import-graph check on the 8 new libs + intended wire-up markers: no `continuous-decision-recorder` / `decision-memory-material` / `withManualAnalysePriority` in the approved ship paths.

---

## MIXED FILES REQUIRING HUNK-LEVEL STAGING:

### `lib/desk-pipeline.ts` — **mostly carveable** (4 hunks, +52/−1)

| Include? | Approx WT lines / diff hunk | Description |
|----------|-----------------------------|-------------|
| YES (1) | wt ~L17–20 (`@@ -16,0 +17,4`) | import `isDecisionHistoryRecordSuppressed`, `recordDecisionEnvelopeHistory` |
| YES (4/5 dep) | wt ~L30–38 (`@@ -25,0 +30,9`) | `replaceLastPipelineResult` — required by `decision-time-travel.ts` |
| YES (1,2) | wt ~L218 (`@@ -205 +218`) | `buildAnalysisContract(result, ctx, state)` signature call |
| YES (1) | wt ~L224–261 (`@@ -210,0 +224,38`) | LIVE `recordDecisionEnvelopeHistory({…})` block |

No recorder coupling. Closest to a clean mixed file; still requires hunk staging if any future churn lands here.

### `lib/analysis-contract.ts` — **entangled** (26 hunks, +238/−39)

| Include? | Approx WT lines | Description |
|----------|-----------------|-------------|
| YES (1,2) | ~L14–27 imports; ~L55–59 `decision?: DecisionEnvelope`; ~L356+ signature `(result, ctx?, state?)`; ~L397 `buildDecisionEnvelope`; ~L425 `decision: decisionEnvelope`; validate `validateDecisionEnvelope` | Envelope model wiring for QG + history record |
| NO | majority of other hunks (liquidity/structure/FVG why rewrites, `buildRejectedAlternative` expansion, `formatAnalysisContract` prompt churn, etc.) | Unrelated contract/prompt surface |

**Entanglement:** decision-envelope inserts sit inside the same rewritten `buildAnalysisContract` / why-builder regions as large non-ship contract text changes. Cannot isolate with whole hunks alone without editing the patch.

### `lib/analysis-quality-gate.ts` — **entangled** (14 hunks, +65/−8)

| Include? | Approx WT lines / hunk | Description |
|----------|------------------------|-------------|
| YES (2) | import `formatCanonicalEnvelopeForPrompt`; type `decisionEnvelope?` / `envelopeText?`; return `envelopeText: formatCanonicalEnvelopeForPrompt(...)`; `formatQualityGateForPrompt` append of DECISION ENVELOPE | QG envelope dedupe |
| NO | same import hunk pulls `live-latency-profile` + `market-data-errors`; `lastGateCache` / `resetQualityGateCache` / `bumpLiveLatency` (~L38–71, L131); `marketDataFailureQualityGate` (~L49–60); large prompt-instruction rewrite hunks (~L141–161) | Latency cache + timeout helper + unrelated prompt tone — **not** features 1–6 |

**Entanglement:** feature-2 `envelopeText` assignment shares the evaluate-return / cache-write hunk with latency reuse; import block is one contiguous hunk mixing ship + exclude. Shipping wholesale also pulls transitive need for untracked `lib/live-latency-profile.ts` + `lib/market-data-errors.ts` (pre-commit audit: collateral NO).

### `lib/chat-engine.ts` — **heavily entangled** (46 hunks, +712/−67)

| Include? | Approx WT lines | Description |
|----------|-----------------|-------------|
| YES (1) | L59 import + ~L526 `await flushDecisionMemoryWrites()` | Redis flush after QG build |
| YES (3) | ~L190–350 contiguous: `isInstantReadLlmSkipEnabled`, `tryInstantReadFromQualityGate`, `tryCurrentMarketReadFastPath`; call sites ~L1021 / ~L1103 | Instant LLM skip |
| PARTIAL (3) | imports from `decision-contract-output` (`formatMentorTradeSpoken`, etc.) | Needed by instant-read formatters — but same import cluster mixes `market-data-errors` |
| NO | intelligence cache reuse, market-data timeout/`MarketDataError`, `marketDataFailureQualityGate`, live-latency marks, voice/persona, casual/mentor routing churn, historical fixture fields, etc. | Unrelated WT |

**Entanglement:** `flushDecisionMemoryWrites` is **inside** the rewritten `buildChatSystemPrompt` market-intel / 25s timeout / failure-gate block — not a standalone hunk. Instant-read call sites share `generateChatReply` / `streamChatReply` hunks with unrelated streaming/latency/diagnostics edits. Requires interactive patch **and** manual split of mixed hunks.

### `app/api/chat/stream/route.ts` — **heavily entangled** (35 hunks, +487/−44)

| Include? | Approx WT lines | Description |
|----------|-----------------|-------------|
| YES (1,4,5) | imports L64–66; block ~L322–325 `isDecisionHistoryTimeQuery` → `hydrateDecisionMemoryFromStore({ lane: "LIVE" })` → `answerLiveDecisionHistoryQuery` | LIVE hydrate + time-travel |
| YES (3) | import `tryCurrentMarketReadFastPath`; call ~L496 | Instant read fast path |
| NO | same regions wrap returns with `markLiveLatencyStage` / `noteLiveLatency` / `liveLatencyTimingsPayload` / `emitLiveLatencyTraceIfEnabled`; import hunk also adds historical-ui, mentor follow-up, SSE header refactor, casual/diag routing overhaul | Latency instrumentation + unrelated stream rewrite |

**Entanglement:** approved call sites are not isolated hunks — they are embedded in large POST-handler rewrites that also change casual streaming, historical fixture handling, and latency tracing. Carve needs interactive staging + de-entangle edits (strip latency wrappers or accept them as accidental collateral).

### `lib/market-data.ts` — **partially carveable, mostly unrelated** (22 hunks, +260/−25)

| Include? | Approx WT lines / hunk | Description |
|----------|------------------------|-------------|
| YES (4) | ~L402–416 inside `@@ -222,0 +402,53` after `getEstDateKey`: `cmeSessionDateKey`, `cmeSessionDateKeyFromDate` | Required export for `decision-time-travel.lookupLiveAtClock` |
| NO (same hunk) | ~L418+ `priorCmeSessionKey`, `barsInCmeSession`, `aggregateSessionBar`, `sessionCloseBar` | Session-bar helpers for PD-level work — not required by feature-4 import (`cmeSessionDateKeyFromDate` only among new CME exports) |
| NO | Yahoo timeout/test hooks, cache scope/TTL, `resolvePdLevelAnchorTimes` CME rewrite (~L655+) | Unrelated market-data / PD churn |

**Entanglement:** the only required exports share one 53-line insert hunk with non-ship session aggregation helpers. Interactive `add -p` can accept/reject **by line** only with manual editing; default hunk accept would over-ship.

### `extension/casual-chat.js` — **entangled** (21 hunks, +189/−15)

| Include? | Approx WT lines | Description |
|----------|-----------------|-------------|
| YES (6) | ~L60–61 `MARKET_ANAPHORA` includes `(?:are\|were) you waiting for` | Client past-tense wait anaphora |
| NO | ~L58–133 large insert: `BARE_ANAPHORA`, follow-up helpers, exports; plus many other casual-chat routing/UI hunks | Broader casual-chat expansion beyond feature 6 |

**Entanglement:** the `(?:are|were)` token lives inside a newly added multi-regex / helper block, not a one-line edit against HEAD. Server `lib/mentor-intent.ts` / `lib/conversational-intent.ts` remain the authoritative API routing fix; client carve is optional but not clean.

---

## EXCLUDED FILES:

### Continuous recorder (must stay out)

| path | reason |
|------|--------|
| `lib/continuous-decision-recorder.ts` | continuous recorder (untracked) |
| `lib/decision-memory-material.ts` | recorder material-change gate (untracked) |
| `scripts/test-continuous-decision-memory.ts` | recorder test harness (untracked) |
| `.tmp-continuous-recorder-adversarial-probe.ts` | recorder probe |
| `lib/verdict-engine.ts` | WT imports `withManualAnalysePriority` from recorder; mixed non-ship churn — **exclude entirely** |
| `package.json` → `test:continuous-decision-memory` | recorder-only script (file also mixes version + many unrelated scripts — **omit whole `package.json`**) |
| `data/research/karen-continuous-*` | recorder docs/audits |

### Shipset collateral / tests / probes (not production ship for this carve)

`lib/live-latency-profile.ts`, `lib/market-data-errors.ts`, feature test scripts (`test-decision-memory-adapter`, `test-quality-gate-envelope-dedupe`, `test-karen-instant-read-llm-skip`, `test-decision-history-time-travel`, `test-karen-wait-followup`), `.tmp-measure-qg-dedupe.ts`, `.tmp-session-boundary-audit-probe.ts`, `.tmp-waiting-routing-check.ts`, `.tmp-why-not-integrity-probe.*`, `data/routing-golden.csv`, `extension/mentor-intent.js` (lacks past-tense `were`; not feature-6 SoT)

### Everything else in the dirty tree (~640 other paths)

Examples: `DEPLOY.md`, `STABILIZATION_CHECKLIST.md`, other `app/api/**`, extension surfaces beyond the casual-chat were-fix, unrelated `lib/**`, `data/research/**` (including this report), `data/supervisor/**`, `reports/**`, `.cursor/**`, `tmp*` / `.tmp*`, package-lock, tsbuildinfo. No `.env` / credential files observed in dirty tree.

---

## Entanglement verdict (why SAFE TO STAGE fails)

Even with interactive `git add -p`, these hunks **cannot be accepted as-is without further patch editing**:

1. **`lib/chat-engine.ts`** — feature-1 flush nested inside unrelated timeout/QG/latency rewrite hunk.  
2. **`lib/analysis-quality-gate.ts`** — feature-2 envelope fields/return share hunks with cache + latency + `marketDataFailureQualityGate`; imports inseparable without edit.  
3. **`app/api/chat/stream/route.ts`** — feature 1/3/4/5 call sites embedded in latency + historical/casual stream overhaul hunks.  
4. **`lib/analysis-contract.ts`** — envelope wiring interleaved with large why/format rewrites (26 hunks).  
5. **`lib/market-data.ts`** — required `cmeSessionDateKey*` exports share one insert with non-ship session helpers.  
6. **`extension/casual-chat.js`** — `(?:are|were)` lives inside a large new anaphora helper insert.

`lib/desk-pipeline.ts` alone is close to clean, but features 1–6 do **not** ship without the entangled wire-ups above.

**Exact patch that SHOULD be committed (logical):** 8 new libs + carved wire-up hunks listed as YES above + only `cmeSessionDateKey` / `cmeSessionDateKeyFromDate` from `market-data.ts` + optional one-line-equivalent casual-chat were-fix — **after** de-entangling mixed hunks (manual patch / split commits). As the worktree stands, that exact patch is **not** mechanically stageable.

---

FINAL COMMIT FILES:
- Whole-file: `lib/decision-memory-backend.ts`, `lib/decision-envelope-history.ts`, `lib/decision-envelope.ts`, `lib/decision-contract-output.ts`, `lib/decision-time-travel.ts`, `lib/decision-history-query.ts`, `lib/mentor-intent.ts`, `lib/conversational-intent.ts`
- Plus ONLY carved YES hunks from mixed files listed above (not whole-file)

MIXED FILES REQUIRING HUNK-LEVEL STAGING:
- `lib/desk-pipeline.ts` (carveable; all current hunks are feature 1 + 4/5 dep)
- `lib/analysis-contract.ts` (entangled — envelope vs why/format churn)
- `lib/analysis-quality-gate.ts` (entangled — dedupe vs latency/cache/timeout)
- `lib/chat-engine.ts` (entangled — flush/instant-skip vs timeout/routing/latency)
- `app/api/chat/stream/route.ts` (entangled — hydrate/time-travel/fast-path vs latency/stream rewrite)
- `lib/market-data.ts` (entangled — CME key exports vs session-bar/timeout/PD)
- `extension/casual-chat.js` (entangled — were-anaphora vs large casual expansion)

EXCLUDED FILES:
- Recorder: `lib/continuous-decision-recorder.ts`, `lib/decision-memory-material.ts`, `scripts/test-continuous-decision-memory.ts`, `.tmp-continuous-recorder-adversarial-probe.ts`, `lib/verdict-engine.ts`, `package.json` (`test:continuous-decision-memory` + wholesale file), `data/research/karen-continuous-*`
- Plus all non-ship dirty paths / probes / research / supervisor / reports / .cursor / tmp (see body)

UNRELATED CHANGES DETECTED: YES

RECORDER CHANGES DETECTED: YES

ACCIDENTAL DELETIONS: NO

ACCIDENTAL RENAMES: NO

FINAL DIFF SAFE TO STAGE: FAIL

Reason: mixed wire-up files for features 1–6 have feature hunks entangled with unrelated latency, timeout, contract-prompt, stream-routing, and market-data churn; clean carve requires interactive patch tooling **plus** manual hunk splitting. Do not stage / commit from this worktree as-is.

---

## STOP

Audit complete. No staging, commit, push, or deploy. No product source changes beyond this report.
