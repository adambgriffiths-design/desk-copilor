**Open this first:** [KAREN-OPEN-ME.md](./KAREN-OPEN-ME.md)

# KAREN — Research command centre

**Date:** 2026-08-16  
**Audience:** non-programmer status board  
**Rules in force:** no new trading behaviour · no unlock · holdout sealed · validation set do not touch · edge claim none  

Proven facts vs hypotheses are labelled below.

---

## CURRENT KAREN BEHAVIOUR

**Fact.** In live use, Karen still often says **WAIT** when one side looks supported but entry status is WAIT or EXTENDED. That “force wait” gate stays on in production.

**Fact.** Research focus is no longer “which waits should we release?” It is: **does Karen record the quality and sequence of evidence richly enough before she chooses WAIT?**

**Fact.** Selective unlock (picking some waits to turn into trades on today’s features) is **parked**. There is no approved single change ready to score or ship.

---

## WHAT HAS ACTUALLY IMPROVED

**Fact.** Karen already builds typed “what conflicts with what” items (not just a conflict count). Those typed items are now saved on research stamps (`contradiction_repr_v1`). Spec frozen.

**Fact.** Typed conflict labels carry more information than the old count alone (type-vs-count measurement: richer = yes).

**Fact.** On ~1,074 force-wait research stamps, typed structure-vs-bias conflicts showed a clear pattern vs “no typed conflict”: higher share of GOOD among decided labels for the main structure↔bias types; different types under the same count of “1” are **not** interchangeable. Wait-representation work was **continued**, not killed. Unlock stayed parked.

**Fact.** Core liquidity levels (label, price, side, taken, status, etc.) are already on the research stamp surface (`liquidity_repr_v0`). Side is not the missing piece.

**Fact.** Timing/provenance fields for those levels are on the stamp surface as `liquidity_repr_v1` (formedAt including session asia/london/ny_rth print times, qualifying tick, candle). Outcome-blind smoke freq: **PASS**. Broader pools (#2) and interaction sequence (#3) are **not started**.

**Fact.** Higher-timeframe bias stack (daily / m15 / m5 / aligned) is stamped as `htf_bias_repr_v0` alongside back-compat `tradeableBias`.

**Fact.** A pipeline information-loss audit mapped what Karen computes internally vs what research stamps keep (outcomes not inspected in that audit).

---

## WHAT IS ONLY REPRESENTATION WORK

**Fact (scope).** The active lane is about **how clearly evidence is written down for research**, not about changing live trade rules.

Still representation-only (not live behaviour changes):

- ~~Finish liquidity timing/provenance~~ → **PASS**; next is broader pools / map (#2), then sequence (#3).
- ~~Stamp HTF bias stack~~ → **PASS** (`htf_bias_repr_v0`).
- Other omitted structures (reasoning chain detail, conflict/horizon objects, FVG geometry, reason lists as lists not counts) remain audit findings — not trading patches.

**Hypothesis (not proven as a ship decision).** Richer stamps *might* later support a safer wait-quality rule. That is **not** authorized and is **not** the same as unlocking waits today.

---

## WHAT HAS BEEN REJECTED

**Fact.** Turning almost all waits into actionable entries (binary “c1”) failed quality checks and was **rejected**. Production keeps force-wait.

**Fact.** The cited-MSS unlock seed was **blocked/closed** (too collinear with “one contradiction,” and unlock-all style gates fail the frequency budget).

**Fact.** A scan for another clean one-knob unlock on **current** stamp fields found **none justified**.

**Fact.** Selective unlock on the current feature set stays **parked**. Scoring/implementing “c4” is **not defined** — research direction only.

---

## ACTIVE MEASUREMENTS

| Work | Status | Fact / note |
|------|--------|-------------|
| Typed contradiction stamps + provenance + coverage | **Done** | Representation frozen |
| Type vs count richness | **Done** | Richer = yes |
| Contradiction type ↔ GOOD/BAD relation | **Run completed** | Meaningful association = yes · kill wait branch = no · unlock still parked |
| Pipeline info-loss audit | **Done** | Outcomes not inspected |
| Liquidity timing (`liquidity_repr_v1`) | **PASS** | Session `formedAt` wired; smoke freq 100% formedAt; dump enrich progressive |
| HTF bias stack (`htf_bias_repr_v0`) | **PASS** | daily/m15/m5/aligned + tradeableBias retained |
| Selective unlock / c4 score | **Not active** | Parked / not defined |

---

## TOP 5 INFORMATION LOSSES

From the decision-pipeline info-loss audit (representation gaps — **not** proof that fixing them changes trades):

1. **Liquidity second-order detail** — core levels + timing **PASS**; remaining = broader pools (#2) then sequence (#3).
2. **Reasoning chain** — Karen builds rich per-concept checks; stamps mostly keep a short list of concept names.
3. ~~Higher-timeframe bias stack~~ — **PASS** (`htf_bias_repr_v0`); residual conflict-pair detail is secondary.
4. **REH/REL and related pools** — computed but largely absent from stamps (**liquidity priority #2 — NEXT**).
5. **Conflict / horizon structures** — structured disagreement and horizon reads collapse to stance/prose.

*(Other losses exist — FVG polarity/geometry, explainability/uncertainty reports, reason lists flattened to counts — but the five above are the lead board.)*

---

## WHAT COULD EVENTUALLY CHANGE DECISIONS

**Hypothesis only — none of this is approved to change live Karen.**

- If typed conflicts (and later liquidity timing / HTF stack / reasoning detail) prove stable and Gate-10-aware, a **future** selective wait rule *might* be designable. Today: association ≠ unlock.
- If representation work fails to support a quality story, the locked path is to **park force-wait as an active research attack**, not to hunt unlock subsets on today’s thin features.
- Queued suspects (evidence weighting, entry timing, targets/invalidation, label confounders, regime) stay **behind** this work — open only if Adam says so.

**Fact.** Edge claim remains **none**. Holdout sealed. Validation set do not touch.

---

## NEXT 3 ACTIONS

1. **Full liquidity map (priority #2)** — NY-pre, ORG, gaps, REH/REL, EQH/EQL into representation — **not started** (pointer only until Adam opens implement).
2. After #2: interaction sequence history (priority #3) if still justified.
3. **Do not** invent unlocks, open weighting, score c4, or touch validation/holdout unless Adam explicitly opens that door.

---

**Pointers:** [KAREN-HANDOFF.md](./KAREN-HANDOFF.md) · [karen-research-queue-one-bottleneck.md](./karen-research-queue-one-bottleneck.md) · [karen-contradiction-type-outcome-relation-measurement.md](./karen-contradiction-type-outcome-relation-measurement.md) · [karen-decision-pipeline-info-loss-audit.md](./karen-decision-pipeline-info-loss-audit.md) · [karen-liquidity-internal-vs-featuresAtT.md](./karen-liquidity-internal-vs-featuresAtT.md)
