# SESSION-BOUNDARY GOLDEN FIXTURE SPEC

**Read-only diagnostic specification** — derived from codebase as of 2026-08-13 (post audit `12b88aef`).  
**Purpose:** deterministic golden reference showing where four boundary models **diverge**. Does not pick a "correct" model.

**Probe script:** `tmp/session-boundary-probe.ts` (reproduces boundary-key columns below).

---

## Boundary models summary

| # | Model | Rule (code) | Primary functions |
|---|--------|-------------|-------------------|
| **M1** | **EST calendar day** | `en-CA` date in `America/New_York` | `getEstDateKey` — Yahoo daily filter, `sliceDailyForAsOf`, `buildFvgDailyBars`, session day keys, PDH/PDL path |
| **M2** | **CME 6 PM ET session day** | Minutes ≥ 18:00 ET → next calendar date key | `cmeSessionDateKey` — TickStream HTF daily from 1m |
| **M3** | **RTH anchors** | Open 09:30 ET (`RTH_OPEN_MIN`); close 16:15 ET (`RTH_CLOSE_MIN`) | `computeOrg`, `resolvePdLevelAnchorTimes` (PDC), CDO anchor preference |
| **M4** | **UTC candle buckets** | 1m: `floor(ts/60)*60`; HTF fixed: `floor(minuteTs/seconds)*seconds` | `MinuteAggregator`, `aggregateFixed` in `htf-aggregate.ts` |

**Weekly boundary (CME):** week starts **Sunday ≥ 18:00 ET** (`cmeWeekSundayKey`). No EST-calendar-week concept in `lib/`.

**Known cross-model conflicts (audit):** Sunday 18:00, Yahoo daily vs CME daily, Asia H/L `yesterday` key, NDOG vs Globex open semantics.

---

## Definition status legend

| Tag | Meaning |
|-----|---------|
| **EXPLICIT** | Named type/field + calculator in `lib/` |
| **INFERRED** | Derivable from related EXPLICIT code but no dedicated symbol |
| **UNDEFINED** | No implementation; fixture documents absence only |

---

## Fixture conventions

- **Instrument:** synthetic MNQ-like prices (~21000).
- **Timestamps:** ISO 8601 UTC unless noted.
- **m1 bar shape:** `{ "ts": "<ISO>", "o", "h", "l", "c" }`
- **yahooDaily bar shape:** `{ "ts": "<ISO noon anchor>", "o", "h", "l", "c" }` — `getEstDateKey(bar.time)` is the series key.
- **asOf:** evaluation instant for `buildMarketContextAt`-style slicing.
- **Min gap:** NDOG/NWOG null if spread < 0.25 pts.

---

## Scenario fixtures

### S1: Sunday 18:00 ET (CME week open / session rollover)

**Anchor `asOf`:** `2025-01-12T23:00:00.000Z` (Sun 18:00 ET, EST)

| Field | Value |
|-------|-------|
| ISO UTC | `2025-01-12T23:00:00.000Z` |
| EST calendar date (M1) | `2025-01-12` |
| CME session date (M2) | `2025-01-13` ← **rolls forward** |
| RTH session (M3) | Not RTH; Globex / Asia (`resolveSessionContext` → `asia`) |
| UTC 1m bucket (M4) | `2025-01-12T23:00:00.000Z` |
| CME week key | `2025-01-12` (Sun ≥ 18:00) |
| Weekly (M2) | Week `2025-01-12`; first bar of new CME week |

**Daily classification**

| Model | Bar containing 18:00 candle | "Completed prior day" for PD |
|-------|----------------------------|------------------------------|
| M1 EST | Still **Sun 2025-01-12** | Last Yahoo daily with key `< 2025-01-12` → **Fri 2025-01-10** |
| M2 CME | **Mon 2025-01-13** session (new day) | Prior CME session = **Sun 2025-01-12** evening + Fri Globex tail (not Yahoo Fri bar) |
| M3 RTH | N/A at 18:00 | PDC/ORG anchors use 16:15 / 9:30 on EST keys |
| M4 UTC | UTC date still **2025-01-12** | N/A |

