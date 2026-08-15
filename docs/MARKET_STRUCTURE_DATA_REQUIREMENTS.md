# Market Structure Data Requirements

**Read-only specification** — derived from existing project definitions and implementation code as of 2026-08-13. This document states what the codebase **currently requires and computes**; it does not prescribe new behavior.

**Sources inspected:** `docs/OBSERVATION_DEFINITIONS.md`, `data/observation-definitions.json`, `lib/pd-arrays.ts`, `lib/gap-zones.ts`, `lib/market-data.ts`, `lib/levels.ts`, `lib/structure.ts`, `lib/observation-engine.ts`, `lib/tickstream/htf-aggregate.ts`, `DECISIONS.md`, and referenced test scripts.

**Machine-readable twin (observation concepts):** [`data/observation-definitions.json`](../data/observation-definitions.json)

---

## Session and calendar conventions (cross-cutting)

The project uses **multiple day-boundary models** depending on pipeline. This is a primary source of ambiguity.

| Boundary model | Definition in code | Used by |
|----------------|-------------------|---------|
| **EST calendar day** | `getEstDateKey(date)` → `en-CA` date in `America/New_York` | Yahoo daily bar filtering, FPFVG day windows, session H/L day keys, `sliceDailyForAsOf` “completed” daily |
| **CME Globex session day** | Bars at/after **6:00 PM ET** roll to the **next** session date (`cmeSessionDateKey` in `lib/tickstream/htf-aggregate.ts`) | TickStream HTF daily aggregation from 1m |
| **CME week** | Week starts **Sunday 6:00 PM ET** (`cmeWeekSundayKey` in `lib/market-data.ts`) | NWOG, TickStream weekly aggregation |
| **RTH anchors** | Open **9:30 AM ET** (`RTH_OPEN_MIN`); close **4:15 PM ET** (`RTH_CLOSE_MIN`) | ORG, PDC anchor, PD level formation times |
| **CME daily FVG formation anchor** | **6:00 PM ET** on displacement day (`fvgFormationTime`) | Daily FVG chart anchors (not gap detection itself) |
| **CME daily completion anchor** | **5:00 PM ET** (`dayFormationTime`, 17:00) | Daily bar completion timestamp on chart |

**Yahoo fetch ranges** (`lib/market-data.ts:fetchAllTimeframes`): daily `3mo`, 15m/5m `5d`, 1m `7d`. Backtest variant extends 15m/5m to `60d`.

**Default instrument:** MNQ (`MNQ=F` via Yahoo).

---

## Summary table

