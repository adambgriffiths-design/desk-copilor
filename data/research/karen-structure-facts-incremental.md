# Karen — structure facts incremental (new-bar)

**When:** 2026-08-14T22:35:41.776Z (re-verify)  
**Audit:** 2026-08-14T22:35Z  
**Status:** **ALREADY_DONE** — no new implementation this pass  
**Parity re-run:** **PASS**  
**Dataset:** `nq-aug12-2026-cme` fixture (idx 601 pure 1m, walk 500+40)  
**Scope:** Gate/incremental `buildStructureFacts` leaves on closed-bar path — REH/REL scope advance + first-presented reuse. EQH force-off untouched. No HTF fullRebuild / tick-engine / DecisionEnvelope / ICT def changes.

---

## AUDIT VERDICT: ALREADY_DONE

Priority 1 already landed. Tree audit confirms wiring; re-ran focused parity + bench; **no code changes** this pass.

| Check | Result |
|---|---|
| `updateStructureFacts` in `lib/structure.ts` | Present (REH scoped advance + FP incremental + sessionM1 advance; full fallback) |
| Wired into `applyClosedBar` | Yes: `afterClosedBar` → `rebuildOneMinuteStructure` → `updateStructureFacts` |
| Seed on `fullRebuild` | Yes: `structureInc` seeded via `updateStructureFacts(null,…)` |
| `detectFirstPresentedFvgsIncremental` / `refreshFirstPresentedFvg` | Present in `lib/gap-zones.ts` |
| Parity script | `scripts/test-structure-facts-incremental.ts` |
| HTF append-only / SSE / connectivity / ICT / DecisionEnvelope / PIT / tick / cache | **Untouched** this pass (no edits) |

**STOP.** Do not duplicate. Remaining bottleneck is EQH force path + cheap leaves (MSS / FVG80 / sweeps40), then HTF `fullRebuild` — out of scope.

---

## FINAL OUTPUT

### Reference BEFORE (prior implement report 2026-08-14T22:06:34Z)

- buildStructureFacts (new 1m): **989.4 ms**
- applyClosedBar / total new-bar: **2250.6 ms**
- REH/REL full detect: **502.6 ms**
- first-presented FVG full: **594.5 ms**
- updateStructureFacts AFTER (same report): **232.1 ms** → **4.26×** structure

### Re-verify AFTER (this run 2026-08-14T22:35:41Z)

BEFORE (full path, same fixture, this machine — noisier than prior re-verify):
- buildStructureFacts (new 1m): 2019.1 ms
- applyClosedBar / total new-bar: 1693.3 ms
- REH/REL full detect: 419.7 ms
- first-presented FVG full: 530.6 ms

AFTER (incremental):
- updateStructureFacts (new 1m): **601.4 ms**
- applyClosedBar lastBarMs: **758.7 ms**
- engine lastStructureMs: **373.3 ms**
- first-presented FVG incremental: **322.2 ms**

SPEEDUP (this re-run):
- structure facts: **3.36×** (vs this-run full)
- structure vs original BEFORE 989.4→601.4: **1.64×**
- total new-bar: **2.23×** (vs this-run full)

PARITY: **PASS**

REMAINING BOTTLENECK: EQH/EQL on force path (`lastEqhMs` 199.9 ms) plus cheap leaves still full-recompute each bar (MSS / 1m FVG lookback 80 / sweeps lookback 40). At 08:02 ET, NY opening / post-FHDR first-presented still scan.

NEXT SINGLE TARGET: HTF `fullRebuild` path (explicitly NOT started) — only after this Priority 1 report is accepted.

---

## BEFORE / AFTER / SPEEDUP

| Metric | PRIOR BEFORE (ms) | RE-VERIFY AFTER (ms) | vs prior BEFORE |
|---|---:|---:|---:|
| `buildStructureFacts` / `updateStructureFacts` (new 1m) | 989.4 | 601.4 | **1.64×** |
| applyClosedBar / lastBarMs | 2250.6 | 758.7 | **2.97×** |
| first-presented FVG | 594.5 | 322.2 | **1.84×** |

| Metric | THIS-RUN FULL (ms) | THIS-RUN INC (ms) | SPEEDUP |
|---|---:|---:|---:|
| structure facts | 2019.1 | 601.4 | 3.36× |
| REH/REL (full detect vs update call*) | 419.7 | 656.3 | 0.64× |
| first-presented FVG | 530.6 | 322.2 | 1.65× |
| Total new-bar / lastBarMs | 1693.3 | 758.7 | 2.23× |

\* REH “AFTER” column times the full `updateStructureFacts` advance (REH scope + FP + cheap leaves), not REH alone — see engine `lastStructureMs` 373.3ms on applyClosedBar. Machine load higher than prior re-verify (191.7ms AFTER); leaf mode still `incremental` / `advanced_scope`.

