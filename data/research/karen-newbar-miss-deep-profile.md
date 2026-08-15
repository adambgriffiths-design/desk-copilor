# Karen — deep profile: new-bar MISS (post EQH force-off)

**When:** 2026-08-14T19:29:58Z  
**Mode:** PROFILE ONLY — no production changes, no OpenAI/HTTP, no next-dev, no commit/push/deploy.  
**Dataset:** `nq-aug12-2026-cme` in-process fixture.  
**Script:** `scripts/profile-newbar-miss-deep.ts`  
**Raw JSON:** `data/research/karen-newbar-miss-deep-profile.json`  
**Prior:** `karen-cold-newbar-context-profile.md`, `karen-eqh-force-off.md`, `karen-speed-connection-priority-audit.md`  
**Memory:** RSS 81.6 → 789.7 MB (leaf re-runs after HTF path inflate wall; **engine counters are authoritative for in-path**).

---

## Method

1. Initialize `IncrementalMarketEngine` once on a pure-1m prefix (HTF lengths unchanged).
2. Apply **one** closed consecutive 1m that triggers live `miss:bars` / `applyClosedBar` (not HIT reuse).
3. Separately: HTF-coincident `syncSeries` at fixture tail where m5+m15+daily all grow → `htf sync rebuild`.
4. Leaf timings re-invoke detectors after the bar path (attribution only; GC can inflate wall — prefer `lastStructureMs` / CPU / prior cold leaf ratios).

**Samples**

| Case | idx | times (UTC) | m1 | m5 | m15 | daily |
|---|---:|---|---|---|---|---|
| Pure 1m | 601 | `08:01→08:02` | 602→603 | 121=121 | 41=41 | 1=1 |
| HTF coincident | 1379 | `20:59→22:00` (+3660s) | 1380→1381 | 276→277 | 92→93 | 1→2 |

---

## Ranked bottleneck table

| RANK | BOTTLENECK | TIME | CAUSE | SAFE TO OPTIMIZE? | EXPECTED PAYOFF | CORRECTNESS RISK |
|---:|---|---:|---|---|---|---|
| **1** | **`buildStructureFacts` full re-scan every pure closed 1m** | **In-path `lastStructureMs` 649ms @603 bars (~83% of `applyClosedBar` 783ms); shared miss structure 974ms; scales ~1.1–2.3s @ deeper prior runs** | `afterClosedBar` → `rebuildOneMinuteStructure` always calls full `buildStructureFacts(m1,…)` | **Yes — gate/incremental leaves; detectors unchanged** | **Cuts majority of every pure `miss:bars` CPU** | **Med** — need parity vs full facts |
| **2** | **`syncSeries` HTF-length → `fullRebuild`** | **~13.1s wall (CPU user ~9.0s) @1381 bars; `lastFullMs` 11.6s + EQH 1.2s** | Any m5/m15/daily **length** change assigns sliced m1 and rebuilds **entire** context | **Partial — targeted HTF patch + `applyClosedBar` instead of fullRebuild** | **Removes 8–13s+ class misses when 5m/15m/daily grow** (live +I/O/GC → tens of s) | **Med–high** — HTF FVG/PD/ORG/session must stay correct |
| 3 | REH/REL leaf inside structure | Leaf ~437ms wall / ~235ms CPU @603 | `detectRelativeEqualPools` re-windows + re-pairs every bar | Yes (on new swing only) | Large share of #1 | Med |
| 4 | first-presented FVG leaf | Leaf ~334ms wall / ~297ms CPU @603 | `detectFirstPresentedFvgs` re-runs even after FP already set | Yes (cache until session change) | Large share of #1 | Low–med |
| 5 | EQH/EQL on closed bar | In-path **133ms** (reuseΔ=0 this bar) | `eqhForce:false` → `updateEqhEqlLiquidity` still **rebuild** when swing/area gate fires | Already done for force-off; further = gate only | Small on busy NQ; large on quiet reuse | Low (gates proven) |
| 6 | Session window filters on **fullRebuild** | ~1.86s wall @1381 (`barsInEstWindow` ×5) | `getEstDateKey`/`getEstMinutes` per bar per window inside `buildMarketContextAt` | Yes (index by date once) | Material on HTF/cold only | Low |
| 7 | HTF PD/NWOG/ORG bundle on fullRebuild | ~3.2s leaf (overlaps daily FVG scan) | Recomputed only on fullRebuild | Partial with #2 | Part of HTF path | Med |
| 8 | Level interactions + sweeps | Leaf wall ~302ms but CPU ~16ms (GC noise); prior cold ~192ms | lookback-40 classify × levels | Partial (last bar vs tracked) | Modest | Low–med |
| 9 | Quality gate | **31ms** | assemble intel + `auditDataQuality` | No need | Negligible | — |
| 10 | 5m/15m FVG alone | **3.6ms / 1.2ms** on HTF path; **0 on pure** | lookback 40 | n/a on pure | Tiny | — |
| 11 | Tickstream / Yahoo | **not measured** (fixture) | live I/O | separate track | live `*_live` ~8–10s prior | — |
| 12 | MSS / 1m FVG lookback 80 | **0.3ms / 2.5ms** | short lookback | no | none | — |