**Minimal m1 sequence**

```json
[
  { "ts": "2025-01-10T21:14:00.000Z", "o": 21000, "h": 21010, "l": 20990, "c": 21005, "note": "Fri 16:14 RTH" },
  { "ts": "2025-01-10T21:15:00.000Z", "o": 21005, "h": 21015, "l": 21000, "c": 21010, "note": "Fri 16:15 PDC anchor" },
  { "ts": "2025-01-10T22:00:00.000Z", "o": 21010, "h": 21030, "l": 21005, "c": 21020, "note": "Fri 17:00 NWOG fri close anchor" },
  { "ts": "2025-01-12T23:00:00.000Z", "o": 21080, "h": 21090, "l": 21075, "c": 21085, "note": "Sun 18:00 asOf — week open" }
]
```

**yahooDaily (M1 series)**

```json
[
  { "ts": "2025-01-09T17:00:00.000Z", "o": 20980, "h": 21020, "l": 20970, "c": 21000 },
  { "ts": "2025-01-10T17:00:00.000Z", "o": 21000, "h": 21050, "l": 20950, "c": 21020 }
]
```

**Concept impact (at `asOf`)**

| Concept | Status | Expected (this fixture) | Source path |
|---------|--------|-------------------------|-------------|
| **PDH** | EXPLICIT | **21050** (Fri Yahoo H — M1 prior) | `sliceDailyForAsOf` → `prev.high` |
| **PDL** | EXPLICIT | **20950** (Fri Yahoo L) | same |
| **Daily FVG** | EXPLICIT | Depends on last 3 **EST** dailies (Thu/Fri/… wick triplets) | `buildFvgDailyBars` + `detectDailyFvgs` |
| **PWH** | UNDEFINED | — | — |
| **PWL** | UNDEFINED | — | — |
| **NWOG** | EXPLICIT | top **21080**, bottom **21020**, weekOpen **21080**, priorWeekClose **21020** | `computeNwog` — Fri 17:00 close → Sun 18:00 open |
| **NDOG** | EXPLICIT | top **21080**, bottom **21020** if first m1 on **Sun** calendar is 18:00 bar; **null** if first Sun m1 was earlier | `prevClose` (Fri Yahoo **21020**) vs `dayOpen` (first m1 on EST **Sun**) |

**Divergence:** M1 "today" = Sun; M2 session = Mon; NWOG fires at week boundary; NDOG may duplicate NWOG gap or differ if Sun had earlier m1 bars. TickStream CME daily H/L for "Mon session" starts at 18:00 bar — **≠** Yahoo Fri PDH.

---

### S2: Monday morning (09:30 ET RTH open)

**Anchor `asOf`:** `2025-01-13T14:30:00.000Z` (Mon 09:30 ET)

| Field | Value |
|-------|-------|
| EST calendar date | `2025-01-13` |
| CME session date | `2025-01-13` |
| RTH session | **RTH open** (`ny_am`, kill zone) |
| UTC bucket | `2025-01-13T14:30:00.000Z` |
| CME week | `2025-01-12` |
| `yesterday` key in `levels.ts` | `2025-01-12` (calendar −1 day, **not** `priorEstDateKey`) |

**Daily classification:** M1/M2 agree on `2025-01-13`. Prior completed Yahoo daily = **Fri 2025-01-10** (Sat/Sun skipped).

**Minimal m1 sequence**

```json
[
  { "ts": "2025-01-12T23:00:00.000Z", "o": 21080, "h": 21100, "l": 21070, "c": 21095, "note": "Sun 18:00 — EST Sun, CME Mon" },
  { "ts": "2025-01-13T05:00:00.000Z", "o": 21095, "h": 21110, "l": 21090, "c": 21105, "note": "Mon 00:00 — first m1 on EST Mon calendar" },
  { "ts": "2025-01-13T05:01:00.000Z", "o": 21105, "h": 21115, "l": 21100, "c": 21110, "note": "Mon 00:01 Asia tail" },
  { "ts": "2025-01-13T14:30:00.000Z", "o": 21150, "h": 21160, "l": 21140, "c": 21155, "note": "Mon 09:30 asOf — RTH open / CDO anchor" }
]
```

