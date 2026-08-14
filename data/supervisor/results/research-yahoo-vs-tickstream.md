# Research: Yahoo Finance vs TickStream/CME Historical Data

**Task ID:** research-yahoo-vs-tickstream  
**Agent:** Composer (subagent)  
**Status:** COMPLETE

## Question
Can Yahoo Finance historical data safely substitute for TickStream/CME tick-archive data in Karen **research** tooling (screening), or must TickStream remain the validation authority?

**Scope:** Research tooling only — no production Karen changes.

---

## DATA COVERAGE

| Dimension | Yahoo (`MNQ=F`) | TickStream/CME (`NQ`) |
|-----------|-----------------|------------------------|
| **1m history** | ~7 days (`fetchBars` / `fetchAllTimeframesForBacktest`) | Full archive (API-key gated; Aug 12 2026 session cached) |
| **5m / 15m** | 60 days | Derived from ticks (research loader) |
| **Daily** | 3 months | Derived from 1m (CME Globex 18:00 ET boundary) |
| **Overlap used** | Aug 11 22:00 UTC → Aug 12 22:00 UTC (1371 aligned minutes) | Fixture `nq-aug12-2026-cme` / `2562961408b256ac94f1` (1381 candles) |
| **Volume / OI** | Not returned by `lib/market-data.fetchBars` | Tick `size` aggregated (volume omitted from research schema intentionally) |
| **Instrument** | Continuous front-month `MNQ=F` | Root `NQ` CME ticks |

**Finding:** Only ~7 days of Yahoo 1m overlaps TickStream archive in practice. Prior probe (`tmp/nq-mnq-yahoo-validation.ts`) could not dual-validate Jul 2026 — Yahoo 1m window too short. Aug 12 2026 is the first viable overlap window with cached TickStream fixture.

**Price scale correction:** MNQ=F and NQ share **index-point price levels** (~29657), not NQ÷4. Prior `/4` scaling assumption in tmp probes was **wrong** for OHLC comparison. Research Yahoo loader uses scale=1.

---

## RESOLUTION

| | Yahoo | TickStream |
|---|-------|------------|
| Native resolution | Pre-aggregated 1m OHLC | Tick → `aggregateTicksTo1m` |
| Timestamp | Unix seconds, UTC minute open | Unix seconds, `floor(ts/60)*60` UTC |
| Timezone semantics | UTC buckets; EST used downstream | Same aggregation; CME session date in HTF |
| OHLC fidelity | Exchange-sourced aggregates (unknown tick inclusion) | Tick-built OHLC from CME prints |
| Adjusted vs unadjusted | Unadjusted index points | Raw tick prices |

**Overlap OHLC stats (1371 aligned minutes):**

| Metric | Value |
|--------|-------|
| Avg diff O/H/L/C | 0.45 / 0.42 / 0.41 / 0.48 pts |
| Max diff O/H/L/C | 5.25 / **14.75** / 7.50 / 11.75 pts |
| Within 0.25 pt | 56.9% |
| Within 1.0 pt | 93.7% |
| TS-only minutes | 10 |
| Yahoo-only minutes | 0 |

OHLC is **close but not tick-identical**. Max high diff 14.75 pts can flip swing/MSS detection at margin.

---

## RUNTIME

| Operation | Latency (this run) |
|-----------|-------------------|
| Yahoo 1m fetch + slice (Aug 12 session) | **781 ms** |
| Yahoo full backtest bundle (1m/5m/15m/daily) | **2914 ms** |
| TickStream Aug 12 fixture load | **~0 ms** (disk cache) |
| TickStream cold fetch (1381 bars, prior task) | ~minutes + API pagination |

Yahoo is **orders-of-magnitude faster** for ad-hoc screening when overlap exists. TickStream requires API key, chunked tick pagination, and one-time dataset build.

---

## DATA DIFFERENCES

### Missing / duplicate bars
- TickStream fixture: 60 missing minutes (SESSION_BOUNDARY_GAP WARNING — user-approved)
- Yahoo slice: 70 missing minutes (10 more than TS; includes globex boundary minutes TS retains)
- Duplicates: 0 both sources

### Session / maintenance gaps
- Both show ~60-min gap at CME session roll (Aug 12→13 boundary)
- Yahoo lacks 10 TS minutes (likely maintenance / thin-market minutes TS ticks captured)

### Futures contract / roll
- Yahoo `MNQ=F`: continuous front-month (roll logic opaque, back-adjust unknown)
- TickStream `NQ`: explicit CME root; month inferred from tick stream
- Aug 12 overlap shows **sub-point avg OHLC diff** → no roll discontinuity in window

### Reproducibility
- **TickStream:** Immutable dataset + `data_version` fingerprint → reproducible
- **Yahoo:** Live API; no version pin; re-fetch may drift slightly

---

