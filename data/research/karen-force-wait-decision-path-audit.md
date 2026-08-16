# KAREN — FORCE_WAIT decision-path audit

**DATE:** 2026-08-16  
**MODE:** research documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score / unlock / implementation:** none  
**Outcome labels:** **not used** to design changes  
**Sources:** stamp dump + `lib/interpretation-engine.ts`, `lib/contradiction-report.ts`, `lib/decision-layer.ts`, `lib/execution-plan.ts`, `lib/decision-process-experiment.ts`, `scripts/karen-dv-force-wait-shadow-stamps-y1500.ts`  
**Lock:** selective unlock **PARKED**

**Bottleneck frame:** **evidence quality / sequence representation before WAIT** — not “which individual WAITs to unlock.”

---

## PATH (stages)

```mermaid
flowchart TD
  A[Raw bars / MarketContext] --> B[Observation freeze at t]
  B --> C[Interpretation: reasons + entry_model + free-text contradictions]
  B --> D[Typed ContradictionReport id/severity/affects]
  C --> E[longSupported / shortSupported + reason lists]
  D -.->|mostly unused by stamps| X[Discarded from featuresAtT]
  E --> F[Execution scaffold: entry zone / WAIT|EXTENDED|ACTIVE]
  F --> G{One-sided support?}
  G -->|yes + WAIT/EXTENDED| H[Verdict WAIT = FORCE_WAIT primary]
  G -->|yes + ACTIVE| I[LONG/SHORT actionable]
  G -->|both / neither| J[WAIT conflict or NO_TRADE]
  H --> K[Stamp featuresAtT: counts + booleans + string contradictions]
  K --> L[Research sees contradictionCount / citedConcepts / binaries]
```

### Stage notes

| Stage | What is kept | What is lost |
|-------|----------------|--------------|
| Observation | structure, bias, displacement, fvg status, liquidity levels | Often direction/side detail not mirrored into stamp columns |
| Interpretation | reason **strings**, entry_model, free-text contradictions | Reason **identity** → later only **counts**; FVG/sweep meaning in prose |
| ContradictionReport | typed ids | **Not copied** into DV stamps |
| Support flags | boolean + counts | Correlation / duplication among reasons unmeasured |
| Execution | WAIT vs EXTENDED vs in-zone | `waitReason` **null** on stamps; zone distance absent |
| Decision | WAIT | “Why wait” compressed to invalidationCondition templates |
| Stamp | featuresAtT | Research-facing lossy view |

FORCE_WAIT primary (`isForceWaitPrimary`): one-sided support + WAIT (or waitReason entry/retrace/extended). Gate force itself is `shouldForceEntryWait(entryStatus)` — WAIT|EXTENDED under frozen experiment `none`.

---

## LOSSY_STEPS (ranked)

1. **Typed contradictions → `string[]` + `contradictionCount`** — largest research-facing loss; typed report already exists. Only **3** unique strings on dump.  
2. **Liquidity semantics → `sweepPresent` boolean** — taken/breached/interacted and BSL vs SSL survive in narrative / level labels, not structured stamp fields.  
3. **Reason lists → `longReasonCount` / `shortReasonCount`** — independent vs duplicated/correlated confluence invisible; same margin can mean different evidence.  
4. **Confirmation sequence → independent binaries** — displacement, fvgStatus, mssPresent, sweepPresent co-occur without order/freshness/alignment.  
5. **FVG polarity / which gap** — in `factsPreview` prose; not a stamp column (pipeline has `obs.fvg.direction`).  
6. **Entry scaffold state** — WAIT vs EXTENDED vs distance-to-zone not in featuresAtT (`waitReason` always null on this dump).  
7. **Support filter vs contradiction text** — structure↔bias “opposes bearish” does not clear LONG support (filter looks for “opposes bullish”) — conflict recorded ≠ conflict enforced.

---

## SMALLEST_UPSTREAM_REPRESENTATION_PROBLEMS

(Plausibly explain why GOOD/BAD look the same at the FORCE_WAIT gate — **without** designing unlocks.)

| Rank | Problem | Why it blocks WAIT-quality research |
|------|---------|-------------------------------------|
| 1 | **Contradiction type discarded** | Gate/research only sees count; cannot ask “what kind of conflict?” before WAIT |
| 2 | Sequence/alignment not first-class | Same Disp+FVG label covers agreeing and opposing displacement/FVG stories |
| 3 | Liquidity meaning collapsed | Raid-on-highs vs raid-on-lows treated as one sweep bit |
| 4 | Reason correlation unmeasured | Counts overstate confluence |

**Sample fold-in:** 49 shared categorical fingerprints cover **458 GOOD + 313 BAD** — largely inseparable on discrete `featuresAtT` fields. Strongest existing separators are lossy renames of structure↔bias (`cc=1` / cited_mss), **not** WAIT quality — already DEFINE_BLOCK’d / PARKED for unlock.

---

## STOP CONDITION VERDICT (shared)

| Field | Value |
|-------|--------|
| **NEW_FEATURE_STORY_JUSTIFIED** | **YES** |
| **ONE representation to instrument** | **contradiction type (not count)** |
| **Not chosen now** | confirmation sequence/freshness; liquidity meaning; independent vs duplicated reasons — parked behind this single next measurement |
| **C4_SINGLE_CHANGE** | **NOT_DEFINED** |
| **SELECTIVE_UNLOCK** | **PARKED** |

Rationale for YES (single choice): the typed report is already PIT-computable at decision time; stamps throw it away; count is demonstrably lossy **without** using outcomes. That is a clean representation fix for “evidence quality before WAIT,” not a WAIT-unlock story.

If instrumentation later shows typed conflicts still cannot support any quality story, **then** PARK FORCE_WAIT as an active research attack (no subset-hunting). That park is **not** the next step while type remains unmeasured.

---

## NEXT_SINGLE_MEASUREMENT

**Measure/instrument contradiction type only** (typed id + structure↔bias polarity on FORCE_WAIT stamps). Frequency / co-occurrence with other at-*t* fields. No unlock, no score, no VAL, no threshold mining.

---

## Governance

EDGE_CLAIM NONE · HOLDOUT SEALED · VAL DO NOT TOUCH · no ALS / production / commit  
Related: [`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md) · [`karen-force-wait-good-bad-mechanism-review.md`](./karen-force-wait-good-bad-mechanism-review.md)