| Concept | Required timeframe(s) | Min lookback | OHLC fields | Timestamp / session | Implementation | Test coverage |
|---------|----------------------|--------------|-------------|---------------------|----------------|---------------|
| FVG (intraday 1m) | 1m | 80 bars (scan last 40 for detection) | H, L, O, C | EST minute; `formatEst` | `lib/gap-zones.ts`, `lib/structure.ts` | `npm run test:observation-proof` (documented); `scripts/test-scoped-chart-qa.ts` |
| FVG (5m / 15m) | 5m, 15m | 40 bars | H, L, O, C | Bar timestamp | `lib/gap-zones.ts`, `lib/levels.ts` | Indirect via market context / replay |
| FVG (daily) | Daily | 20 daily bars (last 3 gaps kept) | H, L (c1/c3 wicks); no min-gap on daily path | EST date key on c3 | `lib/pd-arrays.ts:detectDailyFvgs` | **No dedicated unit test** |
| FVG (weekly) | — | — | — | — | **UNDEFINED** | **None** |
| FVG (monthly) | — | — | — | — | **UNDEFINED** | **None** |
| FPFVG (first presented FVG) | 1m | 3+ bars in window; full day m1 | H, L, O, C | ICT session open windows (EST) | `lib/gap-zones.ts` | `npm run test:scoped` (`scripts/test-scoped-chart-qa.ts`) |
| IFVG (inverted FVG) | 1m (also 5m/15m/daily paths) | From formation index forward | **Close** for inversion | Post-formation bars | `lib/gap-zones.ts:isFvgInverted` | `scripts/test-scoped-chart-qa.ts` (inverted FVG structure summary) |
| PD arrays (HTF bundle) | Daily + 1m for opens | 1 prior daily + current partial day | H, L, O, C | Mixed (see PDH/NDOG) | `lib/pd-arrays.ts:computeHtfPdArrays` | Indirect via `buildMarketContext` consumers |
| PDH / PDL | Daily (+ 1m for anchors) | 1 prior completed daily | H, L | Prior **EST calendar day** (`sliceDailyForAsOf`) | `lib/levels.ts`, `lib/pd-arrays.ts` | `scripts/test-scoped-chart-qa.ts`, `scripts/test-market-intelligence.ts` |
| PDC / PDO | Daily | 1 prior daily | C, O | PDC anchor 4:15 PM ET on prior day | `lib/pd-arrays.ts` | Indirect |
| CDO (current day open) | 1m | Today’s first 1m bar | O | 9:30 AM ET preferred anchor | `lib/levels.ts`, `lib/market-data.ts` | Indirect |
| PWH / PWL | — | — | — | — | **UNDEFINED** | **None** |
| PMH / PML | — | — | — | — | **UNDEFINED** | **None** |
| Daily open (explicit) | 1m or daily | Current day | O | First 1m of EST calendar day | `lib/levels.ts:dayOpen` | Indirect |
| Weekly open | 1m or daily | Current CME week | O | **Sunday 6:00 PM ET** | `lib/market-data.ts:computeNwog` | Indirect |
| Monthly open | — | — | — | — | **UNDEFINED** | **None** |
| NWOG | 1m (+ daily fallback) | Prior Friday + current week | O, C | Fri close → Sun 6 PM ET week open | `lib/market-data.ts:computeNwog` | `npm run test:market-intelligence` (routing/answer) |
| NDOG | Daily + 1m | Prior day close + today open | C, O | Prior close vs today open (calendar day) | `lib/pd-arrays.ts` | Evidence-only in observation; no chart-proof |
| ORG | 1m | Prior + current EST day | C, O | **4:15 PM ET close → 9:30 AM ET open** | `lib/levels.ts:computeOrg` | Indirect; DECISIONS mentions 6:30 (conflict) |
| MSS | 1m | 80 bars (min 10); scan last 12 | **Close** vs swing H/L | 1m bar close time (EST) | `lib/structure.ts:detectMss` | Documented `chart-proof-mss-bullish`; `npm run test:observation` |
| BOS | — | — | — | — | **UNDEFINED** (MSS used instead; CHoCH explicitly rejected) | **None** |
| Liquidity sweep | 1m | 40 bars | H, L, **Close** | 1m EST | `lib/structure.ts:detectLiquiditySweeps` | Replay fixtures; observation-proof (documented) |
| Session H/L | 1m | Session window bars | H, L | ICT session windows (EST) | `lib/levels.ts:recentSessionBars` | **No dedicated structure test** |
| REH / REL | 1m | 120 bars (observation path) | H, L swings | 1m EST | `lib/reh-rel.ts`, `lib/structure.ts` | `npm run test:reh-rel`; documented `chart-proof-reh-above` |
| Premium / discount | Derived | Current + prior day range | Last price vs ranges | Calendar day ranges | `lib/pd-arrays.ts:computePremiumDiscount` | `npm run test:observation` (via ctx) |

---

## Per-concept requirements

### FVG — intraday (1m, 5m, 15m)

| Field | Value |
|-------|-------|
| **Definition** | 3-candle pattern: bullish if `c1.high < c3.low` and gap ≥ **3 points** (`MIN_GAP_POINTS`); bearish if `c1.low > c3.high` and gap ≥ 3 pts. Unfilled if not ≥50% overlap fill and not full traverse (`isGapFilled`). Inverted (IFVG) when **body close** through gap (`isFvgInverted`). |
| **Timeframe** | 1m (structureFacts / observation), 5m and 15m (market context `unfilledFvgs`) |
| **Min lookback** | Default **40** bars for detection window; 1m structure path uses **80** bars with max **5** gaps returned |
| **OHLC** | Gap measured on **wick extremes** (high/low of c1 and c3). Fill/inversion uses subsequent bar H/L/C |
| **Timestamp / session** | `formedAt` = EST formatted time of c3 (`formatEst`). No session filter for generic intraday FVG |
| **Dependencies** | None beyond OHLC series |
| **Implementation** | `lib/gap-zones.ts:detectUnfilledIntradayFvgs`, `fvgAtIndex`, `isGapFilled`, `isFvgInverted`; `lib/structure.ts:detectM1UnfilledFvgs`; `lib/observation-engine.ts:mapFvg` |
| **Test coverage** | `npm run test:observation-proof` (fixture `chart-proof-fvg-present` per docs); `scripts/test-scoped-chart-qa.ts` (IFVG, `detectUnfilledIntradayFvgs`); `npm run test:observation` |
| **Ambiguities / conflicts** | `fvg_validity` (tradeable vs present) **SPEC_NOT_BUILT**. `hasVolumeImbalance` in types **unused**. Observation reports most recent unfilled 1m FVG only — not FPFVG. 1m vs 5m/15m use same rules but different bar feeds (Yahoo 5d range). |

