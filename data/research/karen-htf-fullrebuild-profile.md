# Karen — HTF fullRebuild profile

**When:** 2026-08-14T21:49Z  
**Mode:** PROFILE / TRACE ONLY — no production code changes, no PIT/ICT/DecisionEnvelope weakening, no commit/push/deploy, no benchmark marathon.  
**Read-only** on `lib/incremental-market-engine.ts` and structure-facts / latency-instrumentation owned files.  
**Fixture:** `nq-aug12-2026-cme`  
**Evidence:** code read of `syncSeries` / `fullRebuild` / `buildMarketContextAt`; prior engine sample in `karen-newbar-miss-deep-profile.json`; one leaf re-measure (`.tmp-htf-fullrebuild-probe.json`). Engine `syncSeries` re-time blocked this turn by mid-WIP missing `updateStructureFacts` export (structure-facts agent) — prior calibrated engine numbers used as primary wall times.

---

## Verdict (required)

| Field | Value |
|---|---|
| **Classification** | **C — partially incrementalizable** |
| **Safest optimization target** | Replace `syncSeries` `htfChanged → fullRebuild` with: assign grown HTF arrays → `applyClosedBar` for new 1m bars → patch only the TF(s) whose **length** grew (5m/15m HL+FVG; daily PD/NWOG/ORG/`buildFvgDailyBars` only if `daily.length` grew) |
| **Expected payoff** | Drop HTF-coincident miss from **~8–13s** cold-class rebuild to pure-path class **~1–3s** (+ few ms HTF patch). Removes the in-process mechanism behind live “tens of seconds” when a 1m close coincides with 5m/15m/daily growth |
| **Correctness risk** | **Medium** — must preserve 5m/15m FVG fill/invert, bias stack, and especially daily-boundary PDH/PDL/NWOG/ORG. Safest first slice: **m5-only / m15-only** mid-session (daily length unchanged) |

---

## Why HTF length change triggers ~8–13s

### Triggering condition (exact)

In `IncrementalMarketEngine.syncSeries` (`lib/incremental-market-engine.ts`):

```ts
const htfChanged =
  sliced.m15.length !== this.feed.m15.length ||
  sliced.m5.length !== this.feed.m5.length ||
  sliced.daily.length !== this.feed.daily.length;
```

- Fires on **any** m5 / m15 / daily **array length** inequality after `sliceFeedAt`.
- Does **not** inspect OHLC content of existing HTF bars.
- On `htfChanged`: assigns `feed.m1 = sliced.m1` (skips the `applyClosedBar` loop) and calls `fullRebuild()` with event label **`htf sync rebuild`**.
- Pure consecutive 1m with HTF lengths equal never hits this gate (`fullRebuildsΔ=0`).

### Caller

| Site | Condition | Label / path |
|---|---|---|
| **`syncSeries` → `fullRebuild`** | `htfChanged` (length gate) | **`htf sync rebuild`** — subject of this profile |
| `initialize` → `fullRebuild` | cold / firstMatch fail / shrink | `initial load` |
| `rebuild()` | test/reference | forced |
| `applyClosedBar` seek-back | `bar.time < last` | `seek/recovery rebuild` |
| `syncSeries` → `initialize` | `!ctx` / `!firstMatch` / `next.length+1 < prev.length` | re-init → fullRebuild |

Live miss path reaches the HTF gate via shared `syncLiveEngineFromFeed` → `syncSeries`.

### Fixture transitions discovered (length-only)

| Kind | Example idx | m1 | m5 | m15 | daily | Notes |
|---|---:|---|---|---|---|---|
| `m5+` | 204 | 205→206 | 41→42 | 14→14 | 1→1 | Mid-session; **only 5m grew** — still fullRebuild today |
| `m5+m15` | 209 | 210→211 | 42→43 | 14→15 | 1→1 | 15m boundary |
| `daily+` / `tail` | 1379 | 1380→1381 | 276→277 | 92→93 | 1→2 | Gap `20:59→22:00`; all three HTF lengths grow |

