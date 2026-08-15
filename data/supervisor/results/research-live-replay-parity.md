# Live vs replay parity audit

**Date:** 2026-08-14  
**Dataset:** TickStream NQ CME fixtures — `nq-week-aug05-aug12-2026-cme` (Aug 5–12, prior Globex sessions) and `nq-aug12-2026-cme` (session-only Aug 12). No Aug 13/14 replay fixtures in repo.  
**Question:** Given identical market data available up to timestamp T, do the production live builder and the research replay builder emit the same structured state?  
**Not in scope:** Karen prompt redesign, trading-logic fixes, commit/push/deploy, live TV attach.

Live arm = production `IncrementalMarketEngine` path (`buildDeskMarketIntelligence` / `GET /api/levels`). Replay arm = `ReplayDataCutoff` / `ReplayEngine`. Both converge on `buildMarketContextAt` when fed the same PIT inputs.

---

## PARITY: PASS

**Test:** `72 passed, 0 failed` — `npm run test:live-replay-parity`  
**Live-fresh ≡ replay-cutoff:** 13/13 cutoffs across both fixtures.

**Note:** PASS on available TickStream fixtures. Live TV/Yahoo attach not done — production-only data forks (Yahoo vs CME tickstream, 45s cache, forming Last) remain unverified end-to-end.

---

## FIRST DIVERGENCE

| Field | Value |
|---|---|
| **Cutoff** | NY open 09:30 ET (2026-08-12T13:30:00.000Z) |
| **Stage** | PIT-correct HTF vs pre-aggregated feed (both paths agree on wrong bucket) |
| **LIVE** | pre-aggregated 5m/15m FVG fingerprint |
| **REPLAY** | same as live (shared leak) |
| **EXPECTED** | aggregateHtfFrom1m(m1≤T) only |
| **ROOT CAUSE** | researchDatasetToReplayMarketData aggregates full series then sliceBarsAt keeps forming bucket with future minutes |



---

## Per-category (live-initialize vs replay-cutoff)

| Category | Fields compared | Result |
|---|---|---|
| **PDC** | `previousDayClose`, `pdcFormedAt`, `pdhSource` | PASS — live ≡ replay at all cutoffs; week NY open uses `cme_session_1m`; aug12-only uses `yahoo_daily_fallback` until session end |
| **PDH / PDL** | prior-session H/L, `pdhSource`, CDH/CDL | PASS |
| **LIQUIDITY** | `levelInteractions`, REH/REL, sweeps | PASS |
| **STRUCTURE** | MSS, BOS (unused), 1m/5m/15m FVG, HTF/LTF H/L+bias | PASS |
| **MARKET CONTEXT** | session id, AMD, Asia/London/NY pre/RTH H/L, premium/discount, ORG, NWOG, bias stack | PASS |
| **DECISION INPUTS** | `fingerprintKarenInput`, `fingerprintEnvelope`, verdict/entry/invalidation/target | PASS |

### PDC cross-check (Aug 13/14 — separate provenance audit)

Repo has **no** Aug 13/14 TickStream replay fixtures. PDC price for live Aug 14 context verified separately in `research-pdc-level-provenance.md`:

| Property | Value |
|---|---|
| Correct PDC | **30216.25** (Globex prior-session last 1m @ 16:59 ET Thu) |
| Wrong (Yahoo) | 30188.50 — must not be used when `pdhSource=cme_session_1m` |
| Live vs replay on fixtures | Both paths emit same PDC from same `sliceDailyForAsOf` / `sessionCloseBar` at every tested cutoff |

PDC **interaction status** (TAKEN vs UNTOUCHED) is a separate documented gap — see `research-pdc-status-verification.md`. Not a live↔replay path fork.

---

## POINT-IN-TIME: PARTIAL

| Layer | PIT-safe? | Notes |
|---|---|---|
| **1m bars** | **PASS** | `ReplayDataCutoff.assertNoFutureLeak`; poison bar after T excluded on both paths |
| **PDH/PDL (week fixture)** | **PASS** | `cme_session_1m` from prior Globex session |
| **PDH/PDL (aug12-only early)** | **PARTIAL** | `yahoo_daily_fallback` daily bar can embed later-session OHLC |
| **Pre-aggregated 5m/15m/D** | **FAIL vs PIT-HTF** | Forming bucket includes minutes after T — live-initialize and replay-cutoff **share** this leak |
| **PIT-HTF re-agg** | Reference | `aggregateHtfFrom1m(m1≤T)` — differs from pre-agg at 3 sampled cutoffs |

