# Research: Yahoo 60d HTF screening vs TickStream overlap

**Task ID:** research-yahoo-screening-pilot  
**Agent:** Composer (subagent)  
**Status:** COMPLETE  
**Verify:** `npm run test:research-yahoo-vs-tickstream` → **12/12 PASS** (exit 0)

## Question
Can Yahoo native daily/15m (60d) be used as a cheap HTF bias/MSS **screening** layer against TickStream overlap windows, and what is the divergence rate?

**Scope:** Research tooling only. Did **not** replace TickStream validation. Did **not** run full NQ baseline.

---

## DATA USED

| Source | Window | Bars |
|--------|--------|------|
| Yahoo 15m (`loadDatasetFromYahoo` 60d) | ~2026-06-04 → 2026-08-13 | 4578 |
| Yahoo 5m (60d) | same | 13665 |
| Yahoo daily (3mo) | 64 calendar days | 64 |
| Yahoo 1m (7d) | ~last 7d | 7140 (5121 inside week window) |
| TickStream week fixture `nq-week-aug05-aug12-2026-cme` | 2026-08-05T22:00Z → 2026-08-12T22:00Z | 6880 1m |
| TickStream Aug 12 fixture (regression) | 2026-08-11T22:00Z → 2026-08-12T22:00Z | 1381 1m |

**Overlap for dual-source HTF compare:** five complete CME sessions **2026-08-06, 07, 10, 11, 12**. Last TS daily bar (session 2026-08-13 globex stub) dropped as partial.

Yahoo 1m still only covers ~7d, so MSS on the 60d scan is mostly unavailable. 15m/daily screening does not need 1m.

---

## METHOD

1. `loadDatasetFromYahoo` for 1m/5m/15m/daily (no TickStream API).
2. `compare-sources`: 15m OHLC (TS-derived from 1m vs Yahoo native 15m, UTC 900s buckets); daily OHLC keyed by CME session date vs Yahoo calendar date.
3. Fast HTF bias/MSS at NY 09:30 ET (`compareHtfBiasAtTimestamps` / truncated lookbacks — not full-week ReplayEngine).
4. Yahoo-only 60d bias histogram at NY 09:30 (49 weekdays with 15m coverage).

TickStream remains the validation authority. Yahoo is screening-only.

---

## 15m OHLC (week overlap)

| Metric | Value |
|--------|-------|
| Aligned 15m bars | **460** (TS-only 1, Yahoo-only 0) |
| Avg diff O/H/L/C | 0.63 / 0.62 / 0.89 / **0.69** pts |
| Max diff O/H/L/C | 10.75 / 14.75 / 29.00 / **23.75** pts |
| Within 0.25 pt | 49.2% |
| Within 1.0 pt | **87.0%** |

**Finding:** Native Yahoo 15m is close to tick-derived 15m on overlap. Slightly worse than 1m (93.7% within 1pt on Aug 12) but usable for coarse HTF range/bias.

---

## Daily OHLC (session-date match, complete sessions only)

| Metric | Value |
|--------|-------|
| Matched dates | 2026-08-06, 07, 10, 11, 12 |
| Avg diff O/H/L/C | 3.10 / 0.40 / 0.50 / **23.25** pts |
| Max close diff | **47.50** pts |
| Within 1.0 pt | 55.0% |

**Cause:** Yahoo daily = calendar/exchange day. TickStream daily = CME Globex 18:00 ET session. High/low can match (session extremes) while **close diverges** because the buckets end at different times. Including the Aug 13 globex stub previously inflated max high to 442 pts — that bar is not a complete session.

**Finding:** Yahoo daily is **not** a drop-in Globex daily. Close diffs of 20–50 pts are enough to flip PD-array daily bias.

---

## HTF bias / MSS divergence (NY 09:30, n=5 overlap days)

TS = HTF derived from TickStream 1m. Yahoo = **native** 15m/5m/daily (+ 1m when present).

