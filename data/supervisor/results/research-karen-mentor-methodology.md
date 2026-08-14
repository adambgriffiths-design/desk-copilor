# Research: Karen Mentor Methodology

**Task ID:** research-karen-mentor-methodology  
**Agent:** Composer (subagent 2801860b)  
**Status:** COMPLETE  
**Builds on:** research-historical-data-quality, research-synthetic-vs-replay-setups, research-yahoo-vs-tickstream (be4d9b45)

---

## Priority shift: MENTOR not signals

Karen is a **trading mentor / decision support** system — not a signal generator.

| Valid outcomes | Invalid optimization targets |
|----------------|------------------------------|
| LONG, SHORT, WAIT, NO_TRADE | Setup count maximization |
| Insufficient info | Forced directional calls |
| Conflicting evidence acknowledged | Win/loss as primary score |

**Reasoning quality > subsequent price direction.**

Yahoo vs TickStream track: **STOP** (complete). Yahoo = screening; TickStream = validation authority.

---

## Blocker resolution: chartSnapshot → data_quality

### Path traced

```
historical dataset (m1 bars)
  → ReplayDataCutoff.slicedM1()
  → buildResearchChartSnapshotFromBars({ bars, asOf })
      source: "research_bars"
      scoreChartQuality(base, asOfSec)  // not Date.now()
  → buildMarketState({ chartSnapshot })
  → buildMarketObservation → data_quality
  → buildMarketInterpretation
  → buildTradingDecision
  → setup gates (baseline) / mentor response (replay)
```

### Before → after (NQ 14:30Z)

| Field | Before | After |
|-------|--------|-------|
| chartSnapshot.source | `none` | `research_bars` |
| data_quality | `missing` | `good` |
| decision.verdict | `NO_TRADE` | `WAIT` |
| Structure fields | `unknown` | populated |

**Fix location:** `lib/research/chart-snapshot-from-bars.ts` — research adapter only. Prod gates unchanged.

---

## Mentor-quality evaluation framework

Research-only rubric in `lib/research/mentor/`. **Not scored primarily by win/loss.**

### Ten criteria (0=fail, 1=partial, 2=pass)

| # | ID | What it measures |
|---|-----|------------------|
| 1 | `sufficient_info` | Cites enough observable facts at cutoff T |
| 2 | `structure_accuracy` | Structure evidence aligns with observation |
| 3 | `dominant_conflicting_evidence` | Acknowledges conflict when both cases supported |
| 4 | `uncertainty` | Confidence appropriate for mixed/weak evidence |
| 5 | `invalidation` | Actionable invalidation when directional |
| 6 | `no_hindsight` | No candle/time references after cutoff T |
| 7 | `no_forced_direction` | WAIT/NO_TRADE when evidence insufficient |
| 8 | `consistency` | Verdict aligns with cited evidence |
| 9 | `trader_usefulness` | Entry idea + levels actionable for trader |
| 10 | `data_quality_honesty` | Honest handling of missing/stale data |

**Pass threshold:** ≥70% total score AND zero falsification flags AND `source === "pipeline"`.

### Falsification checks (automatic disqualifiers)

| Flag | Detects |
|------|---------|
| `hindsight_leakage` | Candle timestamps after cutoff T |
| `overconfidence` | confidence ≥70 with WAIT/NO_TRADE or mixed evidence |
| `forced_signal` | Deterministic path OR directional under bad data |
| `cherry_pick` | Deterministic LONG/SHORT when both cases supported |
| `unavailable_info_cited` | Structure claims when observation blocked |

### Usage

```typescript
import { evaluateMentorResponse } from "../lib/research/mentor";

const result = evaluateMentorResponse({
  asOf, karen, observation, interpretation, decision,
  availableBarTimes: m1.map(b => b.time.toISOString()),
});
// result.mentorEvalReady, result.pctScore, result.falsifications
```

Run: `npm run test:research-mentor-eval`

---

## Falsification results (methodology)

### 1. Deterministic replay ≠ mentor evidence

`buildDeterministicKarenResponse` always emits LONG/SHORT from bias stack.

- **Fails:** `no_forced_direction`, `forced_signal`, `data_quality_honesty`
- **mentorEvalReady:** false
- **Do not use** for edge validation or mentor scoring

### 2. Pipeline path now evaluable

At NQ 14:30Z and 20:59Z:
- `data_quality: good`
- Verdict: `WAIT` (valid — entry not active or structure insufficient for trade)
- **mentorEvalReady:** true (pipeline source, no falsifications)

Zero baseline setups at these timestamps is **correct mentor behavior** (WAIT), not methodology failure.

### 3. Yahoo track closed

Per be4d9b45: Yahoo adequate for screening; not baseline authority. No further Yahoo work unless methodology gap proven.

---

## What historical evaluation can now measure

| Measurable | Not yet measurable |
|------------|-------------------|
| Reasoning at cutoff T | Post-hoc win rate as primary metric |
| WAIT vs trade appropriateness | Full-session mentor narrative quality (needs human review) |
| Data-quality honesty | TV drawing-dependent calls |
| Consistency with Phase 1 spec | Multi-day mentor drift |

---

## TESTS + BUILD

| Command | Result |
|---------|--------|
| `npm run test:research-baseline` | 33/33 PASS |
| `npm run test:research-mentor-eval` | 17/17 PASS |
| `npm run test:research-backtest` | PASS |
| `npm run test:research-dataset` | PASS |
| `npm run test:research-dataset-replay` | PASS |
| `npm run build` | PASS |

---

## MENTOR EVAL READY

**YES**

Criteria met:
1. Historical data-quality blocker fixed (research adapter)
2. Pipeline reaches interpretation/decision on NQ timestamps
3. 10-criterion rubric + falsification framework implemented
4. Regression tests pass
5. Deterministic path explicitly falsified for mentor scoring

**NOT ready for:** Edge validation claiming tradable alpha. Mentor eval measures reasoning quality, not P&L.

---

## Next queued task

**`research-karen-edge-validation-v2`** — re-run edge validation using pipeline path + mentor rubric. Do NOT optimize setup count. Score mentor quality per timestamp; price outcome is secondary diagnostic only.

---

## Artifacts

| Path | Purpose |
|------|---------|
| `lib/research/chart-snapshot-from-bars.ts` | Historical OHLC → chart snapshot adapter |
| `lib/research/mentor/evaluation.ts` | Mentor rubric + falsification |
| `lib/research/mentor/types.ts` | Criterion/falsification types |
| `scripts/test-research-mentor-eval.ts` | Regression tests |
| `scripts/research-compare-pipelines.ts` | Stage-by-stage comparison |
| `data/supervisor/results/research-historical-data-quality.md` | Data-quality fix report |

STOP.
