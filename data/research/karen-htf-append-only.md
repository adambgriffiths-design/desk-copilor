# Karen — HTF m5/m15 append-only incrementalization

**When:** 2026-08-14T22:16Z  
**Status:** IMPLEMENTED — parity PASS (Tests A–J 10/10)  
**Profile:** `data/research/karen-htf-fullrebuild-profile.md`  
**Dataset:** `nq-aug12-2026-cme` (mid-session m5 idx 500, m15 idx 510)  
**Scope:** ONLY `syncSeries` append-only m5/m15 path. Daily growth / seek / cold / session discontinuity keep `fullRebuild`. No architecture-v1, DecisionEnvelope, ICT, weights, PIT, tick loop, cache, SSE, or connectivity changes.

---

## BEFORE

| Metric | Value |
|---|---:|
| m5 append (`syncSeries` HTF → fullRebuild / re-init oracle) | **11315.3 ms** |
| m15 append | **11074.7 ms** |
| total market-context leaf (`buildMarketContextAt` @ m5 target) | **11884.1 ms** |
| total new-bar request (m5 coincident) | **11315.3 ms** |
| fullRebuilds on sequential m5/m15 append | **1** |

Prior profile calibrated the same gate at **~8–13 s** (`htf sync rebuild`).

---

## AFTER

| Metric | Value |
|---|---:|
| m5 append (applyClosedBar + m5 patch) | **2685.2 ms** |
| m15 append | **1069.4 ms** |
| total market-context leaf (unchanged API; still used on cold/daily) | **11884.1 ms** |
| total new-bar request (m5 coincident) | **2685.2 ms** |
| fullRebuilds on sequential m5/m15 append | **0** |

Warm mid-session probe (same transition, lighter RSS): m5 **~277–512 ms** vs cold-class rebuild **~3.3–4.4 s**.

---

## SPEEDUP

| Path | BEFORE → AFTER | SPEEDUP |
|---|---|---|
| m5 append | 11315 → 2685 ms | **4.2×** |
| m15 append | 11075 → 1069 ms | **10.4×** |
| new-bar request (m5) | 11315 → 2685 ms | **4.2×** |

Target class **~1–3 s**: **hit** on this fixture (m5 ~2.7 s; m15 ~1.1 s). Correctness prioritized over chasing a lower number.

---

## FULL REBUILDS BEFORE / AFTER

| Case | BEFORE | AFTER |
|---|---:|---:|
| Sequential m5 append only | 1 | **0** |
| Sequential m15 append | 1 | **0** |
| Session boundary | 1 | **1** (fallback) |
| Daily boundary | 1 | **1** (fallback) |
| Cold / seek / skip / OOO / missing HTF | ≥1 | ≥1 (unchanged) |

---

## PARITY

**PASS** — CURRENT (`initialize` / `buildMarketContextAt` at T) ≡ OPTIMIZED (`initialize`@T−1 + `syncSeries` append-only) for:

- m5 / m15 / daily structure windows  
- swings / MSS, REH/REL, 1m FVG, EQH/EQL  
- liquidity sweeps / interactions  
- session H/L (+ placeholder times for not-yet-started windows)  
- HTF bias stack  
- DecisionEnvelope stance / thesis / conflicts / invalidation fingerprint  

| Test | Result |
|---|---|
| A sequential m5 append | PASS (`fullRebuildsΔ=0`) |
| B sequential m15 append | PASS (`fullRebuildsΔ=0`) |
| C repeated same bar | PASS |
| D skipped bar | PASS (fallback rebuild) |
| E out-of-order / seek | PASS (fallback) |
| F session boundary | PASS (fallback `Δ=1`) |
| G daily boundary | PASS (fallback `Δ=1`) |
| H cold initialization | PASS |
| I historical seek / firstMatch fail | PASS |
| J missing/incomplete m5 | PASS |

Harness: `npx tsx scripts/test-htf-append-only.ts` → `data/research/karen-htf-append-only-metrics.json`.

---

## FALLBACK CASES

Append-only is used only when **all** hold:

1. Daily length unchanged  
2. m5 and/or m15 length **grew** (no shrink)  
3. HTF series are append-safe (time prefix; solid OHLC; forming last-bar drift allowed when length unchanged)  
4. m1 time-prefix append with `next.length > prev.length`  
5. Session key (`id|amd|macro`) unchanged vs prior `asOf`  
6. Previous-day anchors non-degenerate (not PDH=PDL=lastClose bootstrap)

Otherwise → existing **`htf sync rebuild`** / `initialize` fullRebuild:

- cold init  
- historical seek / firstMatch fail / shrink  
- non-sequential / skipped / out-of-order  
- session discontinuity  
- **daily length growth** (unchanged policy)  
- incomplete HTF wipe (e.g. `m5: []`)  
- early-session degenerate PDH placeholder  

---

## FILES CHANGED

| File | Change |
|---|---|
| `lib/incremental-market-engine.ts` | `syncSeries` append-only gate; `patchGrownIntradayHtf`; inactive session placeholder time align; prefix helpers |
| `lib/levels.ts` | `buildIntradayTimeframeState` shared by full context + HTF patch |
| `scripts/test-htf-append-only.ts` | Tests A–J + BEFORE/AFTER bench |
| `data/research/karen-htf-append-only.md` | this report |
| `data/research/karen-htf-append-only-metrics.json` | raw metrics |

---

## CORRECTNESS RISKS

1. **Early Globex bootstrap** — when previous day is missing, fullRebuild sets PDH≈lastClose every minute. Append-only is **disabled** via degenerate-anchor gate; if that gate is wrong, PDH/sweeps could drift.  
2. **Session placeholder times** — not-yet-started windows must track `asOf` like `buildMarketContextAt`; completed windows must keep real extreme times. Wrong gate → drawing/session metadata skew (H/L already matched in tests).  
3. **Forming HTF OHLC** — length-unchanged last bar may drift; length-growth requires solid historical OHLC. Rewrite of older HTF bars still forces fullRebuild.  
4. **Multi-bar catch-up** — several 1m closes applied then one HTF patch; intermediate bias uses pre-patch HL (final state patched).  
5. **Daily still fullRebuild** — intentional; do not extend this pass to daily+/NWOG/ORG without a new parity suite.

**Policy:** If any structural / envelope output differs unexpectedly — do not weaken tests; tighten the append-only gate or revert to fullRebuild for that case.

---

## STOP

No further optimization in this task. No commit / push / deploy.
