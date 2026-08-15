# Extension market-read + last-decision fixes (karen-final-integration)

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Production promote:** NO

## FAIL 1 — `whats the market read` → CHART_READ_REQUEST_ROUTING

### Root cause
1. Server `isChartReadCommand` substring-matched `market read`, so `needsFullChartRead` was true.
2. Stream returned JSON `{ needsChartRead: true }` with **no reply**.
3. Real Chrome extension (primary) treats trading conversational reads as `conversationalBounce` → `Desk returned no reply (CHART_READ_REQUEST_ROUTING)`.
4. Mentor did **not** classify the phrase as `CURRENT_MARKET_READ` (only exact `market read` / `what's the read`).
5. After routing fix, weekend/missing OHLC still HTTP **500** `QUALITY_GATE:…` until chat-engine returned spoken WAIT as `instantReply`.

### Fix
- Expand `isCurrentMarketRead` for `whats/what's the market read`.
- Align `isChartReadCommand` with extension: **no** bare `market read` substring (exact `market read` / `get the read` still screenshot commands).
- Skip `needsChartRead` bounce when mentor intent is `CURRENT_MARKET_READ`.
- `streamChatReply` + stream route catch: QUALITY_GATE → spoken SSE `done` (not HTTP 500).
- Primary extension: conversational market-read skip ROUTING bounce; strip `QUALITY_GATE:` on stream errors.

## FAIL 2 — `when was your last decision?` → casual GENERAL_CHAT

### Root cause
Parser already returned `last_recorded`, but stream only ran history when `!isCasual`. Extension sends these as casual → casual LLM (“I don't make decisions…”).

### Fix
- Always run LIVE decision-history lookup when `isDecisionHistoryTimeQuery` (even with `casualOnly`).
- Expand parser for `what did you decide last?` / `when did you last decide`.

## Files changed
- `lib/mentor-intent.ts`
- `lib/chart-read-intent.ts`
- `extension/chart-intent.js`
- `app/api/chat/stream/route.ts`
- `lib/chat-engine.ts`
- `lib/decision-history-query.ts`
- `scripts/test-extension-market-read-last-decision.ts` (new)
- Primary `extension/{api-config,options,content,manifest}.js` — preview pin + QUALITY_GATE spoken path

## Verification
| Gate | Result |
|------|--------|
| New extension-shape test | PASS |
| Adapter / red-team / F2–F6 / time-travel | PASS (prior matrix) |
| tsc | PASS |
| Preview `whats the market read` | **200** SSE spoken WAIT (no `needsChartRead`, no `QUALITY_GATE` 500) |
| Preview `when was your last decision?` + casualOnly | **200** SSE `live_decision_last_recorded` |

## Confidence
**FAIL 1:** HIGH  
**FAIL 2:** HIGH  

## New Preview (not production)

| Field | Value |
|-------|--------|
| PREVIEW URL | `https://desk-copilor-connpuliu-adam-b45d.vercel.app` |
| DEPLOYMENT ID | `dpl_D5ERNHK6kAJTnAEphd1tKVeh11CK` |
| HEALTH | `{"ok":true,"version":"1.4.74"}` |
| Prior preview (stale QUALITY_GATE 500) | `…qbbq0ru6q…` / `1.4.73` |

**Extension:** `PIN_PREVIEW_API_BASE=true` + `PREVIEW_BASE` updated to the new URL; manifest `1.4.133`. Reload unpacked extension → hard-refresh TradingView → RECONNECT. Production alias unchanged.
