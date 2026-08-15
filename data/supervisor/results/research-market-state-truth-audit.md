# Market-state truth audit

**Date:** 2026-08-14  
**Scope:** PDH false “taken” → named statuses → provenance → PIT / live-replay / symbol / data quality  
**Not in scope:** conversation turn-2 UI, Aug 12 EQH/EQL liquidity-quality dump, prompt rewrites, trading execution  

Karen is **not** claimed production-reliable. PDH taken-path regressions pass. Remaining rows below are honest FAIL / PARTIAL.

---

## Intended sweep semantics (unchanged rule, correct side)

Existing detector (`lib/structure.ts:detectLiquiditySweeps`):

- **Highs (PDH, session high, ORG top):** body close **beyond** = `close > level` AND `high >= level` → `CLOSED_BEYOND`
- **Lows (PDL, session low):** body close **beyond** = `close < level` AND `low <= level` → `CLOSED_BEYOND`
- Wick through without close = `BREACHED`, **not** taken
- Exact tag = `TOUCHED`, **not** taken
- Stop 1 tick (NQ **0.25**) short = `TESTED`, **not** taken
- EQH/EQL `SWEPT` (wick) is a **different** detector and is not collapsed into PDH taken

---

## Observed failure — PDH false TAKEN

Live report (this session, not screenshot-hardcoded into production): MNQU2026 / MNQ, TV Last **~30226–30229**, overnight / NY pre, chart PDH at the **top**, price in a REL cluster **below**.

### Chain (raw data → Karen sentence)

1. Yahoo / 1m OHLC + Yahoo daily  
2. `sliceDailyForAsOf` (was EST calendar daily `prev.high`)  
3. `detectLiquiditySweeps` (was **both** sides on every level)  
4. `observation-engine` `taken=true` if any sweep id/label matched  
5. `observation-facts` status `swept`  
6. `formatObservationNarrative` / `interpretFact` → **“PDH taken” / “buy-side liquidity was taken”**

### Root causes (two, both real)

**A. Side-blind sweep (primary false-positive)**  
`detectLiquiditySweeps` applied `close < level && low <= level` to **PDH**. Any 1m bar trading **below** an untouched high satisfied sell-side sweep. Karen said PDH was taken while Last was still under the chart PDH.

**B. Wrong day boundary (wrong PDH price)**  
PDH came from Yahoo **EST calendar** daily, not **CME Globex 18:00 ET** session. Calendar Thursday can miss Wednesday 18:00–24:00 (true Globex high at the top of the TV chart) and/or mix Thursday 18:00+ into “previous day”. Documented in Yahoo-vs-TickStream / SESSION_BOUNDARY notes.

### Provenance — failure as Karen stated it (BEFORE)

Prices are the **30,2xx reconstruction of this incident class** (user Last ~30226–30229). `21,xxx.xx` in the request was a placeholder and is **not** used.

```
Karen statement:
PDH was taken

PDH:
30280.50   (chart / Globex previous session high — what the trader saw)
           backend also able to emit taken against calendar PDH 30200.00

PDH status:
boolean taken=true
(misclassified: sell-side close < PDH on a HIGH; actual interaction UNTOUCHED)

Current price:
30226.50

Qualifying tick:
none that closes beyond 30280.50
(system used a 1m close below the high, e.g. Friday 07:3x ET bar close 30226.50)

Market snapshot:
unavailable on the failing path (no snapshotId)

Evidence:
no candle ID proving body close > PDH

Confidence:
unproven — must not be stated as fact
```

### Provenance — AFTER fix (same fixture)

```
Karen statement:
PDH was not confirmed taken

PDH:
30280.50

PDH status:
UNTOUCHED

Current price:
30226.50

Qualifying tick:
none

Market snapshot:
ms_* / <built_at ISO>

Evidence:
none

Confidence:
unproven
```

If this block cannot be filled with `CLOSED_BEYOND` + Globex 1m source + candle ID + tick timestamp/price, observation **`taken` is not true** and facts are not `swept`.

---

## Fixes (data layer only)