---

### FVG — daily

| Field | Value |
|-------|-------|
| **Definition** | Same 3-bar wick gap pattern on **daily** bars: bullish `c1.high < c3.low`, bearish `c1.low > c3.high`. **No `MIN_GAP_POINTS` check** on daily path. Returns last **3** detected; `filterUnfilledDailyFvgs` drops filled gaps using `isGapFilled` on subsequent daily bars. |
| **Timeframe** | Daily (`FvgZone.timeframe = "daily"`) |
| **Min lookback** | **20** daily bars (`detectDailyFvgs` default) |
| **OHLC** | H, L of c1/c3; daily bar O/C not used in gap detection |
| **Timestamp / session** | `formedAt` = EST date key of c3 (`getEstDateKey`). Chart anchor helpers reference **6 PM ET** formation (`fvgFormationTime`) and **5 PM ET** completion (`dayFormationTime`) — anchors only |
| **Dependencies** | `buildFvgDailyBars(yahooDaily, m1)` — completed EST calendar days; may patch “today” from 1m if ≥30 bars and EST time ≥ 4:00 PM |
| **Implementation** | `lib/pd-arrays.ts:detectDailyFvgs`, `filterUnfilledDailyFvgs`; fed by `lib/levels.ts` via `buildFvgDailyBars` |
| **Test coverage** | **No dedicated unit test** |
| **Ambiguities / conflicts** | Daily bars from Yahoo use **EST calendar day**, while TickStream HTF daily uses **CME 6 PM session day** — two daily series definitions. Daily FVG lacks 3-point minimum enforced on intraday. |

---

### FVG — weekly

| Field | Value |
|-------|-------|
| **Definition** | **UNDEFINED** — `FvgZone.timeframe` allows only `"daily" \| "15m" \| "5m" \| "1m"`. No weekly FVG detector. |
| **Timeframe** | — |
| **Min lookback** | — |
| **OHLC** | — |
| **Timestamp / session** | TickStream can aggregate **weekly OHLC** (`aggregateWeekly` in `lib/tickstream/htf-aggregate.ts`) but no FVG logic consumes it |
| **Dependencies** | — |
| **Implementation** | **None** |
| **Test coverage** | **None** |
| **Ambiguities / conflicts** | Listed in `DECISIONS.md` glossary / confluence checklist as ICT concept; not implemented. |

---

### FVG — monthly

| Field | Value |
|-------|-------|
| **Definition** | **UNDEFINED** |
| **Timeframe** | — |
| **Min lookback** | — |
| **OHLC** | — |
| **Timestamp / session** | `scripts/test-tickstream-historical-mnq.ts` explicitly **STOP**: *"No established monthly session boundary in lib/"* |
| **Dependencies** | — |
| **Implementation** | **None** |
| **Test coverage** | `npm run test:tickstream-historical-mnq` (monthly = STOP) |
| **Ambiguities / conflicts** | ICT transcripts reference monthly charts; codebase has no monthly calendar. |

---

### FPFVG (First Presented FVG)

