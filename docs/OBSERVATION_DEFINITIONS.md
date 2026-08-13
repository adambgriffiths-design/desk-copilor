# Observation Definitions

**Operational spec for Adam's ICT concepts** — what the observation engine detects, how, and where it diverges from intent.

Machine-readable twin: [`data/observation-definitions.json`](../data/observation-definitions.json)

Related: [`ICT_DECISION_SPEC.md`](./ICT_DECISION_SPEC.md) (pipeline architecture), [`DECISION_TRACKER_SPEC.md`](./DECISION_TRACKER_SPEC.md) (confirmation policies)

---

## How to use this doc

1. **Define** — each concept below states detection rules pulled from code (not aspirational).
2. **Prove** — run chart proof against labeled fixtures:
   ```bash
   npm run test:observation-proof
   ```
3. **Compare** — gap report at bottom flags `SPEC_NOT_BUILT` vs bugs.

Chart-proof fixtures (`chart-proof-*`) rebuild `structureFacts` from OHLC via `buildStructureFacts` — they prove detection, not pre-baked ctx.

---

## State vocabulary

| State | Meaning in observation JSON |
|-------|----------------------------|
| `unknown` | Insufficient/stale data — reasoning must not guess |
| `absent` | Scanned, not found |
| `present` / `active` | Detected and current |
| `invalidated` / `swept` | Was active, price action removed it |
| `pending` | **NOT IMPLEMENTED** — no intrabar pending lifecycle in Layer 1 |
| `unclear` | Ambiguous (e.g. structure without MSS) |

When `data_quality` is `missing` or `stale`, structural fields become `unknown`.

---

## Tolerance formulas

| Concept | Formula | Code |
|---------|---------|------|
| REH/REL clustering | `max(2, min(4, referencePrice × 0.001))` pts | `lib/structure.ts:rehRelTolerance` |
| REH/REL price filter | `0.25` pt eps above/below current price | `lib/drawing-levels.ts:REH_REL_PRICE_EPS` |
| FVG minimum gap | `≥ 3` pts between c1 and c3 wicks | `lib/gap-zones.ts:MIN_GAP_POINTS` |
| Displacement body | `body > avgBody × 1.5` (avg excludes last 3 bars) | `lib/observation-engine.ts:detectDisplacement` |
| FVG fill | `≥ 50%` overlap or full traverse | `lib/gap-zones.ts:isGapFilled` |

**REH example @ 29807:** tolerance = 4 pts → highs 29887.00 & 29886.25 qualify (diff 0.75 ≤ 4).

---

## Concepts

### MSS (Market Structure Shift)

**Code:** `lib/structure.ts:detectMss` → `lib/observation-engine.ts:mapStructure`

| | |
|--|--|
| **Timeframe** | 1m |
| **Min candles** | 10 (80-bar lookback, scan last 12) |
| **Swing** | 5-bar pivot (wing = 2) |
| **Bullish** | Body **close** > prior swing high |
| **Bearish** | Body **close** < prior swing low |
| **Confirmation** | Candle close (`confirmation-policy.ts:mss`) |
| **Reject** | Wick-only pierce; no prior swing |

**Observation field:** `market_structure` → `bullish` \| `bearish` \| `unclear` \| `unknown`

**Gap vs Adam's intent:**
- No `pending` MSS state
- When MSS is null, `mapStructure` falls back to `tradeable_bias` — can show `bullish` without MSS
- Not distinguished from CHoCH in code

**Chart proof:** `chart-proof-mss-bullish` — OHLC produces bullish MSS @ 21005, close 21007.

---

### REH (Relative Equal High)

**Code:** `lib/reh-rel.ts:detectRehRel` (observation) + `lib/structure.ts:detectRelativeEqualPools` (structureFacts)

| | |
|--|--|
| **Timeframe** | 1m |
| **Swing** | 3-bar pivot (wing = 1) in observation path |
| **Cluster** | ≥2 highs within REH tolerance (union-find) |
| **Level** | `max(high)` in cluster |
| **Active** | Level ≥ currentPrice + 0.25 |
| **Swept** | Last close > REH level |
| **Confirmation** | Candle close for sweep |

