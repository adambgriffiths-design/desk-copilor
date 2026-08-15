# KAREN — LIVE current-stance data handoff fix

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/` (pinned preview `desk-copilor-connpuliu-adam-b45d` was **1.4.74**)  
**Extension:** primary `extension/` with `PIN_PREVIEW_API_BASE=true` → that preview  
**Mode:** surgical handoff / routing fix — quality gate semantics preserved (no fabricated OHLC)  
**Commit/push/prod deploy:** not done (per task)

---

## Verdict

**FIRST broken hop:** `/api/chat/stream` → `ChatPromptInput` / `buildChatSystemPrompt` **dropped** extension `chartLastPriceSource` + `chartLastPriceTs`.  
`buildMarketState` then set `requireTvLive=true` because a numeric Last was present, and `resolveAuthoritativePrice` **rejected** the untagged print → `lastPrice=0` (“current price unknown”).

**Compounding hop:** chat path never attached OHLC candles (no `chartSnapshot` in chat extras; `MarketState.candles` only came from TV export). Desk Yahoo m1 existed but was not hydrated → `can_observe=false` → “OHLC / market state unavailable; market data missing…”.

**Routing hop:** “What’s your current stance on Nasdaq futures?” was **not** `CURRENT_MARKET_READ` (fell to rich trading + empty MarketState). Stance / bias / MNQ|NQ|Nasdaq think-of phrases now classify as **CURRENT_MARKET_READ** and do **not** steal into DecisionEnvelope history.

---

## Repro (pinned preview 1.4.74 — before)

Extension-shaped POST to `https://desk-copilor-connpuliu-adam-b45d.vercel.app/api/chat/stream`:

| Case | Payload | Reply (truncated) |
|------|---------|-------------------|
| minimal | messages + `forceMarket` + `MNQ1!` | `waiting — OHLC / market state unavailable; market data missing; market structure not confirmed; higher-timeframe bias unknown…` |
| **with TV Last** | + `chartLastPrice: 25123.5`, `source: tradingview_live`, `ts: now` | **Still** `waiting — OHLC / market state unavailable; **current price unknown**; market data missing…` |

That proves the extension already had usable Last, and the **server handoff** was the first place it was lost.

---

## Trace (hops)

```
extension prompt
  → intent (was GENERAL_CHAT / rich trading; now CURRENT_MARKET_READ)
  → chartLastPrice (+ source/ts) captured in chatRequestExtras
  → POST /api/chat/stream
      ✗ FIRST BREAK: body.chartLastPriceSource / Ts discarded
      ✗ candles never hydrated from desk m1
  → buildDeskMarketIntelligence / buildMarketState (lastPrice=0, candles=[])
  → observation data_quality=missing
  → quality gate WAIT (honest given empty state — gate itself OK)
  → response
```

---

## Fix (files changed in `.tmp/karen-final-integration/`)

| File | Change |
|------|--------|
| `app/api/chat/stream/route.ts` | Pass `parseChartPriceMeta` + `parseChartSnapshotInput` into `ChatPromptInput` |
| `lib/chat-engine.ts` | `ChatPromptInput` carries source/ts/snapshot; `buildChatSystemPrompt` forwards them |
| `lib/chart-live-price.ts` | Untagged valid MNQ print + fresh age → `tradingview_live` even when `requireTvLive` |
| `lib/market-intelligence.ts` | If TV export missing, hydrate `yahoo_fallback` snapshot from desk m1 |
| `lib/chart-snapshot.ts` | `yahoo_fallback` with enough candles → **degraded** (usable), not **missing** |
| `lib/data-quality-check.ts` | When `expectFresh=false`, bar age is **warning** (`stale_bar_closed`), not critical broken feed |
| `lib/mentor-intent.ts` | Stance / bias / bullish-or-bearish / think-of MNQ\|NQ\|Nasdaq → `CURRENT_MARKET_READ` (before bias coaching) |
| `lib/decision-history-query.ts` | Remove `current_stance` history steal — live desk read owns those phrases; use **last recorded state** for ring history |
| `scripts/test-live-current-stance-handoff.ts` | **New** extension-shaped regression |
| Related history tests | Updated for live CMR vs recorded-state split |

**Not weakened:** quality gate still WAIT when true OHLC/price absent. No invented candles.

---

## Before / after (pinned preview)

| | Before (`connpuliu` 1.4.74) | After (`8uxfmve9v` 1.4.76) |
|--|----------------------------|----------------------------|
| Intent | rich trading / empty state | live market read |
| With TV Last `25123.5` | WAIT OHLC unavailable + **current price unknown** | Spoken bias/structure with **last price 25123.50** |
| Flags | `badOHLC=true`, `priceUnknown=true` | `badOHLC=false`, `priceUnknown=false`, `marketMissing=false` |
| Weekend age | critical `stale_bar` | warning when `!expectFresh` |
| Follow-ups | product intents with prior WAIT | `why?` / waiting-for / why-not-long / invalidates OK |

---

## Tests run

```
npx tsx scripts/test-live-current-stance-handoff.ts   # PASS
npx tsx scripts/test-extension-shape-hardening.ts     # PASS
npx tsx scripts/test-last-decision-semantics.ts       # PASS
npx tsx scripts/test-actionable-trade-semantics.ts    # PASS
npx tsc --noEmit                                      # OK
```

Full suite not run (shared core touched only in the integration tree; focused tests cover handoff + history coordination).

---

## Deploy note

- Pin confirmed: preview **1.4.74** at `desk-copilor-connpuliu-adam-b45d` (pre-fix).  
- Integration tree deployed preview: `https://desk-copilor-8uxfmve9v-adam-b45d.vercel.app` (package **1.4.76**).  
- Primary `extension/api-config.js` + `options.js` `PREVIEW_BASE` pinned to that URL.  
- **No production deploy.** Reload extension (or Options → pin preview) to hit the new host.

---

## Coordination

Hardening work in the same tree (history / actionable-trade semantics) was adjusted surgically: **current stance** is live CMR; **last recorded state/decision** remains history. Avoided clobbering last-decision composite behavior.