| Field | Value |
|-------|-------|
| **Definition** | First qualifying **1m** FVG (same 3-bar, ≥3 pt rule) in a session-specific window after open. Variants: **`ny_opening`** (9:30–10:00, middle candle must not be 9:30 bar); **`post_fhdr`** (after body-close break of 9:30–10:30 FHDR); **`session_open`** (first ~30 min after Asia/London/NY PM opens). |
| **Timeframe** | 1m only |
| **Min lookback** | All 1m bars for current EST date key; ≥3 bars in window |
| **OHLC** | H, L (gap); post-FHDR also requires **close** beyond FHDR high/low |
| **Timestamp / session** | EST minutes via `getEstMinutes`; session opens: Asia **8:00 PM**, London **3:00 AM**, NY AM **9:30 AM**, NY PM **1:30 PM** (`SESSION_OPENS` in `lib/gap-zones.ts`). Asia open in gap-zones (**20:00**) differs from `lib/sessions.ts` Asia kill zone start (**18:00**) |
| **Dependencies** | Session date key, FHDR range for post-FHDR variant |
| **Implementation** | `lib/gap-zones.ts:detectFirstPresentedFvgs` and helpers; `lib/structure.ts:buildStructureFacts`; facts in `lib/observation-facts.ts` — **not** core `observation.fvg` |
| **Test coverage** | `npm run test:scoped` — `detectNyOpeningFirstPresentedFvg`, routing, snapshot answers |
| **Ambiguities / conflicts** | Distinct from “most recent 1m FVG” used by observation engine. DECISIONS uses acronym **FPFVG**; code uses `firstPresentedFvg`. Not daily/weekly/monthly FVG. |

---

### IFVG (Inverse FVG)

| Field | Value |
|-------|-------|
| **Definition** | Bullish FVG inverted when subsequent **body close < gap bottom**; bearish inverted when **body close > gap top**. Polarity flip heuristic. |
| **Timeframe** | Applied to 1m, 5m, 15m unfilled FVG detection paths |
| **Min lookback** | Bars after formation index |
| **OHLC** | **Close** for inversion; gap from H/L |
| **Timestamp / session** | Post-`startTime` or index+1 |
| **Dependencies** | Parent FVG zone |
| **Implementation** | `lib/gap-zones.ts:isFvgInverted`; exposed as `m1InvertedFvgs` in structureFacts |
| **Test coverage** | `scripts/test-scoped-chart-qa.ts` |
| **Ambiguities / conflicts** | DECISIONS glossary lists **IVFVG**; code comment says IFVG. Same logic. |

---

### PD arrays (HTF bundle)

| Field | Value |
|-------|-------|
| **Definition** | Code-computed set: **PDH, PDL, PDC, PDO, CDO, current/previous day EQ, NDOG bounds, NWOG bounds, recent daily FVG midpoints**. Used for directional hint and liquidity level list. “PD arrays” in prompts = this bundle, not a single formula. |
| **Timeframe** | Daily context + 1m for opens/anchors |
| **Min lookback** | ≥1 prior completed daily bar; NWOG needs Fri+Sun/Mon; NDOG needs prior day |
| **OHLC** | Full OHLC on daily prev bar; opens/closes for gaps |
| **Timestamp / session** | Prior day = last daily with EST date key **< today** (`sliceDailyForAsOf`). Day open = first 1m today |
| **Dependencies** | `buildFvgDailyBars`, `computeNwog`, prior daily bar |
| **Implementation** | `lib/pd-arrays.ts:computeHtfPdArrays`, `pdArrayDirectionHint`, `formatPdArrayBrief` |
| **Test coverage** | Indirect: `scripts/test-scoped-chart-qa.ts`, `scripts/test-market-intelligence.ts`, `npm run test:observation` |
| **Ambiguities / conflicts** | DECISIONS “daily bias from key levels on daily chart” — implemented as `pdArrayDirectionHint`, not separate daily MSS/BOS. |

---

### PDH (Previous Day High)

| Field | Value |
|-------|-------|
| **Definition** | **High** of prior completed daily bar (`prev.high`), fallback to last price if missing. Chart anchor: first 1m bar on prior EST date key that printed the day high (`findDayExtremeBar`). |
| **Timeframe** | Daily (+ 1m for anchor time) |
| **Min lookback** | 1 prior daily bar |
| **OHLC** | **High** |
| **Timestamp / session** | Prior **EST calendar day** (Yahoo daily), not explicitly CME session H/L |
| **Dependencies** | `sliceDailyForAsOf`, optional m1 for `resolvePdLevelAnchorTimes` |
| **Implementation** | `lib/pd-arrays.ts`, `lib/levels.ts`, `lib/market-data.ts:resolvePdLevelAnchorTimes` |
| **Test coverage** | Scoped chart QA, market intelligence, liquidity sweep via structureFacts |
| **Ambiguities / conflicts** | If Yahoo daily ≠ CME session daily, PDH may differ from Globex-session high. m1-derived PDH anchor uses calendar prior key. |

---

### PDL (Previous Day Low)