That `m5+` alone triggers the same `fullRebuild` is proof the cost is an **implementation gate**, not “all HTF concepts must be historically rebuilt for correctness.”

---

## Measured sample (HTF-coincident / tail)

**Transition:** idx 1379 · `2026-08-12T20:59Z → 22:00Z` · m1 1380→1381 · m5 276→277 · m15 92→93 · daily 1→2

### Primary (engine `syncSeries`, prior calibrated run)

| Metric | Value |
|---|---:|
| `syncSeries` wall | **13095ms** |
| `lastFullMs` | **11555ms** |
| `lastEqhMs` | **1151ms** |
| `fullRebuildsΔ` | **1** |
| `barUpdatesΔ` | **0** (applyClosedBar loop skipped) |
| Event | `htf sync rebuild` |

Source: `data/research/karen-newbar-miss-deep-profile.json` (`htf` block). Cold/new-bar profile cited the same path at **~8–10s** on a lighter RSS run.

### Leaf re-measure this turn (`buildMarketContextAt` + EQH only)

| Leaf | Wall |
|---|---:|
| `buildMarketContextAt` @1381 | 18723ms |
| `detectEqhEqlLiquidity(720)` | 5236ms |
| Sum ≈ fullRebuild body | ~24s |

Higher than the prior engine sample (GC/RSS after earlier failed engine init). Confirms cost class remains **cold-full context**, not pure-bar. Prefer the **13.1s / 11.6s** engine numbers for planning.

### Leaf attribution inside fullRebuild (from deep profile @1381)

| Work | Approx wall | Runs on pure 1m? |
|---|---:|---|
| `buildMarketContextAt` (incl. structure) | ~12.3s | **No** |
| → HTF PD / NWOG / ORG (+ daily FVG) | ~3.2s | No |
| → session window re-scan (`barsInEstWindow` ×5) | ~1.9s | No (extremes bumped) |
| → `buildFvgDailyBars` | ~0.2s | No |
| → 5m / 15m FVG | ~4ms / ~1ms | No |
| → `buildStructureFacts` (inside context) | ~2s class | Yes via `rebuildOneMinuteStructure` |
| `detectEqhEqlLiquidity(720)` | ~1.2s | Partial (`updateEqhEqlLiquidity`) |

**Bars processed:** entire sliced **m1 (~1381)**, not the single new HTF candle. HTF FVG lookbacks are tiny; the bill is 1m history + session/PD/structure/EQH.

---

## Per–fullRebuild classification table

For the **HTF-triggered** rebuild (`htf sync rebuild`):

| Question | Answer |
|---|---|
| **Triggering condition** | `sliced.m5\|m15\|daily.length !== feed.*` after PIT slice |
| **Caller** | `syncSeries` → private `fullRebuild()` |
| **Bars processed** | Full `feed.m1` (+ full m5/m15/daily for HL/FVG) |
| **Calculations repeated** | Entire `buildMarketContextAt` + full EQH detect + structure snapshot + drawing FP |
| **Historical work repeated unnecessarily** | 1m structure scan; EQH full detect; session window filters; current-day H/L; **unchanged** TF FVG/HL/PD when only another TF grew; ORG/NWOG when not at week/day open |
| **Data that genuinely needs updating** | New 1m bar(s) structure/EQH/price-derived; **grown** TF’s recent HL + unfilled FVG + bias; if **daily** grew: `sliceDailyForAsOf`, PD arrays, daily FVG bars, possibly NWOG; session id/AMD if clock crossed |
| **Existing incremental helpers that could replace most of the rebuild** | `applyClosedBar` / `afterClosedBar` / `rebuildOneMinuteStructure`; `updateStructureFacts` (structure-facts WIP); `updateEqhEqlLiquidity`; `applyPriceDerived` / `updateSessionExtremes`. **Missing:** dedicated HTF patch helper (would wrap existing `detectUnfilledFvgs` / `sessionHighLow` / `computeHtfPdArrays` on the grown series only) |
| **Classification** | **C** |

### Sub-piece A/B/C/D (inside the same rebuild)

