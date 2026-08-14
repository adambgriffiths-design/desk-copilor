# Mentor Minute Replay — Layer 1 (Full Resolution)

**Dataset:** `nq-week-aug05-aug12-2026-cme`
**Generated:** 2026-08-14T02:18:29.557Z

## Methodology

- **Layer 1 (this report):** Phase 1 pipeline at **every 1-minute cutoff** — point-in-time only.
- **Layer 2 (not run):** 10-criterion mentor rubric on Layer 1 episodes only — not a substitute for minute replay.
- **Do NOT** conclude unresponsiveness from 15–30 min checkpoint sampling alone.

## Benchmark — Aug 12 (1 CME day)

**Day benchmark fixture:** `nq-aug12-2026-cme` (full CME session, every 1m bar)

### CME session 2026-08-12

- Evaluations: **1,321** | Runtime: **5565.7s** (4213.3 ms/eval)
- Range: 2026-08-11T23:00:00.000Z → 2026-08-12T22:00:00.000Z
- Verdict transitions: **94** | entry ACTIVE windows: **100** (226 min) | setup-eligible: **37** (90 min)
- Structure / bias / session changes: **63** / **115** / **7**
- Responsive: **YES** — 94 verdict transition(s) at native 1m resolution (e.g. WAIT→LONG @ 23:21Z, LONG→WAIT @ 23:25Z, WAIT→LONG @ 00:19Z); 100 entryStatus ACTIVE window(s), 226 total minutes; 37 setup-eligible window(s), 90 total minutes; 63 structure change(s)
- Poison test: ✅ PASS — point-in-time preserved — 14 snapshots unchanged before poison at 2026-08-11T23:14:00.000Z


## Week run

- Full week **not executed** — extrapolated runtime ~**483.1 min** (cap 20 min).
- Extrapolation: 4213.3 ms/eval × week m1 bars.
- Re-run with `--full-week` to force complete week replay.


## Primary responsiveness verdict

**Karen IS responsive** — minute replay detected state transitions and/or actionable windows at native 1m resolution.

94 verdict transition(s) at native 1m resolution (e.g. WAIT→LONG @ 23:21Z, LONG→WAIT @ 23:25Z, WAIT→LONG @ 00:19Z); 100 entryStatus ACTIVE window(s), 226 total minutes; 37 setup-eligible window(s), 90 total minutes; 63 structure change(s)

### Aggregate metrics (primary scope)

- Minute evaluations: **1,321**
- Verdict transitions: **94**
- entryStatus ACTIVE windows: **100** (226 total minutes)
- Setup-eligible windows: **37** (90 total minutes)
- Episode indices for Layer 2 rubric: **272**

## Verdict distribution

- **WAIT:** 1201 (90.9%)
- **SHORT:** 71 (5.4%)
- **LONG:** 49 (3.7%)

## Entry status distribution

- **WAIT:** 916 (69.3%)
- **ACTIVE:** 226 (17.1%)
- **null:** 178 (13.5%)
- **EXTENDED:** 1 (0.1%)

## Verdict transitions

| Time (UTC) | Field | From | To |
|------------|-------|------|-----|
| 2026-08-11T23:21:00 | verdict | WAIT | LONG |
| 2026-08-11T23:25:00 | verdict | LONG | WAIT |
| 2026-08-12T00:19:00 | verdict | WAIT | LONG |
| 2026-08-12T00:23:00 | verdict | LONG | WAIT |
| 2026-08-12T00:25:00 | verdict | WAIT | LONG |
| 2026-08-12T00:26:00 | verdict | LONG | WAIT |
| 2026-08-12T01:17:00 | verdict | WAIT | SHORT |
| 2026-08-12T01:18:00 | verdict | SHORT | WAIT |
| 2026-08-12T01:20:00 | verdict | WAIT | SHORT |
| 2026-08-12T01:21:00 | verdict | SHORT | WAIT |
| 2026-08-12T01:29:00 | verdict | WAIT | SHORT |
| 2026-08-12T01:30:00 | verdict | SHORT | WAIT |
| 2026-08-12T01:34:00 | verdict | WAIT | SHORT |
| 2026-08-12T01:39:00 | verdict | SHORT | WAIT |
| 2026-08-12T02:16:00 | verdict | WAIT | LONG |
| 2026-08-12T02:17:00 | verdict | LONG | WAIT |
| 2026-08-12T02:24:00 | verdict | WAIT | LONG |
| 2026-08-12T02:25:00 | verdict | LONG | WAIT |
| 2026-08-12T02:38:00 | verdict | WAIT | LONG |
| 2026-08-12T02:43:00 | verdict | LONG | WAIT |
| 2026-08-12T02:52:00 | verdict | WAIT | LONG |
| 2026-08-12T02:59:00 | verdict | LONG | WAIT |
| 2026-08-12T03:11:00 | verdict | WAIT | LONG |
| 2026-08-12T03:13:00 | verdict | LONG | WAIT |
| 2026-08-12T03:27:00 | verdict | WAIT | SHORT |
| 2026-08-12T03:31:00 | verdict | SHORT | WAIT |
| 2026-08-12T03:51:00 | verdict | WAIT | SHORT |
| 2026-08-12T04:00:00 | verdict | SHORT | WAIT |
| 2026-08-12T04:35:00 | verdict | WAIT | SHORT |
| 2026-08-12T04:37:00 | verdict | SHORT | WAIT |
| 2026-08-12T04:39:00 | verdict | WAIT | SHORT |
| 2026-08-12T04:42:00 | verdict | SHORT | WAIT |
| 2026-08-12T04:43:00 | verdict | WAIT | SHORT |
| 2026-08-12T04:45:00 | verdict | SHORT | WAIT |
| 2026-08-12T05:06:00 | verdict | WAIT | SHORT |
| 2026-08-12T05:07:00 | verdict | SHORT | WAIT |
| 2026-08-12T05:56:00 | verdict | WAIT | LONG |
| 2026-08-12T05:59:00 | verdict | LONG | WAIT |
| 2026-08-12T09:44:00 | verdict | WAIT | SHORT |
| 2026-08-12T09:45:00 | verdict | SHORT | WAIT |

