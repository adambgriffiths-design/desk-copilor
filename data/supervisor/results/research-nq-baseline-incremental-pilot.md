# NQ Incremental Baseline Pilot

**Task ID:** research-nq-baseline-incremental-pilot  
**Run ID:** `baseline-2026-08-13T17-48-11-508Z`  
**Date:** 2026-08-13  
**Status:** PARTIAL — incremental full pass + train/test/poison complete; reproducibility killed before export

---

## QUESTION

Does the incremental baseline runner (`--incremental --chunk-size 100`) complete an honest Phase 1 backtest on real NQ (`nq-aug12-2026-cme`, 1381 bars) with observable chunk progress, valid checkpoints, and poison/repro gates — and does the strategy emit any tradable setups?

**Answer:** Incremental runner **validated** (14/14 chunks, resume works). Strategy emits **0 setups**. Export incomplete — process killed during reproducibility (~5.6 h elapsed).

---

## TASK

Run `npm run research:baseline -- --dataset nq-aug12-2026-cme --incremental --chunk-size 100`. Resume if checkpoint exists. Report chunk progress, fingerprint, poison/repro gates. No duplicate concurrent baseline. No production Karen changes.

---

## DATA USED

| Field | Value |
|-------|-------|
| Dataset | `nq-aug12-2026-cme` / hash `2562961408b256ac94f1` |
| Symbol | NQ (MNQ-equivalent) |
| Bars | 1381 (1m TickStream) |
| Validation | **WARNING** — 60 min CME session-boundary gap (accepted, not INVALID) |
| Mode | `--incremental --chunk-size 100` (default 70/30 train/test split) |
| Strategy | `phase1-decision-pipeline@spec-1.0.0+pipeline-1.0.0` |
| Git | `018310a672e9274c8e3c537d04d085b39658fa14` |

### Split (default 70% train)

| Period | Bars | Index range |
|--------|------|-------------|
| FULL | 1381 | 0–1380 |
| TRAIN | 966 | 0–965 |
| TEST (OOS) | 415 | 966–1380 |

---

## RUNTIME

| Phase | Duration | Detail |
|-------|----------|--------|
| `strategy_init` | 1 ms | — |
| `full_backtest` (incremental) | **6,319,533 ms** (~105.3 min) | 14 chunks, 0 setups |
| `train_backtest` | **2,428,741 ms** (~40.5 min) | 966 bars |
| `test_backtest` | **2,471,741 ms** (~41.2 min) | 415 bars |
| `lookahead_poison` | **4,928,439 ms** (~82.1 min) | completed (timing logged) |
| `reproducibility` | **KILLED** | exit 4294967295 before phase log |
| `export` | **NOT RUN** | no `manifest.json` / `results.json` at run root |

**Total before kill:** 20,317,093 ms (~338 min / ~5 h 38 min)

**Resume attempt:** `--resume baseline-2026-08-13T17-48-11-508Z` — full_backtest skipped in 463 ms; killed at 193 s during `train_backtest` (exit 4294967295).

**Est. remaining:** reproducibility ~90–105 min (one full 1381-bar pass) + export <1 min.

---

## PER-CHUNK TIMINGS (full_backtest incremental)

| Chunk | Bar range | Duration (s) | Setups | Completed (UTC) |
|-------|-----------|--------------|--------|-----------------|
| 0 | 0–99 | 72 | 0 | 17:49:26 |
| 1 | 100–199 | 185 | 0 | 17:52:31 |
| 2 | 200–299 | 155 | 0 | 17:55:06 |
| 3 | 300–399 | 250 | 0 | 17:59:16 |
| 4 | 400–499 | 279 | 0 | 18:03:55 |
| 5 | 500–599 | 723 | 0 | 18:15:58 |
| 6 | 600–699 | 749 | 0 | 18:28:27 |
| 7 | 700–799 | 530 | 0 | 18:37:17 |
| 8 | 800–899 | 440 | 0 | 18:44:37 |
| 9 | 900–999 | 523 | 0 | 18:53:20 |
| 10 | 1000–1099 | 592 | 0 | 19:03:12 |
| 11 | 1100–1199 | 668 | 0 | 19:14:20 |
| 12 | 1200–1299 | 712 | 0 | 19:26:12 |
| 13 | 1300–1380 | 517 | 0 | 19:34:49 |

**Avg chunk:** ~457 s (~7.6 min/chunk). Later chunks slower (cursor/state carry-over). Chunk 5–6 spike (~12 min each).

---

## RESULT

| Metric | FULL | TRAIN | TEST/OOS |
|--------|------|-------|----------|
| Setups | **0** | **0** | **0** |
| Win rate | n/a | n/a | n/a |
| Expectancy | 0 R | 0 R | 0 R |

**Interpretation (projected):** INSUFFICIENT DATA — zero decisive setups; cannot assess edge.

---

## EVIDENCE

| Item | Value |
|------|-------|
| Chunks completed | **14/14** |
| Checkpoint dir | `data/research/baseline-runs/baseline-2026-08-13T17-48-11-508Z/checkpoints/` |
| Cursor at completion | 1380 |
| Merged setup count | 0 |
| Session-boundary gap | WARNING (60 min) — documented, not blocking |
| Log files | `data/research/baseline-runs/nq-incremental-pilot.log`, `nq-incremental-pilot-resume.log` |
| Prior killed monolithic attempts | 44–61 min (no report) — incremental avoids that failure mode for full pass |

---

## FINGERPRINT

Empty setup list SHA-256:

`4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`

(stable across all 14 chunks in `state.json`)

---

## SETUPS COUNT

**0** — no LONG/SHORT with `entryStatus === ACTIVE` on any bar in FULL, TRAIN, or TEST windows.

---

## TESTS

| Check | Result |
|-------|--------|
| Incremental chunking (14/14) | **PASS** |
| Checkpoint I/O + resume skip | **PASS** (463 ms full pass on resume) |
| Look-ahead poison | **Likely PASS** (phase completed; 0 setups → trivial equality) |
| Reproducibility | **INCOMPLETE** — killed before phase log |
| Export / manifest | **NOT RUN** |
| `npm run build` | **PASS** (post-run verification, no code touched) |
| Synthetic equivalence (prior test10) | **PASS** (from chunked-execution task) |

---

## CONCLUSION

1. **Incremental runner works on NQ scale** — 1381 bars in 14 chunks with disk checkpoints; resume correctly skips completed chunks.
2. **Zero setups on real NQ** — Phase 1 pipeline emits WAIT throughout; not a chunking or data-INVALID artifact (WARNING gap accepted).
3. **End-to-end baseline export blocked by process kill** during reproducibility (~6 h total compute). Resume re-runs train/test/poison (no phase-level checkpoint) — needs ~3+ h to finish gates unless repro-only shortcut is added to tooling.
4. **Do not restart monolithic baseline** — incremental path is the correct execution mode.

---

## CONFIDENCE

- **High** — incremental mechanics, setup count (0), fingerprint stability, chunk observability.
- **Medium** — poison gate (phase ran, result not exported).
- **Low** — reproducibility/export (incomplete).

---

## NEXT TASK

**Resume repro + export only** (when compute available):

```bash
npm run research:baseline -- --dataset nq-aug12-2026-cme --incremental --chunk-size 100 --resume baseline-2026-08-13T17-48-11-508Z
```

Consider tooling enhancement: checkpoint post-full phases (train/test/poison/repro) to avoid ~3 h re-run on resume. Edge validation remains blocked at 0 setups regardless.

**STOP.**
