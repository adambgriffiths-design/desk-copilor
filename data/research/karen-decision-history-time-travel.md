# Decision history & time-travel explanations

**Date:** 2026-08-14  
**Path:** `buildKarenReplayResponse` → `runDeskPipeline` → **DecisionEnvelope** (not legacy formatter)

## What you can ask

| Question | Lane | Behavior |
|----------|------|----------|
| `What was your decision at 09:31?` | HISTORICAL or LIVE | Exact clock → PIT rebuild / LIVE ring |
| `What was your decision 10 minutes ago?` | HISTORICAL or LIVE | Relative lookback |
| `What changed?` / `What changed since 09:31?` | HISTORICAL or LIVE | Envelope compare (market / interpretation / decision) |
| `What was different between 09:31 and 10:20?` | both | Dual snapshot compare |
| `Why did your decision change…` | both | Same compare, labeled why |

Outputs are labeled:

- **HISTORICAL / FIXTURE — NOT LIVE MARKET DATA · DECISION HISTORY**
- **LIVE — CURRENT SESSION HISTORY**

Lanes never mix.

## Modules

- `lib/decision-envelope-history.ts` — LIVE / HISTORICAL rings; suppress during PIT builds
- `lib/decision-history-query.ts` — clock + relative parse
- `lib/decision-time-travel.ts` — PIT dual-cutoff via `ReplayDataCutoff` + `buildKarenReplayResponse`
- Wired in `app/api/chat/stream/route.ts` (LIVE) and `lib/research/replay/historical-ui.ts` (HISTORICAL)

## Tests

```bash
npm run test:decision-history-time-travel
```

Covers exact / nearest-previous / missing / changed / unchanged / **future-leak refuse** / LIVE↔HISTORICAL isolation.
