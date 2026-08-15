# KAREN — Trading-brain Baseline v2

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Phase:** trading-brain-correctness  
**FIX:** sweep dual-credit only  
**EDGE CLAIM:** NONE  
**Baseline v2 status:** **FROZEN** after full-214 identical-asOf integrity run  
**Baseline v1 status:** still **FROZEN** and replayable via `withTradingBrainBaseline("v1")`

**Prior:** [`karen-trading-brain-baseline-v1.md`](./karen-trading-brain-baseline-v1.md) · [`karen-trading-logic-correctness-audit.md`](./karen-trading-logic-correctness-audit.md)

---

## Scope lock (Adam)

Baseline v2 includes **only**:

1. Sweep reasons no longer dual-credited to both long and short from the same event
2. Observation preserves detector `side` on liquidity levels (for v2 weigher)
3. Focused tests for one-sided sweep credit + frozen v1 dual-credit replay
4. Identical-asOf Decision Validation replay vs **frozen Baseline v1** on shared timestamp manifest
5. Structural diff beyond verdict + confounder rate for `sweeps_dual_credit`

**Explicitly OUT OF SCOPE for Baseline v2:**

- v3 PD `prev ?? lastPrice` invent
- v4 empty-session HL fallback
- Order block geometry / FVG validity / TOD modules
- Weight tuning / genetic optimization / edge claims
- Conversational layer

---

## TRUE frozen baseline mechanism

```ts
withTradingBrainBaseline("v0" | "v1" | "v2", () => runDecisionValidationV0(...))
```

| Mode | Behavior |
|------|----------|
| **v0** | Bias-as-structure; undirected displacement dual-credit; **sweep dual-credit** |
| **v1 (frozen)** | Directed displacement + MSS≠bias; **sweep dual-credit still ON** |
| **v2 (HEAD)** | v1 fixes + **SSL → long only; BSL → short only; unknown side → neither** |

Module: `lib/trading-brain-baseline.ts`. Production / default path = **v2**. Older baselines remain honest replay modes — never “whatever is in HEAD.”

---

## Fix shipped (v2)

| Fix | Before (frozen v1) | After (v2) |
|-----|--------------------|------------|
| **Sweep weigher credit** | Same `Liquidity sweep observed at …` string pushed to **long and short** | SSL (sell-side) → **long only**; BSL (buy-side) → **short only**; unknown → **neither** |
| **Observation side** | Levels had `taken` only | Optional `side` from `structureFacts.liquiditySweeps` (detector remains source of truth) |
| **Confounder tag** | `sweeps_dual_credit` active whenever a sweep was present (proxy for dual-credit) | Active only when the **same** sweep reason string appears on both sides |

Frozen v0/v1 keep label-only `classifyLevelSide(label)` for SSL-raid / skip semantics (PDC stays unknown under those freezes) so v1 verdicts do not regress.

---

## Full-214 identical-timestamp integrity (development split)

**Canonical shared timestamps:** `data/karen-decision-validation/evaluation-timestamps-v0.json`  
**Contract:** `data/karen-decision-validation/v0/shared-asof-manifest.json`  
**Fixture:** `mnq-week-chronological-dev-v0`  
**FULL_REPLAY:** **PASS** (214/214 paired)  
**dedupeIdle:** false  

### Verdict counts (paired)

| | LONG | SHORT | WAIT | NO_TRADE | ACTIONABLE | TOTAL |
|---|---:|---:|---:|---:|---:|---:|
| **V1_COUNTS** | 13 | 11 | 156 | 34 | 22 | 214 |
| **V2_COUNTS** | 16 | 12 | 155 | 31 | 26 | 214 |
| **DELTAS (v2−v1)** | +3 | +1 | −1 | −3 | +4 | 0 |

V1 paired counts match the frozen v1 integrity report (no regression of displacement / MSS≠bias freezes).

### Structural diff (beyond verdict)

| Metric | Count |
|---|---:|
| structureChanged | **109** |
| verdictChanged | **15** |
| structureChanged & verdict unchanged | **94** |
| same WAIT, reasoning/structure changed | **82** |
| same NO_TRADE, reason fields changed | 2 |

Top field hits: shortReasons 92, longReasons 18, whyNow 24, shortSupported 16, verdict 15, stance 13, invalidation 12.

**Interpretation:** Many same-WAIT with cleaner reasons is expected — v2 removes inappropriate dual-credit of the same sweep event without claiming edge.

### Sweeps dual-credit confounder rate

| | active | rate |
|---|---:|---:|
| **v1 (frozen)** | 109 | **50.9%** |
| **v2** | 0 | **0.0%** |

### Outcome metrics (recorded; EDGE_CLAIM NONE)

| Metric | v1 | v2 |
|---|---:|---:|
| MEDIAN_MFE | 21.875 | 18 |
| MEDIAN_MAE | 41.625 | 41.5 |
| TARGET_BEFORE_INVALIDATION_RATE | 0.214 | 0.188 |

No profitability / edge interpretation.

---

## Roadmap only (do NOT implement yet) — same timestamp manifest

| Baseline | Confounder | Severity | Scope |
|----------|------------|----------|-------|
| **v3** | pd_level_fallback_last_price | medium | Refuse invented PD via `prev ?? lastPrice` |
| **v4** | empty_session_hl_fallback | medium | Refuse fake session HL from empty-window fallback |

Still out of production until explicitly scoped: OB geometry, FVG validity/pending, TOD modules in weights.

---

## EDGE_CLAIM

**NONE** — correctness / measurement integrity only.

---

## BASELINE_V2_FROZEN

Yes — ready for later **v3 PD lastPrice fallback only** (not now).

---

## How to verify

```bash
cd .tmp/karen-final-integration
npx tsx scripts/test-trading-brain-correctness-b2.ts
npx tsx scripts/karen-trading-brain-baseline-v2.ts --smoke
npx tsx scripts/karen-trading-brain-baseline-v2.ts   # full 214
```

Reports: `data/karen-decision-validation/v2/reports/trading-brain-baseline-v2-latest.{json,md}`

---

## Files

| Path | Role |
|------|------|
| `lib/trading-brain-baseline.ts` | v0/v1/v2 mode switch; freeze constants |
| `lib/interpretation-engine.ts` | One-sided sweep weigher credit (v2); dual-credit frozen on v0/v1 |
| `lib/observation-engine.ts` | Preserve detector `side` on liquidity levels |
| `lib/desk-schema.ts` | Optional level `side`; baseline-v2 evidence path |
| `lib/decision-validation/confounders.ts` | Evidence-based `sweeps_dual_credit` tag |
| `lib/decision-validation/v0-replay.ts` | Pass dual-credit detection; default mode v2 |
| `scripts/test-trading-brain-correctness-b2.ts` | Focused sweep + freeze tests |
| `scripts/karen-trading-brain-baseline-v2.ts` | Paired structural integrity runner |
| `data/karen-decision-validation/v2/` | Config + reports + runs |

No commit / push / prod deploy in this track.