| Field | Value |
|-------|-------|
| **Definition** | **Low** of prior completed daily bar; anchor via first 1m bar printing day low on prior EST date key. |
| **Timeframe** | Daily (+ 1m anchors) |
| **Min lookback** | 1 prior daily |
| **OHLC** | **Low** |
| **Timestamp / session** | Same as PDH |
| **Dependencies** | Same as PDH |
| **Implementation** | Same as PDH |
| **Test coverage** | Same as PDH |
| **Ambiguities / conflicts** | Buy-side PDL sweep may over-report when price simply above PDL (documented in OBSERVATION_DEFINITIONS). |

---

### PDC / PDO (Previous Day Close / Open)

| Field | Value |
|-------|-------|
| **Definition** | PDC = prior daily **close**; PDO = prior daily **open**. PDC chart anchor = 1m bar closest to **4:15 PM ET** on prior day. |
| **Timeframe** | Daily (+ 1m for PDC anchor) |
| **Min lookback** | 1 prior daily |
| **OHLC** | **Close** (PDC), **Open** (PDO) |
| **Timestamp / session** | RTH close anchor 16:15 ET |
| **Dependencies** | Prior daily bar |
| **Implementation** | `lib/pd-arrays.ts` |
| **Test coverage** | Indirect (liquidity levels in observation) |
| **Ambiguities / conflicts** | PDEQ uses same anchor time as PDC in `resolvePdLevelAnchorTimes`. |

---

### PWH / PWL (Previous Week High / Low)

| Field | Value |
|-------|-------|
| **Definition** | **UNDEFINED** — no symbols, types, or calculators in `lib/`. |
| **Timeframe** | — |
| **Min lookback** | — |
| **OHLC** | — |
| **Timestamp / session** | CME week boundary exists for NWOG/weekly agg but not for PWH/PWL |
| **Dependencies** | — |
| **Implementation** | **None** |
| **Test coverage** | **None** |
| **Ambiguities / conflicts** | May be implied by ICT “weekly levels” in playbook; not coded. |

---

### PMH / PML (Previous Month High / Low)

| Field | Value |
|-------|-------|
| **Definition** | **UNDEFINED** |
| **Timeframe** | — |
| **Min lookback** | — |
| **OHLC** | — |
| **Timestamp / session** | Monthly boundary **UNDEFINED** |
| **Dependencies** | — |
| **Implementation** | **None** |
| **Test coverage** | `test-tickstream-historical-mnq` flags monthly STOP |
| **Ambiguities / conflicts** | — |

---

### Daily open (CDO — Current Day Open)

| Field | Value |
|-------|-------|
| **Definition** | **Open** of first 1m bar on current EST calendar day, else last price. Exposed as `cdo` in PD levels and `currentDay.open` in HTF PD arrays. |
| **Timeframe** | 1m (primary), daily fallback implicit via Yahoo |
| **Min lookback** | Today’s 1m bars |
| **OHLC** | **Open** |
| **Timestamp / session** | First bar where `getEstDateKey === today`; anchor prefers **9:30 AM ET** |
| **Dependencies** | Today’s 1m series |
| **Implementation** | `lib/levels.ts:dayOpen`, `lib/pd-arrays.ts`, `lib/market-data.ts:resolvePdLevelAnchorTimes` |
| **Test coverage** | Indirect |
| **Ambiguities / conflicts** | Globex session open is **6 PM ET** (used for NWOG/NDOG narrative elsewhere) but CDO uses calendar-day first 1m, not necessarily 6 PM open. |

---

### Weekly open

| Field | Value |
|-------|-------|
| **Definition** | **Open** at start of CME week: **Sunday 6:00 PM ET** (`weekOpen` in NWOG). Fallback: daily open of Sunday or Monday daily bar if 1m missing. |
| **Timeframe** | 1m preferred; daily fallback |
| **Min lookback** | Current week + prior Friday |
| **OHLC** | **Open** (week), **Close** (prior Fri) |
| **Timestamp / session** | CME week = Sunday ≥ 6 PM ET (`cmeWeekSundayKey`) |
| **Dependencies** | NWOG computation |
| **Implementation** | `lib/market-data.ts:computeNwog` |
| **Test coverage** | Indirect; NWOG Q&A in `test-market-intelligence` |
| **Ambiguities / conflicts** | Not exposed as standalone “weekly open” level ID — only inside NWOG struct. |

---

### Monthly open

