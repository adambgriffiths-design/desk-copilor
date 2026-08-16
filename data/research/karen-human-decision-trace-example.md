# Karen — human-readable decision trace (example)

**Date:** 2026-08-16  
**Purpose:** Show *why* Karen said WAIT on one real stamp — without reading code.  
**Mode:** Explanation only. No behaviour change. No rules from outcomes.  
**Source stamp:** FORCE_WAIT Y=1500 dump  
`data/karen-decision-validation/acquisition/reports/force-wait-shadow-stamps-y1500-latest.json`  
**asOf:** `2023-10-19T12:55:00.000Z` (Thursday)

---

## Bottom line (plain English)

Karen saw a **bullish short-term story** (structure flipped up, liquidity taken below, upward shove, bullish gap left behind) while the **higher-timeframe lean was still bearish**. She treated that as a **LONG lean that is not ready to fire** — so the live verdict was **WAIT**, not LONG.

In research language this stamp is **FORCE_WAIT**: one-sided support for a side, but entry still waiting for price to come back into the gap zone.

---

## Walkthrough

### 1. Market state

| What | Value |
|------|------:|
| Price | **15088.25** |
| Prior day high (PDH) | 15228.50 |
| Prior day low (PDL) | 14979.25 |
| Where in the day range | Slightly **below** the midpoint (~44% up from the low) |
| Session bucket on stamp | OTHER (not a named NY AM/PM bucket on this row) |

Nothing exotic here: NQ sitting in the middle-lower half of the prior day’s range.

### 2. Liquidity

Stamp facts:

> **PDC liquidity at 15037.50 was swept.**

Plain read: price had already run through yesterday’s close and taken that resting liquidity. Karen marks a sweep as present. That is the “something was raided” piece of the story — not yet a trade by itself.

### 3. Higher-timeframe bias

| What | Value |
|------|-------|
| Tradeable HTF bias | **bearish** |

So the bigger-picture lean on the stamp is **down**, not up.

### 4. Structure

| What | Value |
|------|-------|
| Observed market structure | **bullish** |
| Market structure shift (MSS) noted | yes |

Short-term structure is pointing **up** — opposite the HTF lean.

### 5. Displacement / fair value gap (FVG)

| What | Value |
|------|-------|
| Displacement | **present**, direction **bullish** (+9.75 points in the facts preview) |
| FVG | **present**, bullish gap **15076.25 – 15082.00** |

After the sweep, price shoved higher and left a bullish imbalance. That gap is the natural “come back and fill / rebalance” zone Karen would wait on for a long-style entry.

### 6. Evidence Karen cited (at decision time)

From the stamp’s concept list and facts preview:

- HTF bias (bearish)
- Premium / discount context (day range geometry)
- Session / equal-highs–lows style liquidity concepts (cited; PDC sweep is the concrete fact)
- MSS (bullish structure)
- FVG (bullish gap above)

Frozen narrative Karen used:

> PDC liquidity at 15037.50 was swept. Price displaced upward by 9.75 points. A bullish FVG exists between 15076.25–15082.00.

### 7. Reasons (why she leans LONG, not SHORT)

| Side | Supported? | Reason count |
|------|------------|-------------:|
| LONG | **yes** | 4 |
| SHORT | **no** | 1 |

What that means in practice:

- **LONG case has enough confluence** on this stamp (structure up + sweep + displacement after + bullish FVG — the usual Adam-style stack).
- **SHORT case does not** — the bearish HTF bias alone is not enough confluence on the stamp (only one short reason).
- Model label on the stamp: **“NY open sweep + displacement + FVG retrace (Adam reversal model)”**.

So Karen’s *directional lean* is LONG. That is not yet the same as “take the long now.”

### 8. Contradictions

Recorded conflict:

> **Bullish structure opposes bearish tradeable bias**

Typed form on the stamp:

| Field | Value |
|-------|-------|
| id | `structure_vs_bias` |
| polarity | bullish structure vs bearish bias |
| severity | blocking (for agreement) |
| affects | both sides’ clarity |

Plain read: **local tape says up; bigger bias says down.** Until those agree, Karen’s invalidation / stay-out line on this stamp is:

> Needs structure and bias to agree — not a long or short while they disagree.

Important nuance for reading the path (not a rule change): the conflict is **recorded**, and it shapes the “don’t treat this as a clean go” story. The stamp still shows **LONG supported** because the bullish short-term stack cleared the support checks — the conflict is between *timeframes*, not “no bullish evidence.”

### 9. Decision

| Field | Value |
|-------|-------|
| Baseline verdict | **WAIT** |
| FORCE_WAIT primary | **yes** |
| Stance | flat |
| Confidence | medium |

**How WAIT is reached on this path:**

1. Observation freezes the facts (price, sweep, structure, displacement, FVG, HTF bias).
2. Interpretation builds reasons → **LONG supported, SHORT not**.
3. Execution still wants a **retrace into the bullish FVG** (price at 15088 is **above** the gap 15076–15082) → entry status stays **WAIT**.
4. One-sided LONG + entry WAIT → live verdict **WAIT** (research label: FORCE_WAIT).

So the decision is not “I see nothing.” It is:

> I see a LONG-shaped setup, but I’m not firing it — wait for the pullback into the gap, and the structure↔bias disagreement is still unresolved.

---

## One-sentence chain

**Market mid-range → PDC swept → HTF still bearish → short-term structure bullish → bullish displacement + bullish FVG → LONG lean with 4 reasons → structure↔bias contradiction logged → WAIT (not LONG).**

---

## Optional postscript (outcomes — not used for rules)

Shadow scoring on this stamp (research only; **do not** treat as a gate or unlock signal):

| Field | Value |
|-------|-------|
| If forced as LONG under c1 shadow | side LONG |
| Outcome label on stamp | GOOD |
| Wait-class note | MISSED_OPPORTUNITY |

That only answers “what happened later if you had acted.” It does **not** explain why Karen waited, and it must not be used to invent new wait/unlock rules.

---

## How to reuse this format

For any other stamp, fill the same spine in order:

1. **Market state** — price vs PDH/PDL  
2. **Liquidity** — what was taken  
3. **HTF bias** — bigger lean  
4. **Structure** — local MSS / structure  
5. **Displacement / FVG** — shove + gap  
6. **Evidence** — facts Karen froze  
7. **Reasons** — which side had confluence  
8. **Contradictions** — what disagreed  
9. **Decision** — WAIT / LONG / SHORT / NO_TRADE and why entry was or wasn’t ready  

Prefer explaining the path from evidence at *t*. Use outcomes only as an optional afterword when they already sit on the stamp.

---

EDGE_CLAIM: NONE · HOLDOUT: SEALED · behaviour unchanged · OUTCOMES not used for rule design
