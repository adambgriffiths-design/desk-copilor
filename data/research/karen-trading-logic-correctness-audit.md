# KAREN — Trading Logic Correctness Audit

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Scope:** Concept computation + evidence weighing — **not** profitability  
**Prior scaffold:** [`karen-decision-validation-v0.md`](./karen-decision-validation-v0.md)  
**Conversational layer:** frozen (bugfix only if showstopper; none hit)

---

## Verdict

**READY FOR DECISION VALIDATION EXPANSION: CONDITIONAL**

Core ICT concepts that Decision Validation will score (PDH/PDL/PDC, FVG, MSS, session windows, premium/discount, quality gate → LONG/SHORT/WAIT/NO_TRADE) are **implemented and mostly computed from sliced OHLC**. One **critical sweep over-report bug was fixed** in this pass. Remaining CONDITIONAL blockers are documented below — expand DV with them as known confounders, not silent truth.

---

## IMPLEMENTED CONCEPTS

| Concept | Status | Owner | Notes |
|---------|--------|-------|-------|
| **PDH / PDL / PDC** | **accurate** | `levels.ts` → `sliceDailyForAsOf` + `pd-arrays.ts` `computeHtfPdArrays` | Previous **completed** EST calendar day from Yahoo daily (`getEstDateKey(b) < asOfKey`). Light path: `light-pd-level.ts` same rule. |
| **PDO / CDO / day EQ** | **accurate** | `pd-arrays.ts` | Equilibrium = mid of high/low. |
| **Current day H/L** | **accurate (LIVE partial)** | `levels.ts` | Built from today's m1 via `sessionHighLow` — correctly forming/partial, not a closed daily. |
| **NDOG** | **accurate** | `pd-arrays.ts` | Prior close → day open gap when ≥ 0.25 pts. |
| **NWOG** | **accurate** | `market-data.ts` `computeNwog` | CME week open (Sun 18:00 ET) vs Fri close. |
| **ORG** | **accurate** | `levels.ts` `computeOrg` | Prior 4:15 PM → today 9:30 open; CE / 25 / 75. |
| **Session H/L** (Asia/London/NY pre/RTH/PM) | **accurate** | `levels.ts` `recentSessionBars` | EST windows; Asia = prior calendar 18:00–24:00 + today 00:00–01:00. Empty window falls back to **today m1 HL** (can invent session levels — see risks). |
| **Kill zone / AMD / macros** | **accurate (clock)** | `sessions.ts` `resolveSessionContext` | Pure EST clock → session id, killZone bool, AMD phase, macro labels. Not OHLC-derived. |
| **Overnight** | **named** | `sessions.ts` | Residual bucket when not in named windows; no separate overnight HL concept beyond Asia span. |
| **FVG (1m / 5m / 15m)** | **accurate** | `gap-zones.ts` | 3-candle, ≥3 pts, 50% fill rule, inverted IFVG. Observation maps latest unfilled. |
| **First-presented FVG** | **accurate** | `gap-zones.ts` | NY open / session-open windows; NY middle bar must not be 9:30. |
| **Daily FVG** | **accurate** | `pd-arrays.ts` | On completed daily series; unfilled filter. |
| **MSS** | **accurate** | `structure.ts` `detectMss` | 5-bar swing, body close through prior swing; lookback 80 / scan last 12. |
| **Displacement** | **buggy (incomplete)** | `observation-engine.ts` | Body > 1.5× avg in last 5 of 12 — **no direction stored**; weigher credits both sides. |
| **Liquidity sweep** | **accurate (fixed)** | `structure.ts` `detectLiquiditySweeps` | Was over-reporting (any price above PDL = “buy_side”). Now: rejection or close-through from other side; high pools → BSL only, low pools → SSL only. |
| **REH / REL** | **accurate but dual** | `reh-rel.ts` (observation) vs `structure.ts` `detectRelativeEqualPools` | Observation uses clustering path only; structure pools not wired into `reh_rel`. |
| **Premium / discount** | **accurate** | `pd-arrays.ts` `computePremiumDiscount` | ±10% of range mid vs current/prev day; NWOG/NDOG inside/premium/discount. |
| **Order block** | **stub** | `observation-engine.ts` `inferOrderBlock` | Heuristic: MSS → relevant; FVG only → unclear. **No OB geometry.** |
| **fvg_validity / wick entry / pending states** | **stub / SPEC_NOT_BUILT** | docs only | Labeled in fixtures; not in observation engine. |
| **11:30→10:00 high/low (time hypotheses)** | **not implemented** | — | No modular time-hypothesis layer yet (see hook design). |

### PDH day-boundary detail

- Keys: **`getEstDateKey`** (America/New_York `YYYY-MM-DD`), **not** `cmeSessionDateKey` (rolls at 18:00 ET).
- Implication: after 18:00 ET Globex “new session,” PDH still means **previous EST calendar daily bar**, while CME session date has already rolled. Documented divergence — futures ICT often wants Globex session day; Karen’s PD arrays follow **Yahoo EST daily + EST keys**.
- `priorEstDateKey(m1, today)` correctly skips empty weekend keys for ORG/m1 anchors.
- Asia “yesterday” uses `asOf.setDate(-1)` then EST key — calendar yesterday, not `priorEstDateKey` (usually OK Mon→Sun for Asia open).