**Concept impact**

| Concept | Status | Expected | Notes |
|---------|--------|----------|-------|
| **PDH/PDL** | EXPLICIT | **21050 / 20950** (Fri Yahoo) | M1 prior daily |
| **Daily FVG** | EXPLICIT | EST daily series; Mon partial excluded until ≥30 m1 + EST ≥ 16:00 | `buildFvgDailyBars` |
| **PWH/PWL** | UNDEFINED | — | |
| **NWOG** | EXPLICIT | Still **21080–21020** gap (week `2025-01-12`) | Already formed Sun 18:00 |
| **NDOG** | EXPLICIT | top **21150**, bottom **21020** — **CDO = 21105** (first EST-Mon m1 @ 00:00), **not** 21150 | **Diverges from ICT Globex NDOG** (would use 18:00 Sun open) |
| **ORG** | EXPLICIT | close **21010** (Fri 16:15) → open **21150** (Mon 9:30) | `computeOrg` — separate from NDOG |

**Asia H/L bug surface:** `recentSessionBars` uses `yesterday=2025-01-12` → Asia = Sun 18:00–24:00 + Mon 00:00–01:00 only — **misses Mon 01:00–09:30**.

---

### S3: Friday close (16:15 ET — RTH close anchor)

**Anchor `asOf`:** `2025-01-10T21:15:00.000Z` (Fri 16:15 ET)

| Field | Value |
|-------|-------|
| EST / CME date | `2025-01-10` (both) |
| RTH | **Just closed** — 16:15 is `RTH_CLOSE_MIN`; `nyRth` window ends at 16:00 exclusive |
| Session id | `overnight` (16:15 ∉ ny_pm 13:30–16:00, ∉ ny_rth) |
| CME week | `2025-01-05` (prior Sun) |

**Minimal m1 sequence**

```json
[
  { "ts": "2025-01-10T20:59:00.000Z", "o": 21040, "h": 21055, "l": 21035, "c": 21050, "note": "Fri 15:59 RTH" },
  { "ts": "2025-01-10T21:00:00.000Z", "o": 21050, "h": 21060, "l": 21045, "c": 21055, "note": "Fri 16:00 — last RTH minute excluded from nyRth" },
  { "ts": "2025-01-10T21:14:00.000Z", "o": 21055, "h": 21065, "l": 21050, "c": 21060, "note": "Fri 16:14" },
  { "ts": "2025-01-10T21:15:00.000Z", "o": 21060, "h": 21070, "l": 21055, "c": 21065, "note": "Fri 16:15 asOf — PDC anchor" }
]
```

**Concept impact**

| Concept | Expected |
|---------|----------|
| **PDH/PDL** | Thu Yahoo H/L (prior completed) |
| **PDC** | **21065** @ 16:15 Fri (`findBarClosestTo(RTH_CLOSE_MIN)`) |
| **NWOG** | Not yet formed — needs Sun 18:00; `priorWeekClose` candidate = **21065** or **17:00 close 21070** |
| **NDOG** | For **Mon** eval only — Fri 16:15 is anchor for *prior* day ORG/PDC, not NDOG |
| **Daily FVG** | Fri bar incomplete on M1 until patched after 16:00 EST with ≥30 m1 |

**Divergence:** `dayFormationTime` uses **17:00 ET** for daily completion anchor vs PDC at **16:15**.

---

### S4: 16:00–16:15 ET (RTH end vs PDC anchor)

**Sub-fixtures:** same Thu 2025-01-09, prices flat 21000 for clarity.