| Change | Where | Why |
|---|---|---|
| PDH/PDL/PDC from prior **CME Globex** 1m session (18:00 ET roll) | `lib/market-data.ts`, `lib/levels.ts` | Match TV futures PDH, not Yahoo calendar daily |
| Sweep only the matching side of a high/low | `lib/structure.ts:detectLiquiditySweeps` | Body close *beyond*, not “price is below the high” |
| Named statuses UNTOUCHED…CLOSED_BEYOND | `lib/level-interaction.ts`, observation levels | Stop collapsing to `taken=true` |
| `taken=true` only if `CLOSED_BEYOND` **and** provenance can be proved | `lib/observation-engine.ts` | Unproven ≠ fact |
| Yahoo-daily fallback PDH never `taken=true` | observation | Cannot prove Globex PDH |
| `snapshotId`, TV vs 1m bar close recorded (`m1BarClose`, `priceAgreement`) | `lib/market-state.ts`, `market-state-build.ts` | Provenance + disagreement, no silent-only last |
| PD interaction uses **current** Globex session bars | `buildStructureFacts` | Formation bar of PDH is not a “touch” of PDH |

Trading execution, Karen prompts, and EQH/EQL detector were not redesigned.

---

## Accuracy scorecard

| Field | Result | Notes |
|---|---|---|
| **PDH ACCURACY** | **PASS** (regression) / **PARTIAL** (live TV) | Globex 1m PDH + side-aware sweep. Live TV chart PDH not attached this session. |
| **PDL ACCURACY** | **PASS** (unit) | Same session model + low-side close-through. |
| **SESSION LEVEL ACCURACY** | **PARTIAL** | Asia/London/NY windows unchanged; Asia still uses local `setDate(-1)` for “yesterday” (ET risk). Sweep side now correct for `*_high` / `*_low`. |
| **SWING ACCURACY** | **PARTIAL** | MSS/REH swings unchanged; not re-audited beyond existing tests. |
| **MSS/BOS ACCURACY** | **PARTIAL** | MSS = 1m body close through swing (existing). **BOS: no separate detector** (documented). PIT poison on session high: PASS. |
| **FVG ACCURACY** | **PARTIAL** | Existing 1m FVG + PIT replay tests PASS. Not expanded this pass. |
| **EQH/EQL ACCURACY** | **PARTIAL** | Left to Aug 12 liquidity dump; not duplicated. Incremental EQH reuse still PASS. |
| **LIQUIDITY STATUS ACCURACY** | **PASS** for PDH/PDL named states | UNTOUCHED/TESTED/TOUCHED/BREACHED/CLOSED_BEYOND. `SWEPT` reserved (EQH wick ≠ PD body close). |
| **SWEEP STATUS ACCURACY** | **PASS** for PD highs/lows | Qualifying taken = `CLOSED_BEYOND` only. |
| **POINT-IN-TIME** | **PASS** | Future 99999 high excluded; research-replay 26/26; observation cutoff. |
| **LIVE/REPLAY PARITY** | **PASS** (synthetic) | Incremental ≡ full rebuild after interactions moved into `buildStructureFacts`. |
| **TRADINGVIEW/BACKEND AGREEMENT** | **FAIL** (this session) | No TV widget attach. User Last ~30226–30229 not independently read from the chart. Disagreement is now **recorded** (`priceAgreement.agree`, `tv_backend_price_disagree`) and not used to invent PDH taken. |
| **PROVENANCE** | **PASS** (dev path) | `formatPdhProvenanceBlock` + `snapshotId` + candle IDs. Cannot state PDH taken without proof. |
| **DETERMINISM** | **PASS** | Same OHLC → same PDH/PDL/status. |
| **SYMBOL/CONTRACT** | **PARTIAL** | `MNQU2026` → MNQ; Yahoo still **`MNQ=F`**, not the dated contract. Continuous vs front-month not solved. |
| **DATA QUALITY** | **PARTIAL** | Stale → no `taken=true`. Missing chart export still empties liquidity levels (pre-existing). |
| **HISTORICAL DATA READINESS** | **FAIL / blocked** | No multi-month TickStream/NinjaTrader dump in this pass. NinjaTrader ETH 1m Last needs **manual export**. Do not fabricate months. |
| **PERFORMANCE** | **MEASURED, not optimized** | `data/research/live-pipeline-profile.md`: `buildMarketContextAt` **~8.6 s** avg on NQ 1381 bars. Incremental quiet tick **0.73 ms** (synthetic). This pass added named-status classify on structure rebuild; incremental suite ~168 s wall. **No CPU optimization** (user: don’t optimize until measured — already measured; largest bottleneck remains full context rebuild, left alone). |

---

## Regression tests (1–14)

`npx tsx scripts/test-market-state-truth.ts` → **61 passed, 0 failed**

