# KAREN — FORCE_WAIT GOOD vs BAD mechanism review (case study)

**DATE:** 2026-08-16  
**MODE:** research documentation only  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED  
**VAL:** DO NOT TOUCH  
**ALS / score / unlock / implementation:** none  
**Source:** `data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json`  
**Pool:** FORCE_WAIT ∧ c1Shadow.actionable (n=1074)  
**Outcome labels:** stratification / reading only — **not** for predicate or unlock design  
**Lock:** [`karen-wait-quality-feature-gap-lock.md`](./karen-wait-quality-feature-gap-lock.md) — selective unlock **PARKED**

**Bottleneck frame:** **evidence quality / sequence representation before WAIT** — not “which WAITs to unlock.”

---

## METHOD

1. Restrict to DEV FORCE_WAIT shadow-ACT stamps.  
2. Stratify ~12 GOOD and ~12 BAD by session × side; outcomes only to pick case sets.  
3. Trace decision-time path: structure, bias, displacement, FVG, sweeps, entryModel, contradictions, reason counts, gate phrasing.  
4. Code path: one-sided support + entry WAIT|EXTENDED → WAIT (`lib/decision-layer.ts` / `shouldForceEntryWait`).  
5. No subset hunting, no proxyR mining, no unlock rule.

**Sample fold-in:** Typed `ContradictionReport` exists but stamps keep `string[]` + count (only **3** unique strings). **49** shared categorical fingerprints cover **458 GOOD + 313 BAD** — largely inseparable on discrete fields. Strongest existing separators are lossy structure↔bias renames (`cc=1` / cited_mss), **not** WAIT quality.

---

## HOW FORCE_WAIT IS REACHED

```
observation → interpretation (reasons + free-text contradictions + entry_model)
  → decision-layer: one-sided support + entry scaffold WAIT|EXTENDED
  → verdict WAIT  (= FORCE_WAIT primary when one-sided)
```

- Many stamps have `cc=0` (620/1074) — contradictions are not the gate.  
- `featuresAtT.waitReason` always **null** on this dump.

---

## Compact case tables

### GOOD (n=12 stratified)

| asOf (UTC) | side | sess | model | ms | bias | disp | fvg | sw | mss | cc | ctype | L/S | gate |
|------------|------|------|-------|----|------|------|-----|----|-----|----|-------|-----|------|
| 2023-10-16 14:15 | L | AM | bull-cont | bull | bear | abs | pre | N | Y | 1 | struct>bias_bull | 2/1 | struct/bias WAIT |
| 2023-10-20 15:02 | S | AM | Disp+FVG | bear | bear | D:bull | pre | N | Y | 0 | (none) | 1/3 | retrace WAIT |
| 2023-10-06 18:46 | L | PM | bull-cont | bull | bear | abs | pre | N | Y | 1 | struct>bias_bull | 2/1 | struct/bias WAIT |
| 2023-10-19 19:42 | S | PM | Disp+FVG | bear | bear | D:bear | pre | N | Y | 0 | (none) | 0/4 | retrace WAIT |
| 2023-10-04 15:30 | L | LUNCH | bull-cont | bull | bear | abs | pre | N | Y | 1 | struct>bias_bull | 2/1 | struct/bias WAIT |
| 2023-11-16 16:42 | S | LUNCH | bear-cont | bear | bear | abs | pre | Y | Y | 0 | (none) | 1/3 | other WAIT |
| 2023-10-02 00:00 | L | OTHER | bull-cont | bull | bear | abs | pre | Y | Y | 1 | struct>bias_bull | 2/2 | struct/bias WAIT |
| 2023-10-06 12:36 | S | OTHER | NY-rev | bear | bear | D:bear | pre | Y | Y | 0 | (none) | 1/4 | retrace WAIT |
| 2023-10-03 07:40 | L | OTHER | Disp+FVG | bull | bear | D:bull | pre | Y | Y | 1 | struct>bias_bull | 4/1 | struct/bias WAIT |
| 2023-10-09 03:56 | S | OTHER | bear-cont | bear | bear | D:bear | abs | N | Y | 0 | (none) | 0/3 | other WAIT |
| 2023-10-09 16:16 | L | LUNCH | Disp+FVG | bull | bear | D:bull | pre | N | Y | 1 | struct>bias_bull | 3/1 | struct/bias WAIT |
| 2023-10-09 23:16 | L | OTHER | bull-cont | bull | bear | D:bull | abs | N | Y | 1 | struct>bias_bull | 2/1 | struct/bias WAIT |

### BAD (n=12 stratified)

