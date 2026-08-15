# Karen decision architecture

**Date:** 2026-08-14  
**Status:** design locked for this pass — implement envelope + reasoning chain only. No commit / push / deploy.  
**Code:** `lib/decision-envelope.ts` (schema) attached to `lib/analysis-contract.ts` (existing response contract).

This document is the source of truth for **how Karen names a decision** and **how she shows the path to that decision**. It does not change how levels, sweeps, entries, PDH provenance, REH/EQL, or mentor scoring are computed.

---

## Hypothesis — not validated

> **This hierarchy is a hypothesis, not a proven best architecture.**  
> You cannot know the best decision order without evidence. We propose an architecture and make it **explicit so it is testable**. We do **not** claim it is optimal. We do **not** backtest or tune for P&L in this pass. We do **not** optimize every knob at once (that is noise).  
> Unlike old NinjaTrader bots, we can log **rich reasoning** (which concepts fired, which mattered, outcome true/false/uncertain). That lets us analyse **decision quality**, not just P&L. The architecture starts as a principled guess from existing trading logic; it earns its place only through evidence that accumulates live, then later OOS review.

**Question this pass does *not* answer:** does Strategic → Tactical → Execution → Invalidation produce better decisions over time? That requires later logging + backtest + careful out-of-sample — **not now**.

---

## Current decision flow (logic order, not code)

This is what the desk **already does**, mapped as a sequence a human can read top-down. No new strategy.

```
1. DATA
   Live / chart snapshot → price, session, daily PD arrays, 1m candles, bias stack.

2. OBSERVATION (facts, frozen)
   Market structure (MSS), liquidity levels + interaction status,
   FVG, displacement, HTF bias stack, premium/discount, session.
   PDH/PDL “taken” only when existing provenance allows (CLOSED_BEYOND + candle + tick).
   UNPROVEN is not taken. Unknown stays unknown.

3. INTERPRETATION (meaning)
   Long case / short case / contradictions / entry-model name
   from observation only. Session buy-side raid is not a long.

4. EXECUTION SCAFFOLD (already computed — not changed this pass)
   Entry zone from FVG / plan; status ACTIVE vs WAIT vs EXTENDED.
   Targets from existing plan. No new setups.

5. PIPELINE VERDICT (unchanged math)
   LONG | SHORT | WAIT | NO_TRADE
   One-sided + entry ready → LONG/SHORT
   One-sided + entry not ready → WAIT (trigger)
   Conflict / both sides / session stay-out → WAIT (stay flat)
   Missing facts / no confluence → NO_TRADE

6. ENVELOPE (this pass — naming + layout + chain only)
   Map verdict → one stance: long | short | flat | wait | monitor
   Name strategic vs tactical, resolve conflict in one sentence,
   attach FACTS | INTERPRETATION | DECISION | INVALIDATION,
   attach reasoningChain (playbook checklist + provenance).
```

**Trader-facing overlay (the hypothesis we will log):**

| Step | Label in every response | Backed by existing fields |
|------|-------------------------|---------------------------|
| 1 | **STRATEGIC BIAS** | HTF context (`htfContext` / daily tradeable bias) — context only, not the trade |
| 2 | **TACTICAL BIAS** | Primary horizon (`primaryHorizon` / chart structure) + **conflict resolution** + **one stance** |
| 3 | **EXECUTION** | Existing entry zone / wait-for-trigger / stay-flat — **not** a new entry model |
| 4 | **INVALIDATION** | Existing invalidation price or stay-flat condition |

Then the four evidence layers (same object): **FACTS → INTERPRETATION → DECISION → INVALIDATION**, plus **REASONING CHAIN**.

Alignment: strategic = HTF context; tactical = current/1m structure (not the same as HTF); execution = tradeable opportunity vs actual trade direction; invalidation = what kills the thesis. **Do not collapse these into one bullish/bearish label.** Unlabeled “bullish” / “bearish” is invalid.

When HTF and tactical disagree, **do not automatically** let HTF override every LTF setup, and **do not automatically** let LTF override HTF. **Current architecture (exposed, not claimed best):** the existing pipeline stay-flats on bias-vs-structure conflict, so the envelope logs `ltfAgainstHtfAllowed: false` and overall stance `FLAT` — a **hypothesis default** to log and test later. The schema **can** represent “short-term long against bearish HTF” when the pipeline actually takes a LONG; that is not the same as forcing it.

