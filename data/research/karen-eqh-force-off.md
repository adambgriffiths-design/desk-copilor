# Karen EQH force-off (closed bars)

**When:** 2026-08-14T19:18Z  
**Status:** IMPLEMENTED (parity passed — not reverted)  
**Scope:** Stop `eqhForce=true` on closed-bar path only. Use existing `updateEqhEqlLiquidity`.  
**Constraints honored:** no architecture-v1 / ICT / DecisionEnvelope / weights / stance / thesis / conflict / PIT changes; no new cache or tick engine; no commit/push/deploy; no next-dev marathons; did not touch `extension/content.js`.

---

## 1. Locate every relevant `eqhForce=true` closed-bar path

| Site | File | Behavior |
|---|---|---|
| **`afterClosedBar`** | `lib/incremental-market-engine.ts` | Was the **only** closed-bar force site: always `rebuildOneMinuteStructure({ eqhForce: true })` after every `applyClosedBar` / append. **CHANGED → `eqhForce: false`.** |
| Tick HL expand | same file `applyTick` | `eqhForce: hlChanged` — **unchanged** (forming bar, not closed-bar path). |
| `fullRebuild` / `initialize` | same file | Calls `detectEqhEqlLiquidity` directly (cold/HTF/seek) — **unchanged**. |

No other `eqhForce: true` call sites remain in the repo after this change.

---

## 2. Why it previously bypassed `updateEqhEqlLiquidity`

`rebuildOneMinuteStructure({ eqhForce })` ends in `refreshEqhIfNeeded(force)`:

- **`force === true`** → always `detectEqhEqlLiquidity(...)` (full lookback 720 detect), increments `eqhEqlRebuilds`, **never** calls `updateEqhEqlLiquidity`.
- **`force === false`** → `updateEqhEqlLiquidity(prev, bars, …)` which either:
  - **reuse** prior liquidity when no pending-swing confirm and last bar cannot touch/sweep areas, or
  - **rebuild** via the same `detectEqhEqlLiquidity` algorithm.

Closed bars historically forced full detect “to be safe,” even though the incremental helper already encodes the correctness gate (`eqhEqlNeedsRebuild` / `pendingSwingConfirmsAt` / `areaCouldInteract`).

---

## 3. Exact code path changed

```
applyClosedBar / syncSeries(+1m)
  → afterClosedBar(bar)
    → applyPriceDerived
    → rebuildOneMinuteStructure({ eqhForce: false })   // was true
      → buildStructureFacts(...)                       // unchanged
      → refreshEqhIfNeeded(false)
        → updateEqhEqlLiquidity(...)                   // was skipped
```

**Diff (smallest possible):** one boolean in `afterClosedBar` — `eqhForce: true` → `eqhForce: false`.

---

## 4. Parity tests

Extended `scripts/test-incremental-market-engine.ts`:

| Case | Result |
|---|---|
| **14** force detect ≡ leaf `updateEqhEqlLiquidity` ≡ engine `applyClosedBar` over 40 synthetic new 1m bars; liquidity sides BUY_SIDE/SELL_SIDE | **ok** — `reusedΔ=38` `rebuildΔ=2` |
| **15** quiet closed bar + forming-bar tick HL path | **ok** — quiet `mode=reuse` |
| **16** repeated same-timestamp closed bar + session-span walk (80 bars) | **ok** |

Also ran:

- `npm run test:eqh-eql-liquidity` → **ok (31 cases)**
- `npm run test:live-context-reuse` → **49 passed, 0 failed**

**Parity failure policy:** would revert `eqhForce` back to `true`. **Not needed** — fingerprints matched in all runs (`mismatches=0`).

---

## 5. Benchmark before vs after

Fixtures: `nq-aug12-2026-cme` (pure consecutive 1m @ idx 601, same as cold/new-bar profile) + consecutive walk @ start 500.

### EQH leaf (forced detect vs `updateEqhEqlLiquidity`) — idx 601

| Path | Median ms | Mode |
|---|---:|---|
| BEFORE (force `detectEqhEqlLiquidity`) | **175.1** | always rebuild |
| AFTER (`updateEqhEqlLiquidity`) | **174.5** | **rebuild** on this bar |
| Δ | **~0.5ms** | no win when rebuild required |

Parity: engine ≡ force ≡ incr fingerprints **true**.

### Total new-bar `applyClosedBar` (structure unchanged)

| | ms | Notes |
|---|---:|---|
| Estimated BEFORE (structure + force EQH) | **~1769** | `lastStructureMs` 1594 + force EQH 175 |
| AFTER (`applyClosedBar` wall) | **~1931** | structure dominates; EQH still rebuilt (`eqhReusedΔ=0`) |
| Engine `lastEqhMs` after | **334** | variance vs leaf samples; same rebuild work |

**Interpretation:** On the profiled pure-1m NQ bar (and a 40-bar NQ walk from idx 500: **reuse=0 / rebuild=40**), areas/swing confirms still trigger rebuild — so **EQH CPU ≈ before** on those bars. That matches the cold-profile note that savings are workload-dependent.

### Where reuse pays (synthetic fixture)

Closed-bar parity walk: **38/40 reused**, **2 rebuilt**. Quiet constructed bar: `quietMode=reuse`. On reuse, EQH path returns prior liquidity (≪ full detect); structure rebuild remains the dominant cost (~70–75% of new-bar time per prior profile).

### NQ consecutive walk (start=500, n=40)

```json
{ "reuse": 0, "rebuild": 40, "mismatches": 0, "rebuildEqhMedMs": 229, "rebuildBarMedMs": 1729 }
```

Artifacts: `data/research/karen-eqh-force-off-bench.json`, `karen-eqh-force-off-reuse-sample.json`, `karen-eqh-force-off-walk.json`.

---

## 6. Changed outputs / correctness

- **Semantic outputs:** none observed — EQH/EQL area fingerprints matched forced full detect in every tested closed bar, repeated bar, session-span walk, and quiet bar.
- **Counters:** closed bars can now increment `eqhEqlReused` (previously always `eqhEqlRebuilds` on this path).
- **Correctness concerns:** none blocking. When `updateEqhEqlLiquidity` chooses rebuild it calls the same `detectEqhEqlLiquidity`. When it reuses, gates require no pending-swing confirm and no area interaction — proven equal to force on fixtures. Active NQ stretches often rebuild (no false reuse in walk).

---

## 7. Files changed

| File | Change |
|---|---|
| `lib/incremental-market-engine.ts` | `afterClosedBar`: `eqhForce: false` |
| `scripts/test-incremental-market-engine.ts` | Cases 14–16 parity coverage |
| `scripts/bench-eqh-force-off.ts` | Before/after leaf + applyClosedBar bench |
| `scripts/bench-eqh-force-off-reuse.ts` | Sparse NQ sample |
| `scripts/bench-eqh-force-off-walk.ts` | Consecutive reuse/rebuild walk |
| `data/research/karen-eqh-force-off.md` | This report |
| `data/research/karen-eqh-force-off-*.json` | Raw timings |

**Not changed:** detectors, structure facts algorithm, DecisionEnvelope, extension/content.js, PIT, trading logic.