| Sub | ISO UTC | EST min | In `nyRth` (09:30–16:00)? | PDC anchor? |
|-----|---------|---------|----------------------------|-------------|
| S4a | `2025-01-09T21:00:00.000Z` | 960 (16:00) | **No** (`960 < 960` false) | No |
| S4b | `2025-01-09T21:14:00.000Z` | 974 (16:14) | No | No |
| S4c | `2025-01-09T21:15:00.000Z` | 975 (16:15) | No | **Yes** (`RTH_CLOSE_MIN`) |

**Minimal m1 (shared)**

```json
[
  { "ts": "2025-01-09T21:00:00.000Z", "o": 21000, "h": 21005, "l": 20995, "c": 21002 },
  { "ts": "2025-01-09T21:14:00.000Z", "o": 21002, "h": 21008, "l": 21000, "c": 21006 },
  { "ts": "2025-01-09T21:15:00.000Z", "o": 21006, "h": 21012, "l": 21004, "c": 21010 }
]
```

**Concept impact:** NY RTH H/L **excludes** 16:00 bar; PDC/ORG use **16:15** close. **Diverges** inside same EST calendar day.

---

### S5: 18:00 ET rollover (Thu → Fri CME session)

| Sub | ISO UTC | EST date | CME session | Session id |
|-----|---------|----------|-------------|------------|
| S5a 17:59 | `2025-01-09T22:59:00.000Z` | `2025-01-09` | `2025-01-09` | `overnight` |
| S5b 18:00 | `2025-01-09T23:00:00.000Z` | `2025-01-09` | **`2025-01-10`** | `asia` |
| S5c 18:01 | `2025-01-09T23:01:00.000Z` | `2025-01-09` | `2025-01-10` | `asia` |

**Minimal m1**

```json
[
  { "ts": "2025-01-09T22:59:00.000Z", "o": 21000, "h": 21002, "l": 20998, "c": 21001 },
  { "ts": "2025-01-09T23:00:00.000Z", "o": 21050, "h": 21055, "l": 21045, "c": 21052, "note": "Globex open — CME day rolls" },
  { "ts": "2025-01-09T23:01:00.000Z", "o": 21052, "h": 21058, "l": 21050, "c": 21056 }
]
```

**Concept impact**

| Concept | S5a (17:59) | S5b (18:00) |
|---------|-------------|-------------|
| **M2 CME daily bucket** | Thu session | **Fri session** starts; open **21050** |
| **M1 EST "today" partial** | Thu m1 partial | Still Thu calendar; 18:00 bar counts toward **Thu** EST day |
| **NDOG (if eval Fri 9:30)** | — | Prior close Thu Yahoo vs Fri CDO — **misses 18:00 Thu gap** |
| **Daily FVG formation anchor** | — | `fvgFormationTime` → **18:00 ET** on displacement day (anchor only) |

**Divergence:** canonical **Thu vs Fri** split at exactly 18:00:00 ET.

---

### S6: Midnight ET

**Anchor `asOf`:** `2025-01-09T05:00:00.000Z` (Thu 00:00 ET)

| Field | Value |
|-------|-------|
| EST date | `2025-01-09` |
| CME session | `2025-01-09` (estMin 0 < 1080) |
| Session | `asia` |
| UTC bucket | `2025-01-09T05:00:00.000Z` (UTC date = EST date here) |

**Minimal m1**

```json
[
  { "ts": "2025-01-08T23:00:00.000Z", "o": 20990, "h": 21000, "l": 20985, "c": 20995, "note": "Wed 18:00" },
  { "ts": "2025-01-09T05:00:00.000Z", "o": 20995, "h": 21005, "l": 20990, "c": 21000, "note": "Thu 00:00 asOf" },
  { "ts": "2025-01-09T05:01:00.000Z", "o": 21000, "h": 21008, "l": 20998, "c": 21006 }
]
```

**Concept impact:** Asia H/L window = **Wed** 18:00–24:00 + **Thu** 00:00–01:00 (`yesterday=2025-01-08`). CME session unchanged at midnight. **M1 calendar day flips** at 00:00 but **M2 does not**.

---

### S7: DST spring forward (2025-03-09)

