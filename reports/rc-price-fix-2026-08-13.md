# RC-PRICE fix — 2026-08-13

## Problem (diagnosis 4a190a28)

Karen quoted **29,784.50** from stale Yahoo MNQ=F 1m close (~2 hrs old) while TradingView live last was available. Extension had 6+ price sources with no TTL on `priceHint.last`, and `formatLocalPriceAnswer` bypassed the backend when any `ChartPrice.read()` succeeded (including bar close / legend / bridge).

## Fix summary

- Single resolver: `resolveAuthoritativePrice()` in `lib/chart-live-price.ts`
- TradingView `[data-field="last"]` authoritative when fresh (≤60s)
- Every live quote carries `{ value, source, timestamp, ageMs }`
- Stale `priceHint.last` rejected; bar close / bridge / legend never used as live tick
- Extension sends `chartSnapshot` + `chartLastPrice` (+ source/ts) together to snapshot routes
- REH/REL filtering reads `state.lastPrice` built from the same authoritative quote
- Price questions no longer bypass backend with local-only answer

## Before / after trace

| Layer | Before (stale) | After (fix) |
|-------|----------------|-------------|
| **Karen quoted price** | 29,784.50 (Yahoo 1m close, ~2h old via local bypass or silent fallback) | 29,912.25 (`tradingview_live`, fresh) or **WAIT — live data unavailable** |
| **Intelligence layer price** | 29,784.50 (`yahoo` / `state.lastPrice` from snap/Yahoo) | 29,912.25 (`state.lastPrice` from `resolveAuthoritativePrice`) |
| **REH/REL filter price** | 29,784.50 (`state.lastPrice` diverged from TV) | 29,912.25 (same `state.lastPrice` as intelligence) |

All three layers now share **identical value + source** when TV live is available; when not, all return unavailable (no silent Yahoo fallback on extension-attached paths).

## Files changed

- `lib/chart-live-price.ts` — `AuthoritativePrice`, `resolveAuthoritativePrice`, TTL constants
- `lib/market-state-build.ts` — authoritative `lastPrice` selection
- `lib/market-intelligence.ts` — pass price meta + snapshot through build
- `lib/api-data-quality.ts` — reject stale/non-TV when extension price attached
- `lib/levels.ts` — price meta on `buildMarketContext`
- `lib/observation-engine.ts` — REH/REL uses authoritative `state.lastPrice`
- `app/api/market-snapshot/route.ts` — chartSnapshot + price meta
- `app/api/market-intelligence/route.ts` — chartSnapshot + price meta
- `extension/chart-price.js` — TV header/quote only; quote object with provenance
- `extension/chart-draw.js` — TTL on priceHint; no anchor from stale hint
- `extension/chart-snapshot.js` — price source/ts in payload
- `extension/content.js` — snapshot+price API payload; remove local price bypass
- `extension/background.js` — forward chartSnapshot + price meta
- `scripts/test-rc-price.ts` — regression tests
- `package.json` — `test:rc-price` script

## Not changed (per spec)

- MSS detection (`lib/structure.ts`)
- REH detection math (`lib/reh-rel.ts` algorithms)
- Voice latency, UI layout, casual fallback, GPT prompts