_…and 54 more._


## Entry status transitions

| Time (UTC) | Field | From | To |
|------------|-------|------|-----|
| 2026-08-11T23:05:00 | entryStatus | null | WAIT |
| 2026-08-11T23:06:00 | entryStatus | WAIT | null |
| 2026-08-11T23:13:00 | entryStatus | null | WAIT |
| 2026-08-11T23:16:00 | entryStatus | WAIT | null |
| 2026-08-11T23:28:00 | entryStatus | null | WAIT |
| 2026-08-11T23:30:00 | entryStatus | WAIT | null |
| 2026-08-11T23:33:00 | entryStatus | null | WAIT |
| 2026-08-11T23:37:00 | entryStatus | WAIT | null |
| 2026-08-11T23:38:00 | entryStatus | null | WAIT |
| 2026-08-12T00:03:00 | entryStatus | WAIT | null |
| 2026-08-12T00:04:00 | entryStatus | null | WAIT |
| 2026-08-12T00:11:00 | entryStatus | WAIT | ACTIVE |
| 2026-08-12T00:11:00 | entryActive | false | true |
| 2026-08-12T00:12:00 | entryStatus | ACTIVE | WAIT |
| 2026-08-12T00:12:00 | entryActive | true | false |
| 2026-08-12T00:14:00 | entryStatus | WAIT | null |
| 2026-08-12T00:16:00 | entryStatus | null | WAIT |
| 2026-08-12T00:19:00 | entryStatus | WAIT | ACTIVE |
| 2026-08-12T00:19:00 | entryActive | false | true |
| 2026-08-12T00:24:00 | entryStatus | ACTIVE | WAIT |
| 2026-08-12T00:24:00 | entryActive | true | false |
| 2026-08-12T00:25:00 | entryStatus | WAIT | ACTIVE |
| 2026-08-12T00:25:00 | entryActive | false | true |
| 2026-08-12T00:32:00 | entryStatus | ACTIVE | WAIT |
| 2026-08-12T00:32:00 | entryActive | true | false |

_…and 456 more._


## Structure / bias / session changes

**Structure:**
| Time (UTC) | Field | From | To |
|------------|-------|------|-----|
| 2026-08-11T23:05:00 | marketStructure | bullish | bearish |
| 2026-08-11T23:17:00 | marketStructure | bearish | unclear |
| 2026-08-11T23:26:00 | marketStructure | unclear | bullish |
| 2026-08-11T23:35:00 | marketStructure | bullish | bearish |
| 2026-08-11T23:50:00 | marketStructure | bearish | bullish |
| 2026-08-12T00:01:00 | marketStructure | bullish | bearish |
| 2026-08-12T00:14:00 | marketStructure | bearish | bullish |
| 2026-08-12T00:39:00 | marketStructure | bullish | bearish |
| 2026-08-12T00:45:00 | marketStructure | bearish | bullish |
| 2026-08-12T01:16:00 | marketStructure | bullish | bearish |
| 2026-08-12T01:36:00 | marketStructure | bearish | unclear |
| 2026-08-12T01:41:00 | marketStructure | unclear | bullish |
| 2026-08-12T01:51:00 | marketStructure | bullish | bearish |
| 2026-08-12T02:11:00 | marketStructure | bearish | unclear |
| 2026-08-12T02:17:00 | marketStructure | unclear | bullish |
| 2026-08-12T02:18:00 | marketStructure | bullish | unclear |
| 2026-08-12T02:19:00 | marketStructure | unclear | bullish |
| 2026-08-12T03:24:00 | marketStructure | bullish | bearish |
| 2026-08-12T03:36:00 | marketStructure | bearish | bullish |
| 2026-08-12T03:38:00 | marketStructure | bullish | bearish |

