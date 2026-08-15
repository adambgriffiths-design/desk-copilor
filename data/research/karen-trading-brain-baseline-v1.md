# KAREN — Trading-brain Baseline v1

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Phase:** trading-brain-correctness (Track B2)  
**EDGE CLAIM:** NONE  

**Prior:** [`karen-trading-logic-correctness-audit.md`](./karen-trading-logic-correctness-audit.md)

---

## Scope lock (Adam)

Baseline v1 includes **only**:

1. Directed displacement (not dual-credited both ways)
2. MSS≠bias structure (`mapStructure` does not copy bias when MSS absent)
3. Focused tests for those two
4. Identical-asOf Decision Validation replay vs Baseline v0 when shared timestamp manifest exists

**Explicitly OUT OF SCOPE for Baseline v1** (remain stubs / future versioned OFF-by-default modules):

- Order block geometry (heuristic stub stays stub)
- FVG validity / pending state machines
- Time-of-day hypothesis modules in production weights
- Automatic weight optimization / genetic tuning / live self-learning

---

## Fixes shipped

| Fix | Before | After |
|-----|--------|-------|
| **Directed displacement** | `displacement=present` with no direction; interpretation added the same reason to **long and short** | `displacement_direction` = bullish\|bearish from body close vs open; weigher credits **one side only** |
| **MSS≠bias structure** | `mapStructure` copied `tradeable_bias` when MSS null → fake bullish/bearish structure | No MSS → `market_structure=unclear`; bias stays on `htf_bias` only |

**Version tags**

- `TRADING_BRAIN_BASELINE_ID` = `baseline-v1`
- `DECISION_EVIDENCE_PATH_VERSION` = `trading-brain-baseline-v1`
- Stamped on every observation evidence map
- Pipeline schema bumped to `1.1.0` (semantic observation fields)

---

## Identical-timestamp replay

**Canonical shared timestamps:** `data/karen-decision-validation/evaluation-timestamps-v0.json`  
**Contract pointer:** `data/karen-decision-validation/v0/shared-asof-manifest.json`

- Large MNQ chronological fixture: `mnq-week-chronological-dev-v0` (6880 m1 bars; development split)
- Smoke subset (tiny fixture): 3 asOfs — identical replay **PASS**; v0↔v1 paired delta **0**
- MNQ sample (`--limit=30`): identical replay **PASS**; paired asOfs 28/30 vs frozen v0; paired delta **0**
- Full development split (214): available via `npm run karen:trading-brain:baseline-v1` (no `--limit`)

Runner: `npm run karen:trading-brain:baseline-v1` (optional `--smoke`, `--limit=N`)

Compares verdict counts on paired identical asOfs only. No profitability / edge interpretation.

---

## v0 vs v1 delta (summary counts)

| Run | LONG | SHORT | WAIT | NO_TRADE | notes |
|-----|-----:|------:|-----:|---------:|-------|
| Smoke paired (3) | Δ0 | Δ0 | Δ0 | Δ0 | tiny chronological |
| MNQ limit30 paired (28) | Δ0 | Δ0 | Δ0 | Δ0 | same verdicts on overlapping asOfs |

v1 evaluated 30/30 requested MNQ timestamps (2 not present in frozen v0 report — v0 idle-dedupe).

---

## Remaining confounders (after B2)

| Confounder | Severity | Notes |
|------------|----------|-------|
| Liquidity sweeps dual-credited in weigher | Medium | Detector side is correct; interpretation still adds sweep reasons to both sides |
| `prev ?? lastPrice` for missing PDH/PDL/PDC | Medium | Invents levels at last price |
| Empty session → today HL fallback | Medium | Fake Asia/London early/thin |
| Dual REH algorithms | Low–Med | Envelope vs observation clustering |
| Order block stub | Low | SPEC_NOT_BUILT — **OUT OF SCOPE** |
| FVG validity / pending | — | SPEC_NOT_BUILT — **OUT OF SCOPE** |
| TOD modules | — | OFF by default — **OUT OF SCOPE** |
| EST daily vs CME session day for PD | Med (labeling) | Fixtures must declare convention |

---

## How to verify

```bash
cd .tmp/karen-final-integration
npx tsx scripts/test-trading-brain-correctness-b2.ts
npx tsx scripts/test-observation-engine.ts
npx tsx scripts/test-trading-logic-correctness.ts
npx tsx scripts/karen-trading-brain-baseline-v1.ts
npx tsc --noEmit -p tsconfig.json
```

---

## Files

| Path | Role |
|------|------|
| `lib/observation-engine.ts` | Directed displacement + MSS-only structure |
| `lib/interpretation-engine.ts` | One-sided displacement reasons |
| `lib/desk-schema.ts` | `displacement_direction` + baseline id constants |
| `scripts/test-trading-brain-correctness-b2.ts` | Focused B2 tests |
| `data/karen-decision-validation/v0/shared-asof-manifest.json` | Shared asOf contract |
| `data/karen-decision-validation/v1/` | Baseline v1 config + reports |
| `scripts/karen-trading-brain-baseline-v1.ts` | Identical-asOf replay + delta |

No commit / push / prod deploy in this track.
