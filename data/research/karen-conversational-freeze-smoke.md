# KAREN — Final Conversational Freeze Preview Smoke

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Preview:** https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app  
**Package version:** `1.4.79`  
**Extension manifest:** `1.4.137`  
**Inspect:** https://vercel.com/adam-b45d/desk-copilor/sxm3h1vbwUuYJDM51ZkUaLaLqbjP  

**Status:** `CONVERSATIONAL_FREEZE_BUGFIX_ONLY` *(pending your short Chrome smoke below)*

Includes shipset: market aliases · challenge/skepticism · one-word composer · weather · contextual why · API base pin · latency P1 · **structural proximity-intent family** · harness.

## Reload

1. chrome://extensions → **Reload** unpacked (manifest 1.4.137)  
2. Options → **Use active preview** (or confirm BASE = `https://desk-copilor-kgv2ibmdp-adam-b45d.vercel.app`)  
3. Confirm Connected → that host (not localhost)  
4. Hard-refresh TradingView / RECONNECT  

## Short smoke (showstoppers only)

| # | Test | Expect |
|---|------|--------|
| 1 | `what is the previous daily high` | PDH value or honest unavailable — **not** “I'm game…” |
| 2 | `yesterday's high` | Same PDH domain |
| 3 | After PDL stated: `what is current price closer to` / `what level are we nearest to` | Friday’s close comparative — **not** “Live market data is unavailable” |
| 4 | Market read → `why?` → `really?` / `are you sure?` | Locked evidence; **not** “Same energy.” |
| 5 | One-word: `why` / `really` / `yes` | Types + sends |
| 6 | Joke / pasta then back to `what's PDL?` | Topic switch OK |
| 7 | Casual → market | No domain escape |

If no showstoppers → freeze holds. No new conversational features.

## After freeze

Primary work: **Trading Logic Correctness** → Decision Validation v0 (already scaffolded: `npm run test:karen-decision-validation:v0`).

No production promote / commit / push from this note.