_…and 43 more._

**Bias:**
| Time (UTC) | Field | From | To |
|------------|-------|------|-----|
| 2026-08-11T23:05:00 | tradeableBias | neutral | bearish |
| 2026-08-11T23:06:00 | tradeableBias | bearish | neutral |
| 2026-08-11T23:13:00 | tradeableBias | neutral | bearish |
| 2026-08-11T23:16:00 | tradeableBias | bearish | neutral |
| 2026-08-11T23:28:00 | tradeableBias | neutral | bullish |
| 2026-08-11T23:30:00 | tradeableBias | bullish | neutral |
| 2026-08-11T23:33:00 | tradeableBias | neutral | bearish |
| 2026-08-11T23:37:00 | tradeableBias | bearish | neutral |
| 2026-08-11T23:38:00 | tradeableBias | neutral | bearish |
| 2026-08-11T23:50:00 | tradeableBias | bearish | bullish |
| 2026-08-12T00:01:00 | tradeableBias | bullish | bearish |
| 2026-08-12T00:03:00 | tradeableBias | bearish | neutral |
| 2026-08-12T00:04:00 | tradeableBias | neutral | bearish |
| 2026-08-12T00:14:00 | tradeableBias | bearish | neutral |
| 2026-08-12T00:16:00 | tradeableBias | neutral | bullish |

_…and 100 more._

**Session:**
| Time (UTC) | Field | From | To |
|------------|-------|------|-----|
| 2026-08-12T06:00:00 | session | asia | london |
| 2026-08-12T09:00:00 | session | london | off_hours |
| 2026-08-12T11:00:00 | session | off_hours | ny |
| 2026-08-12T15:00:00 | session | ny | off_hours |
| 2026-08-12T17:30:00 | session | off_hours | ny |
| 2026-08-12T20:00:00 | session | ny | off_hours |
| 2026-08-12T22:00:00 | session | off_hours | asia |


## Actionable windows

| Kind | Start | End | Duration (min) | Verdict | Entry status | Act→Inv (min) |
|------|-------|-----|----------------|---------|--------------|---------------|
| setupEligible | 00:19 | 00:22 | 4 | LONG | ACTIVE | 4 |
| setupEligible | 00:25 | 00:25 | 1 | LONG | ACTIVE | 1 |
| setupEligible | 01:17 | 01:17 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 01:20 | 01:20 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 01:29 | 01:29 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 02:38 | 02:42 | 5 | LONG | ACTIVE | 5 |
| setupEligible | 02:52 | 02:58 | 7 | LONG | ACTIVE | 7 |
| setupEligible | 03:11 | 03:12 | 2 | LONG | ACTIVE | 2 |
| setupEligible | 03:27 | 03:30 | 4 | SHORT | ACTIVE | 4 |
| setupEligible | 03:51 | 03:59 | 9 | SHORT | ACTIVE | 9 |
| setupEligible | 04:35 | 04:36 | 2 | SHORT | ACTIVE | 2 |
| setupEligible | 04:39 | 04:41 | 3 | SHORT | ACTIVE | 3 |
| setupEligible | 04:43 | 04:44 | 2 | SHORT | ACTIVE | 2 |
| setupEligible | 05:06 | 05:06 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 05:56 | 05:58 | 3 | LONG | ACTIVE | 3 |
| setupEligible | 09:44 | 09:44 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 10:50 | 10:50 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 10:52 | 10:55 | 4 | SHORT | ACTIVE | 4 |
| setupEligible | 11:24 | 11:24 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 11:32 | 11:32 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 11:45 | 11:49 | 5 | LONG | ACTIVE | 5 |
| setupEligible | 12:48 | 12:48 | 1 | LONG | ACTIVE | 1 |
| setupEligible | 13:15 | 13:15 | 1 | LONG | ACTIVE | 1 |
| setupEligible | 15:37 | 15:38 | 2 | SHORT | ACTIVE | 2 |
| setupEligible | 15:42 | 15:43 | 2 | SHORT | ACTIVE | 2 |
| setupEligible | 16:44 | 16:44 | 1 | LONG | ACTIVE | 1 |
| setupEligible | 16:46 | 16:47 | 2 | LONG | ACTIVE | 2 |
| setupEligible | 17:22 | 17:22 | 1 | SHORT | ACTIVE | 1 |
| setupEligible | 18:03 | 18:05 | 3 | SHORT | ACTIVE | 3 |
| setupEligible | 18:10 | 18:10 | 1 | SHORT | ACTIVE | 1 |

_…and 107 more windows._


---
*Generated by scripts/research-run-mentor-minute-replay.ts — research only.*