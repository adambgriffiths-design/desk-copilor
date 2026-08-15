# ICT Decision Specification

**Source of truth** for Desk Copilot's institutional decision pipeline. Code, prompts, and tests must conform to this document.

## Core insight

You are not trying to make ICT objective — you are trying to make the AI **consistent at applying Adam's subjective framework**.

Separate **what happened** (observation) from **what it means** (interpretation) from **what to do** (decision).

---

## HARD RULE

> **The AI must NEVER modify, invent, or reinterpret an observation. If the observation engine marks a field as `unknown`, the reasoning engine MUST treat it as `unknown`.**

Implementation:
- Observation JSON is immutable once produced (`Object.freeze` + `ReadonlyMarketObservation`)
- Interpretation receives observation only — must cite `observation.evidence` field paths
- `lib/contamination-guard.ts` validates interpretation does not cite prices/levels not in observation
- Unknown enum values propagate — never guess

---

## Three-layer architecture

```
MarketState + MarketContext
        ↓
  Layer 1: OBSERVATION (deterministic, 100% hard-coded)
        ↓  frozen JSON
  Layer 2: INTERPRETATION (rule-assisted now, AI-assisted later — meaning only)
        ↓  separate JSON
  Layer 3: DECISION (explicit verdict — LONG | SHORT | WAIT | NO_TRADE)
        ↓
  Mentor output (combines all three + delta from running state)
```

**Three distinct JSON objects — never merged.**

### Canonical example

**Observation** (facts only, no meaning):
> Sell-side liquidity at 21,450 was swept. Price displaced upward by 8 points. A bullish FVG exists between 21,470–21,478.

