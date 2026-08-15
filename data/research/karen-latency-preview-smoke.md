# Karen latency + casual pasta preview smoke

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Preview URL:** https://desk-copilor-iheit8p38-adam-b45d.vercel.app  
**Health version:** `1.4.78`  
**Inspect:** https://vercel.com/adam-b45d/desk-copilor/9j45ujH31Hcgz3XHqWyxLnNN8wpv  
**Prior preview (latency-only, pre-pasta):** `https://desk-copilor-lq01vqirt-adam-b45d.vercel.app` — superseded  

**Includes:** market-intel latency P1 (EST memoize, intel cache/dedupe, closed tickstream skip) · joke instant-local · casual pasta P1 (e319560f)

## Extension pin (reload required)

| File | Role |
|------|------|
| `extension/api-config.js` | `PREVIEW_BASE` + `PIN_PREVIEW_API_BASE = true` |
| `extension/options.js` | same `PREVIEW_BASE` (“Use active preview”) |
| `extension/manifest.json` | `1.4.136` (bump for reload / `onInstalled`) |
| `extension/casual-chat.js` | synced from tree — pasta FOOD_WORDS, preference fallthrough, declarative shares |
| `extension/content.js` | synced from tree — `canUseInstantLocal` includes jokes |

**Adam — RELOAD the unpacked extension** (chrome://extensions → Reload). Extension JS changed for pasta + jokes; a soft refresh alone is not enough. Then hard-refresh TradingView / RECONNECT.

No production promote. No commit / push.

## Smoke checklist (after reload)

| # | Utterance | Expect |
|---|-----------|--------|
| 1 | `tell me a joke` | Instant local (no long health/stream wait); never “Not a casual question” |
| 2 | `do you like pasta` | Real preference reply mentioning pasta / like; **not** Ha / failure bubble |
| 3 | `whats the previous day low` / PDL | Level answer; should feel faster than pre-P1 (closed session skips tickstream wait) |
| 4 | `whats the market read` | Spoken WAIT / market path; no QUALITY_GATE 500; warmer repeats benefit from intel cache |
| 5 | `when was your last decision?` | Fast history / last-decision path |
| 6 | `I'm trading on Monday` | Declarative share reply; **never** “Not a casual question” |

## Quick health

```text
npx vercel curl https://desk-copilor-iheit8p38-adam-b45d.vercel.app/api/health --scope adam-b45d
→ {"ok":true,"version":"1.4.78"}
```