---

## Problem

Karen already produces useful analysis (observation → interpretation → LONG/SHORT/WAIT/NO_TRADE). The trader still has to guess:

1. **Which horizon she actually cares about** — daily lean vs 1-minute structure vs “tradeable bias.”
2. **Why a directional lean and a stay-flat/wait can coexist** — “leaning bullish but stay flat” with no conflict line.
3. **Whether a conclusion is playbook or pattern-matching** — a sweep / equal-high / FVG is asserted without the swing, candle, or timestamp that produced it.

Every trading response must stand on its own: seven labeled layers (never a single bullish/bearish), a complete trade thesis or WAIT/MONITOR, conflict log when horizons disagree, four evidence layers, and a reasoning chain that distinguishes **detected** vs **used**.

---

## Seven layers (horizon ≠ thesis)

Never print bullish/bearish without a **horizon**. These seven are distinct fields:

| # | Layer | Field | Example |
|---|--------|--------|---------|
| 1 | Higher-timeframe context | `read.htfContext` | daily — bearish |
| 2 | Current / tactical structure | `read.currentStructure` | 1-minute — bullish |
| 3 | Tradeable opportunity | `read.tradeableOpportunity` | potential long (LTF setup exists) |
| 4 | Trade direction | `read.tradeDirection` | LONG if taking it, else NONE |
| 5 | Target | `read.target` | named liquidity / level from existing decision |
| 6 | Invalidation | `read.invalidation` | explicit price or structure condition |
| 7 | Overall stance | `read.overallStance` | `SHORT-TERM LONG / HTF BEARISH` **or** `FLAT — 1-minute bullish vs daily bearish` |

Opportunity (3) is not direction (4). You can have a potential long on 1m while HTF is bearish and still be **FLAT** under the current hypothesis. Interpretation must say when a short-term long is **not** an HTF bullish reversal.

---

## Trade thesis (actionable setups)

Every **long** / **short** must answer:

| Question | Field |
|----------|--------|
| WHAT am I trading? | `thesis.what` |
| WHY now? | `thesis.whyNow` |
| ON WHICH TIMEFRAME? | `thesis.timeframe` |
| TOWARD WHAT? | `thesis.toward` |
| FROM WHERE? | `thesis.fromWhere` |
| WHAT INVALIDATES IT? | `thesis.invalidates` |

`thesis.complete` is true only if all six are non-empty. **If incomplete → envelope stance is `wait` or `monitor`**, not an ambiguous directional label. Pipeline verdict math is unchanged; we refuse to *name* an incomplete thesis as long/short.

---

## Conflict log (testable, not auto-override)

When HTF lean ≠ tactical lean, log (do not hide):

- which horizon is bullish / bearish  
- `ltfAgainstHtfAllowed` (current architecture: `false` when pipeline stay-flats; `true` only if pipeline actually LONG/SHORT against HTF)  
- why  
- target that would make an against-HTF trade logical  
- invalidation  

Schema field: `conflictLog` `{ htfHorizon, htfLean, tacticalHorizon, tacticalLean, disagree, ltfAgainstHtfAllowed, why, target, invalidation }`.

Required conflict sentence when `primary_vs_htf`:

> {htf timeframe} context is {htf lean}. {primary timeframe} structure is {primary lean}. {bullish horizon} is bullish; {bearish horizon} is bearish. LTF-against-HTF allowed: yes|no (current hypothesis — not validated). Why: {stay-flat default **or** pipeline taking LONG/SHORT against HTF — this is NOT an HTF reversal}. Target that would make an against-HTF trade logical: {price or none named}. Invalidation: {price or condition}.

This is the evidence record for later OOS: *does allowing or forbidding LTF-against-HTF improve decisions?* Not answered now.

---

## Detected vs used

Each chain row:

- `detected` — concept is present in structured state (`outcome === true`)  
- `usedInDecision` — it actually moved the named stance  
- `role` — `PRIMARY` (cited / drove stance) · `SUPPORTING` (detected and in the read but not the driver) · `NONE` (not detected, or detected and unused)

Trader must see playbook combination vs mere detection (e.g. EQH detected YES, role NONE).

---

## What we are not changing

Do **not** add strategies, setups, or entry tweaks. Do **not** change:

- PDH / PDL / PDC sweep semantics (`CLOSED_BEYOND` only; `UNPROVEN ≠ TAKEN`)
- Liquidity detectors, REH/EQL / EQH/EQL formulas, mentor scoring
- Chart-read routing (`kickOffChartRead` vs TEXT `/api/chat/stream`) except attaching this envelope to existing analysis
- Prompt wording whose job is PDH taken/untouched semantics
- Observation / interpretation / `buildTradingDecision` verdict math (`LONG | SHORT | WAIT | NO_TRADE` still computed the same way)

This pass is **naming, layout, and provenance surfacing** of facts that already exist on observation / context / state.

---

## Decision hierarchy

Two horizons. They are not interchangeable.

| Role | Field | What it is | What it is not |
|------|--------|------------|----------------|
| **Primary** | `primaryHorizon` | The chart / execution timeframe the **stance** is about (usually 1-minute; follows `state.timeframe` via existing `mtf` labels). Lean comes from **observed market structure** on that chart (`observation.market_structure`). | Not “whatever the daily PD array wants.” |
| **HTF context** | `htfContext` | Daily / tradeable-bias frame. Lean comes from `observation.htf_bias.tradeable_bias` (already daily-led when the bias stack conflicts). | Not a trade. Never silently becomes the stance. |

**Rule:** Stance is always a statement about the **primary** horizon. HTF is labeled **context only**. If they disagree, HTF does not “win” a long or short.

Existing pipeline verdict (`LONG | SHORT | WAIT | NO_TRADE`) is unchanged and still stored on the contract as `verdict` for the panel. Trader-facing **stance** is the one-word call defined below.

---

## Allowed stances

Exact enum: `long | short | flat | wait | monitor`

Mapped **after** the existing decision layer — no new entry logic.

| Stance | Meaning | Maps from existing pipeline |
|--------|---------|-----------------------------|
| **long** | Primary-horizon call is long. One side. | `verdict === LONG` |
| **short** | Primary-horizon call is short. One side. | `verdict === SHORT` |
| **wait** | A **named trigger** exists (retrace / confirmation). Directional thesis, not clickable yet. | `verdict === WAIT` and wait-for-trigger (numeric entry zone + retrace/FVG/sweep setup, no stay-flat conflict) |
| **flat** | Stay out. Blocking conflict or stay-out rule. Not “almost a long.” | `verdict === WAIT` and stay-flat: HTF vs structure disagreement, both PDH+PDL taken, or session-liquidity stay-out (e.g. London Asia-high raid) |
| **monitor** | Watching. No one-sided thesis and no blocking stay-out. Includes insufficient data. | `verdict === NO_TRADE` |

**One stance per response.** No compound “lean long / stay flat” as the call.

---

## Conflict resolution

When primary lean and HTF lean are opposite (`bullish` vs `bearish`):

- **Schema:** can represent `TRADE DIRECTION: LONG` + `OVERALL STANCE: SHORT-TERM LONG / HTF BEARISH` if the pipeline actually takes that trade. Do **not** auto-force HTF to kill every LTF setup, and do **not** auto-force LTF to override HTF.
- **Current architecture (exposed, not claimed best):** existing `buildTradingDecision` stay-flats on bias-vs-structure. Envelope stance is therefore not `long`/`short`; `ltfAgainstHtfAllowed: false`; `winner: "neither"`. If the pipeline verdict is `WAIT`, stance is `flat`; if `NO_TRADE`, stance is `monitor`. Both are non-directional.
- **Required sentence** (must appear in `conflictResolution.sentence`, CONFLICT LOG, and the DECISION layer): the LTF-against-HTF template in **Conflict log** above.

Other `between` values (still one sentence, still `winner: "neither"`):

| `between` | When | Required sentence core |
|-----------|------|------------------------|
| `primary_vs_htf` | Structure vs tradeable bias oppose | LTF-against-HTF template (which horizon bullish/bearish, allowed yes/no, why, target, invalidation) |
| `session_stay_out` | Existing session-liquidity stay-flat (buy-side raid, not a long) | Primary may look bullish; session stay-out applies; stance is flat — not a long because the high was swept. |
| `both_sides` | PDH and PDL both taken | Both sides taken; stance is flat until a fresh one-sided liquidity event. |
| `none` | No blocking conflict | `No conflict — higher-timeframe {htf} agrees with primary-horizon {primary}; stance is {stance}.` **or** HTF unclear: `Higher-timeframe context is {lean}; stance follows the primary horizon: {stance}.` |