---

## EVIDENCE WEIGHER MAP

```
bars (≤ asOf) → buildMarketContextAt
              → buildMarketState / observation
              → buildMarketInterpretation   [Layer 2]
              → buildTradingDecision        [Layer 3]
              → analysis-contract + decision-envelope
              → evaluateAnalysisQualityGate (freshness / missing → block verdict)
```

### How LONG / SHORT / WAIT / NO_TRADE are produced

| Verdict | Produced when |
|---------|----------------|
| **NO_TRADE** | `data_quality` missing/stale; required fields `unknown`; contamination guard fail; **or** neither long nor short case supported (`decision-layer.ts`) |
| **WAIT** | Exactly one side supported **but** execution scaffold `entryStatus` is WAIT/EXTENDED; **or** both long & short supported (conflict) |
| **LONG** | `long_case.supported && !short_case.supported` and entry not waiting |
| **SHORT** | Mirror of LONG |

Interpretation support (`interpretation-engine.ts`):

- Needs **≥2 reasons** on a side, structure/FVG not `unknown`, no opposing bias/structure contradiction.
- Reasons: HTF tradeable bias, market_structure, liquidity sweeps (added to **both** sides), displacement (both sides), directional FVG.
- Special skip: NY + bullish MSS/FVG/displacement **without** sell-side sweep → `reversalLookalikeWithoutSslSweep` → not a supported long.

Stance naming (`decision-envelope.ts` `resolveStance`): LONG→long, SHORT→short, WAIT→wait **only if** trigger-like entry model + numeric zone, else **flat**; NO_TRADE path → monitor/flat via contract.

### Confirmations / conflict / invalidation / missing

| Concern | Representation |
|---------|----------------|
| Confirmation policy | `confirmation-policy.ts` — candle_close for MSS/sweep/disp/FVG formation; wick entry does **not** affect verdict |
| Pending lifecycle | **Not in observation JSON** (desk-state-machine has phases; Layer 1 does not) |
| Conflicting evidence | `interpretation.contradictions[]`; both cases supported → WAIT |
| Invalidation | From swept levels ±5 or MSS level ±5; execution scaffold target |
| Missing / stale | Observation fields → `unknown`; quality gate `canDeliverVerdict=false` → WAIT tone; contract forces NO_TRADE if INSUFFICIENT + non-NO_TRADE |
| Envelope chain | Playbook concepts scored true/false/uncertain with detected vs used roles — **naming/explainability**, does not recompute sweeps |

### Quality gate / freshness (do not weaken)

`evaluateAnalysisQualityGate`:

- Audits OHLC usability, timestamp alignment, price, observation quality, deep-analysis structure/bias.
- Runs same `runDecisionPipeline` as live desk.
- Blocks verdict on critical missing / contract invention / insufficient data.
- **DV must keep this gate** — v0 already does.

WAIT/NO_TRADE are **explainable from blockers** when quality fails or contradictions fire. Risk remains when `mapStructure` fills bullish/bearish from **bias without MSS** — can invent directional structure appearance without a true MSS event.

---

## CRITICAL BUGS

### Fixed this pass

| Bug | Impact | Fix |
|-----|--------|-----|
| **Liquidity sweep over-report** | Any bar with `close > PDL` marked PDL buy-side taken; any `close < PDH` marked PDH sell-side. Poisoned confluence, both-sides-taken, SSL checks. | `detectLiquiditySweeps`: rejection (`wick through + close reclaim`) or close-through **from the other side**; high pools → BSL only; low pools → SSL only. Docs/JSON definitions updated. |

### Listed (not fixed — design / poison for DV metrics)

| Issue | Severity for DV | Notes |
|-------|-----------------|-------|
| `mapStructure` bias fallback when MSS null | **High** | Structure can read bullish/bearish without MSS — DV may score “structure” hits that are bias copies. |
| Displacement has no direction | **High** | Credits long **and** short reasons → artificial confluence. |
| Sweeps still add reasons to both sides | **Medium** | Side is computed correctly now; weigher still dual-credits. |
| `prev ?? lastPrice` for PDH/PDL/PDC | **Medium** | Missing prior daily invents levels at last price. |
| Empty session → today HL fallback | **Medium** | Fake Asia/London levels early session / thin data. |
| Dual REH algorithms | **Low–Med** | Envelope EQH vs observation REH can disagree. |
| Order block stub | **Low** | Mark SPEC_NOT_BUILT in DV labels. |
| EST daily vs CME session day for PD | **Med (labeling)** | DV fixtures must state which day boundary is ground truth. |

---

## LOOK-AHEAD / DAY-BOUNDARY RISKS