**US spring forward:** 02:00 EST → 03:00 EDT. **Missing wall hour:** 02:00–02:59 does not exist.

| Sub | ISO UTC | Wall clock ET | estMin | Notes |
|-----|---------|---------------|--------|-------|
| S7a | `2025-03-09T06:59:00.000Z` | 01:59 EST | 119 | Last minute before jump |
| S7b | `2025-03-09T07:00:00.000Z` | 03:00 EDT | 180 | `getEstMinutes` skips 120–179 |
| S7c | `2025-03-09T07:01:00.000Z` | 03:01 EDT | 181 | London session |

**Minimal m1**

```json
[
  { "ts": "2025-03-09T06:59:00.000Z", "o": 21000, "h": 21005, "l": 20998, "c": 21002 },
  { "ts": "2025-03-09T07:00:00.000Z", "o": 21010, "h": 21015, "l": 21008, "c": 21012 },
  { "ts": "2025-03-09T07:01:00.000Z", "o": 21012, "h": 21018, "l": 21010, "c": 21016 }
]
```

**Concept impact:** `barsInEstWindow(m1, 18*60, 2*60)` Asia wrap — **02:00–02:59 hole** on spring day; `findBarClosestTo(..., 18*60, dateKey)` still locates 18:00 prior evening. CME 18:00 rollover on Mar 9 uses **EDT** offset (23:00 UTC). **UNDEFINED:** no special DST branch — relies on `Intl` TZ DB.

---

### S8: DST fall back (2025-11-02)

**Repeated hour:** 01:00–01:59 occurs twice.

| Sub | ISO UTC | Occurrence | estMin |
|-----|---------|------------|--------|
| S8a | `2025-11-02T05:30:00.000Z` | 1st 01:30 EDT | 90 |
| S8b | `2025-11-02T06:30:00.000Z` | 2nd 01:30 EST | 90 |
| S8c | `2025-11-02T07:30:00.000Z` | 02:30 EST | 150 |

**Minimal m1 (different closes to expose ambiguity)**

```json
[
  { "ts": "2025-11-02T05:30:00.000Z", "o": 21000, "h": 21010, "l": 20995, "c": 21005, "note": "1st 01:30" },
  { "ts": "2025-11-02T06:30:00.000Z", "o": 21005, "h": 21015, "l": 21000, "c": 21008, "note": "2nd 01:30 — same estMin" },
  { "ts": "2025-11-02T07:30:00.000Z", "o": 21008, "h": 21020, "l": 21005, "c": 21018 }
]
```

**Concept impact:** `findBarClosestTo` / `findDayExtremeBar` may pick **either** 01:30 bar when target estMin=90 — **order-dependent**. UTC buckets differ (05:30 vs 06:30) so M4 disambiguates; M1/M3 estMin does not.

---

## Divergence matrix

| Scenario | EST day | CME day | PDH source | PDL source | FVG series | NWOG | NDOG | Diverges? |
|----------|---------|---------|------------|------------|------------|------|------|-----------|
| **S1** Sun 18:00 | Sun 01-12 | **Mon 01-13** | Fri Yahoo (M1) | Fri Yahoo | EST dailies | **Forms** 21020→21080 | May = NWOG or null | **YES** |
| **S2** Mon 09:30 | Mon 01-13 | Mon 01-13 | Fri Yahoo | Fri Yahoo | EST; Mon partial | Active | **00:00 open**, not 9:30 | **YES** |
| **S3** Fri 16:15 | Fri 01-10 | Fri 01-10 | Thu Yahoo | Thu Yahoo | Fri incomplete | Not yet | N/A | Mild (17:00 vs 16:15) |
| **S4** 16:00–16:15 | Thu 01-09 | Thu 01-09 | Wed Yahoo | Wed Yahoo | EST | — | — | **YES** (RTH vs PDC) |
| **S5** 18:00 roll | Thu 01-09 | **Fri 01-10** @ 18:00 | Wed Yahoo | Wed Yahoo | EST vs CME split | — | — | **YES** |
| **S6** midnight | Thu 01-09 | Thu 01-09 | Wed Yahoo | Wed Yahoo | EST | — | — | **YES** (Asia window) |
| **S7** DST spring | Mar 9 | Mar 9 | — | — | EST | — | — | **YES** (missing hour) |
| **S8** DST fall | Nov 2 | Nov 2 | — | — | EST | — | — | **YES** (duplicate estMin) |