| asOf (UTC) | side | sess | model | ms | bias | disp | fvg | sw | mss | cc | ctype | L/S | gate |
|------------|------|------|-------|----|------|------|-----|----|-----|----|-------|-----|------|
| 2024-02-12 14:02 | L | AM | bull-cont | bull | bear | D:bull | abs | Y | Y | 1 | struct>bias_bull | 3/1 | struct/bias WAIT |
| 2023-10-12 14:56 | S | AM | bear-cont | bear | bear | abs | pre | Y | Y | 0 | (none) | 1/4 | other WAIT |
| 2023-11-30 17:47 | L | PM | Disp+FVG | bull | bear | D:bull | pre | N | Y | 1 | struct>bias_bull | 3/1 | struct/bias WAIT |
| 2023-11-01 17:32 | S | PM | Disp+FVG | bear | bear | D:bear | pre | N | Y | 0 | (none) | 1/3 | retrace WAIT |
| 2023-10-13 16:45 | L | LUNCH | bull-cont | bull | bear | abs | pre | N | Y | 1 | struct>bias_bull | 2/1 | struct/bias WAIT |
| 2023-10-05 17:06 | S | LUNCH | Disp+FVG | bear | bear | D:bear | pre | N | Y | 0 | (none) | 0/4 | retrace WAIT |
| 2023-10-02 12:10 | L | OTHER | bull-cont | bull | bear | abs | pre | Y | Y | 1 | struct>bias_bull | 2/2 | struct/bias WAIT |
| 2023-10-02 06:00 | S | OTHER | Disp+FVG | bear | bear | D:bull | pre | N | Y | 0 | (none) | 1/3 | retrace WAIT |
| 2023-10-03 01:30 | S | OTHER | Disp+FVG | bear | bear | D:bear | pre | N | Y | 0 | (none) | 0/4 | retrace WAIT |
| 2023-10-04 03:10 | L | OTHER | Disp+FVG | bull | bear | D:bull | pre | N | Y | 1 | struct>bias_bull | 3/1 | struct/bias WAIT |
| 2023-10-05 04:40 | S | OTHER | bear-cont | bear | bear | abs | pre | N | Y | 0 | (none) | 0/3 | other WAIT |
| 2023-10-05 10:50 | S | OTHER | Disp+FVG | uncl | bear | D:bear | pre | Y | N | 0 | (none) | 1/3 | other WAIT |

Same models and binary footprints appear in both tables — case reading does **not** yield a safe release rule on current fields.

---

## GOOD_FW_MECHANISMS

1. Structure-led one-sided support under HTF conflict (`struct/bias WAIT`).  
2. Aligned continuation / Disp+FVG with entry not in zone (`retrace WAIT`, often cc=0).  
3. NY-reversal path still WAIT (not in zone).  
4. Displacement/FVG disagreement lives in prose, not typed features.

## BAD_FW_MECHANISMS

1. Same “clean” retrace WAIT that later fails.  
2. Same structure≠bias template as GOOD.  
3. Displacement opposing intended side under Disp+FVG label.  
4. Thin / unclear structure still one-sided by counts.

## SHARED_MECHANISMS

One-sided support + entry WAIT|EXTENDED; shared entry models; binary mss/fvg/sweep; contradictions collapsed to count; missing typed entry/wait state on stamps.

---

## MISSING_INFORMATION_CANDIDATES (four areas — Adam menu)

| Area | Status in audit |
|------|-----------------|
| **contradiction type (not count)** | **SELECTED** — typed report exists; stamps discard it |
| confirmation sequence/freshness | Real gap; deferred |
| liquidity meaning (taken/breached/interacted) | Real gap (`sweepPresent`); deferred |
| independent confluence vs duplicated reasons | Real gap (counts only); deferred |

FVG polarity / reason text / sweep identity in `factsPreview` reinforce that structured representation is missing — still **one** next instrument only.

---

## FEATURE_REPRESENTATION_GAPS

| Gap | Loss |
|-----|------|
| contradictionCount | type, polarity, severity, evidence paths |
| sweepPresent | raid side / interaction meaning |
| displacement binaries | alignment / freshness vs support |
| reason counts | independence vs duplication |
| no entryStatus / zone distance | why WAIT vs ACTIVE |

---

## NEW_FEATURE_STORY_JUSTIFIED

**YES**

**ONE missing PIT-safe representation to instrument next:**  
**contradiction type (not count)**

Not an unlock. Not c4. Selective unlock stays **PARKED**. If typed conflict still cannot support a quality story after measurement → **PARK FORCE_WAIT** as active research attack (no subset-hunting). That is the stop after this measurement — not a license to keep mining unlocks now.

---

## NEXT_SINGLE_MEASUREMENT

**Instrument contradiction type only** on FORCE_WAIT stamps (reuse `ContradictionReport` ids + structure↔bias polarity); frequency/co-occurrence only — no unlock, no score, no VAL.

---

## Governance

EDGE_CLAIM NONE · HOLDOUT SEALED · VAL DO NOT TOUCH · no ALS / trading code / commit  
Related: [`karen-force-wait-contradiction-semantics.md`](./karen-force-wait-contradiction-semantics.md) · [`karen-force-wait-decision-path-audit.md`](./karen-force-wait-decision-path-audit.md)
