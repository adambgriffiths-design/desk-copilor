# Karen investigation — liquidity_swept false-negative + decision-stance misses

**Date:** 2026-08-15  
**Mode:** Investigate ONLY — no product fixes, no commit/push/deploy  
**Primary WT:** `C:\Users\adamg\Projects\desk-copilot`  
**Source of truth for misses:** overnight STOP mid-probe + `reports/replay-2026-08-15.md` + `data/supervisor/results/overnight-interpretation-gap-inventory.md`

## Verdict (short)

| Issue | Failure layer |
|-------|----------------|
| `liquidity_swept` false-negative (3 fixtures) | **observation** |
| `ny-open-long-a-plus` stance (LONG → WAIT) | **verdict** (decision-layer entry-wait demotion) |
| `similar-but-skip` stance (NO_TRADE → WAIT) | **interpretation** (over-supports long without sweep) |

They do **not** share one root cause. Fixing the observation sweep does **not** flip `ny-open-long-a-plus` to LONG (counterfactual below).

---

## 1. Exact reproduction

### Commands run

```bash
npm run test:replay
npx tsx .tmp-liquidity-swept-stance-probe.ts
npx tsx .tmp-liquidity-swept-counterfactual.ts
```

Probe scripts are temporary under `.tmp*` (product code untouched).

### Observed outputs

**`npm run test:replay`** (reconfirmed 2026-08-15):

```
1. Observation Accuracy: 93.6%
2. Interpretation Agreement: 61.1%
3. Decision Agreement: 66.7%
Diagnosis: Primary gap: interpretation layer (61.1% …)
```

Matches `reports/replay-2026-08-15.md`:

| Field / case | Expected | Got |
|--------------|----------|-----|
| `liquidity_swept` overall | — | **3/6 (50%)** |
| bearish-wait / bullish-wait / ny-open-long-a-plus | `liquidity_swept: true` | `false` |
| ny-open-long-a-plus stance | LONG | WAIT |
| similar-but-skip stance | NO_TRADE | WAIT |

### Overnight context (not re-opened as work)

- `data/supervisor/overnight-karen-progress.md` **STOPPED** ~07:04 — mid `liquidity_swept` observation probe; no code changes from that probe.
- Inventory: `data/supervisor/results/overnight-interpretation-gap-inventory.md`

---

## 2. `liquidity_swept` false-negative — layer + hop evidence

### Classification: **observation**

Not market-state construction (sweep is present on ctx), not interpretation, not verdict.

### Data-flow hops (identical pattern on all 3 misses)

Fixtures: `bearish-wait`, `bullish-wait`, `ny-open-long-a-plus`  
Shared ctx authoring: `lib/replay-fixtures.ts` → `baseCtx()` includes:

```ts
structureFacts.liquiditySweeps: [{ levelId: "pdl", label: "PDL", price: 24800, side: "sell_side", ... }]
```

`daily.pdhSource` is **unset** (`null` in probe). `levelInteractions` is **empty**.

| Hop | Location | Value |
|-----|----------|-------|
| 1. Market context | `ctx.structureFacts.liquiditySweeps` | PDL sweep **present** |
| 1b. Provenance | `ctx.daily.pdhSource` | **missing** |
| 1c. Interactions | `ctx.structureFacts.levelInteractions` | **[]** |
| 2. Observation build | `lib/observation-engine.ts` → `buildLiquidityLevels` → `makeLevel("pdl", …)` | See branch below |
| 3. PDL level | `obs.liquidity.levels[pdl].taken` | **`"unknown"`** (not `true`) |
| 4. Derived field | `lib/replay-engine.ts` → `actualObservationFields` | `liquidity_swept = levels.some(l => l.taken === true)` → **`false`** |

### Exact failing branch

`lib/observation-engine.ts` `buildLiquidityLevels` / `makeLevel`:

```ts
const sweepHit = sweeps.some(
  (s) => s.levelId.toLowerCase() === id.toLowerCase() || s.label.toLowerCase() === label.toLowerCase()
);
// ...
else if ((id === "pdh" || id === "pdl" || id === "pdc") && pdhSource !== "cme_session_1m") {
  taken = isQualifyingTaken(status) || sweepHit ? "unknown" : false;
} else if (id === "pdh" || id === "pdl" || id === "pdc") {
  taken = prove; // ignores sweepHit; needs CLOSED_BEYOND + qualifying tick
}
```

With `pdhSource === undefined`, `pdhSource !== "cme_session_1m"` is **true**, so PDL with `sweepHit` becomes `taken: "unknown"`.

Replay scoring only accepts `taken === true` (`lib/replay-engine.ts:64`).  
Spec text: `docs/OBSERVATION_DEFINITIONS.md` — `liquidity_swept = any level.taken` (boolean true).

### Probe snapshot (bullish-wait / ny-open / bearish-wait)

```
pdhSource: null
liquiditySweeps: [PDL @ 24800]
pdl.taken: "unknown"
liquidity_swept_derived: false
expected_liquidity_swept: true
```

### Side effect into interpretation (not the FN itself)

Because `taken !== true`, `lib/interpretation-engine.ts` never sets `sslRaid`, so:

- `entry_model` stays `"Displacement + FVG retrace entry"` instead of `"NY open sweep + displacement + FVG retrace …"`
- Keyword scorer misses `"sweep"` on bullish-wait / ny-open

That feeds the interpretation % gap but the **boolean false-negative is observation**.

### Counterfactual (read-only)