---

## Concept definitions status

| Concept | Status | Source |
|---------|--------|--------|
| **PDH** | EXPLICIT | `sliceDailyForAsOf` → `prev.high`; anchor `findDayExtremeBar(m1, priorEstKey, "high")` |
| **PDL** | EXPLICIT | `prev.low`; anchor `findDayExtremeBar(..., "low")` |
| **Daily FVG** | EXPLICIT | `detectDailyFvgs(buildFvgDailyBars(...))` — **EST daily series**, no 3pt min |
| **PWH** | UNDEFINED | No calculator; CME week exists but unused |
| **PWL** | UNDEFINED | No calculator |
| **NWOG** | EXPLICIT | `computeNwog` — Fri close (17:00 or 16:15) → Sun 18:00 open; CME week |
| **NDOG** | EXPLICIT | `computeHtfPdArrays` — Yahoo `prev.close` vs first EST-calendar-day m1 open (≥0.25 gap) |
| **ORG** | EXPLICIT (related) | `computeOrg` — prior 16:15 → today 9:30; not same as NDOG |
| **PDC** | EXPLICIT (related) | Prior daily close; anchor 16:15 ET |
| **CDO** | EXPLICIT (related) | First m1 on EST today; 9:30 anchor in `resolvePdLevelAnchorTimes` |
| **Weekly FVG** | UNDEFINED | `aggregateWeekly` OHLC only |
| **CME daily H/L** | INFERRED | `aggregateDaily` in TickStream — not wired to PDH/PDL |

---

## Implementation mapping

| Fixture eval step | Function | Module |
|-------------------|----------|--------|
| EST date key | `getEstDateKey` | `market-data.ts` |
| CME session key | `cmeSessionDateKey` | `htf-aggregate.ts` |
| CME week key | `cmeWeekSundayKey` | `market-data.ts` |
| 1m UTC bucket | `minuteBucket` / `floor(ts/60)*60` | `aggregate.ts` |
| HTF 5m/15m/1H/4H bucket | `aggregateFixed` | `htf-aggregate.ts` |
| HTF daily bucket | `aggregateDaily` | `htf-aggregate.ts` |
| HTF weekly bucket | `aggregateWeekly` | `htf-aggregate.ts` |
| Prior Yahoo daily | `sliceDailyForAsOf` | `levels.ts` |
| PDH / PDL / NDOG bundle | `computeHtfPdArrays` | `pd-arrays.ts` |
| Daily FVG detect | `detectDailyFvgs`, `filterUnfilledDailyFvgs` | `pd-arrays.ts` |
| Daily FVG input bars | `buildFvgDailyBars` | `market-data.ts` |
| NWOG | `computeNwog` | `market-data.ts` |
| ORG | `computeOrg` | `levels.ts` |
| Session bucket | `resolveSessionContext` | `sessions.ts` |
| Asia/London/NY H/L windows | `recentSessionBars`, `barsInEstWindow` | `levels.ts` |
| PD anchor times | `resolvePdLevelAnchorTimes` | `market-data.ts` |
| End-to-end | `buildMarketContextAt` | `levels.ts` |

---

## Suggested golden-test harness (future, not implemented)

1. Load fixture JSON: `{ id, asOf, m1[], yahooDaily[], expected: { boundaries, concepts } }`.
2. Assert boundary keys via imported pure functions (no Yahoo fetch).
3. Optionally run `buildMarketContextAt` with synthetic `data` object.
4. Compare **divergence flags** rather than single "correct" PD values when models disagree.

---

*Read-only spec. No production logic modified.*
