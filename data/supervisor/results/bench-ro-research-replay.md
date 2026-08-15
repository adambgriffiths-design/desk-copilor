# READ-ONLY audit: lib/research/replay/

**Task ID:** bench-ro-research-replay  
**Category:** audit  
**Date:** 2026-08-14  
**Scope:** `lib/research/replay/` only — no code changes. Karen/mentor logic not modified.

## Outcome

COMPLETE — 14 files, barrel `index.ts` re-exports all modules. Isolated point-in-time replay stack with explicit cutoff and two Karen response builders.

## Modules

| File | Role |
|------|------|
| `engine.ts` | `ReplayEngine` — cursor over 1m bars, HTF index maps, cutoff cache, `assertNoFutureLeak` on context build |
| `cutoff.ts` | `ReplayDataCutoff` — slice m1/m5/m15/daily at asOf; `forwardM1` labeled reveal-only |
| `fast-slice.ts` | Prefix slices + HTF end-index maps (backtest hot path) |
| `features.ts` | `extractFeaturesAtCutoff` |
| `karen.ts` | `buildKarenReplayResponse` (desk pipeline) and `buildDeterministicKarenResponse` |
| `fixtures.ts` | Synthetic + dataset fixture load/write |
| `records.ts` / `dataset.ts` / `store.ts` | Point-in-time records, fingerprints, persist |
| `session.ts` | In-memory replay session + locked verdict / reveal |
| `excursion.ts` / `outcome.ts` | Forward excursion and outcome eval (post-cutoff, not fed to Karen) |
| `types.ts` | Shared types |

## Cutoff / leak checks

- `ReplayDataCutoff.assertNoFutureLeak()` throws if any sliced m1/m5/m15 bar is after asOf.
- Engine `cutoffEntryAtCursor()` calls that assert, then `buildContextAtBarIndex`.
- `forwardM1` / `computeExcursion` / `evaluateOutcome` are after-cutoff tools; comments say they must not be passed to Karen.

## Dual Karen paths (label, do not conflate)

- **Pipeline:** `buildKarenReplayResponse` → `runDeskPipeline` + chart snapshot from cutoff bars. Chart price source in this builder is `"yahoo"` (research snapshot adapter), not a live TickStream change.
- **Deterministic:** `buildDeterministicKarenResponse` — used by `scripts/research-run-replay.ts`. Prior research: do **not** treat this path’s LONG/SHORT as baseline edge.

This audit did not execute either path.

## Safety

- Allowed path respected: `lib/research/replay/` read only.
- Did not edit `karen.ts` or any replay file.
- No commit, push, or deploy.

## STOP
