# Karen Edge Validation v2 — Post Data-Quality Fix

**Task ID:** research-karen-edge-validation-v2  
**Run ID:** `baseline-2026-08-13T17-48-11-508Z` (resumed incremental, post-fix code)  
**Date:** 2026-08-13  
**Status:** COMPLETE

---

## QUESTION

After fixing historical data-quality scoring (`research-historical-data-quality`), does Karen's Phase 1 pipeline demonstrate genuine, repeatable OOS trading edge on real NQ Aug 12 2026?

**Answer: INCONCLUSIVE for positive edge. Zero tradable setups on honest baseline — strategy emits WAIT, not LONG/SHORT.**

---

## DATA

| Field | Value |
|-------|-------|
| Dataset | `nq-aug12-2026-cme` / TickStream 1m, 1381 bars |
| Fix applied | `research_bars` adapter, cutoff-scored freshness |
| Baseline mode | `--incremental --chunk-size 100 --test-start 2026-08-12T14:30:00.000Z` |
| Prior v1 finding | 0 setups partly infrastructure (data_quality gate) — superseded |

---

## PERIOD

| Split | Bars | Window |
|-------|------|--------|
| FULL | 1381 | Aug 11 22:00 → Aug 12 20:59 UTC |
| TRAIN | 991 | Pre-NY open (idx 0–989) |
| TEST/OOS | 391 | NY RTH open → close (idx 990–1380) |

Incremental: **14/14 chunks**, 5267051 ms full pass.

---

## SETUPS

**0** across FULL, TRAIN, and TEST. Pipeline runs correctly (dataQ=good) but never emits LONG/SHORT with ACTIVE entry.

---

## LONG / SHORT / WINS / LOSSES

| | FULL | TRAIN | TEST/OOS |
|---|------|-------|----------|
| LONG | 0 | 0 | 0 |
| SHORT | 0 | 0 | 0 |
| WINS | 0 | 0 | 0 |
| LOSSES | 0 | 0 | 0 |

---

## EXPECTANCY / WIN RATE / DRAWDOWN

| Metric | FULL | TRAIN | TEST/OOS |
|--------|------|-------|----------|
| EXPECTANCY | 0 R | 0 R | 0 R |
| WIN RATE | n/a | n/a | n/a |
| MAX DRAWDOWN | 0 R | 0 R | 0 R |

---

## COST ASSUMPTIONS

Perfect limit fill at scaffold anchor; no commission/slippage. Zero setups → cost sensitivity not applicable.

---

## OOS RESULT

**0 setups in TEST window (391 bars post-NY open).** No in-sample signal in TRAIN (991 bars) either. Cannot assess OOS degradation — no in-sample edge to degrade.

---

## EVIDENCE

### Pipeline vs deterministic replay (labeled separately)

| Cutoff | replay(det) | pipeline | entryStatus | baseline |
|--------|-------------|----------|-------------|----------|
| 14:30 UTC | LONG | **WAIT** | WAIT | NONE |
| 20:59 UTC | SHORT | **WAIT** | ACTIVE | NONE |

- **Pipeline path:** Honest strategy measurement — WAIT verdict blocks setup even when entryStatus=ACTIVE at session end.
- **Deterministic replay:** Bias/MSS heuristic only — **falsified as edge evidence** (unchanged from v1).

### Full-session incremental baseline

| Item | Value |
|------|-------|
| Bars processed | 1381 |
| Chunks | 14/14 |
| Setups | 0 |
| Fingerprint | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| dataQ on all bars | good (post-fix) |
| Synthetic control | 0 setups (120 bars, post-fix) |

### Tests

`npm run test:research-baseline` — 33/33 PASS (test9 data_quality gate, test11 adapter chain).

---

## CONFIDENCE

**High** that zero setups is a genuine strategy outcome (WAIT verdicts), not measurement artifact.

**Low** that Karen has demonstrated tradable edge on this session — no completed trades, single day, pipeline disagrees with deterministic replay directional labels.

---

## FALSIFICATION RESULT

| Test | Result |
|------|--------|
| Zero setups post-fix? | **YES** → INCONCLUSIVE, not positive |
| Infrastructure block removed? | **YES** — dataQ=good, pipeline reaches decision layer |
| Replay LONG/SHORT = edge? | **FALSIFIED** — pipeline WAIT at same cutoffs |
| Single session repeatability? | **Cannot assess** |
| Multi-day edge? | **Not tested** — would need additional datasets |

---

## 2026-08-14 verification (inbox leftover)

Did **not** re-run the ~87 min 1381-bar incremental full+train+test. Checkpoint already complete:

- Run `baseline-2026-08-13T17-48-11-508Z`
- `checkpoints/state.json`: `lastCompletedChunk` 13 (14/14), `mergedSetupCount` 0
- `fingerprintPartial` matches prior report: `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`

Re-ran this session:

| Check | Result |
|-------|--------|
| Det replay NY open 14:30Z | LONG (deterministic) — `replay-2026-08-14T08-04-59-503Z`, price 29907.5 |
| Det replay session end 20:59Z | SHORT (deterministic) — `replay-2026-08-14T08-05-02-542Z`, price 29805.75 |
| `npm run test:research-baseline` | **33 passed, 0 failed** (~710s) |

Pipeline WAIT at those cutoffs is **not** re-measured this session (would require full Phase 1 window, not the snapshot CLI). Prior table still stands: det LONG/SHORT is **not** edge evidence.

No Karen/mentor logic edits. No commit, push, or deploy.

## NEXT TASK

**None on single-session NQ Aug 12.** Honest methodology is now in place; this session yields zero tradable setups by strategy design (WAIT). Multi-day edge study requires additional real-data datasets not currently loaded — do not manufacture without new data. STOP.
