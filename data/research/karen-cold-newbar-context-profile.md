# Karen cold / new-bar context profile

**When:** 2026-08-14T19:01:51Z (measurements 18:56–19:01Z)  
**Mode:** PROFILE ONLY — no optimizations, no architecture/ICT/trading changes, no OpenAI, no HTTP Yahoo/Tickstream, no next-dev.  
**Dataset:** `nq-aug12-2026-cme` (`2562961408b256ac94f1`) — on-disk fixture.  
**Scripts:** `scripts/profile-cold-newbar-context.ts`, `profile-cold-newbar-corrective.ts`, `profile-cold-newbar-pure1m.ts`  
**Raw JSON:** `karen-cold-newbar-context-profile.json`, `karen-cold-newbar-context-profile-corrective.json`, `karen-cold-newbar-pure1m.json`

**Memory (first run):** RSS 81.5 → 461 MB · wall ~56s · stage cap 90s (none aborted)

---

## Method

1. Prefer fixture bars (already OHLC). Live Yahoo/Tickstream **not** re-timed (8GB RAM); cite prior audits for I/O.
2. **Cold:** first-touch leaf stages + `IncrementalMarketEngine.initialize` / shared `syncLiveEngineFromFeed` cold.
3. **Genuine new 1m bar:** two cases measured:
   - **Pure 1m** — consecutive minute, **m5/m15/daily lengths unchanged** → `syncSeries` → `applyClosedBar`.
   - **HTF-coincident** — fixture tail `20:59 → 22:00` (+3660s) where m5/m15/**daily** all grow → `syncSeries` **htf sync fullRebuild**.
4. DecisionEnvelope / quality assemble timed separately.

Reuse fingerprint (unchanged): bars identity · last print ≥0.25 · session — see `karen-live-context-reuse.md`.

---

## Ranked bottleneck table

### A. Cold initialize (~1380 1m bars)

| Rank | Stage | Duration | Bars | Cache | Notes |
|---:|---|---:|---:|---|---|
| 1 | `buildMarketContextAt` (inside `fullRebuild`) | **7.82–7.58s** | 1380 | MISS | First-touch full context 7.82s; engine `lastFullMs−lastEqhMs` ≈7.58s |
| 2 | `IncrementalMarketEngine.initialize` / shared cold sync | **7.84–8.11s** | 1380 | MISS | = context + EQH; canonical cold path |
| 3 | `buildStructureFacts` (composite) | **2.04s** | 1380 | MISS | Inside context; see leaf split below |
| 4 | HTF / PD / NWOG / daily FVG bars (re-timed leaf) | **~1.24s** | daily+m1 | MISS | Inside context; not a separate production call |
| 5 | Disk fixture load (`candles.json` hydrate) | **978ms** | 1381 | HIT (disk) | Only I/O in this profile |
| 6 | REH/REL `detectRelativeEqualPools` | **575ms** | 1380 | MISS | Leaf of structure |
| 7 | 1m FVG + first-presented | **563ms** | 1380 | MISS | Leaf of structure |
| 8 | EQH/EQL `detectEqhEqlLiquidity(720)` | **174–425ms** | ≤720 | MISS | Engine cold `lastEqhMs` 249–425ms |
| 9 | Level interactions + sweeps | **192ms** | 1380×17 | MISS | lookback 40 per level |
| 10 | MSS / findSwings | **0.6ms** | 80 | MISS | Cheap vs REH/FVG |
| 11 | Session/AMD clock alone | **≪1s** | — | — | *Do not use the 10.61s bundled row from the first draft — that stage incorrectly included HTF+ORG+NWOG prep* |
| — | OHLC construction | **0.4ms** | — | N/A | Fixture already OHLC; live Yahoo builds candles |

**Cold engine counters (1380 prefix):** `fullRebuilds=1`, `eqhEqlRebuilds=1`, `lastFullMs≈7834`, `lastEqhMs≈249`.

### B. Genuine new 1m bar — pure consecutive (HTF unchanged)

Sample: idx 601 · `08:01→08:02` · m1 602→603 · m5/m15/daily **unchanged**.

| Rank | Stage | Duration | Bars | Cache | Necessary after 1 new bar? |
|---:|---|---:|---:|---|---|
| 1 | Shared `syncLiveEngineFromFeed` miss `bars` | **2697ms** | 603 | MISS | yes — live intel path |
| 2 | Local `applyClosedBar` | **1312ms** | 603 | MISS | yes |
| 3 | `rebuildOneMinuteStructure` (`lastStructureMs`) | **1076–1433ms** | 603 | MISS | yes — full `buildStructureFacts` re-scan |
| 4 | Forced EQH (`eqhForce=true`, `lastEqhMs`) | **232–1262ms** | ≤720 | MISS | partial — always full detect today |
| 5 | `applyPriceDerived` (session H/L + bias) | **~0.2ms** | 1 | N/A | yes — already incremental |
| 6 | assemble intel + `auditDataQuality` | **17.5ms** | — | N/A | yes |
| 7 | `DecisionEnvelope` | **3.3ms** | — | N/A | yes — negligible |

**Counters (pure 1m):** `barUpdates=1`, `structureRebuilds=1`, `eqhEqlRebuilds+=1`, `eqhEqlReused=0`, `fullRebuilds` unchanged after cold.

At **full NQ depth (~1381)** on a local engine (append-only, HTF not refreshed in that instance): `applyClosedBar` **3140ms** = structure **2332ms** + EQH **802ms**.

### C. New-bar miss when HTF series also grow

Fixture tail `20:59→22:00` (+3660s): m5 276→277, m15 92→93, daily 1→2.

| Rank | Stage | Duration | Cache | Notes |
|---:|---|---:|---|---|
| 1 | `syncSeries` **htf sync rebuild** (`fullRebuild`) | **~8–10s** | MISS | Same cost class as cold context+EQH; **not** `applyClosedBar` |
| — | Pure `applyClosedBar` | n/a | — | Skipped when HTF lengths differ |

This path explains some live “tens of seconds” new-bar misses when a 1m close coincides with 5m/15m/daily growth (or gap fills), on top of Yahoo/Tickstream.

---

## Leaf attribution inside `buildStructureFacts` (cold, 1380 bars, first touch)

| Leaf | Duration | Repeated on every new bar today? | Theoretically incremental? |
|---|---:|---|---|
| REH/REL pools | 575ms | yes (full re-scan) | yes — on new swing only |
| 1m FVG + first-presented | 563ms | yes | partial — fill/invert vs last bar |
| Level interactions + sweeps | 192ms | yes | partial — last 40 bars / tagged levels |
| MSS / swings | 0.6ms | yes | yes — cheap anyway |
| **Composite `buildStructureFacts`** | **2040ms** | **yes** | **yes — largest new-bar CPU** |

---

## Answers (required)

### 1. Largest CPU cost

| Path | Largest stage | Measured |
|---|---|---|
| **Cold** | `buildMarketContextAt` / `initialize` fullRebuild | **~7.8–8.1s** @ 1380 bars |
| **Pure new 1m** | `buildStructureFacts` via `rebuildOneMinuteStructure` | **1.1–2.3s** (scales with m1 depth); total bar path **1.3–3.1s** |
| **HTF-coincident new bar** | `fullRebuild` (context+EQH again) | **~8–10s** |

### 2. Largest I/O cost

| Source | Duration | Notes |
|---|---:|---|
| This run (disk fixture) | **978ms** | JSON parse + Date hydrate |
| Live (prior audit, not re-run) | Yahoo **~319–575ms** median; Tickstream live **~8s** | `karen-live-latency-audit.md` — dominates when cold + thrash; not measured here |

### 3. Repeated work (every genuine new 1m)

- Full `buildStructureFacts` over **all** 1m bars (REH/REL + FVG + interactions), not delta.
- `detectEqhEqlLiquidity(720)` with **`eqhForce=true`** on every closed bar — bypasses `updateEqhEqlLiquidity` reuse.
- On HTF length change: entire `buildMarketContextAt` + EQH again.
- HTF 5m/15m FVG inside full context: **skipped** on pure `applyClosedBar` (good).

### 4. Theoretically incremental

- EQH: `updateEqhEqlLiquidity` already exists (reuse when no new swing confirm + no area interaction).
- REH/REL / MSS: update on new confirmed swing only.
- FVG: re-check fill/invert against last bar + append new gaps.
- Session H/L, current-day PD extremes, bias: **already** incremental in `applyPriceDerived`.

### 5. Genuinely require historical rebuild

- Cold `initialize` / first symbol.
- Seek-back / first-bar mismatch / reconnect.
- **HTF series length change** (`htf sync rebuild`).
- Session/AMD identity change (reuse key → `initialize`).
- EQH when new swing confirms or last bar interacts with areas.

---

## Stage detail — cold (1380-bar run)

| Stage | Duration | Bars | Repeated calcs | Cache | Needed after 1 new bar? |
|---|---:|---:|---|---|---|
| market-data / historical load (disk) | 978ms | 1381 | JSON+Date | HIT | n/a |
| series slice (asOf) | 0.4ms | 1380 | filter | N/A | partial |
| `buildMarketContextAt` full | 7.82s | 1380 | HTF+session+structure+5m/15m FVG | MISS | **no** (bar path avoids) |
| → structure composite | 2.04s | 1380 | see leaves | MISS | yes |
| → REH/REL | 575ms | 1380 | full pools | MISS | yes |
| → 1m FVG + first-presented | 563ms | 1380 | full | MISS | yes |
| → interactions+sweeps | 192ms | 1380 | ×17 levels | MISS | yes |
| → MSS | 0.6ms | 80 | swings | MISS | yes |
| EQH lookback 720 | 174–425ms | ≤720 | full detect | MISS | partial |
| `engine.initialize` | 7.84s | 1380 | context+EQH | MISS | n/a |
| quality / DecisionEnvelope | 3–18ms | — | assemble+envelope | N/A | yes |

---

## Safest first optimization (**recommendation only — not implemented**)

**Stop forcing `eqhForce=true` on `afterClosedBar`; call existing `updateEqhEqlLiquidity`.**

- Smallest surface: one call-site flag in `rebuildOneMinuteStructure` / `afterClosedBar`.
- Detectors, architecture-v1, ICT definitions, and weighting stay untouched.
- On this pure-1m sample EQH still rebuilt (interaction/swing), so savings are **workload-dependent**; quiet bars that neither confirm a swing nor touch areas can reuse.
- **Larger CPU is still `buildStructureFacts` (~70–75% of pure new-bar time)** — but gating REH/REL behind swing confirmation is a wider behavioral change; do EQH force→incremental first, then measure again.

**Do not** (this pass): add caching layers, rewrite structure/EQH algorithms, or change architecture-v1.

---

## Relation to live ~80s cold / tens-of-seconds new-bar

This profile’s in-process CPU on fixture (~8s cold, ~1.3–3s pure new bar, ~8–10s HTF-coincident) is **lower** than live wall clocks because live also pays Yahoo + Tickstream + GC thrash on 8GB and may hit HTF-coincident fullRebuilds. Prior median MARKET CONTEXT ~28s remains compatible: context CPU + I/O + memory pressure, not DecisionEnvelope.

---

## Engine counter snapshots

**Cold + append at fixture depth (local, 1380→1381, HTF not updated in feed):**

```json
{
  "fullRebuilds": 1,
  "barUpdates": 1,
  "structureRebuilds": 1,
  "eqhEqlRebuilds": 2,
  "eqhEqlReused": 0,
  "lastFullMs": 7833.5,
  "lastBarMs": 3139.1,
  "lastStructureMs": 2331.6,
  "lastEqhMs": 802.1
}
```

**Pure consecutive 1m (shared sync, 602→603):**

```json
{
  "missReason": "bars",
  "fullRebuilds": 1,
  "barUpdates": 1,
  "structureRebuilds": 1,
  "eqhEqlRebuilds": 2,
  "eqhEqlReused": 0,
  "sharedColdMs": 6251,
  "sharedMissMs": 2697,
  "lastStructureMs": 1433,
  "lastEqhMs": 1262
}
```