| Field | Value |
|-------|-------|
| **Definition** | **UNDEFINED** |
| **Timeframe** | — |
| **Min lookback** | — |
| **OHLC** | — |
| **Timestamp / session** | — |
| **Dependencies** | — |
| **Implementation** | **None** |
| **Test coverage** | Monthly STOP in tickstream historical probe |
| **Ambiguities / conflicts** | — |

---

### NWOG (New Week Opening Gap)

| Field | Value |
|-------|-------|
| **Definition** | Gap between **prior Friday close** and **current week open** (Sunday 6 PM ET). Top/bottom = max/min of the two prints. Null if gap < **0.25** pts. |
| **Timeframe** | 1m (+ daily fallback) |
| **Min lookback** | Friday + Sunday/Monday in range; up to 8 days back for Sunday key |
| **OHLC** | Fri **close**, week **open** |
| **Timestamp / session** | Fri close: 1m closest to **5:00 PM** or **4:15 PM** ET; week open: **6:00 PM ET** Sunday |
| **Dependencies** | `cmeWeekSundayKey`, `fridayBeforeSunday`, m1 or daily |
| **Implementation** | `lib/market-data.ts:computeNwog`; `lib/levels.ts`; evidence in `lib/observation-engine.ts` |
| **Test coverage** | `npm run test:market-intelligence`; conversation routing tests |
| **Ambiguities / conflicts** | Not a core `MarketObservation` field — evidence/facts only. DECISIONS example #1 lists NWOG as resistance; premium/discount vs NWOG in `computePremiumDiscount`. |

---

### NDOG (New Day Opening Gap)

| Field | Value |
|-------|-------|
| **Definition** | Gap between **prior day close** and **current day open**: `top = max(prevClose, dayOpen)`, `bottom = min(...)`. Null if spread < **0.25** pts. |
| **Timeframe** | Daily context; day open from 1m |
| **Min lookback** | 1 prior daily + today open |
| **OHLC** | Prior **close**, current **open** |
| **Timestamp / session** | Uses Yahoo prior daily close vs today’s first 1m open — **not** explicitly 6 PM Globex open |
| **Dependencies** | `computeHtfPdArrays` inputs |
| **Implementation** | `lib/pd-arrays.ts`; evidence in observation engine |
| **Test coverage** | **No chart-proof** (documented gap) |
| **Ambiguities / conflicts** | ICT NDOG often defined around Globex 6 PM open; this implementation uses **calendar prior daily close → today open** (often 9:30 RTH open for CDO). Distinct from ORG. |

---

### ORG (Opening Range Gap)

| Field | Value |
|-------|-------|
| **Definition** | Gap from **prior session 4:15 PM close** to **today 9:30 AM open**. Includes top, bottom, CE (50%), 25%, 75% levels. |
| **Timeframe** | 1m |
| **Min lookback** | Prior EST date + today |
| **OHLC** | Prior bar **close** @ 4:15 PM, today **open** @ 9:30 AM |
| **Timestamp / session** | `RTH_CLOSE_MIN` (16:15), `RTH_OPEN_MIN` (9:30) |
| **Dependencies** | `priorEstDateKey`, 1m bars at anchors |
| **Implementation** | `lib/levels.ts:computeOrg`; liquidity + drawing levels |
| **Test coverage** | Indirect via market context / execution plan |
| **Ambiguities / conflicts** | **DECISIONS.md Step 21** says ORG = *"4:15 close → 6:30 open"*; **code and playbook** use **9:30 AM** open. ICT knowledge notes 4:14 vs 4:15 equivalence. ORG ≠ NDOG. |

---

### MSS (Market Structure Shift)

| Field | Value |
|-------|-------|
| **Definition** | On 1m: **body close** above most recent **5-bar swing high** (wing=2) → bullish; below swing low → bearish. Scans last **12** bars of **80-bar** window. Wick-only pierce rejected. Comment: *not CHoCH*. |
| **Timeframe** | 1m only |
| **Min lookback** | 80 bars (minimum 10) |
| **OHLC** | **Close** vs swing **high/low** |
| **Timestamp / session** | Break bar EST time |
| **Dependencies** | Swing detection on 1m |
| **Implementation** | `lib/structure.ts:detectMss`; `lib/observation-engine.ts:mapStructure` |
| **Test coverage** | Documented `chart-proof-mss-bullish`; `npm run test:observation`; `npm run test:observation-proof` (script referenced in package.json) |
| **Ambiguities / conflicts** | `mapStructure` falls back to `tradeable_bias` when MSS null. No `pending` state. Not distinguished from CHoCH/BOS in code despite DECISIONS mentioning BOS. |