1. PDH untouched  
2. PDH touched  
3. PDH breached one tick (wick)  
4. PDH wick-through reject = BREACHED, not taken  
5. PDH close above = CLOSED_BEYOND, taken  
6. PDL TESTED / CLOSED_BEYOND  
7. Globex 18:00 ET session roll  
8. MNQU2026 → MNQ / Yahoo `MNQ=F`  
9. Stale → not taken=true  
10. Future-candle poison  
11. Live/replay PDH parity  
12. Duplicate closed bar  
13. Unsorted session aggregate  
14. Reconnect same PDH  

Tick size **0.25**.

Also: `test-observation-engine` ok, `test-session-liquidity` ok, `test-tickstream-historical-unit` 34/34, `test-research-replay` 26/26, `test-incremental-market-engine` ok, `npm run build` **PASS**.

---

## Live result

**Not compared to TradingView this session.** No chart screenshot pixels in-repo; no extension attach. User-reported Last ~30226–30229 and PDH visually above price is consistent with the reconstructed failure (price below Globex PDH, system still said taken). Yahoo 1m live dump was not completed in the eval harness (CJS top-level await). **Do not treat live TV agreement as PASS.**

---

## Replay result

Research replay PIT **PASS**. Incremental vs full **PASS** after structure facts own `levelInteractions`.

---

## TOP defects

1. **P0 (fixed):** PDH `taken=true` when Last is below PDH — sell-side close&lt;high applied to a high.  
2. **P0 (fixed):** PDH price from Yahoo calendar daily ≠ Globex previous session high.  
3. **P1 (mitigated):** Boolean `taken` hid UNTOUCHED vs BREACHED vs CLOSED_BEYOND.  
4. **P1 (open):** TV Last vs Yahoo/TickStream 1m close can differ; now flagged, not independently verified live.  
5. **P1 (open):** Yahoo `MNQ=F` vs TV `MNQU2026` / `MNQ1!` — not the same contract series.  
6. **P2 (open):** Asia “yesterday” via `Date#setDate` in local TZ.  
7. **P2 (open):** No BOS detector; MSS only.  
8. **P2 (open):** Full snapshot rebuild ~8.6 s (measured); not touched.  
9. **P2 (open):** Multi-month historical readiness blocked on NinjaTrader/TickStream export.

---

## Remaining risks

- Forming 1m bar: replay treats last included bar as complete OHLC; live last bar is incomplete Last. Parity holds for **same OHLC**, not for incomplete vs completed minute.  
- `detectLiquiditySweeps` lookback remains **40** 1m bars (existing). A close-beyond older than 40 minutes will not stay in the sweep list.  
- Chart overlay PDH line still depends on 1m being present for Globex; Yahoo-only fallback is `unknown` taken, not a confident taken.  
- Karen prompt text still *says* “taken” when observation `taken===true` — that is now gated on proof, not a wording patch.  
- **Production Vercel is still on the old side-blind detector** (`liquiditySweeps.pdh` `sell_side` at 30273.25). Live desk Karen hits prod, not this working tree, until deploy (not done).  
- TradingView Last was not attached this pass.

---

## Exact object that still fed Karen PDH=TAKEN (after the two-cause fix)

Traced at every stage on 2026-08-14. Authoritative PDH status is `structureFacts.levelInteractions.pdh` / `observation.liquidity.levels[PDH]`.

### LIVE production (what the desk actually calls)

`GET https://desk-copilor.vercel.app/api/levels` at 2026-08-14T12:05:33.614Z:

```
structureFacts.liquiditySweeps[0] =
  { levelId: "pdh", label: "Previous day high (PDH)", price: 30273.25, side: "sell_side", at: "07:55" }
```

**FIRST STAGE TAKEN: SWEEP RESULT** — old side-blind `close < PDH` still deployed. Labels still `Previous day high (PDH)`. Snapshot panel quoted PDH 30273.25; spoken was “market data unavailable” (quality UNAVAILABLE) so this path is the levels/structure JSON, not the snapshot one-liner.

### Local working tree (two-cause fix present, still not sufficient until this patch)

Same timestamp class, fixture PDH **30280.50** Last **30226.50**, and live Yahoo PDH **30273.25** Last **30259–30265.50**:

