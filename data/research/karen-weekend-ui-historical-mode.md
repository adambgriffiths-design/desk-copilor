# KAREN — Weekend UI historical mode

**Date:** 2026-08-14  
**Label:** HISTORICAL / FIXTURE — NOT LIVE MARKET DATA  
**Path:** `buildKarenReplayResponse` → `runDeskPipeline` → DecisionEnvelope (not `buildDeterministicKarenResponse`)

## How to launch from normal UI

1. Open the Karen panel on TradingView.
2. Open **Dev tools** (panel accordion).
3. Enable **Enable HISTORICAL / FIXTURE mode**.
4. Fixture defaults: `synthetic-ny-am`, bar index `50`.
5. Click **ANALYSE MARKET** or ask in chat: `Give me the read`.
6. Follow-ups (`Why?`, `Why not long?`, `Why not short?`, `What are you waiting for?`) reuse the same frozen decision.

UI shows badge **HISTORICAL / FIXTURE**. Extension omits live `chartLastPrice` / chart snapshot extras when enabled.

## Fixture used

`synthetic-ny-am` @ index `50` (`data/replay-fixtures/synthetic-ny-am.json`)

## Exact UI label/state

`HISTORICAL / FIXTURE — NOT LIVE MARKET DATA`

## Live/fixture isolation

- Server: `body.historicalFixture` → `answerHistoricalFixtureTurn` / `buildHistoricalFixtureIntelligence`
- Does not write live intel cache; restores any prior `lastPipeline`
- No Yahoo / Tickstream on this path
- Extension does not push TV OHLC into the request while historical mode is on

## Tests / E2E

- `npx tsx scripts/karen-weekend-e2e-historical-ui.ts` → **PASS**  
  Report: `data/research/karen-weekend-e2e-historical-ui.md`

## Limitations

- Historical mode is a panel Dev toggle (localStorage), not production-facing.
- `:3000` health was 500 during this run; E2E validated the same adapter the stream route calls in-process with `LIVE_LATENCY_TRACE`.
- General chat still bypasses the market pipeline when historical mode is on.