**Engine applyClosedBar (profile bar):** wall 579.3ms; `lastStructureMs` 373.3; `lastEqhMs` 199.9.

---

## PARITY RESULT: **PASS**

| Case | Result | Detail |
|---|---|---|
| new_1m_close leaf CURRENT≡OPTIMIZED | PASS | mode=incremental reh=advanced_scope fpReuse={"nyOpening":false,"postFhdr":false,"activeSession":true} |
| engine applyClosedBar ≡ buildStructureFacts | PASS | lastStructureMs=373.3 lastBarMs=578.6 structureΔ=1 |
| repeated bar facts stable ≡ full | PASS | barUpdatesΔ=1 |
| first/cold initialize structure ≡ full | PASS | bars=41 |
| walk 40 bars CURRENT≡OPTIMIZED | PASS | mismatches=0 incrementalModes=40/40 |
| later session-span bar CURRENT≡OPTIMIZED | PASS | mode=incremental date 2026-08-12→2026-08-12 |
| first-presented FVG CURRENT≡OPTIMIZED | PASS | reused={"nyOpening":false,"postFhdr":false,"activeSession":true} |
| REH/REL pools CURRENT≡OPTIMIZED | PASS | pools=6 |

Covered: structure facts fingerprint (mss, swings/MSS, REH/REL, FVGs, first-presented, liquidity sweeps/interactions, summary), first/cold bar, repeated bar, new 1m close, multi-bar walk, later session-span bar. EQH/EQL left to existing force-off tests (unchanged). Session boundaries: date/session/CME-key mismatch forces full rescan.

---

## FILES (prior implement — no NEW edits this pass)

| File | Change |
|---|---|
| `lib/structure.ts` | `updateStructureFacts`, REH scoped advance, sessionM1 advance, shared assemble |
| `lib/gap-zones.ts` | `refreshFirstPresentedFvg`, `detectFirstPresentedFvgsIncremental` |
| `lib/incremental-market-engine.ts` | `rebuildOneMinuteStructure` → `updateStructureFacts`; seed `structureInc` on `fullRebuild` |
| `scripts/test-structure-facts-incremental.ts` | parity + bench |
| `data/research/karen-structure-facts-incremental.md` | this report (ALREADY_DONE audit + re-verify) |

**This pass:** report update only. No lib/scripts code changes. HTF untouched.

---

## CORRECTNESS RISKS

1. **REH scope advance** must mirror `mergeBarsByTime(nyPre, sessionBars, last120)` on +1 / same-length tick. Dropped last-120 bars still in nyPre/session must remain. Mismatch → wrong pools — **parity walk guards this**; on FAIL revert REH advance and keep FP-only.
2. **First-presented reuse** assumes formation identity is stable once found for a date+session; only `filled` / `inverted` refresh. Session/date change forces full detect.
3. **`sessionM1` advance** assumes CME session key stable; key change forces full. Wrong session slice would alter PDH/PDL interaction status.
4. **fullRebuild** still uses `buildMarketContextAt` (full facts) and only seeds incremental state — HTF path unchanged.
5. Cheap leaves (MSS, 1m FVG lookback 80, sweeps lookback 40) still recompute every bar — intentional for safety.

**Policy:** If any structural output differs unexpectedly — do not weaken tests; revert the offending leaf.

---

## Raw samples (re-verify run)

```json
{
  "currentStructureMs": [
    1120.0892000000022,
    2361.2995999999985,
    1598.8634999999776,
    2725.698299999989,
    1638.2499000000244,
    2794.593599999993,
    2019.0501999999979
  ],
  "optStructureMs": [
    635.791699999987,
    693.0188999999955,
    722.4599999999919,
    521.9654000000155,
    476.5497000000032,
    520.7993000000133,
    601.3628999999783
  ],
  "rehFullMs": [
    6545.937999999995,
    1965.2681999999913,
    533.1496999999799,
    417.65160000001197,
    331.63939999998547,
    419.7360000000335,
    327.37900000001537
  ],
  "fpFullMs": [
    969.3956999999937,
    670.2961000000068,
    524.4891999999818,
    905.5763999999617,
    530.6418999999878,
    430.7540999999619,
    246.11310000001686
  ],
  "fpOptMs": [
    534.7918000000063,
    1077.7315999999992,
    322.17050000000745,
    1855.03959999996,
    278.23970000003465,
    286.9094000000041,
    204.72590000001946
  ],
  "barOptLastBarMs": [
    758.6615999999922,
    404.8135000000184,
    625.931500000006,
    1709.2921000000206,
    1277.2204999999958
  ],
  "leafMode": "incremental",
  "fpReuse": {
    "nyOpening": false,
    "postFhdr": false,
    "activeSession": true
  }
}
```