`conflictResolution.sentence` is **always** non-empty so the turn is self-contained.

### Ban: lean without why

Invalid:

- Opening or calling “leaning bullish / bearish / long / short” while stance is `flat | wait | monitor` **without** the conflict/resolution sentence **and** without a chain item whose `impact` explains the non-directional stance.

Valid example: HTF bullish, primary bearish, stance `flat`, sentence present, chain `mss` + `htf_bias` impacts cite the disagreement.

Voice and TEXT must narrate the **same** envelope. They must not open “I'm leaning bullish” when stance is `flat`.

---

## Four layers

Every formatted analysis (panel, TEXT prompt, self-contained turn) carries these labels in order:

### FACTS

What the observation engine already recorded. No “so we should long.”

Source: frozen observation + `why` block already built from it (liquidity, structure, displacement, FVG, PD zone, session) + last price / snapshot id when present. **Not LLM invention.**

### INTERPRETATION

Meaning only: `interpretation.reasoning`, supported long/short cases, entry model name. Still cites observation; still must not invent prices.

### DECISION

Exactly one `stance`, named primary horizon, named HTF context, and the conflict-resolution sentence. Must **cite** `reasoningChain` concept ids (`citedConcepts`) that produced this stance — especially for `flat` / `wait`.

### INVALIDATION

What would change the stance. Numeric price when the existing decision layer already has one; otherwise a condition already produced (`wait_reason` / “needs structure and bias to agree”). Do not invent a stop.

---

## Reasoning chain (explainability layer)

The trader must see the **path**, not only the conclusion — playbook checklist vs silent skip vs proven fact.

Stable object (also TypeScript in `lib/decision-envelope.ts`):

```ts
reasoningChain: Array<{
  concept: string;          // playbook id, e.g. "liquidity_sweep_pdh", "eqh", "mss", "fvg"
  checked: boolean;
  detected: boolean;        // present in structured state (typically outcome === true)
  usedInDecision: boolean;  // actually moved the named stance
  role: "PRIMARY" | "SUPPORTING" | "NONE";
  evidence: {
    source: string;
    prices?: number[];
    swing?: string;
    candleTime?: string;    // ISO when known
    close?: number;
    tolerance?: number;
    snapshotId?: string;
    candleId?: string;
    status?: string;
  };
  outcome: "true" | "false" | "uncertain";
  impact: string;           // how it moved stance / why it did not
}>
```

### Playbook checklist (always present)

Do not omit a concept because it was skipped. If it is on this list, emit a row.

| `concept` | Checked from (existing state only) |
|-----------|--------------------------------------|
| `htf_bias` | `observation.htf_bias` |
| `premium_discount` | `observation.premium_discount` |
| `liquidity_sweep_pdh` | PDH level + interaction (`taken`, `status`, `candleId`, `qualifyingTickAt`, `why`) |
| `liquidity_sweep_pdl` | PDL, same provenance fields |
| `session_liquidity` | Asia/London (etc.) levels + existing stay-out helpers |
| `eqh` | Production `observation.reh_rel` REH + `structureFacts.relativeEqualPools` type `reh` |
| `eql` | REL / type `rel` |
| `mss` | `structureFacts.mss` / `observation.market_structure` |
| `displacement` | `observation.displacement` |
| `fvg` | `observation.fvg` (+ 1m bounds when present) |

`checked: false` = not enough data to evaluate (unknown / missing / stale). `checked: true` = we evaluated it. Absence of a pool is `checked: true`, `outcome: "false"`, not omission.

### Provenance bar

| If the chain claims… | Evidence must include… |
|----------------------|-------------------------|
| Liquidity sweep `outcome: "true"` | Which level/swing, **candle id**, **timestamp**, close when known. Snapshot id when on state. |
| Equal highs/lows used (`outcome: "true"`) | Prices, **tolerance** (`rehRelTolerance` already in `lib/structure.ts`), swing timestamps. |
| FVG / MSS / PDH-PDL / session liquidity | Same idea: prices + time/candle from structured fields already on the object. |

**UNPROVEN must not be presented as true.** Align with existing PDH rules (`canProvePdhTaken`: `CLOSED_BEYOND` + qualifying tick timestamp + candle id + CME 1m source). If observation `taken === true` but candle or timestamp is missing, chain `outcome` is **`uncertain`**, impact states UNPROVEN — not taken. Do not change the detector; do not print “PDH taken” from an unproven row.

