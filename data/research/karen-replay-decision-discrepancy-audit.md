# KAREN — Replay decision discrepancy audit

**Date:** 2026-08-14  
**Mode:** AUDIT ONLY — no DecisionEnvelope / ICT / stance / PIT / market-context / tick-current / performance changes  
**Fixture:** `synthetic-ny-am` @ **index 50** (`2026-08-12T14:20:00.000Z`, price ~25006.9)  
**Label:** HISTORICAL / FIXTURE — NOT LIVE  
**Constraint:** Do **not** “fix” by forcing CLI and pipeline to match.

Smoke context: `data/research/karen-weekend-analysis-smoke.md` (CLI prints SHORT; envelope truth is WAIT / flat).

---

## Executive answer (required fields)

| Field | Answer |
|-------|--------|
| **CLI PATH** | `npm run research:replay` → `scripts/research-run-replay.ts` → shared PIT cutoff (`ReplayEngine` + `ReplayDataCutoff.buildContext`) → **`buildDeterministicKarenResponse`** → bias heuristic → **SHORT** (`source: "deterministic"`) |
| **PIPELINE PATH** | Same PIT cutoff / same `MarketContext` → **`buildKarenReplayResponse`** → `buildMarketState` + chart snapshot → **`runDeskPipeline`** → `buildTradingDecision` → **WAIT** → `buildDecisionEnvelope` → **stance=`flat`**, `tradeDirection=NONE` (`source: "pipeline"`) |
| **FIRST POINT OF DIVERGENCE** | Immediately after shared context build: CLI invokes `buildDeterministicKarenResponse`; authoritative path invokes `buildKarenReplayResponse` / `runDeskPipeline`. No shared decision function. |
| **AUTHORITATIVE PATH** | **Pipeline / DecisionEnvelope** (`buildKarenReplayResponse` → `runDeskPipeline` → envelope). Live mentor / trading reads use this class of path — not the CLI deterministic formatter. |
| **REAL BUG?** | **No decision-logic bug.** Dual paths by design: deterministic formatter **always** emits LONG\|SHORT from bias/MSS and **never** WAIT. Pipeline correctly WAITs (SHORT lean + `entryStatus=WAIT` retrace gate). Documented previously in `research-historical-data-quality` / mentor eval falsifiers. |
| **LIVE RISK?** | **Low for live trading** if operators use pipeline/envelope. **Research/operator confusion risk:** treating CLI `Karen: SHORT` as strategy evidence or live stance. Mentor eval already scores deterministic as forced_signal / no_forced_direction fail. |
| **SAFE FIX** | (recommend only) Point `research:replay` at `buildKarenReplayResponse` (or print **both** with explicit `source` labels); keep deterministic offline-only / tagged non-strategy. Do **not** change DecisionEnvelope, ICT, or stance resolution to chase CLI SHORT. |

---

## Same cutoff — measured outputs

Regression: `npm run test:karen-replay-decision-discrepancy` (also reproduced via `research-compare-pipelines` @ 14:20).

| Path | `pipelineVerdict` | `source` | Notes |
|------|-------------------|----------|--------|
| Deterministic (CLI) | **SHORT** | `deterministic` | `bias=bearish`, `mss=null` → `longBias=false` → always SHORT |
| Desk pipeline | **WAIT** | `pipeline` | `verdict_reason` starts with SHORT bias + wait-for-retrace into `25009–25035`; entry zone present; invalidation null at this cutoff |
| DecisionEnvelope | stance **`flat`** | (from pipeline) | `resolveStance(WAIT)` → flat (not wait-trigger stance); confidence medium; thesis “bearish structure continuation”; tradeDirection NONE |

Shared inputs at index 50:

- Bias stack / daily hint: **bearish**
- MSS: **none**
- PD: premium vs today / equilibrium vs prev day
- data_quality (pipeline observation): **good**
- Compare-pipelines sample at 14:20 (51 bars): `SHORT (deterministic)` vs `WAIT (pipeline)`, `entryStatus=WAIT`, baseline NONE

Across synthetic fixture samples (`research-compare-pipelines`): deterministic LONG\|SHORT **13/13**; pipeline LONG\|SHORT **0/13**.

---

## Call-graph trace

### Shared (identical through cutoff)

```
loadReplayFixture("synthetic-ny-am")
  → ReplayEngine({ initialIndex: 50 })
  → snapshot.asOf / currentPrice
  → ReplayDataCutoff(fixture, asOf).assertNoFutureLeak()
  → cutoff.buildContext()  // MarketContext PIT
```

### CLI branch (non-authoritative)

```
scripts/research-run-replay.ts:67
  buildDeterministicKarenResponse(ctx, fixture, asOf)
    lib/research/replay/karen.ts:106–136
      longBias = (dominantBias|daily.biasHint === "bullish")
                 OR (mss.direction === "bullish")
      // else → SHORT — never WAIT / NO_TRADE
      pipelineVerdict: longBias ? "LONG" : "SHORT"
      source: "deterministic"
```