**Observation fields:** `reh_rel.nearest_reh_above`, `reh_rel.reh_levels[]`

**Gap vs Adam's intent:**
- **Two algorithms** — `structure.ts` pairs sequential swings (right lower than left); `reh-rel.ts` clusters any equal highs. Observation uses `reh-rel.ts` only.
- `structureFacts.relativeEqualPools` not wired into `reh_rel` block

**Chart proof:** `chart-proof-reh-above` — REH 29887 from swings 29887.00 / 29886.25 above price 29807.25.

---

### REL (Relative Equal Low)

Mirror of REH on swing lows. Level = `min(low)` in cluster. Active when level ≤ currentPrice − 0.25. Swept when close < REL.

---

### Liquidity sweep

**Code:** `lib/structure.ts:detectLiquiditySweeps` → `observation-engine.ts:buildLiquidityLevels`

| | |
|--|--|
| **Levels scanned** | PDH, PDL, PDC (+ session/org when passed to `buildStructureFacts`) |
| **Sell-side (below)** | `low ≤ level` AND `close < level` |
| **Buy-side (above)** | `high ≥ level` AND `close > level` |
| **Lookback** | 40 bars |
| **Confirmation** | Candle close |

**Observation:** `liquidity.levels[].taken` — `liquidity_swept = any taken`

**Gap:** Session highs/lows listed in observation but default `taken: false` unless in `liquiditySweeps`. Buy-side PDL sweep fires whenever price is above PDL (may over-report on synthetic data).

---

### FVG (Fair Value Gap)

**Code:** `lib/gap-zones.ts:detectUnfilledIntradayFvgs` → `observation-engine.ts:mapFvg`

| | |
|--|--|
| **Pattern** | 3 candles: c1, c2 (middle), c3 |
| **Bullish** | `c1.high < c3.low`, gap ≥ 3 pts |
| **Bearish** | `c1.low > c3.high`, gap ≥ 3 pts |
| **Unfilled** | Not ≥50% filled in subsequent bars |
| **Invalidated** | Inverted (body through gap) → `fvg.status = invalidated` |
| **Formation confirm** | Candle close of c3 |
| **Entry (wick)** | Intrabar wick into zone — policy only, not Layer 1 |

**Observation:** `fvg.status`, `fvg.top`, `fvg.bottom`, `fvg.direction`

**Gap vs Adam's intent:**
- **`SPEC_NOT_BUILT`:** `fvg_validity` (valid / present_not_tradeable / invalid) exists in labeled fixtures but **not** in observation engine
- First-presented FVG tracked in `observation-facts.ts` but not in `observation.fvg`
- Volume imbalance flag in types unused in detection

**Chart proof:** `chart-proof-fvg-present` — bullish gap 21000–21005 unfilled.

---

### Order block

**Code:** `lib/observation-engine.ts:inferOrderBlock`

Heuristic placeholder — no OB geometry. `relevant` if MSS present; `unclear` if FVG only; else `irrelevant`.

**Gap:** `SPEC_NOT_BUILT` — Adam's OB rules not implemented.

---

### Displacement

**Code:** `lib/observation-engine.ts:detectDisplacement`

Impulsive body in last 5 of 12 bars: `|c−o| > 1.5 × avgBody`. Reports `displacement_points`.

**Gap:** Direction not stored (narrative assumes up). Not tied to MSS leg.

---

### Premium / discount

**Code:** `lib/observation-engine.ts:mapPremiumZone` — from `ctx.premiumDiscount` (precomputed in levels pipeline).

Maps price location vs current/previous day range → `premium` \| `discount` \| `equilibrium`.

---

### NWOG / NDOG / ORG

Computed in market pipeline. Observation records in `evidence` and `observation-facts.ts` (`gaps.nwog`, `gaps.ndog`, `gaps.org`) — **not** core `MarketObservation` top-level fields.

ORG quadrants (25/50/75/CE) per `lib/ict-knowledge.ts`.

---

### Confirmation (cross-cutting)

**Code:** `lib/confirmation-policy.ts`

