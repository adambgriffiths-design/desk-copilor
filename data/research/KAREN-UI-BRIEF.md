# KAREN UI BRIEF — Cursor → ChatGPT

**Updated:** 2026-08-16  
**Mode:** representation only · no trading changes  
**EDGE_CLAIM:** NONE · **HOLDOUT:** SEALED · **VAL:** DO NOT TOUCH · **SELECTIVE_UNLOCK:** PARKED

---

## Status

| Field | Value |
|-------|--------|
| **Liquidity timing** (`liquidity_repr_v1`) | **PASS** — session H/L `formedAt` wired; smoke freq 100% formedAt |
| **HTF bias stack** (`htf_bias_repr_v0`) | **PASS** — daily / m15 / m5 / aligned stamped; `tradeableBias` kept |
| **Liquidity map #2** (`liquidity_map_repr_v0`) | **PASS** — `liquidityPools[]` stamps NY-pre, ORG, gaps, REH/REL, EQH/EQL when present; keeps `liquidityLevels` |
| **Reasoning** (`reasoning_repr_v0`) | **PASS** — compact chain + conflictBetween stamped; citedConcepts / reason counts retained |
| **Evidence dependency** (`evidence_dependency_repr_v0`) | **PASS** — audit + synthetic smoke; shared vs separate sources distinguishable; no dedupe / no trading change |
| **Full dump enrich** | Progressive **12/1075** on 8GB box (optional continue later) — map smoke n=8 only |
| **Sequence #3** | **NOT_STARTED** |
| **Unlock** | **PARKED** |
| **C4** | **NOT_DEFINED** |

---

## Locks

1. Representation before unlock  
2. No VAL / HOLDOUT  
3. One next action  
4. No live trading behaviour changes from this lane  

---

## Last result

Evidence dependency representation **PASS** (`evidence_dependency_repr_v0`): code-proven duplicate paths (bias-aliased structure; SSL+displacement-after) vs independent sources (MSS vs bias; sweep vs FVG). Smoke outcome-blind. Reason counts unchanged. Liquidity map / HTF / reasoning status above preserved.

SoT: [`karen-evidence-dependency-representation-v0.md`](./karen-evidence-dependency-representation-v0.md)

---

## Proposed next (ONE)

**Park unlock.** Optional: wire `evidence_dependency_repr_v0` into a tiny outcome-blind stamp helper (no gate change) **only if Adam confirms** — **or** liquidity sequence #3 / map frequency when RAM allows. Do **not** unlock WAIT. Do **not** dedupe reasons yet.

---

## Paste-ready ONE next Cursor prompt

```
Read data/research/KAREN-UI-BRIEF.md and KAREN-HANDOFF.md.

ONE next action (representation only):
Optional tiny outcome-blind stamp of evidence_dependency_repr_v0 (annotation only; no reason dedupe; no support-gate change) — OR liquidity sequence #3 / map frequency only if Adam confirms.
No trading changes. Unlock PARKED. No VAL/HOLDOUT.
Refresh KAREN-UI-BRIEF.md when done.
```
