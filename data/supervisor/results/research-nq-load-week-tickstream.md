# Load 1 week NQ TickStream (Aug 5–12 2026)

**Task ID:** research-nq-load-week-tickstream  
**Status:** COMPLETE  
**Date:** 2026-08-14  
**Verify:** `npm run test:research-dataset` → **51 passed, 0 failed** (exit 0)

Did **not** run a TickStream reload. Did **not** run full baseline. Did **not** duplicate Aug 12 mentor eval. Did **not** commit, push, or deploy.

---

## Answer

The requested week is **already on disk** and **integrity-checks as WARNING (acceptable)**.

| Item | Value |
|------|--------|
| Fixture | `nq-week-aug05-aug12-2026-cme` |
| Dataset id | `229d1bea359bcc6777ff` |
| Symbol / source | NQ / tickstream |
| Window | `2026-08-05T22:00:00.000Z` → `2026-08-12T22:00:00.000Z` (**matches** `--start` / `--end`) |
| 1m bars | **6880** |
| Integrity | **WARNING** — not INVALID |
| Duplicates / invalid OHLC | **0 / 0** |
| Created | `2026-08-13T23:30:19.577Z` |
| `data_version` | `295f66b7aa9381c1` |
| Reload this run | **No** |

---

## What was done

1. Claimed via `npm run supervisor:pickup` (no `--id`). Claimed **this** task, not leftover `mt-1`.
2. Found existing fixture + dataset mirror. **Did not** run `npm run research:dataset` against TickStream — that would have been a duplicate fetch of data already written 2026-08-13.
3. Re-ran `validateCandles` against on-disk `candles.json` (fixture and `data/research/datasets/229d1bea359bcc6777ff/`). Live report **matches stored** `validation.json`.
4. Previewed checkpoint plan: `npx tsx scripts/research-mentor-checkpoint-plan.ts --dataset nq-week-aug05-aug12-2026-cme`.
5. Ran verify script `npm run test:research-dataset` (synthetic layer tests, not a TickStream call).

`TICKSTREAM_API_KEY` STOP condition: **not triggered**. No TickStream API call was made this run; completion does not depend on printing or re-reading secrets.

Pickup note: first `npm run supervisor:pickup` (no `--id`) claimed this task. The live loop later released the claim (`timeout-waiting` in `data/supervisor/throughput.jsonl`). Completing required a targeted re-claim with `--id research-nq-load-week-tickstream` (not a second live loop / inbox watch).

---

## On-disk locations

| Path | Role |
|------|------|
| `data/research-fixtures/nq-week-aug05-aug12-2026-cme/` | Fixture alias (manifest, candles, validation, report) |
| `data/research/datasets/229d1bea359bcc6777ff/` | Canonical dataset store (same 6880 candles) |

Fixture files (mtime `2026-08-13T23:30:28Z`):

| File | Bytes |
|------|------:|
| `candles.json` | 830417 |
| `manifest.json` | 779 |
| `validation.json` | 1892 |
| `report.json` | 3087 |

---

## Integrity (live `validateCandles`)

| Field | Stored | Live re-validate |
|-------|--------|------------------|
| status | WARNING | WARNING |
| candleCount | 6880 | 6880 |
| duplicateCount | 0 | 0 |
| invalidOhlcCount | 0 | 0 |
| missingMinuteCount | 3201 | 3201 |
| issue count | 9 | 9 |

Window first/last timestamps equal requested `1785967200` / `1786572000`. No `PARTIAL_FIRST` / `PARTIAL_LAST`.

### Session-boundary gaps (expected)

| Gap | Message |
|-----|---------|
| 60 min | CME session boundary 2026-08-06 → 2026-08-07 |
| **2950 min** | CME session boundary **2026-08-07 → 2026-08-10** (weekend halt) |
| 60 min | CME session boundary 2026-08-10 → 2026-08-11 |
| 60 min | CME session boundary 2026-08-11 → 2026-08-12 |
| 60 min | CME session boundary 2026-08-12 → 2026-08-13 |

Session-boundary minutes: 60+2950+60+60+60 = **3190**. Remaining **11** minutes are intra-session `MISSING_MINUTES` (below). That accounts for 3201.

### Intra-session missing minutes (11 total)

| Gap | Unix | Count |
|-----|------|------:|
| 1786002480 → 1786002780 | 4 |
| 1786018920 → 1786019100 | 2 |
| 1786086300 → 1786086480 | 2 |
| 1786127880 → 1786128120 | 3 |

These are **WARNING**, not INVALID. Same pattern as the Aug 12 one-day fixture (session-boundary WARNING accepted for research).

---

## Checkpoint plan preview (not executed)

`barCount`: 6880. Plan only — **no mentor eval run**.

| Mode | Checkpoints | Notes |
|------|------------:|-------|
| A framework | **61** | ~12 session anchors/day across 2026-08-06, 07, 10, 11, 12 + 1 globex stub on 2026-08-13 |
| B responsiveness | **185** | RTH density + structure/regime strata |

Mode A by session: 12 / 12 / 12 / 12 / 12 / 1. Mode A strata: 54 session_phase + 7 regime_shift.

Scaling benchmark from planner (`checkpointMsP50` 10793): oneDay ~1.8 min (10 ckpts), oneWeek ~27.7 min (154 ckpts), oneMonth ~122 min (678 ckpts). These are **estimates only**.

Sample cutoffs:

- Mode A: 2026-08-06T02:00Z Overnight mid; 06:00Z Early morning; 11:00Z Pre-market
- Mode B: 2026-08-05T23:00Z MSS flip → bearish; 23:10Z conflicting evidence; 23:15Z MSS flip → bullish

---

## Explicitly not done

- No `npm run research:dataset` TickStream fetch (duplicate of 2026-08-13 load)
- No full baseline
- No Aug 12 mentor eval rerun
- No second live supervisor loop / inbox watch
- No commit / push / deploy
- No edits under extension ticker/Karen/chart-draw or `lib/research/eqh-eql-liquidity.ts`

---

## Next (not this task)

Use `nq-week-aug05-aug12-2026-cme` for checkpointed mentor work. Do not re-fetch this window unless integrity becomes INVALID or `data_version` must change.
