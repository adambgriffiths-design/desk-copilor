# Karen — liquidity interaction sequence audit

**Date:** 2026-08-16  
**Scope:** Representation / retention only. Whether interaction **history** is flattened to a single latest (max-rank) status at decision time.  
**OUTCOMES:** NO  
**Trading / ALS / unlock / VAL / HOLDOUT:** untouched  
**EDGE_CLAIM:** NONE  

Related SoT:
- [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md) — priority #3 = interaction sequence
- [`karen-liquidity-representation-v1.md`](./karen-liquidity-representation-v1.md) — v1 = timing only; sequence = future `v2+`
- Classifier: `lib/level-interaction.ts`
- Structure facts: `lib/structure.ts` (`levelInteractions`)
- Observation: `lib/observation-engine.ts` (`buildLiquidityLevels`)
- Stamp: `lib/liquidity-stamp-features.ts` (`liquidity_repr_v1`)

---

## Verdict

| Question | Answer |
|----------|--------|
| Does Karen keep only one status per level? | **YES** — max-rank collapse |
| Can decision-time stamps reconstruct TESTED→TOUCHED→BREACHED→…? | **NO** |
| Is `liquidityInteractionHistory[]` (or equivalent) justified? | **YES** |
| Outcomes analyzed? | **NO** |

**HISTORY_JUSTIFIED: YES**  
**OUTCOMES: NO**

---

## Intended state ladder (engine vocabulary)

`NamedLevelStatus` in `lib/level-interaction.ts` / `desk-schema` / `types`:

```
UNTOUCHED → TESTED → TOUCHED → BREACHED → SWEPT → CLOSED_BEYOND
                                                      INVALIDATED (type member; not produced by PD classifier)
```

**PD / session classifier behavior (`classifyLevelInteraction` / `classifyReferenceCloseInteraction`):**

| Status | Produced by PD/session classifier? | Notes |
|--------|------------------------------------|-------|
| `UNTOUCHED` | Yes (default) | No tag in lookback |
| `TESTED` | Yes | Stopped 1 tick short |
| `TOUCHED` | Yes | Exact tag |
| `BREACHED` | Yes | Wick through, no body close beyond |
| `SWEPT` | **No** | In type; EQH/EQL wick lifecycle uses a different detector — do not collapse |
| `CLOSED_BEYOND` | Yes | Body close beyond = qualifying “taken” |
| `INVALIDATED` | **No** (this path) | Present on type / EQH lifecycle elsewhere |

So the operational PD sequence Karen actually advances through is:

```
UNTOUCHED → TESTED → TOUCHED → BREACHED → CLOSED_BEYOND
```

(`SWEPT` / `INVALIDATED` are adjacent vocab, not steps emitted by this classifier.)

---

## How flattening works (code)

### 1. Monotonic max-rank over lookback bars

`classifyLevelInteraction` scans `m1.slice(-lookback)` (default **40** bars) and updates only when `rank(next) > rank(status)`:

| Status | Rank |
|--------|------|
| CLOSED_BEYOND | 6 |
| SWEPT | 5 |
| BREACHED | 4 |
| TOUCHED | 3 |
| TESTED | 2 |
| UNTOUCHED | 1 |

Effects:

- Intermediate upgrades are **discarded** (e.g. TESTED then TOUCHED → only TOUCHED retained).
- Once a higher rank is set, lower-rank later bars never reappear.
- Exactly **one** `qualifyingTick` is kept — the tick that achieved the **peak** status, not each step.
- `why` describes only the peak event.

Same pattern in `classifyReferenceCloseInteraction` (PDC).

### 2. Stored as one row per level id

`lib/structure.ts` maps each liquidity level → a single `levelInteractions[]` entry:

- `levelId`, `status`, `why`, optional `atTime` / `candleId` / `tickPrice`

No `history`, `sequence`, `statusPath`, or prior-status array.

### 3. Observation + stamp copy the scalar