| Stage | Object | Result |
|---|---|---|
| RAW PDH / LAST | `ctx.daily.previousDayHigh` / `lastClose` | 30280.50 / 30226.50 (fixture); 30273.25 / 30265.50 (live 1m) |
| SESSION PDH | `pdhSource: cme_session_1m` | Globex 18:00 — **not** the false TAKEN |
| SWEEP RESULT | `structureFacts.liquiditySweeps` **pdh** | **empty** (side-aware) — PDH not taken here |
| LEVEL INTERACTION | `levelInteractions.pdh` | **UNTOUCHED** |
| MARKET STATE / OBS | `observation.liquidity.levels[PDH].taken` | **false** |
| **PATH OVERRIDE** | `liquiditySweeps` on **PDC/PDO/PDEQ/CDO** (`inferSweepSide` = both) + PDC in `highIds` | PDC `taken=true` because last closed **above previous close** |
| SNAPSHOT / FACTS | `buildObservationFacts` copies **every** sweep as `status: "swept"` | `[liquidity.sweep.pdc] Previous Day Close sweep: buy-side liquidity taken` |
| CONTEXT / KAREN INPUT | `formatIntelligenceForPrompt` + `formatStructureCompact` + `interpretation.reasoning` | “PDC taken… Close through a session/**PD high**” next to “Previous day high UNTOUCHED” |
| KAREN OUTPUT (deterministic `was PDH taken`) | `answerFromIntelligence` → `liquidity.pdh` | “previous day high: … — not swept.” |
| KAREN OUTPUT (LLM / mentor / DEEP) | playbook: prefer `liquiditySweeps`; sweeps include PDH/PDL/PDC | Model says **PDH was taken** from the override objects |

**FIRST STAGE that became TAKEN (local, after Globex+side-aware):** not PDH itself — **`structureFacts.liquiditySweeps` PDC/PDO** then **`observation-facts` `liquidity.sweep.*` `status=swept`**, which is what LIVE Karen’s LLM input actually contains.

Opposite-side close never marks the other PD level in `levelInteractions`. Production still can, via sell-side PDH sweep.

### What was changed (data layer only — no prompt/wording patch)

1. Sweepable pools only: PDH/PDL, session H/L, ORG, NDOG/NWOG. **Not** PDC/PDO/CDO/EQ/daily FVG mids.  
2. PDH/PDL remain in `liquiditySweeps` only if `levelInteractions` is **CLOSED_BEYOND**.  
3. `buildObservationFacts` will not emit `liquidity.sweep.pdh|pdl|pdc` unless observation `taken===true`.  
4. `formatStructureCompact` will not print PDH/PDL/PDC as “liquidity taken” without CLOSED_BEYOND.

`npx tsx scripts/test-market-state-truth.ts` → **68 passed**. Observation / session-liquidity / incremental suites ok.

---

## FINAL — live parity (2026-08-14)

Compared at one backend timestamp (Yahoo 1m via local `buildMarketContextAt`). TradingView widget **not attached**. Production API sampled separately (undeployed old detector).

**LIVE PRICE AGREEMENT:** FAIL / NOT RUN — no TV Last. Do not invent one. Backend last / current 1m close **30265.50** at ~08:08 ET (earlier sample **30259.00** at 08:05). Production snapshot did not return a live last (dataQuality UNAVAILABLE).

**PDH AGREEMENT:** PARTIAL — local Globex 1m PDH **30273.25** (`cme_session_1m`), last below it, status **UNTOUCHED**, KAREN INPUT/deterministic output **not swept**. Production `liquiditySweeps.pdh` still **sell_side taken** at the same **30273.25**. Chart PDH vs backend PDH not pixel-compared (TV missing). Calendar daily high matched Globex **30273.25** on this session (the 30280.50 reconstruction is the earlier incident class).

**PDL AGREEMENT:** PASS (local) — PDL **29780.50**, UNTOUCHED, last far above. No opposite-side close marking PDL taken.

**SESSION AGREEMENT:** PASS (definition) — `ny_pre`, Globex session keys `current=2026-08-14` `previous=2026-08-13`, symbol **MNQ=F** (Yahoo continuous; TV dated contract not attached).

**SWEEP SEMANTICS:** PASS (local, this case) — no 1m body close > PDH → not TAKEN; wick-through tests remain BREACHED; body close beyond still TAKEN. Production FAIL (sell-side PDH sweep).

**PROVENANCE:** PASS (local) — cannot prove taken → UNPROVEN / `taken!==true`. Production sweep object asserts taken without a qualifying close beyond.

**PASS/FAIL:** **FAIL** as market-truth validation. Local KAREN INPUT for 30280.50 / 30226.50 no longer contains PDH taken (verified). Live TV Last missing. Production still feeds `liquiditySweeps.pdh` sell_side to the live desk. Market-truth is not validated until that production object is gone and TV Last is compared at the same timestamp.

**Verdict:** The two-cause fix was not sufficient because a later object (`liquiditySweeps` on PDC + fact/prompt copy) still told Karen previous-day liquidity was taken. That override is removed in this tree. Production and TV attach are still red.
