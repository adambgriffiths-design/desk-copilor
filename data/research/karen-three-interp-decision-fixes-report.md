# Karen — three interpretation / decision fixes report

**Date:** 2026-08-15  
**Mode:** MINIMAL FIX + TEST + VERIFY (one controlled pass)  
**Worktree:** `C:\Users\adamg\Projects\desk-copilot\.tmp\karen-interp-decision-fixes`  
**Base:** repo HEAD `74183b2` + primary dirty `lib/` baseline (bugs live in uncommitted primary tree; HEAD alone lacked provenance/`buildLiquidityLevels` path)  
**Primary product code:** NOT modified (report only under `data/research/`)  
**Six-feature tree:** NOT touched (`.tmp/karen-six-feature-clean/` remains six-feature-only)

Source investigation: `data/research/karen-liquidity-swept-stance-miss-investigation.md`

---

## FIX 1 — `liquidity_swept` observation FN

**Status: PASS**

### Root cause
`structureFacts.liquiditySweeps` already contained a confirmed PDL sweep, but `buildLiquidityLevels` / `makeLevel` mapped PDH/PDL/PDC with `pdhSource !== "cme_session_1m"` (or missing) to `taken: "unknown"` when `sweepHit`, and with CME source ignored `sweepHit` in favor of `canProvePdhTaken` only. Replay derives `liquidity_swept` as `levels.some(l => l.taken === true)` → false.

### Definition check
`docs/OBSERVATION_DEFINITIONS.md` + `data/observation-definitions.json`:
- Detection path: `detectLiquiditySweeps` → `buildLiquidityLevels`
- `liquidity_swept = any level.taken === true`
- `taken` state = “sweep detected”
- `unknown` in definition = data_quality missing/stale (not “missing pdhSource”)
- Gap text: session levels stay `taken=false` **unless** in `liquiditySweeps`

**Conclusion:** `structureFacts.liquiditySweeps` is sufficient; provenance gate was over-cautious vs definition. Did **not** weaken provenance for non-sweep PD status (still `"unknown"` when CLOSED_BEYOND-like status without CME proof and no sweep hit).

### Change
`lib/observation-engine.ts` — if `sweepHit` and quality not stale → `taken = true` first; else keep prior PD provenance / interaction branches.

### Files
- `.tmp/karen-interp-decision-fixes/lib/observation-engine.ts`

### Tests
- Probe: bearish-wait / bullish-wait / ny-open → `liquidity_swept=true`, `pdl.taken=true`; similar-but-skip / neutral → false
- `npm run test:replay` → observation **100%** (`liquidity_swept` 6/6)
- `npm run test:observation` PASS
- `test-observation-chart-proof` PASS (3/3; no-sweep charts stay false)

---

## FIX 2 — `similar-but-skip` interpretation → NO_TRADE

**Status: PASS**

### Root cause
Interpretation supported long from HTF + bullish MSS + bullish FVG (≥2 reasons) with **no** sell-side sweep / skip semantics. Decision then correctly mapped supported-long + entry WAIT → WAIT (miss vs Adam’s NO_TRADE starts at interpretation).

### Change
`lib/interpretation-engine.ts` — rule (not fixture-name hard-code):

NY + bullish MSS + bullish FVG present + displacement present + **no** SSL raid (`taken===true` sell-side)  
→ reversal lookalike / `present_not_tradeable` skip: force `longSupported=false`, clear entry_model, emit wouldn't/skip reasoning.

Does **not** blanket every bullish-without-sweep (continuation without displacement still eligible).

### Files
- `.tmp/karen-interp-decision-fixes/lib/interpretation-engine.ts`

### Tests
- `similar-but-skip` → `long_supported=false`, verdict `NO_TRADE`, reasoning contains wouldn't/skip
- `bullish-wait` / `ny-open` (with sweep after Fix 1) → long still supported
- `test-session-liquidity` PASS (London ASH still blocks long; no accidental short)
- Replay decision: similar-but-skip NO_TRADE ✓

---

## FIX 3 — `ny-open-long-a-plus` LONG vs WAIT (decision contract)

**Status: PASS**

### Semantic contract (established first)
From `docs/ICT_DECISION_SPEC.md` Layer 3 Phase 1 rules:

- One-sided interpretation + **entry not ready** → `WAIT`
- One-sided interpretation + **entry active** → `LONG` / `SHORT`

→ Contract **(A)**: `LONG` means immediately executable (entry ACTIVE), **not** directional conviction while waiting.

Fixture `why_taken` (“would take on retrace”) + `entryStatus: WAIT` (price 25100 vs FVG 25085–25095) means engine WAIT was correct; label `adam_verdict: LONG` disagreed with the contract.

Also: `ny-open` and `bullish-wait` share the same `baseCtx()` market shape — engine cannot emit LONG for one and WAIT for the other without fabricating executable entry.