### SINGLE largest safe optimization target

**Incrementalize / gate `buildStructureFacts` on the closed-bar path** (especially **REH/REL** + **first-presented FVG**; keep cheap MSS/1m-FVG lookbacks).

- Hits **every** pure `miss:bars` (most common genuine new-1m).
- Proven **~83%** of in-path `applyClosedBar` after EQH force-off.
- Does **not** require architecture-v1 / ICT definition / DecisionEnvelope / tick-engine changes.
- HTF `fullRebuild` (#2) is the larger **absolute** spike when it fires, but higher correctness risk and rarer (5m/15m/daily length edges). Do structure gate first, then re-measure HTF.

**STOP — not implemented.**

---

## Stage report (pure new-1m MISS)

Authoritative path: `initialize` → `applyClosedBar` → `afterClosedBar` (`eqhForce:false`).

| # | Stage | Wall | CPU (user+sys) | Bars | Scans entire history? | Runs because new 1m? | Theoretically incremental? | Calls other expensive ops? |
|---:|---|---:|---:|---:|---|---|---|---|
| 1 | market-data acquisition | 489ms (disk once) | ~391ms | 1381 | n/a | no | n/a | JSON+Date hydrate |
| 2 | Tickstream | 0 (fixture) | 0 | 0 | n/a | no | n/a | live prior ~8–10s not re-run |
| 3 | 1m processing (`applyClosedBar`) | **783ms** | **719ms** | 603 | yes (via structure) | **yes** | partial | → structure + EQH |
| 4 | 5m processing | **0** | 0 | 0 | — | **no** | yes | skipped |
| 5 | 15m processing | **0** | 0 | 0 | — | **no** | yes | skipped |
| 6 | daily processing | **0** | 0 | 0 | — | **no** | partial | only `applyPriceDerived` H/L bump |
| 7 | `buildStructureFacts` | **`lastStructureMs` 649ms** | (majority of #3) | 603 | **yes** (composite) | **yes** | **yes** | REH+FP+liq+FVG+MSS |
| 8 | swing / MSS | ~0.3ms leaf | ~0 | ≤80 | no | yes | yes | `findSwings` |
| 8b | REH/REL | ~437ms leaf / ~235ms CPU | | scoped+120 | partial | yes | **yes** | window filters + pair |
| 9 | liquidity interactions/sweeps | leaf noisy; lookback 40 | | ≤40×levels | partial | yes | partial | `classifyLevelInteraction` |
| 10 | 1m FVG | ~2.5ms | ~0 | ≤80 | no | yes | partial | cheap |
| 10b | first-presented FVG | ~334ms / ~297ms CPU | | session scan | partial | yes | **partial** (stable after set) | 3 FP detectors |
| 11 | EQH/EQL | **133ms** in-path | | ≤720 | partial | yes | **yes** (`updateEqhEqlLiquidity`) | rebuild this bar (`reuseΔ=0`) |
| 12 | HTF calculations | **0** | 0 | 0 | — | **no** | partial | skipped |
| 13 | session/AMD | ≪1ms | 0 | 1 | no | yes | **already** | `updateSessionExtremes` |
| 14 | ICT concepts | n/a | — | — | — | folded into #7 | — | no separate runner |
| 15 | quality gate | **31ms** | ~15ms | 0 | no | yes | n/a | assemble+audit |
| 16 | `fullRebuild` | **0** (`fullRebuildsΔ=0`) | — | — | — | **no** | — | pure path never calls |

**Counters (pure):** `barUpdates=1`, `structureRebuilds=1`, `eqhEqlRebuilds+=1`, `eqhEqlReused+=0`, `fullRebuilds` unchanged after cold.

**Shared live miss:** cold 5779ms → miss `bars` **1360ms** (`lastStructureMs` 974, `lastEqhMs` 94).

---

## Stage report (HTF-coincident — `fullRebuild`)

| # | Stage | Wall | Notes |
|---:|---|---:|---|
| 16 | `syncSeries` htf sync `fullRebuild` | **13095ms** (CPU user 8984 + sys 1266) | Event label `htf sync rebuild`; `fullRebuildsΔ=1` |
| — | `buildMarketContextAt` leaf | ~12333ms | includes structure |
| 12 | HTF PD/NWOG/ORG (+ daily FVG) | ~3195ms leaf | only on this path |
| 13 | session window re-scan | ~1864ms leaf | `barsInEstWindow` ×5 over 1381 |
| 6 | `buildFvgDailyBars` | ~220ms | scans m1 |
| 4/5 | 5m/15m FVG | 3.6 / 1.2ms | cheap; not the cost |
| 11 | EQH inside fullRebuild | `lastEqhMs` **1151ms** | full `detectEqhEqlLiquidity(720)` |

---

## Trace: every `fullRebuild` call site

| Site | WHY triggered | WHAT changed | Could structural state update incrementally? | Downstream required rebuild |
|---|---|---|---|---|
| `initialize()` | cold / symbol / session miss / first-bar mismatch / shrink | entire sliced feed | **No** (bootstrap) | `buildMarketContextAt` + `detectEqhEqlLiquidity(720)` + structure snapshot |
| `rebuild()` | test/reference | forced | No | same |
| `applyClosedBar` seek-back (`bar.time < last`) | PIT rewind / recovery | m1 truncated to bar | No (history rewrite) | fullRebuild on **current** feed HTF (not re-sliced here) |
| `syncSeries` `htfChanged` | **m5 \|\| m15 \|\| daily length ≠** | HTF arrays + `feed.m1 = sliced.m1` | **Partial** — could `applyClosedBar` new 1ms + patch HTF HL/FVG only | **Everything:** 5m/15m FVG, daily FVG bars, NWOG, ORG, PD, session windows, `buildStructureFacts`, EQH |
| `syncSeries` → `initialize` | `!ctx` / `!firstMatch` / `next.length+1 < prev.length` | full re-slice | No | initialize → fullRebuild |

**Not a `fullRebuild`:** pure `+1` 1m with HTF lengths equal → `applyClosedBar` → `rebuildOneMinuteStructure` only.

Code (`lib/incremental-market-engine.ts`):

```443:459:lib/incremental-market-engine.ts
    const htfChanged =
      sliced.m15.length !== this.feed.m15.length ||
      sliced.m5.length !== this.feed.m5.length ||
      sliced.daily.length !== this.feed.daily.length;
    // ...
    if (htfChanged) {
      this.feed.m1 = sliced.m1;
      // ...
      this.fullRebuild();
      // label: "htf sync rebuild"
```

```484:491:lib/incremental-market-engine.ts
  private afterClosedBar(bar: Bar) {
    this.applyPriceDerived(bar.close, bar);
    const biasEvents = this.drainBiasEvents();
    this.rebuildOneMinuteStructure({ eqhForce: false });
    // ...
  }
```

---

## Proof: does new 1m unnecessarily cause…?

| Claim | Pure consecutive 1m | HTF-coincident 1m |
|---|---|---|
| 5m / 15m / HTF rebuild | **No** — proven `fullRebuildsΔ=0`; stages 4/5/12 = 0ms | **Yes** — length gate → fullRebuild (~13s) |
| Entire structure-history scan | **Yes** — full `buildStructureFacts` every close | **Yes** — inside `buildMarketContextAt` |
| Concepts that cannot have changed | **Yes** — e.g. first-presented after found; untouched HTF FVGs (not even run on pure, but REH/FP re-scan anyway) | Recomputes all HTF concepts even if only one HTF bar appended |

---

## Relation to live 20–80s+ MISS

Fixture CPU alone: pure ~0.8–1.4s @603; HTF coincident **~13s** @1381; prior full-depth pure ~1.3–3s. Live wall remains higher due to Yahoo + Tickstream + 8GB GC thrash (RSS approached ~0.8GB in this profile alone). **HTF-coincident fullRebuild is the in-process mechanism that lands in the “tens of seconds” class** without needing a detector rewrite; pure-path structure remains the **per-minute** tax after EQH force-off.

---

## Engine snapshots

**Pure 1m (local):**

```json
{
  "applyClosedBarMs": 783.5,
  "lastStructureMs": 648.7,
  "lastEqhMs": 133.0,
  "fullRebuildsDelta": 0,
  "structureRebuildsDelta": 1,
  "eqhReuseDelta": 0,
  "eqhRebuildDelta": 1
}
```

**HTF coincident:**

```json
{
  "syncMs": 13094.8,
  "fullRebuildsDelta": 1,
  "lastFullMs": 11554.8,
  "lastEqhMs": 1151.2,
  "event": "htf sync rebuild"
}
```

---

*End of profile. No implementation performed.*
