# Karen decision-architecture research roadmap

**Date:** 2026-08-14  
**Status:** living — evidence-gated. Production architecture is **frozen** as `architecture-v1`.  
**Does not** change trading logic, prompts, or the live envelope.

Rules for every milestone: no silent tuning, no future leakage, single-day NQ = **INFRASTRUCTURE / DEBUGGING EVIDENCE** not **EDGE EVIDENCE**. One next experiment at a time.

---

## Milestone 1 — Freeze + map current architecture

**Goal:** Name what Karen already does. Detected → used → decision. Do not redesign.

**Done when:** Seven layers, conflict rules, playbook concepts, and “no weights” are documented from `lib/decision-envelope.ts` + `lib/decision-layer.ts` + `lib/interpretation-engine.ts`. `architecture-v1` overlay is identity.

**WHAT'S PROVEN**
- Envelope + pipeline exist and tests (`scripts/test-decision-envelope.ts`) lock stance/conflict/chain shape.
- Research map lives in `lib/research/architecture/map.ts`. Freeze guard: `lib/research/architecture/freeze.ts`.
- EQH/EQL are on the playbook chain but typically **not** in interpretation long/short reason lists (detected ≠ used).

**WHAT'S STILL AN ASSUMPTION**
- Stay-flat on HTF vs LTF is a good default (hypothesis, not validated).
- The current concept set is sufficient for later edge claims.

**THE SINGLE HIGHEST-VALUE NEXT EXPERIMENT**  
Log a **decision trace** at one PIT cutoff (synthetic or Aug 12) and confirm DETECTED vs USED vs INFLUENTIAL without changing production.

---

## Milestone 2 — Decision traces + PIT/poison + fingerprints

**Goal:** Every evaluation has a reproducible trace. Future bars cannot change T.

**Done when:** Trace schema includes market context, concepts, conflicts, stance, target, invalidation, labeled horizons. Poison tests for price/swing/sweep/MSS/FVG/liquidity. Same dataset+timestamp+arch version → same fingerprint.

**WHAT'S PROVEN**
- Harness: `lib/research/architecture/trace.ts`, `fingerprint.ts`, `pit.ts`, `evaluate.ts`.
- `npm run test:research-decision-architecture` — 40 passed (2026-08-14), including six poison kinds on synthetic fixture.
- Existing replay PIT: `ReplayDataCutoff.assertNoFutureLeak`, `scripts/test-research-replay.ts`.

**WHAT'S STILL AN ASSUMPTION**
- Envelope `usedInDecision` / `role` is a complete account of *why* the verdict moved (citation heuristics, not a causal ablation).
- Fingerprints remain stable across `generated_at` / `lastPipeline` globals because traces exclude clocks.

**THE SINGLE HIGHEST-VALUE NEXT EXPERIMENT**  
Wire traces through the **temporal split harness** on available NQ (week if present) with n flagged — do not interpret rates as edge.

---

## Milestone 3 — Train / validation / OOS harness

**Goal:** Strict chronological splits even when the dataset is too small for edge.

**Done when:** TRAIN / VALIDATION / OOS windows exist, selection on VAL/OOS is forbidden, low-n and single-day are labeled INFRASTRUCTURE.

**WHAT'S PROVEN**
- `lib/research/architecture/splits.ts` reuses `planWalkForward` (60/20/20, no shuffle).
- Tests forbid `selectedArchitectureFrom: OOS` and mark single-day OOS as INFRASTRUCTURE.

**WHAT'S STILL AN ASSUMPTION**
- Available NQ (1 day + 1 week on disk) can ever support EDGE claims — it cannot, until months exist.
- Bar-index splits on a single Globex session are a valid proxy for session-day OOS (they are only infrastructure).

**THE SINGLE HIGHEST-VALUE NEXT EXPERIMENT**  
Run a **smoke comparison of three frozen architectures** on the harness with explicit sample-size gap — no winner.

---

## Milestone 4 — Small versioned architecture comparison

**Goal:** Hypothesis-testing layer. v1 = production. v2/v3 = research overlays only. Compare decision quality, stability, OOS. Do not pick a winner from eval.

**Done when:** Three snapshots are frozen (`weights: none`). Comparison table has direction / WAIT / avoidance / target / invalidation / R:R / conflict / false confidence — not win rate only.

**WHAT'S PROVEN**
- Snapshots: `lib/research/architecture/versions.ts` + `data/research/architecture/versions.json`.
- Hypotheses H-A / H-B / H-C seeded UNTESTED.
- Comparison reporter exists (`compare.ts`). Empty-run table + sample-gap copy tested.

**WHAT'S STILL AN ASSUMPTION**
- v2 (LTF override on proven PDH/PDL) or v3 (HTF does not block tactical) will change quality vs stay-flat — **untested**.
- Overlay clone (neutralize `tradeable_bias`) is a faithful operationalization of H-B / H-C.

**THE SINGLE HIGHEST-VALUE NEXT EXPERIMENT**  
Not ablation. **Acquire ≥1 month of PIT 1m NQ** (TickStream week-batches or NT 1m Last export) so OOS can be a later calendar period. Until then, do not mark H-B/H-C anything but UNTESTED.

---

## Milestone 5 — Ablation / conditional importance (later)

**Goal:** “When is PDH useful?” Counting only. No profitable-weight search.

**Done when:** Ablation channels (PDH, EQH/EQL, FVG, MSS, session, HTF) run on **clones**. Conditional slices keyed by session / PD / HTF×LTF. n flagged.

**WHAT'S PROVEN**
- Code exists: `ablation.ts`, `importance.ts`. Unit test runs six channels on a replay fixture clone.

**WHAT'S STILL AN ASSUMPTION**
- Ablating observation+ctx fields is equivalent to “this concept was absent in the market.”
- EQH/EQL ablation will move verdicts (map says they usually do not).

**THE SINGLE HIGHEST-VALUE NEXT EXPERIMENT**  
Do **not** start this until Milestone 4 has traces on a multi-week TRAIN split. Then one channel: PDH, on TRAIN only.

---

## Milestone 6 — Consider production change (not this pass)

**Goal:** Only after OOS decision-quality evidence, freeze a candidate and re-evaluate. Not now.

**WHAT'S PROVEN**  
Nothing that would justify changing `lib/decision-envelope.ts` or `buildTradingDecision`.

**WHAT'S STILL AN ASSUMPTION**  
Any alternative conflict rule is better.

**THE SINGLE HIGHEST-VALUE NEXT EXPERIMENT**  
None in production. Stay frozen.

---

## TODAY (2026-08-14)

| Milestone | Status |
|-----------|--------|
| 1 Freeze + map | **Complete** (infra) |
| 2 Traces + PIT + fingerprints | **Complete** (infra; synthetic + fixture) |
| 3 TRAIN/VAL/OOS harness | **Complete** (harness; data too small for EDGE) |
| 4 Versioned comparison | **Harness complete; smoke only; H-A/B/C UNTESTED** |
| 5 Ablation / importance | Code present; **not** the next experiment |
| 6 Production change | **Forbidden this pass** |

**Proven vs assumed TODAY** — see Milestone 4.  
**Single next experiment:** acquire multi-week/month PIT NQ (or NT 1m export) as research fixtures. Do not optimize weights. Do not run a 6-month per-bar baseline.
