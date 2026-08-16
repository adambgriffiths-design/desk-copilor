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
| **Full dump enrich** | Progressive **12/1075** on 8GB box (optional continue later) |
| **Liquidity map #2** | **IN_PROGRESS** — Cursor implementing `liquidityPools[]` (NY-pre, ORG, gaps, REH/REL, EQH/EQL); smoke only, no full Y=1500 |
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

Liquidity timing + HTF stack **PASS**. Full liquidity map implementation **running now** in Cursor (representation only). Await PASS/FAIL fields before next ChatGPT decision.

---

## Proposed next (ONE)

**Wait for Cursor liquidity-map result** (LIQUIDITY_MAP PASS/FAIL). Do not start sequence #3 or unlock. Optional after PASS: outcome-blind coverage smoke review only.

---

## Paste-ready ONE next Cursor prompt

```
Read data/research/KAREN-UI-BRIEF.md and KAREN-HANDOFF.md.

ONE next action (representation only):
Start full liquidity map into featuresAtT (NY-pre, ORG, gaps, REH/REL, EQH/EQL) per karen-liquidity-map-completeness-audit.md.
No trading changes. Unlock PARKED. No VAL/HOLDOUT. No sequence history yet.
Refresh KAREN-UI-BRIEF.md when done.
```
