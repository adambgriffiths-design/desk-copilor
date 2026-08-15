# PDC status verification — TAKEN / BREACHED / UNTOUCHED / UNPROVEN

**Date:** 2026-08-14  
**Scope:** Interaction status for **correct** PDC **30216.25** only (level provenance verified in `research-pdc-level-provenance.md`)  
**Not in scope:** PDC price calculation, trading strategy, Karen bullish/bearish, chat/stream build, commit/push/deploy  

---

## Report card (after fix)

| Field | Value |
|---|---|
| **PDC LEVEL** | **30216.25** (unchanged — Globex frozen) |
| **PDC SOURCE** | Prior CME Globex session last 1m close (`cme_session_1m`); formation candle **2026-08-13T20:59:00.000Z** (16:59 ET Thu) |
| **QUALIFYING CANDLE** | **High-side TAKEN:** `m1:1786705200` — 2026-08-14T11:00:00.000Z (07:00 ET), O=30216.5 H=30217.5 L=30215.5 **C=30226.5** (body close > 30216.25, range tags level). Fri Globex open bar (C=30182) is entirely below PDC → no tag → does not qualify. |
| **PDC STATUS (bar truth)** | **TAKEN** — `classifyReferenceCloseInteraction` returns `CLOSED_BEYOND` within Friday Globex session lookback (body close above 30216.25). |
| **PDC STATUS (pipeline / Karen)** | **TAKEN** — `status=CLOSED_BEYOND`, `taken=true`, fact value `30216.25 — CLOSED_BEYOND`, no `liquidity.sweep.pdc` object. |
| **PROVENANCE** | `ctx.daily.pdhSource=cme_session_1m`, `pdcFormedAt=1786611540`, `yahooDailyClose=30188.50` (diagnostic only), `state.levels.pdcSource=cme_session_1m` |
| **FIRST DIVERGENCE (prior)** | `lib/structure.ts` → `isSweepableLiquidityId("pdc") === false` → PDC hardcoded `status: "UNTOUCHED"`. |
| **FIX APPLIED** | `isReferenceInteractionLevel("pdc")` routes PDC through `classifyReferenceCloseInteraction(sessionM1, level)` while PDC remains excluded from `detectLiquiditySweeps`. |
| **ROOT CAUSE (resolved)** | Intentional “not a sweep pool” exclusion also blocked interaction status. Fixed by separating sweep-pool membership from reference-close interaction classification. |
| **TESTS** | `npx tsx scripts/test-market-state-truth.ts` — **100 passed, 0 failed** (PDC status ladder + provenance). `npx tsx scripts/test-decision-envelope.ts` — **ok**. |

---

## Semantics (implemented)

User mapping: `CLOSED_BEYOND` → **TAKEN**, `BREACHED` → **BREACHED**, no tag → **UNTOUCHED**, missing candle/source → **UNPROVEN**.

PDC uses **reference-close** interaction (`classifyReferenceCloseInteraction` in `lib/level-interaction.ts`):

| Rule | Condition |
|---|---|
| **TAKEN** (high) | Bar range tags PDC **and** 1m body close > 30216.25 |
| **TAKEN** (low) | Bar range tags PDC **and** 1m body close < 30216.25 **without** wicking above (high ≤ PDC) |
| **BREACHED** | Wick through PDC without qualifying body close (e.g. high > PDC, close ≤ PDC) |
| **UNTOUCHED** | Bar range never tags PDC (entirely above or below) |
| **UNPROVEN** | `pdhSource !== cme_session_1m` → `taken="unknown"` via existing `canProvePdhTaken` gate |

Bars entirely on one side of PDC (e.g. Fri Globex open at 30182, high 30190 < 30216.25) do **not** count as TAKEN — requires the 1m range to include the level.

---

## Code changes

```294:310:lib/structure.ts
function isReferenceInteractionLevel(id: string): boolean {
  return id === "pdc";
}
// ...
if (isReferenceInteractionLevel(level.id)) {
  const interaction = classifyReferenceCloseInteraction(sessionM1, level);
  // → levelInteractions.pdc.status from bar truth
}
// liquiditySweeps still filters out pdc via isSweepableLiquidityId
```

```150:205:lib/level-interaction.ts
export function classifyReferenceCloseInteraction(...) {
  // bidirectional body-close semantics; requires bar range to tag level
}
```

**Not changed:** PDC level (30216.25), architecture-v1 weights, Karen prompts, sweep-pool membership for PDC.

---

## End-to-end trace (Globex PDC → Karen) — after fix

```
Prior Globex 1m sessionCloseBar
  → htfPdArrays.previousDay.close = 30216.25
  → buildStructureFacts
       isSweepableLiquidityId("pdc") = false  (still — no sweep object)
       isReferenceInteractionLevel("pdc") = true
       levelInteractions.pdc = classifyReferenceCloseInteraction(sessionM1) → CLOSED_BEYOND
       liquiditySweeps: pdc excluded
  → observation-engine buildLiquidityLevels
       pdc: status=CLOSED_BEYOND, taken=true, source=cme_session_1m
  → observation-facts
       liquidity.pdc: "30216.25 — CLOSED_BEYOND" (swept)
  → formatIntelligenceForPrompt / answerFromIntelligence
       reflects taken status at 30216.25
```

---

## Regression tests (PDC status ladder @ 30216.25)

| Case | Expected | Result |
|---|---|---|
| Body close above PDC | TAKEN (`CLOSED_BEYOND`, `taken=true`) | **pass** |
| Body close below PDC (tags level, no wick above) | TAKEN | **pass** |
| Wick only (high wick, close below) | BREACHED, `taken=false` | **pass** |
| No interaction (entirely below) | UNTOUCHED | **pass** |
| Yahoo 30188.50 must not drive status | Pipeline uses 30216.25 → UNTOUCHED for bar closing 30187.5 | **pass** |
| No `liquidity.sweep.pdc` object | PDC not in sweep pools | **pass** |

---

## Tests run (this verification)

```text
npx tsx scripts/test-market-state-truth.ts   → 100 passed, 0 failed
npx tsx scripts/test-decision-envelope.ts    → ok
```

No commit / push / deploy.
