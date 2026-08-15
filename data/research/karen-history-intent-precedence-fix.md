# KAREN — History Intent Precedence + Trade-Today Routing Fix

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Coordinate:** actionable-trade semantics (`karen-actionable-trade-semantics.md`) — composite last-decision not regressed  
**Preview:** redeploy optional after green (`8uxfmve9v` was 1.4.76 pre-this-fix)

---

## Exact report fields

```text
ROOT CAUSE: PASS (identified)
TRADE TODAY → HISTORY: PASS
LAST ACTIONABLE → HISTORY: PASS
LAST RECORDED → HISTORY: PASS
CURRENT STANCE → CMR (not hist): PASS
PREVIOUS SETUP / OUTCOME → HISTORY: PASS
TIME TRAVEL → HISTORY: PASS
COMPOSITE LAST DECISION: PASS (not regressed)
NO OPENAI WHEN HISTORY ANSWERS: PASS
MISSING OHLC DOES NOT BLOCK HISTORY: PASS
NO GENERAL_CHAT INVENT: PASS
TYPECHECK: PASS
FOCUSED REGRESSION: PASS
```

---

## ROOT CAUSE

**First broken hop:** extension trading-path flags + mentor / stream fall-through order.

1. Extension `content.js` sees the word **trade** → `mustUseTradingStream` / `isClearlyTrading` → posts `/api/chat/stream` with `forceMarket: true`, `casualOnly: false`.
2. If decision-history short-circuit misses (narrow phrase list, or mentor already treated the turn as live read), the request continues into the trading stack.
3. Trading stack builds present `MarketState` → quality gate fails on missing OHLC → spoken **WAIT / “OHLC / market state unavailable…”** dump — the observed CURRENT_MARKET_READ / QG symptom.

So the bug is **precedence + coverage**, not quality-gate honesty itself. History must win before any MarketState rebuild.

### Before / after — real prompt

| | Before | After |
|--|--------|-------|
| Prompt | `Have you taken a trade today?` | same |
| Extension flags | `tradingStream=true`, `forceMarket=true`, `casualOnly=false` | same (unchanged) |
| Parsed kind | often missed / fell through | `trade_today` |
| Mentor | could reach `CURRENT_MARKET_READ` or trading QG path | `CHANGE_ANALYSIS` (history product) |
| Route | CMR / quality-gate WAIT dump | deterministic LIVE DecisionEnvelope history |
| OpenAI | possible (or QG skip) | **0** when history answers |
| Missing OHLC | blocked / QG WAIT | **ignored** (history does not need OHLC) |

---

## Precedence (enforced)

1. **decision-history / time-travel** (`isDecisionHistoryTimeQuery` → `answerLiveDecisionHistoryQuery`)
2. **current stance / CURRENT_MARKET_READ** (live desk MarketState)
3. deterministic follow-ups (WAIT / why-not / prior-read — existing)
4. explicit chart-read commands
5. price / levels
6. general chat

---

## Smallest fix

| File | Change |
|------|--------|
| `lib/decision-history-query.ts` | Expand TRADE TODAY phrases (`did you trade today`, `gone long/short today`, …); optional `side` on `trade_today` |
| `lib/decision-time-travel.ts` | `answerTradeToday` respects optional side filter |
| `lib/mentor-intent.ts` | `isDecisionHistoryProductPhrase`; history **before** CMR; CMR excludes history phrases |
| `lib/chat-engine.ts` | Defense: history short-circuit in `tryCurrentMarketReadFastPath` / `streamChatReply` / `generateChatReply` — never QG/OpenAI MarketState rebuild for history |
| `app/api/chat/stream/route.ts` | Comment + `openaiCalls: 0` on history SSE; history remains first hop |
| `scripts/test-history-intent-precedence.ts` | **New** extension-shaped matrix |

**Not touched:** quality-gate semantics, composite last-decision UX, current-stance handoff payload.

---

## Extension-shaped matrix (summary)

All rows PASS. Columns: prompt | parsed | mentor | route | history kind | responseSource | OpenAI?

- TRADE TODAY phrases → `trade_today` | `CHANGE_ANALYSIS` | HISTORY | `live_decision_trade_today*` | OpenAI=false  
- LAST ACTIONABLE → `last_directional` | HISTORY | OpenAI=false  
- LAST RECORDED → `last_recorded` | HISTORY | OpenAI=false  
- Ambiguous last decision → `last_decision` composite | HISTORY | OpenAI=false  
- CURRENT stance/decision → `none` | `CURRENT_MARKET_READ` | not history  
- Previous setup / what happened → HISTORY | OpenAI=false  
- Time travel at/since clock → HISTORY | OpenAI=false  

---

## Verification

```text
npx tsx scripts/test-history-intent-precedence.ts     → PASS
npx tsx scripts/test-actionable-trade-semantics.ts    → PASS
npx tsx scripts/test-last-decision-semantics.ts       → PASS
npx tsx scripts/test-extension-market-read-last-decision.ts → PASS
npx tsx scripts/test-decision-history-time-travel.ts  → PASS (127)
npx tsc --noEmit -p tsconfig.json                     → PASS
```

---

## Deploy note

Preview redeployed after green:

- **New preview:** https://desk-copilor-ngwl19hx7-adam-b45d.vercel.app  
- Primary `extension/api-config.js` + `options.js` `PREVIEW_BASE` pinned to that host  
- **No production deploy / commit / push**

Reload the Chrome extension (or Options → pin preview) to pick up the new base.

---

## STOP

History intents beat CMR/QG. Trade-today answers from CME-session DecisionEnvelope history. Composite last-decision unchanged.