### Stance must cite the chain

- `citedConcepts` is the subset of chain ids the DECISION layer used.
- If stance is `flat` or `wait`, at least one cited item’s `impact` must explain that stance (conflict, stay-out, wait-for-trigger, missing confirmation).
- “Bullish but flat” without a chain impact that explains **flat** is invalid.

Voice narrates a **compact** subset of the same array (checked rows that moved the stance, plus any `uncertain` sweep). Not a second brain.

---

## Self-contained turn

A trader who did not see prior messages must still be able to act from one response:

- Primary horizon name + lean  
- HTF context name + lean  
- Conflict sentence  
- One stance  
- Four layers  
- Invalidation  
- Reasoning chain (full on panel / TEXT; compact on voice)  
- Facts sourced from this snapshot (`state_hash` / `snapshotId` when present)

Follow-ups may be shorter **only** when they explicitly refer to this envelope (“same stance”) — out of scope for this pass; first read is always full.

---

## Future automation

Stable JSON on `MarketAnalysisContract.decision` (`DecisionEnvelope`):

```
read: { htfContext, currentStructure, tradeableOpportunity, tradeDirection, target, invalidation, overallStance }
thesis: { what, whyNow, timeframe, toward, fromWhere, invalidates, complete }
conflictLog: { htfLean, htfHorizon, tacticalLean, tacticalHorizon, disagree, ltfAgainstHtfAllowed, why, target, invalidation }
reasoningChain[]: { concept, checked, detected, usedInDecision, role, evidence, outcome, impact }
logicOrder, primaryHorizon, htfContext, stance, layers, citedConcepts
```

- Panel / extension: render the object (stance headline, four logic-order lines, four layers, chain table).  
- Voice: `narrateAnalysisContractForVoice` compact-reads the same object (strategic → tactical → execution → invalidation).  
- Stream `/api/chat/stream`: inject formatted envelope into the trading prompt so the LLM **copies** stance + chain, not a parallel verdict. `decisionEnvelope` on SSE `done` when the gate already built it.  
- `/api/live-verdict`: already returns `deskPipeline.analysis_contract` — envelope rides along.

`confidence` is **not** a new score. Map existing data quality + conflict:

| Condition | confidence |
|-----------|------------|
| INSUFFICIENT / missing / stale | `unknown` |
| DEGRADED | `low` |
| GOOD + blocking conflict (`flat`) | `medium` |
| GOOD + `wait` | `medium` |
| GOOD + `long`/`short` + no conflict | `high` |

No weighted ICT rollup.

---

## Evaluation plan (later — do not run now)

Log live so we can judge **decision quality**, not only P&L. Do not optimize all knobs in one experiment.

**Log on every trading verdict (same envelope object):**

| Field | Why |
|-------|-----|
| `state_hash` / `snapshotId` / `generated_at` | Join to price path |
| `logicOrder` (strategic, tactical, execution, invalidation) | Test the hypothesis order |
| `primaryHorizon`, `htfContext` | Horizon identity |
| `stance`, `confidence` | The call |
| `conflictResolution` (`between`, `winner`, `sentence`) | Disagreement handling |
| `read` (seven layers) | Horizon ≠ thesis |
| `thesis` (six questions + `complete`) | Actionable vs wait/monitor |
| `conflictLog` | HTF vs tactical disagreement, LTF-against-HTF allowed?, why, target, invalidation |
| `reasoningChain[]` (concept, checked, **detected**, **usedInDecision**, **role**, evidence, outcome, impact) | Which concepts fired vs which mattered |
| `citedConcepts` | What the stance actually used |
| `verdict` (pipeline LONG/SHORT/WAIT/NO_TRADE) | Unchanged math, for agreement vs stance |
| timestamps on evidence (`candleTime`, swing times) | Provenance |

**Later metrics (not this pass):**

- Decision quality: did stance `flat`/`wait` avoid a loser the trader would have taken? Did `long`/`short` have the cited chain true at entry?  
- Concept lift: which `concept`+`outcome` pairs precede favorable vs unfavorable next-hour structure?  
- Conflict rule: when `primary_vs_htf`, is `flat` better than “still call daily”?  
- P&L is a lagging check, not the only score. OOS: freeze the hierarchy, evaluate on unseen dates, do not retune chain wording and entry pads in the same study.