Forced `pdhSource: "cme_session_1m"` + `levelInteractions` PDL `CLOSED_BEYOND` with qualifying tick:

```
pdl_taken: true
liquidity_swept: true
entry_model: "NY open sweep + displacement + FVG retrace (Adam reversal model)"
verdict: WAIT   ← still WAIT
```

So observation fix restores `liquidity_swept` + sweep phrasing; it does **not** change the LONG stance miss.

---

## 3. Decision-stance misses — layer + evidence

### 3a. `ny-open-long-a-plus`: expected LONG, got WAIT

**Classification: verdict** (`lib/decision-layer.ts` → `buildTradingDecision`)

| Hop | Value |
|-----|-------|
| Observation | long-capable facts present (MSS bullish, FVG present, displacement); sweep FN as above |
| Interpretation | `long_case.supported: true`, `short_case.supported: false` |
| Execution scaffold | `getExecutionScaffold` → `entryStatus: "WAIT"` (`WAIT — not at entry yet`; lastPrice 25100 vs FVG 25085–25095) |
| Decision | `entryWait ? "WAIT" : "LONG"` → **WAIT** |

Failing logic (`lib/decision-layer.ts` ~78–84):

```ts
const entryWait = execution?.entryStatus === "WAIT" || execution?.entryStatus === "EXTENDED";
if (interp.long_case.supported && !interp.short_case.supported) {
  verdict = entryWait ? "WAIT" : "LONG";
}
```

**Important:** `ny-open-long-a-plus` and `bullish-wait` share the same `baseCtx()` / `baseState()` shape (only `stateHash` differs). Engine output is the same WAIT path; labels disagree (LONG vs WAIT). Overnight note said “interpretation was reasonable; check decision rules” — confirmed: interpretation already supports long; stance gap is decision demotion + label contract.

### 3b. `similar-but-skip`: expected NO_TRADE, got WAIT

**Classification: interpretation** (primary); verdict only follows.

| Hop | Value |
|-----|-------|
| Market context | `liquiditySweeps: []` (intentional) |
| Observation | `liquidity_swept: false` ✓ vs label; **no** `fvg_validity` field (`SPEC_NOT_BUILT` per OBSERVATION_DEFINITIONS) |
| Interpretation | Still `long_case.supported: true` from HTF + MSS + bullish FVG (≥2 reasons) **without requiring a sweep**; `entry_model: "Displacement + FVG retrace entry"`; no “wouldn't / skip” language |
| Decision | long supported + `entryStatus: WAIT` → **WAIT** (not NO_TRADE) |

Label intent (`data/labeled-setups/examples/similar-but-skip.json`): skip because no sweep / `fvg_validity: present_not_tradeable`.

Failing interpretation gate (`lib/interpretation-engine.ts` ~148–153): `longSupported` only needs ≥2 longReasons + known structure/FVG — **no sweep requirement**, no `similar_but_skip` / present_not_tradeable handling.

Decision then correctly implements “supported long but not in zone → WAIT”; the product miss vs Adam’s NO_TRADE starts when interpretation marks the long case supported.

---

## 4. Shared root cause?

**No — three independent failures:**

| # | Issue | Root |
|---|-------|------|
| A | `liquidity_swept` FN ×3 | Observation maps PD sweep → `taken: "unknown"` / never `true` without CLOSED_BEYOND proof path |
| B | ny-open LONG miss | Verdict maps long-supported + not-in-zone → WAIT; label wants LONG; same engine path as bullish-wait |
| C | similar-but-skip NO_TRADE miss | Interpretation supports long without sweep / skip semantics |

Causal coupling is one-way and weak: A worsens interpretation keyword/`entry_model` text on the wait/long fixtures, but A→B is **not** required for the stance miss (counterfactual still WAIT). C’s observation sweep field is already correct (`false`).

---

## 5. Recommended fix layer (DO NOT implement here)

1. **Observation (`buildLiquidityLevels`)** — Decide product rule for hand-authored / structure `liquiditySweeps` on PDH/PDL/PDC:
   - Either map confirmed structure sweeps to `taken: true` when definitions say so, **or**
   - Keep provenance caution but teach replay/`liquidity_swept` to treat a documented sweep status (and fix fixtures with `pdhSource` + `levelInteractions` if proof is required).
   - Align with `docs/OBSERVATION_DEFINITIONS.md` / `data/observation-definitions.json`.

2. **Verdict (`buildTradingDecision`) + label contract** — For A+ “would take on retrace” fixtures: either label as WAIT (match engine) or introduce an explicit LONG-intent / “armed long” stance distinct from flat WAIT. Do not silently expect LONG while `entryStatus === WAIT`.

3. **Interpretation** — Gate long support (or force NO_TRADE lean) when no sell-side sweep / when skip-quality FVG; emit wouldn't/skip language for `similar_but_skip`. Optional later: observation `fvg_validity` if Adam wants that as a Layer-1 fact.

Suggested order matches overnight inventory: fix observation sweep mapping first (clears FN + sweep keywords), then interpretation skip gate, then re-check decision/label contract for ny-open.

---

## Artifacts

| Path | Role |
|------|------|
| `reports/replay-2026-08-15.md` | Suite miss table |
| `data/supervisor/results/overnight-interpretation-gap-inventory.md` | Overnight inventory |
| `.tmp-liquidity-swept-stance-probe.ts` (+ `-out.json`) | Hop dump |
| `.tmp-liquidity-swept-counterfactual.ts` | Observation-fixed still WAIT |