---

### BOS (Break of Structure)

| Field | Value |
|-------|-------|
| **Definition** | **UNDEFINED** as separate detector. DECISIONS Step 30: *"No CHoCH. Uses MSS only."* Step 22 lists MSS/BOS as *"Mixed"*. No `detectBos` or BOS types in `lib/`. |
| **Timeframe** | — |
| **Min lookback** | — |
| **OHLC** | — |
| **Timestamp / session** | — |
| **Dependencies** | — |
| **Implementation** | **None** (MSS subsumes execution-TF structure break) |
| **Test coverage** | **None** |
| **Ambiguities / conflicts** | Conversation teaching text mentions “break of structure” synonymously with MSS; not a distinct data product. |

---

### Liquidity sweep

| Field | Value |
|-------|-------|
| **Definition** | For each level: **sell-side** if `low ≤ level` AND `close < level`; **buy-side** if `high ≥ level` AND `close > level`. Lookback **40** 1m bars. |
| **Timeframe** | 1m |
| **Min lookback** | 40 bars |
| **OHLC** | H, L, **Close** (wick pierce + close confirmation) |
| **Timestamp / session** | Sweep bar EST time |
| **Dependencies** | Level list: PDH, PDL, PDC, session highs/lows, ORG (via `liquidityLevelsFromContext`) |
| **Implementation** | `lib/structure.ts:detectLiquiditySweeps`; `lib/observation-engine.ts:buildLiquidityLevels` |
| **Test coverage** | Replay fixtures; documented observation-proof |
| **Ambiguities / conflicts** | Session H/L in observation default `taken: false` unless sweep matched by label. REH/REL sweeps tracked separately. Only PDH/PDL/PDC/NY RTH H/L in core observation liquidity list. |

---

### Session highs / lows

| Field | Value |
|-------|-------|
| **Definition** | High/low of 1m bars in ICT session windows (with times of extreme). Sessions tracked: **Asia, London, NY pre, NY RTH, NY PM**. |
| **Timeframe** | 1m |
| **Min lookback** | Bars within window (see below) |
| **OHLC** | **High**, **Low** |
| **Timestamp / session** | **Asia:** prior day 18:00–24:00 ET + today 00:00–01:00 ET (`levels.ts`). **London:** 02:00–05:00. **NY pre:** 07:00–09:30. **NY RTH:** 09:30–16:00. **NY PM:** 13:30–16:00. Active session windows for REH/REL scope differ slightly (`structure.ts` NY AM = 9:30–11:00). |
| **Dependencies** | Today + yesterday date keys for Asia |
| **Implementation** | `lib/levels.ts:recentSessionBars`, `sessionHighLowWithTimes`; `lib/sessions.ts:resolveSessionContext` for active bucket |
| **Test coverage** | **No dedicated session H/L unit test**; mock data in regression/scoped tests |
| **Ambiguities / conflicts** | **Asia window mismatch:** `sessions.ts` Asia = 18:00–02:00; `levels.ts` Asia H/L = 18:00–24:00 + 0:00–1:00 only. Asia open for FPFVG = 20:00 in gap-zones vs 18:00 session start. DECISIONS Step 24 lists “Previous day H/L” with session levels — PDH/PDL are separate from session H/L. |

---

### REH / REL (Relative Equal Highs / Lows)

| Field | Value |
|-------|-------|
| **Definition** | **Two algorithms:** (1) Observation path (`reh-rel.ts`): cluster ≥2 swing highs/lows within tolerance `max(2, min(4, price×0.001))` pts; REH level = max high; REL = min low; active if beyond price ±0.25 eps; swept on **close** cross. (2) StructureFacts path (`structure.ts`): pair 3-bar swings where **right swing lower than left** within tolerance. |
| **Timeframe** | 1m |
| **Min lookback** | **120** bars (observation); scoped bars for structureFacts (NY pre + active session + last 120) |
| **OHLC** | Swing **high/low** extremes |
| **Timestamp / session** | structureFacts scoped to NY pre + active session window |
| **Dependencies** | Current price, 1m candles |
| **Implementation** | `lib/reh-rel.ts`, `lib/structure.ts:detectRelativeEqualPools`, `lib/observation-engine.ts:mapRehRel` |
| **Test coverage** | `npm run test:reh-rel`; documented `chart-proof-reh-above`; scoped chart QA for structureFacts REH |
| **Ambiguities / conflicts** | **Dual algorithms** — observation uses clustering; structureFacts uses paired swings. `relativeEqualPools` not wired into observation `reh_rel` block. |