**Interpretation** (meaning, Adam's framework):
> This resembles Adam's bullish reversal model because the liquidity sweep was followed by displacement and an FVG.

**Decision** (actionable verdict):
> LONG — provided price retraces into 21,470–21,478. Invalidation: 21,445.

**Mentor output** (what user sees/hears):
> I chose LONG because sweep + displacement + FVG align with NY open reversal model. I rejected SHORT because HTF bias is bullish with no bearish MSS. Since last check: FVG filled, entry model unchanged.

---

## Layer 1: Observation

**Module:** `lib/observation-engine.ts`

Strict JSON — no scores, no verdict, no meaning words.

| Field | Type | Notes |
|-------|------|-------|
| `market_structure` | `unknown \| bullish \| bearish \| unclear` | From MSS detection |
| `liquidity.levels` | `{ label, price, taken }[]` | PDH/PDL/session — sweep = taken |
| `displacement` | `unknown \| present \| absent` | Impulsive body in candle lookback |
| `fvg.status` | `unknown \| present \| absent \| invalidated` | Unfilled vs inverted |
| `order_block` | `unknown \| relevant \| irrelevant \| unclear` | |
| `premium_discount.zone` | `unknown \| premium \| discount \| equilibrium` | |
| `htf_bias` | daily/m15/m5 + aligned + tradeable_bias | |
| `session` | `unknown \| london \| ny \| asia \| off_hours` | |
| `time_context` | string | Kill zone, macro, AMD phase |
| `data_quality` | `good \| degraded \| stale \| missing` | |
| `evidence` | `Record<string, string>` | Field paths — required for audit |

When `data_quality` is `missing` or `stale`, structural fields become `unknown`.

---

## Layer 2: Interpretation

**Module:** `lib/interpretation-engine.ts` (rule-assisted Phase 1)

Given **frozen observation JSON only**:

| Field | Type |
|-------|------|
| `entry_model` | string \| null — e.g. "NY open sweep + FVG retrace" |
| `invalidation` | number \| null — from observation prices only |
| `target` | number \| null |
| `risk_reward` | string \| null |
| `contradictions` | string[] — what argues AGAINST the trade |
| `long_case` | `{ supported, reasons[] }` |
| `short_case` | `{ supported, reasons[] }` |
| `reasoning` | string — "I would consider SHORT because A, B. I rejected LONG because X, Y." |
| `observation_refs` | string[] — cited evidence field paths |

AI prompt rules (when LLM path wired):
- Receive observation JSON only
- Do not restate observations as new facts
- Reference `observation.evidence` paths
- Missing data → null fields, not guesses

---

## Layer 3: Decision

**Module:** `lib/decision-layer.ts`

| Field | Type |
|-------|------|
| `verdict` | `LONG \| SHORT \| WAIT \| NO_TRADE` |
| `verdict_reason` | string |
| `invalidation` | number \| null |
| `entry_zone` | string \| null |
| `target` | number \| null |
| `observation_ref` | frozen observation |
| `interpretation_ref` | interpretation |

**No arbitrary confidence % as primary output.** Probabilities deferred until labeled dataset exists.

Decision rules (Phase 1):
- `data_quality` missing/stale → `NO_TRADE`
- Any required field `unknown` → `NO_TRADE`
- One-sided interpretation + entry not ready → `WAIT`
- One-sided interpretation + entry active → `LONG` or `SHORT`
- Conflicting cases → `WAIT`
- No confluence → `NO_TRADE`

---

## Deferred: weighted rollup → verdict

Weighted concept scores and confidence percentages are **deferred** until Adam's labeled dataset validates which observation combinations correlate with `would_take=true`.

Do not optimize arbitrary weights yet. Infrastructure measures correlation; it does not claim accuracy.

---

## Phased roadmap

| Phase | Goal |
|-------|------|
| **1 (now)** | Observations deterministic; interpretation rule-assisted with strict boundaries; decision explicit |
| **2 (later)** | Labeled examples train interpretation consistency |
| **3 (future)** | Measure which observation combinations correlate with Adam's `would_take` + `why_taken` |

**NOT:** `ICT rules → AI → trade`

**IS:** `Market data → objective observations → your historical examples → AI learns your interpretation → verdict`

---

## Labeling schema

**Path:** `data/labeled-setups/schema.json`

Required fields:
- `why_taken` — why Adam would take or lean (required, min 10 chars)
- `why_rejected_alternatives` — why opposite case rejected (required)
- `adam_verdict`, `would_take`, `grade`, `fvg_validity`, `notes`
- Link to MarketState snapshot + expected observation fields

**Add a label:** `npm run label:setup`

**Replay:** `npm run test:replay` → `reports/replay-{date}.md` with **three separate reports**:
1. Observation Accuracy — `expected_observation` vs engine output
2. Interpretation Agreement — `why_taken` / `why_rejected` keyword overlap
3. Decision Agreement — `adam_verdict` match (±15pt invalidation/target)

Include diverse fixtures (A+ winners, no_trade, similar_but_skip) — see `data/labeled-setups/README.md`.

---

## Contamination guard

**Module:** `lib/contamination-guard.ts`

Before decision and voice output:
1. Extract allowed prices from `observation.evidence`, liquidity levels, FVG bounds
2. Scan interpretation text for MNQ-range prices not in allowed set → fail
3. Block claims about structure/FVG/displacement when observation marks them `unknown`

---

## AI role boundary

| AI may | AI must NOT |
|--------|-------------|
| Weigh observed facts Adam's way | Invent levels not in observation |
| Explain contradictions | Change observation fields |
| Narrate decision + mentor brief | Output fake confidence % as primary signal |
| Cite observation field paths | Merge three layers into one blob |

---

## Files

| Module | Layer |
|--------|-------|
| `lib/observation-engine.ts` | 1 — Observation |
| `lib/interpretation-engine.ts` | 2 — Interpretation |
| `lib/decision-layer.ts` | 3 — Decision |
| `lib/contamination-guard.ts` | Validation |
| `lib/desk-pipeline.ts` | Orchestrator |
| `lib/labeling.ts` | Label load/save/validate |
| `lib/replay-engine.ts` | Correlation measurement |

---

## Phase 1.5: Infrastructure (boring but vital)

Do not add features until this loop works.

### Versioning

Every pipeline output includes `meta` from `lib/pipeline-version.ts`:

- `pipeline_version`, `spec_version`, `schema_version`, `generated_at`
- Bump when schema or rule semantics change — replay artifacts with mismatched versions are flagged via `isVersionMismatch()`

### Deterministic tests

Run before shipping:

```bash
npm run test:desk          # observation + contamination + decision + replay
npm run test:desk:infra    # versioning, quality, explainability, journal schema
npm run test:replay:scale  # 50× replay — verifies same inputs → same outputs
```

### Uncertainty — "I don't know"

`uncertainty.i_dont_know` is true when required observation fields are `unknown` or data quality blocks observation. User-facing message: *"I don't know — missing or unknown: …"* — never guess.

### Contradiction detection

`lib/contradiction-report.ts` — structured blocking vs warning contradictions with `evidence_paths`. Separate from free-text `interpretation.contradictions`.

### Explainability

`lib/explainability.ts` — every claim cites `evidence_paths` + values from `observation.evidence`. Panel brief includes EVIDENCE section.

### Data quality checks

`lib/data-quality-check.ts` — pre-observation audit: stale bars, timestamp drift, Yahoo-only price, missing candles. `can_observe` / `can_decide` gates.

### Replay at scale

`runReplayAtScale(n)` — runs full replay n times, reports min/max/avg for three layers, verifies **deterministic** pipeline (critical for regression).

### Trade journal

**Path:** `data/trade-journal/` — thinking **before** and review **after** each trade.

```bash
npm run journal:pre  -- --thinking "Your read before acting"
npm run journal:post -- --pre <id> --review "What happened" --outcome win
npm run journal:list
```

Pairs with labeled-setups for replay training. Adam's discretionary edge lives in `why_taken` + journal `thinking_before` / `review_after`.

---

## Response contract (agent output)

Every market analysis must produce this structure (`lib/analysis-contract.ts`):

```
VERDICT: LONG | SHORT | WAIT | NO TRADE
SETUP: [specific ICT model]
HTF BIAS: bullish | bearish | neutral | unknown
ENTRY: [price or zone]
INVALIDATION: [price]
TARGET: [price / liquidity level]
R:R: [ratio]

WHY: (facts from observation only)
  Liquidity / Market structure / Displacement / FVG / Order block / Premium-discount / Session-time

CONTRADICTIONS: [what argues against]
REJECTED ALTERNATIVE: [why opposite direction rejected]
DATA QUALITY: GOOD | DEGRADED | INSUFFICIENT
FINAL REASONING: [2–4 sentences]
```

Rules:
- **WAIT is valid** — do not force LONG/SHORT when setup incomplete
- **INSUFFICIENT data → NO TRADE** — never invent missing fields
- **Panel** shows structured contract; **voice** uses `lib/voice-analysis-narrator.ts` for natural mentor speech
- Three layers remain separate JSON internally; contract is the user-facing synthesis