- **NY open 09:30 ET** (2026-08-12T13:30:00.000Z): fvg15m: bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis ≠ bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis
- **NY open 09:30 ET** (2026-08-12T13:30:00.000Z): pdc: 29976.25 ≠ 29805.75; fvg15m: bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis ≠ bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis; sweeps: ndog_top:buy_side:29976.25:1786541340|ndog_bot:buy_side:29657.75:1786541400|asia ≠ ndog_top:buy_side:29805.75:1786541400|ndog_bot:buy_side:29657.75:1786541400|asia; liquidity: asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h ≠ asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h; karenFp: bullish|29976.25|bullish:29981.75:1786541340|Bullish MSS — body close above swin ≠ bullish|29976.25|bullish:29981.75:1786541340|Bullish MSS — body close above swin
- **NY 09:32 ET (mid-5m)** (2026-08-12T13:32:00.000Z): pdc: 29898.75 ≠ 29805.75; sweeps: ndog_top:buy_side:29898.75:1786541460|ndog_bot:buy_side:29657.75:1786541520|asia ≠ ndog_top:buy_side:29805.75:1786541520|ndog_bot:buy_side:29657.75:1786541520|asia; liquidity: asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h ≠ asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h; karenFp: bullish|29898.75|bearish:29959.75:1786541520|Bearish MSS — body close below swin ≠ bullish|29898.75|bearish:29959.75:1786541520|Bearish MSS — body close below swin

Poison test (99999 high 2 min after 09:32): 1m CDH excludes poison on both paths; PIT 5m excludes; pre-aggregated 5m may include same-bucket poison.

---

## Pipeline trace (both paths)

```
RAW DATA → SESSION → LEVELS → STRUCTURE → LIQUIDITY → MARKET CONTEXT → DECISION INPUTS
   │           │         │          │            │              │                  │
TickStream   activeSession  PDH/PDL/   MSS/FVG/    levelInteractions  biasStack/     runDeskPipeline
1m+HTF       AMD phase      PDC/CDH    REH/REL     liquiditySweeps    premiumDisc    buildDecisionEnvelope
```

Both arms: `IncrementalMarketEngine.fullRebuild` or `ReplayDataCutoff.buildContext` → `buildMarketContextAt` → `buildMarketState` → `runDeskPipeline`.

---

## Week fixture (`nq-week-aug05-aug12-2026-cme`)

| Cutoff | EST | ISO | idx | px | session | PDC | PDH | PDL | pdhSource | MSS | verdict | live≡replay | PIT-HTF vs preagg |
|---|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|---|
| NY open 09:30 ET | 09:30 | 2026-08-12T13:30:00.000Z | 6429 | 29976.25 | ny_am | 29646.75 | 29886.75 | 29533.5 | cme_session_1m | bullish | WAIT | YES | 1 diffs |

---

## Session-only fixture (`nq-aug12-2026-cme`)

1381 1m bars, 2026-08-11T22:00Z–2026-08-12T22:00Z.

| Cutoff | EST | ISO | idx | px | session | PDC | PDH | PDL | pdhSource | MSS | verdict | live≡replay | PIT-HTF vs preagg |
|---|---|---|---:|---:|---|---:|---:|---:|---|---|---|---|---|
| Globex open 18:00 ET | 18:00 | 2026-08-11T22:00:00.000Z | 0 | 29647.5 | asia | 29647.5 | 29647.5 | 29647.5 | yahoo_daily_fallback | none | NO_TRADE | YES | equal |
| Asia 21:00 ET | 21:00 | 2026-08-12T01:00:00.000Z | 180 | 29666.5 | asia | 29666.5 | 29666.5 | 29666.5 | yahoo_daily_fallback | none | LONG | YES | equal |
| London open 02:00 ET | 02:00 | 2026-08-12T06:00:00.000Z | 480 | 29719.75 | london | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bullish | WAIT | YES | equal |
| London KZ 04:00 ET | 04:00 | 2026-08-12T08:00:00.000Z | 600 | 29753.5 | london | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bullish | WAIT | YES | equal |
| NY pre 08:00 ET | 08:00 | 2026-08-12T12:00:00.000Z | 840 | 29847 | ny_pre | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bullish | WAIT | YES | equal |
| NY open 09:30 ET | 09:30 | 2026-08-12T13:30:00.000Z | 930 | 29976.25 | ny_am | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bullish | WAIT | YES | 5 diffs |
| NY 09:32 ET (mid-5m) | 09:32 | 2026-08-12T13:32:00.000Z | 932 | 29898.75 | ny_am | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bearish | WAIT | YES | 4 diffs |
| NY AM 10:00 ET | 10:00 | 2026-08-12T14:00:00.000Z | 960 | 29900.75 | ny_am | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bearish | WAIT | YES | equal |
| Midday 12:00 ET | 12:00 | 2026-08-12T16:00:00.000Z | 1080 | 29848 | overnight | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bullish | WAIT | YES | equal |
| NY PM 14:00 ET | 14:00 | 2026-08-12T18:00:00.000Z | 1200 | 29904.25 | ny_pm | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bearish | WAIT | YES | equal |
| RTH close 16:00 ET | 16:00 | 2026-08-12T20:00:00.000Z | 1320 | 29862.75 | overnight | 29805.75 | 30001.75 | 29624.5 | yahoo_daily_fallback | bearish | WAIT | YES | equal |
| Session last bar | 18:00 | 2026-08-12T22:00:00.000Z | 1380 | 29829.25 | asia | 29805.75 | 30001.75 | 29624.5 | cme_session_1m | bullish | WAIT | YES | equal |