**Discipline:** one hypothesis at a time. This pass only **locks the philosophy and the log shape**.

---

## Response paths (this pass)

| Path | How the envelope is emitted |
|------|-----------------------------|
| Chart read / `/api/live-verdict` | `runDeskPipeline` → `buildAnalysisContract` → `formatAnalysisContract` (panel) + voice narrator (spoken) |
| TEXT `/api/chat/stream` | Quality gate already runs the pipeline; prompt includes formatted envelope; LLM must not contradict `STANCE` / chain outcomes |
| Voice mentor (`CURRENT_MARKET_READ`, bias, wait) | Same contract → compact narration of envelope + chain |
| Snapshot / teaching / casual | Unchanged — not a trading verdict |

---

## Sample: “Give me a read on the chart”

*(Illustrative layout. Prices only if present on structured state.)*

```
HTF CONTEXT: daily — bearish
CURRENT STRUCTURE: 1-minute — bullish
TRADEABLE OPPORTUNITY: potential long
TRADE DIRECTION: NONE
TARGET: would-be draw toward previous day low (not taken — LTF against HTF not allowed under current hypothesis)
INVALIDATION: Needs structure and bias to agree — not a long or short while they disagree.
OVERALL STANCE: FLAT — 1-minute bullish vs daily bearish
THESIS: incomplete → wait/monitor (against-HTF long not named as the trade)
CONFLICT LOG: daily bearish; 1-minute bullish; ltfAgainstHtfAllowed=false; why=current pipeline stay-flats on bias vs structure; this is NOT an HTF bullish reversal.

STRATEGIC BIAS: daily — bearish (context only)
TACTICAL BIAS: 1-minute — bullish. …
EXECUTION: no order — stay flat
…
REASONING CHAIN:
- [mss] detected=yes used=PRIMARY …
- [htf_bias] detected=yes used=PRIMARY …
- [eqh] detected=yes used=NONE …
```

If the pipeline had actually taken a LONG, the same object would instead show `TRADE DIRECTION: LONG`, `OVERALL STANCE: SHORT-TERM LONG / HTF BEARISH`, `ltfAgainstHtfAllowed=true`, and a complete thesis. That shape is supported; it is **not** forced this pass.


Voice (same object):  
“Overall stance is flat — one-minute bearish versus daily bullish. HTF context is daily bullish. Current structure is one-minute bearish. LTF-against-HTF allowed: no. Stance is flat — stay flat. Execution: no order. Chain: structure break bearish used primary; equal highs detected, role none. Invalidation: needs structure and bias to agree.”

---

## Tests (no live TradingView session)

1. HTF long vs primary short → one stance (`flat`) + required resolution sentence.  
2. Lean-without-why is invalid (directional lean + `flat`/`wait` without resolution + chain impact).  
3. Four layers present on formatted contract.  
4. Stance enum only.  
5. Self-contained fields present.  
6. Claimed sweep `outcome: "true"` without candle + timestamp is invalid.  
7. “Bullish but flat” requires a chain `impact` that explains flat.  
8. Unproven PDH is not `outcome: "true"`.  
9. **Top-down readability:** formatted text shows STRATEGIC BIAS before TACTICAL BIAS before EXECUTION before INVALIDATION.  
10. Playbook concepts always present on the chain (checked true or false, never silently omitted).  
11. Unlabeled bullish/bearish is invalid (every lean has a horizon).  
12. Incomplete thesis cannot be named long/short → wait/monitor.  
13. Detected ≠ used (`role` PRIMARY vs SUPPORTING vs NONE).  
14. When HTF ≠ tactical, `conflictLog` is present (`ltfAgainstHtfAllowed`, why, target, invalidation).

---

## Gaps / sign-off before commit or deploy

- Confirm stance map: `NO_TRADE` → `monitor` (vs `wait` for missing data).  
- Confirm HTF vs primary: **neither wins a trade** (this doc) vs older prompt line “bias conflict → still call daily.” This pass follows the stay-flat pipeline, not that prompt line.  
- Extension UI: envelope is on the contract JSON; card can show `STANCE` + chain without a visual redesign. Full chain table in the panel is optional follow-up.  
- TEXT LLM may still paraphrase; gate + prompt instruct copy-from-envelope. A hard post-filter that rewrites the model output to the envelope is **not** in this pass unless sign-off wants it.  
- Do not commit, push, or deploy until this design is accepted.