## STRATEGY-RELEVANT DIFFERENCES

Replay probes at 6 cutoffs (globex open, pre-NY, NY+30m, mid-RTH, RTH close, session end):

| Feature | Match rate | Notes |
|---------|------------|-------|
| **FVG count** | **100%** | Count stable; levels may differ slightly |
| **Bias (dominant)** | **67%** | Diverges at session open (bullish vs neutral) |
| **MSS direction** | **50%** | Swings flip on 5–15 pt wick diffs |
| **Deterministic Karen @ NY open** | **MATCH** | Both LONG, same MSS text @ 09:29 ET |
| **Session H/L at cutoff** | Minor diffs | From OHLC drift |

### Cause analysis (not assuming diff = Yahoo wrong)
1. **Tick vs aggregate OHLC:** TS builds from prints; Yahoo from exchange 1m bars → wick differences up to 14.75 pts
2. **MSS sensitivity:** `detectMss` uses body close vs swing H/L over 80 bars — small wick shifts flip direction
3. **Bias stack:** HTF daily boundary conflict (EST calendar vs CME Globex) affects both sources equally in replay bridge, but missing-minute patterns differ
4. **Missing minutes:** 10 TS-only minutes remove/insert FVG windows differently (see `tmp/missing-minute-structure-audit.ts` pattern)

### Falsification context
Prior finding stands: replay `buildDeterministicKarenResponse` ≠ baseline Phase 1 pipeline. Yahoo comparison uses **same replay path** — NY open deterministic verdict **matches** on both sources, so Yahoo does not explain replay/baseline divergence. Baseline blocker remains `data_quality=missing` on historical chart snapshot.

---

## POINT-IN-TIME SAFETY

| | Yahoo | TickStream |
|---|-------|------------|
| Cutoff enforcement | ✓ via `ReplayDataCutoff` | ✓ |
| Future leak | ✓ No look-ahead in replay engine | ✓ |
| Archive immutability | ✗ Re-fetch may change | ✓ Cached dataset |
| `asOf` reproducibility | ✗ | ✓ Fingerprinted records |

**Classification:** Yahoo is **SAFE WITH LIMITATIONS** for ephemeral screening; **UNSAFE** as archival point-in-time authority.

---

## REPLAY COMPATIBILITY

| Use case | Yahoo | TickStream |
|----------|-------|------------|
| Load into research dataset | ✓ `loadDatasetFromYahoo` | ✓ `loadDatasetFromTickstream` |
| Replay bridge (m1/m5/m15/daily) | ✓ | ✓ |
| Validation layer | WARNING (70 missing min) | WARNING (60 missing min) |
| Record fingerprint stability | ✗ | ✓ |
| Baseline backtest (1381 bars) | Possible but unvalidated | ✓ Incremental runner ready |

New tooling (research-only):
- `lib/research/dataset/yahoo.ts` — Yahoo → research dataset loader
- `lib/research/dataset/compare-sources.ts` — OHLC + replay feature diff
- `npm run test:research-yahoo-vs-tickstream` — regression (6/6 PASS)

---

## RECOMMENDATION

### Architecture (evidence-based)
**Confirmed:** Yahoo = cheap/broad screening; TickStream/CME = high-fidelity validation.

### Per use case classification

| Use case | Verdict |
|----------|---------|
| HTF bias / daily structure screening (>7d) | **SAFE WITH LIMITATIONS** — Yahoo daily/15m ranges longer; boundary model conflicts documented |
| 1m intraday OHLC screening (≤7d) | **SAFE WITH LIMITATIONS** — 93.7% within 1pt; not tick-identical |
| MSS / swing structure confirmation | **SAFE WITH LIMITATIONS** — 50% direction match; validate on TS before trusting |
| FVG count / coarse gap scan | **SAFE** — 100% count match in overlap |
| Setup eligibility / baseline backtest | **UNSAFE on Yahoo alone** — use TickStream fixture + incremental baseline |
| Point-in-time record archive | **UNSAFE** — Yahoo only |
| Production Karen live path | **No change** — remains Yahoo for live; TickStream for snapshot fallback |

### Do not
- Replace TickStream validation with Yahoo for NQ baseline or record fingerprints
- Assume MNQ=F prices require ÷4 scaling (index points are shared)
- Run duplicate expensive baseline (incremental pilot `69ac13d9` may be active)

### Next research task
`research-baseline-historical-data-quality` (already in backlog) — align Phase 1 `data_quality` scoring at historical cutoff so baseline and replay paths become comparable before chunked NQ baseline.

---

## Tests & build

```
npm run test:research-yahoo-vs-tickstream  → 6/6 PASS
npm run build                              → PASS
```

## Confidence
**High** for OHLC proximity and architecture split; **Medium** for MSS/bias divergence rates (single-session sample).

STOP.