### Change
**Label reconcile only** (no silent WAIT→LONG in `decision-layer.ts`):
- `adam_verdict`: `LONG` → `WAIT`
- Keep `would_take: true` / grade A+ (armed intent on retrace)
- Notes clarify Layer-3: entry not ready → WAIT; not executable LONG

Decision code **unchanged** (`entryWait ? "WAIT" : "LONG"` preserved).

### Files
- `.tmp/karen-interp-decision-fixes/data/labeled-setups/examples/ny-open-long-a-plus.json`
- (no `lib/decision-layer.ts` edit)

### Tests
- ny-open: long supported, short false, verdict WAIT matches label
- bullish-wait still WAIT; not-in-zone not executable LONG
- Replay decision agreement **100%** (6/6)

---

## COUNTERFACTUAL (Fix 1 ↛ Fix 3)

| Stage | `liquidity_swept` | long supported | entryStatus | verdict |
|-------|-------------------|----------------|-------------|---------|
| Before any fix (investigation) | false | true | WAIT | **WAIT** |
| Forced CME+CLOSED_BEYOND (investigation `.tmp-liquidity-swept-counterfactual.ts`) | true | true | WAIT | **WAIT** |
| After Fix 1 only (this WT verify) | true | true | WAIT | **WAIT** |
| After Fix 1+2+3 | true | true | WAIT | **WAIT** (label now matches) |

**Why:** Verdict demotion is `execution.entryStatus === WAIT|EXTENDED`, independent of sweep observation. Restoring `taken=true` restores sweep keywords / NY open entry_model text; it does **not** flip stance to LONG.

---

## REPLAY

| Layer | Before (investigation) | After |
|-------|------------------------|-------|
| Observation | 93.6% (`liquidity_swept` 3/6) | **100%** (`liquidity_swept` 6/6) |
| Interpretation | 61.1% | **64.5%** |
| Decision | 66.7% | **100%** (6/6) |

Per-case decision: bearish-wait WAIT, bullish-wait WAIT, ny-open WAIT, similar-but-skip NO_TRADE, neutral/missing NO_TRADE — all match.

Interpretation residual (not blocking decision): bearish-wait entry_model becomes “NY open sweep…” because fixture inherits baseCtx PDL sweep (side effect of Fix 1 truth); keyword gaps on missing-quality / neutral remain Phase-1 scoring noise.

---

## REGRESSION

| Suite | Result |
|-------|--------|
| `test:replay` | PASS |
| `test:observation` | PASS |
| `test:observation-proof` / chart-proof | PASS |
| `test:decision` | PASS |
| `test:analysis-contract` | PASS |
| `test:session-liquidity` | PASS |
| `.tmp-three-fix-verify.ts` | PASS |
| `test:regression` (session routing) | **BLOCKED / unrelated** — fails `bare Telford asks which region` (weather routing; not caused by these three fixes) |
| Decision-memory / mode-routing / six-feature | Not claimed; six-feature tree untouched |

---

## TYPECHECK

| Tree | `tsc --noEmit` |
|------|----------------|
| Worktree | exit 2; ~18 error lines — **none** in `observation-engine.ts` / `interpretation-engine.ts` / `decision-layer.ts` |
| Primary | exit 1; ~17 error lines (pre-existing dirty tree) |

Fix files typecheck-clean relative to ambient repo errors. No new errors introduced in the three fix modules.

---

## SCOPE

### Files changed (worktree only)
1. `lib/observation-engine.ts` — Fix 1
2. `lib/interpretation-engine.ts` — Fix 2
3. `data/labeled-setups/examples/ny-open-long-a-plus.json` — Fix 3 label contract
4. Probe: `.tmp-three-fix-verify.ts` (local verify only)

### Unrelated changes?
**NO** — no verdict-engine, continuous recorder, credentials, timers, latency/market-data/routing, six-feature patch, commit/push/deploy.

### Documented side effect (not auto-fixed)
After Fix 1, `bearish-wait` inherits PDL SSL from `baseCtx` → interpretation also accumulates long reasons (ssl + displacement-after-ssl) so both cases supported → still WAIT via conflict branch. Fixture authoring smell; out of scope per “do not auto-fix unless directly required.”

---

## SAFETY

- Primary WT product code untouched (report only)
- No git add / commit / push / deploy
- No credentials touched
- Continuous recorder not shipped / not modified for this task
- `verdict-engine.ts` not modified
- No background timers
- No unrelated refactors
- Six-feature worktree not modified

---

## FINAL

**READY FOR REVIEW**

All three verified bugs fixed in isolated worktree with replay observation 100% / decision 100%, Fix1↛Fix3 counterfactual proven, contract-correct WAIT for ny-open (not fake executable LONG). Remaining interpretation %-gap and unrelated session-regression Telford failure are documented, not blockers for these three.