| Risk | Status |
|------|--------|
| `sliceBarsAt` / `buildMarketContextAt` use `time <= asOf` | **OK** — DV v0 poison fixture covers this |
| PDH from completed daily only (`dateKey < today`) | **OK** — probe confirms Thu poison daily excluded |
| Current day H/L from partial m1 | **OK** if labeled LIVE/partial — not prior day |
| Forming 1m bar included when `time <= asOf` | **OK** if asOf = bar open/close consistently; mis-synced LIVE quote vs last closed bar is a **LIVE vs close** risk |
| `resolveLiveLastPrice` can prefer chart LIVE over bar close | Document in DV: LIVE path ≠ closed-bar path |
| Yahoo daily bar timestamp vs EST key | Rely on `getEstDateKey`; do not mix CME session keys for PD arrays without an explicit module |
| Asia window uses calendar yesterday | Weekend/holiday thin data → fallback HL risk |
| Decision history LIVE write suppressed in DV | **OK** — `withDecisionHistorySuppressed` in v0 |

---

## TIME-MODULE HOOK DESIGN (recommendation only — do not implement)

Layering for future Decision Validation of time hypotheses (e.g. “11:30 tends to take 10:00 high/low”):

```
┌─────────────────────────────────────────────────────────┐
│  CORE FRAMEWORK (versioned, always on)                  │
│  PD arrays, sessions H/L, FVG/MSS/sweep detectors,      │
│  observation → interpretation → decision → quality gate │
└─────────────────────────────────────────────────────────┘
                         ▲ evidence facts only
┌─────────────────────────────────────────────────────────┐
│  TIME HYPOTHESIS MODULES (off by default, versioned)    │
│  id: "ny_1030_vs_1000_hl@v1"                            │
│  inputs: asOf, session H/L anchors, m1 ≤ asOf           │
│  outputs: HypothesisObservation {                       │
│    claimId, status: true|false|unknown,                 │
│    anchors[], evidenceRefs[], lookAheadSafe: true       │
│  }                                                      │
│  MUST NOT mutate core PDH/FVG/MSS or verdict math       │
└─────────────────────────────────────────────────────────┘
                         ▲ optional extras
┌─────────────────────────────────────────────────────────┐
│  WEIGHER / DV SCORER                                    │
│  Core verdict unchanged unless module explicitly        │
│  registered as a confirmation input in a DV profile.    │
│  Score hooks: agreement, MAE/MFE, waitAvoidance —       │
│  no self-learning / auto-rewrite.                       │
└─────────────────────────────────────────────────────────┘
```

Rules:

1. Modules are **pure functions** of `{ bars ≤ t, core observation at t }` — no future bars.
2. **Off by default**; enable per DV profile / feature flag.
3. Version string in `claimId`; never silently change semantics.
4. Emit `unknown` when anchors missing (e.g. 10:00 HL not yet formed at 09:50).
5. Do **not** feed adaptation/self-learning — log outcomes only (aligns with DV v0 score-hook placeholders).

---

## FOCUSED TESTS + tsc

```bash
cd .tmp/karen-final-integration
npx tsx scripts/test-trading-logic-correctness.ts   # 13/13 — sweeps, PD day boundary, look-ahead, CME vs EST
npx tsx scripts/test-observation-engine.ts          # ok
npx tsx scripts/test-decision-pipeline.ts           # ok
npx tsc --noEmit -p tsconfig.json                   # clean
```

Probes cover:

1. No false sweep when floating between PDL/PDH  
2. SSL rejection + SSL close-through on PDL  
3. BSL rejection on PDH  
4. PDH/PDL/PDC exclude same-day poison daily  
5. `sliceBarsAt` excludes future poison close  
6. `priorEstDateKey` Fri←Mon  
7. CME session key rolls at 18:00; EST calendar does not  

---

## READY FOR DECISION VALIDATION EXPANSION

**CONDITIONAL — YES for expansion if:**

1. DV treats fixed sweep detector as baseline (rebuild `structureFacts` from OHLC; do not trust stale baked sweeps in old fixtures without rebuild).  
2. Scorecards **separate** “MSS-present” from “structure==bias fallback”.  
3. Displacement / dual-credit sweep reasons tagged as **weigher confounders**, not concept calc failures.  
4. Fixtures declare day-boundary convention: **EST Yahoo daily** (current) vs future CME-session module.  
5. Quality gate remains mandatory (already in v0).  
6. No profitability claims until score hooks filled (per DV v0).

**NO** if the goal is “concepts are fully Adam-faithful with pending states, OB geometry, and directional displacement” — those are still SPEC_NOT_BUILT / incomplete.

---

## Files touched this audit

| Path | Change |
|------|--------|
| `lib/structure.ts` | Fix `detectLiquiditySweeps` |
| `docs/OBSERVATION_DEFINITIONS.md` | Align sweep rules; mark old bug fixed |
| `data/observation-definitions.json` | Align detection_rules |
| `scripts/test-trading-logic-correctness.ts` | New focused probes |
| `data/research/karen-trading-logic-correctness-audit.md` | This document |

No production commit / push / deploy.