| Concept | Confirmation | Affects verdict |
|---------|--------------|-----------------|
| MSS | candle_close | yes |
| Liquidity sweep | candle_close | yes |
| Displacement | candle_close | yes |
| FVG formation | candle_close | yes |
| FVG entry (wick) | intrabar_wick | **no** |
| HTF bias | candle_close | yes |
| Invalidation | candle_close | yes |
| Session | candle_close | no |

**Gap:** No unified `pending → confirmed` lifecycle in observation JSON.

---

### Wick entry

Policy documented in `confirmation-policy.ts:fvg_entry`. Layer 1 cannot observe intrabar wick fills — **`SPEC_NOT_BUILT`**.

---

## Chart proof harness

```bash
npm run test:observation-proof
```

**Script:** `scripts/test-observation-chart-proof.ts`

For each labeled fixture with a replay entry:
1. Load OHLC + ctx from `lib/replay-fixtures.ts`
2. For `chart-proof-*`: rebuild `structureFacts` from candles
3. Run `buildMarketObservation`
4. Compare `expected_observation` fields
5. Print MSS / REH / FVG diagnostics (candidates + rejections)

---

## Gap report

| Concept | Code implements | Spec documented | Chart proof test | Gap |
|---------|-----------------|-----------------|------------------|-----|
| MSS | ✓ | ✓ | ✓ (`chart-proof-mss-bullish`) | Bias fallback masks absent MSS; no pending state |
| REH/REL | ✓ | ✓ | ✓ (`chart-proof-reh-above`) | Dual algorithms (structure.ts vs reh-rel.ts) |
| Liquidity sweep | ✓ | ✓ | ✓ (replay fixtures) | Session levels not auto-sweep scanned; PDL buy-side over-report risk |
| FVG presence | ✓ | ✓ | ✓ (`chart-proof-fvg-present`) | OK for presence |
| FVG validity (tradeable) | ✗ | ✓ | ✗ | **SPEC_NOT_BUILT** — fixture label only |
| Order block | partial | ✓ | ✗ | **SPEC_NOT_BUILT** — heuristic placeholder |
| Displacement | ✓ | ✓ | ✓ | Direction not in observation field |
| Premium/discount | ✓ | ✓ | ✓ | Requires MarketContext precompute |
| NWOG/NDOG | partial | ✓ | ✗ | Evidence-only, not core observation fields |
| Wick entry | ✗ | ✓ | ✗ | **SPEC_NOT_BUILT** — policy doc only |
| Confirmation lifecycle | partial | ✓ | ✗ | No pending→confirmed in observation JSON |

### SPEC_NOT_BUILT (intentional gaps — not bugs)

- `fvg_validity` tradeability scoring
- Order block zone detection
- Wick-entry observation
- Pending/intrabar confirmation states

### Known bugs / mismatches (separate from SPEC_NOT_BUILT)

- `mapStructure` bias fallback when MSS absent
- `structureFacts.relativeEqualPools` vs `reh_rel` block use different REH algorithms
- PD sweep detection: buy-side PDL when price simply above PDL

---

## Labeled fixture fields

`expected_observation` in `data/labeled-setups/examples/*.json`:

| Field | Maps to observation |
|-------|---------------------|
| `market_structure` | `obs.market_structure` |
| `mss_direction` | `ctx.structureFacts.mss.direction` or `none` |
| `fvg_status` | `obs.fvg.status` |
| `fvg_direction` | `obs.fvg.direction` |
| `displacement` | `obs.displacement` |
| `liquidity_swept` | any `obs.liquidity.levels[].taken` |
| `reh_above` | `obs.reh_rel.nearest_reh_above != null` |
| `reh_level` | `obs.reh_rel.nearest_reh_above.level` |
| `htf_bias_aligned` | `obs.htf_bias.aligned === true` |
| `tradeable_bias` | `obs.htf_bias.tradeable_bias` |
| `data_quality` | `obs.data_quality` |
| `session` | `obs.session` |

`fvg_validity` on the label is Adam's tradeability judgment — **not** compared by chart proof (not in observation engine).