---

## Data pipeline dependencies (end-to-end)

```
Yahoo OHLC (daily, 15m, 5m, 1m)
        │
        ▼
lib/market-data.ts ── sliceBarsAt, buildFvgDailyBars, computeNwog, session helpers
        │
        ▼
lib/levels.ts:buildMarketContextAt
        ├── computeOrg (ORG)
        ├── computeHtfPdArrays (PDH/PDL/PDC/NDOG/daily FVG)
        ├── recentSessionBars (session H/L)
        └── buildStructureFacts (MSS, sweeps, 1m FVG, FPFVG, REH/REL pools)
                │
                ▼
lib/observation-engine.ts:buildMarketObservation (Layer 1 facts)
```

**TickStream path (parallel):** 1m from ticks → `aggregateHtfFrom1m` with **CME session daily** and **Sunday 6 PM weekly** — not yet unified with Yahoo `buildMarketContext` daily series.

---

## Test coverage index

| Script | npm alias | Concepts exercised |
|--------|-----------|-------------------|
| `scripts/test-observation-chart-proof.ts` | `test:observation-proof` | MSS, REH, FVG presence (fixtures `chart-proof-*` per docs) — **file referenced in package.json; verify present in workspace** |
| `scripts/test-observation-engine.ts` | `test:observation` | Observation mapping, premium/discount via ctx, data quality |
| `scripts/test-reh-rel.ts` | `test:reh-rel` | REH/REL clustering, tolerance, sweep semantics |
| `scripts/test-scoped-chart-qa.ts` | `test:scoped` | FPFVG detection/routing, IFVG, PDH/PDL snapshots, structureFacts |
| `scripts/test-market-intelligence.ts` | `test:market-intelligence` | NWOG Q&A, fact routing |
| `scripts/test-tickstream-historical-unit.ts` | `test:tickstream-historical-unit` | `cmeSessionDateKey`, 5m HTF from 1m |
| `scripts/test-tickstream-historical-mnq.ts` | `test:tickstream-historical-mnq` | Monthly boundary STOP |
| `scripts/test-regression-session.ts` | `test:regression` | Routing/regression (mock ctx with session levels, not detection) |

---

## Known ambiguities and conflicts (summary)

1. **Three “day” models:** EST calendar day (Yahoo/levels), CME 6 PM session day (tickstream HTF), RTH 9:30–16:15 (ORG/PDC anchors).
2. **ORG open time:** Code = **9:30 AM ET**; DECISIONS Step 21 = **6:30 AM** — treat as documentation conflict; code wins for requirements.
3. **NDOG vs Globex open:** Code uses prior daily **close → today open** (typically RTH open), not 6 PM Globex open-close pair.
4. **Daily FVG vs intraday FVG:** Daily path has **no 3-point minimum**; different day boundary than CME aggregated daily.
5. **Weekly/monthly FVG and PMH/PML/PWH/PWL:** **UNDEFINED** — no implementation.
6. **BOS:** **UNDEFINED** — MSS only on 1m.
7. **FPFVG vs observation FVG:** Separate code paths; observation `fvg` field ≠ first presented FVG.
8. **Session window inconsistencies:** Asia length and FPFVG Asia open (20:00) vs session id Asia (18:00).
9. **Dual REH/REL algorithms** between `structure.ts` and `reh-rel.ts`.
10. **Liquidity sweep coverage:** Session levels listed but not auto-marked swept in observation except via sweep label match.

---

## Related documents

- [`docs/OBSERVATION_DEFINITIONS.md`](./OBSERVATION_DEFINITIONS.md) — operational detection spec for Layer 1
- [`DECISIONS.md`](../DECISIONS.md) — product ICT glossary (may diverge from code where noted above)
- [`lib/tickstream/htf-aggregate.ts`](../lib/tickstream/htf-aggregate.ts) — CME session aggregation from 1m ticks

---

*Generated read-only from codebase inspection. Do not treat UNDEFINED rows as future requirements unless product explicitly adds them.*