`buildLiquidityLevels` copies `ix.status` + peak tick fields onto `obs.liquidity.levels[]`.  
`stampLiquidityFeaturesFromObs` copies those into `liquidityLevels[]` (`liquidity_repr_v1`).

Still: **one `status` + one qualifying tick per level.**

---

## Can the sequence be reconstructed at decision time?

| Surface | Reconstructable? | Why |
|---------|------------------|-----|
| `featuresAtT` / `liquidityLevels[]` stamp | **No** | Final status + peak tick only |
| `structureFacts.levelInteractions[]` | **No** | Same flatten |
| `obs.liquidity.levels[]` | **No** | Same flatten |
| Re-running current `classifyLevelInteraction` on raw 1m | **No** | Same max-rank algorithm |
| Custom bar-walk that **emits every rank upgrade** (if full 1m still in memory) | **Theoretically yes, outside Karen** | Not implemented; lookback still caps at 40 bars for the current classifier window; stamps never persist the path |

**Conclusion:** At decision / stamp time, Karen retains **latest (peak) state only**. Sequence is not available on the decision surface and is not recoverable from stamped features.

---

## Loss examples (representation only)

| Real path on tape | What Karen retains |
|-------------------|--------------------|
| TESTED → TOUCHED → BREACHED | `BREACHED` + tick of first BREACH upgrade |
| BREACHED → later CLOSED_BEYOND | `CLOSED_BEYOND` + close tick; BREACH time/path gone |
| Multiple TOUCHED before CLOSE | Only CLOSE (or highest) tick |
| CLOSED_BEYOND then wick-only revisit | Still `CLOSED_BEYOND` (rank never decreases) |

This is distinct from the v1 timing gap: v1 answers *when the peak status was earned*; it does **not** answer *what happened before*.

---

## Is `liquidityInteractionHistory[]` justified?

**YES.**

Justification (representation, not outcomes):

1. **Flattening is explicit and complete** — rank-max in the classifier; no parallel history buffer anywhere on the path to `featuresAtT`.
2. **Priority #3 already names this gap** — inventory locks “tested→touched→breached→swept→closed_beyond **history**, not only final status” as second-order work after timing (#1) and pools (#2).
3. **Peak tick ≠ sequence** — `qualifyingTickAt` / `candleId` document one event; they cannot reconstruct prior ranks.
4. **Decision-time reconstruction via current APIs is impossible** — reclassify collapses the same way; stamps have nothing to expand.

An equivalent (ordered list of `{status, at, price?, candleId?}` per level, append-only on rank upgrade, PIT-safe) would close the gap. Naming can be `liquidityInteractionHistory[]` on the level row or a sibling stamp field under a future `liquidity_repr_v2+` — this audit does **not** implement it.

**Do not start implementation here** until inventory priority order allows (#1 stamp + outcome-blind freq PASS, then #2, then #3).

---

## What this audit does *not* claim

- No edge, expectancy, or wait-quality claim from sequence presence/absence.
- No change to taken / CLOSED_BEYOND proof rules.
- No requirement that EQH `SWEPT` lifecycle merge into PD history.
- No trading, unlock, VAL, or HOLDOUT action.

---

## File / field map (flatten points)

| Stage | Location | Retained |
|-------|----------|----------|
| Classify | `lib/level-interaction.ts` | Peak `status` + one `qualifyingTick` |
| Structure facts | `lib/structure.ts` → `levelInteractions[]` | One object per `levelId` |
| Observation | `lib/observation-engine.ts` → `liquidity.levels[]` | Scalar `status` + peak tick fields |
| Stamp | `lib/liquidity-stamp-features.ts` | Same scalars (`liquidity_repr_v1`) |
| History array | — | **Absent** |

---

## Lock lines

```
OUTCOMES: NO
HISTORY_JUSTIFIED: YES
```

Flattened to latest/peak status: **confirmed**.  
Sequence at decision time: **not retained; not reconstructible from stamps**.  
`liquidityInteractionHistory[]` (or equivalent): **justified** as representation work when priority #3 is unlocked.
`)