### Pipeline branch (authoritative)

```
buildKarenReplayResponse(ctx, data, asOf)
  → slicedM1 + buildResearchChartSnapshotFromBars
  → buildMarketState(...)
  → runDeskPipeline(ctx, state)
       observation → interpretation → buildTradingDecision
         short_case supported, long_case not
         + getExecutionScaffold.entryStatus === "WAIT"|"EXTENDED"
         → verdict WAIT ("SHORT bias — wait for retrace…")
  → formatKarenFromPipeline → pipelineVerdict = decision.verdict, source: "pipeline"
  → buildDecisionEnvelope(pipeline, ctx, state)
       resolveStance: WAIT → flat|wait via isWaitForTrigger
       @50 → stance flat, tradeDirection NONE
```

---

## Questions 1–9 (DecisionEnvelope on pipeline path @50)

Same envelope checks as weekend smoke — **pipeline/envelope only** (CLI deterministic is out of scope for envelope truth):

| # | Field | Result | Detail |
|---|--------|--------|--------|
| 1 | **stance** | flat | Pipeline WAIT → `resolveStance` → flat |
| 2 | **thesis** | complete | what ≈ bearish structure continuation |
| 3 | **evidence vs interpretation** | separated | facts ≠ interpretation layers |
| 4 | **detected vs used** | present | playbook chain (e.g. premium_discount / session_liquidity roles) |
| 5 | **conflictLog** | no HTF↔primary disagree | both bearish lean; stay flat |
| 6 | **invalidation** | accepted by validator | pipeline decision.invalidation may be null; envelope still validates |
| 7 | **validateDecisionEnvelope** | 0 errors | per weekend smoke |
| 8 | **mentor matches envelope** | yes | spoken reflects flat / WAIT class |
| 9 | **mentor coaching same envelope** | yes | Why? → WAIT_EXPLANATION on same flat decision |

**CLI SHORT does not participate in 1–9** — it never builds a DecisionEnvelope.

---

## Intentional vs bug

| Claim | Verdict |
|-------|---------|
| Pipeline WAIT / envelope flat wrong for this fixture | **Not established as bug** — SHORT lean without ACTIVE entry → WAIT is production decision-layer behavior |
| CLI SHORT wrong vs live | **Misleading if treated as live call** — formatter always directional |
| Divergence itself | **Known / intentional dual path** — preserve in regression; do not unify by mutating decision logic |

Prior art:

- `data/supervisor/results/research-historical-data-quality.md` — deterministic always LONG\|SHORT; path mismatch preserved by design
- `lib/research/mentor/evaluation.ts` — `source === "deterministic"` → forced_signal / no_forced_direction score 0
- `scripts/research-compare-pipelines.ts` — stage comparison tool already surfaces det vs pipeline

---

## Regression test

- Script: `scripts/test-karen-replay-decision-discrepancy.ts`
- Run: `npm run test:karen-replay-decision-discrepancy`
- Asserts **current observed divergence** on `synthetic-ny-am` @ 50:
  - deterministic → SHORT + `source=deterministic`
  - pipeline → WAIT + `source=pipeline`
  - envelope stance → flat
  - verdicts **must differ** (documents known divergence; fails if someone “fixes” by making them match without changing the dual-path contract)

---

## Safe fix options (do not implement here)

1. **Preferred:** `research-run-replay.ts` calls `buildKarenReplayResponse` for printed Karen; optionally still dump deterministic under a clearly labeled secondary field.
2. **Alt:** Keep deterministic default but banner: `NOT STRATEGY / NOT ENVELOPE — bias formatter only`.
3. **Do not:** Change `buildTradingDecision`, `resolveStance`, ICT, or PIT so CLI SHORT becomes “correct.”

---

## Final

**STOP** — audit + documenting regression only. No decision fix. No commit / push / deploy.

---

## FIX APPLIED (2026-08-14)

**Change:** `research:replay` (`scripts/research-run-replay.ts`) now uses **`buildKarenReplayResponse` → desk pipeline → `buildDecisionEnvelope`** as the primary Karen result. Legacy `buildDeterministicKarenResponse` remains exported but labeled **NON-AUTHORITATIVE** (offline bias heuristic; always LONG|SHORT) and is **not** written into the normal replay snapshot.

**Regression:** `npm run test:karen-replay-decision-discrepancy` now asserts **MATCH** on `synthetic-ny-am` @ 50: pipeline WAIT, replay WAIT, envelope stance flat / tradeDirection NONE, `validateDecisionEnvelope` clean, mentor spoken matches envelope, no fabricated LONG/SHORT on the authoritative path.

**Out of scope (unchanged):** DecisionEnvelope, ICT, stance resolution, playbook, PIT cutoff, live trading, market-context.
