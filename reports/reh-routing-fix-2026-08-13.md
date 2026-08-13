# REH conversational routing fix — 2026-08-13

## Diagnosis
REH / relative equal high queries were swallowed by the casual gate because `classifyFactTopic` and `TRADING_WORDS` did not recognize REH terminology.

## Before / after routing (4 test phrases)

| Phrase | BEFORE | AFTER |
|--------|--------|-------|
| Where is the nearest REH? | casual · stream → GPT | snapshot · general → fact_lookup → market intelligence → `liquidity.reh` |
| Where is the nearest relative equal high? | casual · stream → GPT | snapshot · general → fact_lookup → market intelligence → `liquidity.reh` |
| Where is the last EQH? | casual · stream → GPT | snapshot · general → fact_lookup → market intelligence → `liquidity.reh` |
| Is there a relative equal high near current price? | snapshot · price (price topic won) | snapshot · price → fact_lookup → market intelligence → `liquidity.reh` |

### Signal flags

| Phrase | BEFORE: marketIntel | AFTER: marketIntel | BEFORE: scoped | AFTER: scoped | BEFORE: clearlyTrading | AFTER: clearlyTrading |
|--------|---------------------|--------------------|----------------|----------------|------------------------|----------------------|
| nearest REH | false | true | false | true | false | true |
| nearest relative equal high | false | true | false | true | false | true |
| last EQH | false | true | false | true | false | true |
| REH near current price | true | true | true | true | true | true |

## Changes
- `lib/conversational-query.ts` — REH/REL/EQH/EQL terms in `classifyFactTopic` and `resolveFollowUpTarget` → `liquidity.reh` / `liquidity.rel`
- `lib/casual-chat-intent.ts` — REH terms in `TRADING_WORDS`
- `extension/casual-chat.js` — mirrored `TRADING_WORDS`
- `data/routing-golden.csv` — 4 golden cases (expected route: snapshot, not casual)
- `scripts/test-conversation-routing.ts` — REH regression cases + casual-stream guard
- `scripts/test-market-intelligence.ts` — REH fact routing assertions

## Verification
- `npx tsx scripts/test-conversation-routing.ts` — PASS (11/11)
- `npx tsx scripts/test-routing-golden.ts` — PASS (69/69)
- `npx tsx scripts/test-market-intelligence.ts` — PASS (26/26)
- `npm run test:system` — PASS (100/100)