| Piece | Class | Why |
|---|---|---|
| Bootstrap `initialize` / seek-back / firstMatch fail | **A** | History identity rewritten — full rebuild required |
| New 5m (only) HL + 5m FVG + 5m bias | **A** (delta) / **B** (today’s full path) | Conceptually must update; full history rebuild is only an implementation limit |
| New 15m (only) HL + FVG + bias | same | same |
| Daily length +1 → PDH/PDL/PDC / daily FVG / maybe NWOG | **A** (those fields) | Day boundary / new daily bar is real state change |
| Re-running full 1m `buildStructureFacts` because m5 grew | **D** (avoidable) / **C** via existing helper | Pure path already advances structure without fullRebuild |
| Full EQH `detectEqhEqlLiquidity` because m5 grew | **C/D** | `updateEqhEqlLiquidity` already exists |
| Session `barsInEstWindow` ×5 | **D** | `updateSessionExtremes` already incremental |
| Recomputing 15m FVG when only m5 grew | **D** | Unchanged series |
| Recomputing ORG mid-session on m5 close | **D** (usually) | ORG fixed after formation window |
| Entire `htfChanged → fullRebuild` gate | **C** overall | Patch grown TF + closed-bar path; keep fullRebuild for shrink/seek/cold |

---

## What `fullRebuild` does (code)

```ts
private fullRebuild() {
  this.ctx = buildMarketContextAt(this.feed, this.asOf, this.chartTimeEst, px);
  // seeds structureInc via updateStructureFacts(null, ...) when export present
  this.eqh = detectEqhEqlLiquidity(this.feed.m1, { lookback: 720, ... });
  this.structure = snapshotStructureState(...);
  // drawing fingerprint
}
```

`buildMarketContextAt` (`lib/levels.ts`) always recomputes: session windows, NWOG, ORG, `buildFvgDailyBars`, `computeHtfPdArrays`, 5m/15m HL+FVG, **and** `buildStructureFacts(m1, ...)`.

Contrast pure path (`afterClosedBar`): `applyPriceDerived` + `rebuildOneMinuteStructure` + `refreshEqhIfNeeded` — **no** HTF FVG/PD/ORG rebuild.

---

## Safest optimization target (recommendation only — NOT implemented)

**Do not** weaken PIT slicing, ICT definitions, or DecisionEnvelope.

1. **Narrowest safe change:** In `syncSeries`, when `firstMatch` and HTF lengths **only increase** (append) and daily length **unchanged**:
   - Assign `feed.m5/m15/daily` from slice.
   - Fall through to existing `applyClosedBar` loop for new 1m bars.
   - Patch `ctx.timeframe5m` / `timeframe15m` (HL of recent window + `detectUnfilledFvgs`) for TFs that grew; refresh 5m/15m bias + `computeBiasStack`.
2. **Defer** daily-length growth and length **shrink** to current `fullRebuild` until parity tests exist (fixture tail `daily 1→2` is the hard case).
3. **Do not** start with algorithm rewrites; reuse detectors already called inside `buildMarketContextAt`.

**Payoff:** Eliminates cold-class **8–13s** on every 5m/15m boundary (frequent) while daily boundaries stay rare and can remain fullRebuild initially.

**Risk:** Medium on FVG fill state and bias alignment; low on PIT if slice assignment stays identical. Validate with engine parity: HTF-patched snapshot ≡ `rebuild()` for m5-only and m5+m15 steps before touching daily+.

---

## Relation to other profiles

| Profile | Finding this confirms |
|---|---|
| `karen-cold-newbar-context-profile.md` | Pure 1m does not rebuild HTF; HTF coincident → fullRebuild ~8–10s |
| `karen-newbar-miss-deep-profile.md` | Same gate; measured **13.1s** sync; leaf split PD/session/structure/EQH |
| Structure-facts incremental (in flight) | Helps **pure** closed-bar path; **does not** remove HTF `fullRebuild` until `syncSeries` gate changes |

---

## STOP

No implementation. No commits. No deploys. Next agent should treat this as a design brief for a **gated** HTF patch behind parity tests, starting with m5-only growth.