| Date | Daily TS/Y | 15m TS/Y | Dominant TS/Y | MSS TS/Y |
|------|------------|----------|---------------|----------|
| 2026-08-06 | bearish/**bullish** | bearish/**bullish** | bearish/**bullish** | bearish/**null** |
| 2026-08-07 | bearish/**bullish** | bullish/bullish | neutral/**bullish** | bearish/bearish |
| 2026-08-10 | bullish/**bearish** | bearish/bearish | bearish/bearish | bullish/**null** |
| 2026-08-11 | bullish/bullish | neutral/neutral | neutral/neutral | bearish/bearish |
| 2026-08-12 | bullish/bullish | bullish/bullish | bullish/bullish | bullish/bullish |

| Feature | Match | **Divergence** |
|---------|-------|----------------|
| Daily bias | 40% (2/5) | **60%** |
| 15m bias | 80% (4/5) | **20%** |
| Dominant bias | 60% (3/5) | **40%** |
| MSS direction | 60% (3/5) | **40%** |

Aug 11–12 agree on all four fields. Earlier sessions (especially daily) diverge. MSS `null` on Yahoo for Aug 6/10 is 1m coverage / lookback, not a directional flip.

**Aug 12 1m replay probes (prior task, reconfirmed):** bias 67% match, MSS 50%, FVG count 100%; deterministic Karen @ NY open **LONG/LONG**.

---

## Yahoo-only 60d HTF scan @ NY 09:30

Screening product if Yahoo were used alone (no TickStream). **Not validated** outside the 5-day overlap.

| | Count |
|--|-------|
| Sample days | 49 (2026-06-04 → 2026-08-13) |
| Daily bias | bullish **47**, bearish **2**, neutral 0 |
| 15m bias | bullish 19, bearish 26, neutral 4 |
| MSS | bull 1, bear 3, none 45 (1m only on last ~5 days) |

Yahoo daily bias is almost always bullish over this 60d window. Overlap shows that label is **wrong vs Globex daily on 3/5 days**. A 60d Yahoo-daily screen would over-count bullish HTF days.

15m bias is mixed (roughly even bull/bear) and only 20% divergent vs TS on overlap — better screening signal than daily.

---

## RUNTIME

| Operation | This run |
|-----------|----------|
| Yahoo 1m Aug12 slice | 547 ms |
| Yahoo HTF bundle (1m+5m+15m+daily `loadDatasetFromYahoo`) | **14.6 s** |
| TickStream fixtures | disk |
| Full verify script | **12/12 PASS**, ~208 s wall (Yahoo fetches dominate after Aug12 probes) |

Did not fetch TickStream ticks. Did not run baseline.

---

## TOOLING (research-only)

- `lib/research/dataset/yahoo.ts` — `yahooBarsToCandles`, `datasetFromYahooBars` (reuse fetched bars)
- `lib/research/dataset/compare-sources.ts` — `compareCandleOhlc`, `htfCandlesFromDataset`, `compareDailyBySessionDate`, `compareHtfBiasAtTimestamps`, truncated-lookback `htfContextAtCutoff`
- `scripts/test-research-yahoo-vs-tickstream.ts` — 60d screening section (verify script)

---

## RECOMMENDATION

| Use case | Verdict |
|----------|---------|
| Yahoo **15m** 60d HTF range / 15m-bias screen | **SAFE WITH LIMITATIONS** — 87% of overlap 15m closes within 1pt; 15m bias divergence **20%** (n=5) |
| Yahoo **daily** HTF / PD daily bias screen | **UNSAFE vs Globex** — calendar vs 18:00 ET; daily bias divergence **60%**; 60d Yahoo daily is 47/49 bullish and disagrees with TS on overlap |
| Dominant bias stack (D+15m+5m) | **SAFE WITH LIMITATIONS** — 40% divergence; confirm on TickStream before acting |
| MSS screening | **UNSAFE on Yahoo 60d** — 1m only ~7d; 40% MSS divergence even where 1m overlaps |
| Setup eligibility / baseline / fingerprints | **UNSAFE on Yahoo** — TickStream remains authority |
| Production Karen | **No change** |

### Do not
- Replace TickStream validation with Yahoo for NQ baseline or records
- Treat Yahoo daily close as CME session close
- Trust a 60d Yahoo-daily bullish majority without Globex daily rebuild

### Next
Queued `research-nq-load-week-tickstream` is already on disk (`nq-week-aug05-aug12-2026-cme`). Wider TickStream overlap (beyond one week) is required before tightening the 20%/60% divergence estimates (n=5 is small).

## Confidence
**High** for 15m OHLC proximity and daily bucket mismatch. **Medium** for bias/MSS rates (five NY-open samples).

STOP.