---

## Code forks (architecture — not live≠replay mismatches on fixtures)

| Fork | Live | Replay | Same inputs → same state? |
|---|---|---|---|
| Context builder | `IncrementalMarketEngine.fullRebuild` → `buildMarketContextAt` | `ReplayDataCutoff.buildContext` → `buildMarketContextAt` | **Yes** at T |
| Incremental cache | `syncSeries`; fullRebuild when HTF length changes | Full rebuild every snapshot | Forward sync ≡ fresh |
| 1m tick path | `applyClosedBar` — 1m structure only | N/A | **Diverges** until HTF fullRebuild |
| HTF series | Yahoo forming bar (minutes ≤ now) | Pre-agg full series + slice | **Look-ahead** in research buckets |
| PDC source | Globex `sessionCloseBar` when prior 1m present | Same `sliceDailyForAsOf` | **Yes** on fixtures |
| Yahoo vs TickStream | Live `MNQ=F` | Research NQ CME | **Data** fork — do not mix |
| Quality / stale | `scoreChartQuality(Date.now())` | PIT asOf in research snapshot | Freshness fork only |
| BOS | `structure-state.bos = null` | MSS only | Both omit BOS |

---

## REGRESSION TESTS

| Test | Status | Notes |
|---|---|---|
| `npm run test:live-replay-parity` | PASS | Extended: PDC, liquidity fingerprint, HTF/LTF, DecisionEnvelope |
| `scripts/test-market-state-truth.ts` | prior **85/0** | PDC 30216.25 Globex ≠ Yahoo 30188.50 |
| New tests for trading logic | **none added** | No live≠replay divergence found — documented forks only |

---

## Notes from this run

- aug12 session-only NY open 09:30 ET: PIT-HTF ≠ preagg (5) pdc: 29976.25 ≠ 29805.75; fvg15m: bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis ≠ bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis; sweeps: ndog_top:buy_side:29976.25:1786541340|ndog_bot:buy_side:29657.75:1786541400|asia ≠ ndog_top:buy_side:29805.75:1786541400|ndog_bot:buy_side:29657.75:1786541400|asia; liquidity: asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h ≠ asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h; karenFp: bullish|29976.25|bullish:29981.75:1786541340|Bullish MSS — body close above swin ≠ bullish|29976.25|bullish:29981.75:1786541340|Bullish MSS — body close above swin
- aug12 session-only NY 09:32 ET (mid-5m): PIT-HTF ≠ preagg (4) pdc: 29898.75 ≠ 29805.75; sweeps: ndog_top:buy_side:29898.75:1786541460|ndog_bot:buy_side:29657.75:1786541520|asia ≠ ndog_top:buy_side:29805.75:1786541520|ndog_bot:buy_side:29657.75:1786541520|asia; liquidity: asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h ≠ asia_high:CLOSED_BEYOND|asia_low:UNTOUCHED|cdeq:UNTOUCHED|cdo:UNTOUCHED|london_h; karenFp: bullish|29898.75|bearish:29959.75:1786541520|Bearish MSS — body close below swin ≠ bullish|29898.75|bearish:29959.75:1786541520|Bearish MSS — body close below swin
- week Aug5–12 PDH/PIT NY open 09:30 ET: PIT-HTF ≠ preagg (1) fvg15m: bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis ≠ bullish:29697.00:29690.00:1786513500|bullish:29748.25:29744.00:1786521600|bullis
- FORK/LOOK-AHEAD: pre-aggregated 5m/15m/D buckets whose start ≤ T include 1m after T (forming-bucket OHLC). Live Yahoo forming HTF does not. Locked by test — research replay-bridge aggregates full series then slices by bucket start.
- FORK: applyClosedBar updates 1m structure + session extremes only; 5m/15m FVG and HTF high/low stay at initialize-time until HTF length change triggers fullRebuild.
- FORK: live chart quality uses Date.now() (stale, lastBarAgeSec=231323); research snapshot scores freshness at cutoff T (good). Observation can mark PDH taken=unknown when quality is stale. Not a detector mismatch.
- Week PDH=29886.75 (cme_session_1m); aug12-only PDH=30001.75 (yahoo_daily_fallback). Same builders; different lookback. aug12-only starts at Globex open so previous session is missing → daily fallback. Daily pre-aggregated from the same session can embed later-session OHLC (look-ahead) when used as PDH.
- BOS: IncrementalMarketEngine.snapshotStructureState sets bos=null. Live and replay both expose MSS via structureFacts.mss only. Not a path fork.

---

## Production gaps (not fixture failures)

1. Yahoo 5m/15m/1d vs CME-session 1m / TickStream
2. Forming-minute Last vs completed 1m close
3. 45s Yahoo bar cache + tick overlay
4. Wall-clock stale gates on TV export
5. Research pre-aggregated HTF look-ahead vs live forming HTF

No trading-logic changes. No commit / push / deploy.
