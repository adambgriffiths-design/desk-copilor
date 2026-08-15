# Labeled Setups

Adam's historical ICT examples for replay and Phase 2 training.

## Diversity required

Include **not only best setups**:

| Category | Example fixture | Grade |
|----------|-----------------|-------|
| Obvious winner (taken) | `ny-open-long-a-plus` | A+ |
| Good setup, wait for entry | `bullish-wait` | B |
| Obvious no_trade (no edge) | `neutral-no-trade` | no_trade |
| Data failure | `missing-quality` | no_trade |
| Similar but skip | `similar-but-skip` | C |
| Bearish wait | `bearish-wait` | B |

## Required label fields

- `expected_observation` — what happened (Report 1)
- `why_taken` + `why_rejected_alternatives` — Adam's reasoning (Report 2)
- `adam_verdict` — LONG / SHORT / WAIT / NO_TRADE (Report 3)

## Add a label

```bash
npm run label:setup
```

Match fixture id to entry in `lib/replay-fixtures.ts`.

Chart-proof observation labels live under `chart-proof/` (not `examples/`). They use matching `REPLAY_FIXTURES` OHLC entries + `rebuildCtxFromCandles` via `npm run test:observation-proof`. Decision-replay examples stay under `examples/` for `test:replay` / `test:desk`.

## Adam to refine (Phase 2)

- Scoring methodology and keyword weights
- `expected_invalidation` / `expected_target` tolerance
- Additional observation fields
