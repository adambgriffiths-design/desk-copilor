# KAREN — Real-Extension Joke Latency

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/` (+ extension)  
**Mode:** INVESTIGATE → SURGICAL FIX → VERIFY  
**Scope:** Joke path only — **not** market-intelligence P1 / MarketState / Redis / OpenAI

---

## Exact report fields

```text
FIRST_BROKEN_HOP: canUseInstantLocal returned false for jokes → force ensureBackend/health + /api/chat/stream
NETWORK_NECESSARY: NO (server already canned via tryCasualChatReplyInstant; extension now answers locally)
BEFORE_TOTAL_MS: ~512–1807 (health 309–1406 + stream RTT 202–401)
AFTER_TOTAL_MS: ~0–10 in-extension (0 network hops)
DIVERSITY: PASS (10/10 unique; another ≠ prior; no scarecrow lock)
TYPECHECK: PASS (tsc --noEmit)
FOCUSED_TEST: PASS (scripts/test-extension-joke-instant.mjs)
NO_PROD_DEPLOY / NO_COMMIT / NO_PUSH
NO_MARKETSTATE / NO_REDIS / NO_OPENAI_FOR_JOKES
```

---

## Wall-clock hop trace (BEFORE — network path)

Preview base: `https://desk-copilor-8uxfmve9v-adam-b45d.vercel.app` · health `1.4.76`  
Simulates extension path when `canUseInstantLocal` fails: health probe then casual stream.

| hop | run1 ms | run2 ms | notes |
|-----|--------:|--------:|-------|
| click/send → handler | ~0 | ~0 | local |
| API-base / health probe | **1406** | **309** | `ensureBackend` → `/api/health` |
| fetch start → headers | 400 | 202 | POST `/api/chat/stream` |
| first SSE / done | 401 | 202 | single `done` with canned joke (server instant) |
| bubble render | ≈ done | ≈ done | no stream deltas |
| **click → bubble** | **1807** | **512** | |

Server reply sample (no OpenAI):  
`Why did the trader bring a ladder to the desk? The market kept hitting new highs.`

### Exact FIRST broken/slow hop

**`canUseInstantLocal("tell me a joke")` returned `false`.**

Jokes were **not** in the instant-local allowlist (only farewell / greeting / initiation / persona / resolvable anaphora). That forced:

1. `ensureBackend()` → health probe (often the largest single cost when cache cold)  
2. `runStreamingChat` → Vercel RTT even though the API path is already instant-canned

Network was **not** required for correctness — only forced by the gate. Not MarketState, not Redis, not OpenAI, not `forceMarket`.

Secondary issue: extension `localCasualReply` only had **two hardcoded jokes** (ladder + scarecrow on “another”), so even offline fallback lacked diversity / repetition memory parity with `lib/casual-diversity.ts`.

---

## Key question answer

| Question | Answer |
|----------|--------|
| Can jokes be answered immediately in-extension while preserving repetition memory? | **Yes.** Port JOKE_POOL + history/session selection into `extension/casual-chat.js`; gate jokes (+ “another” after joke) in `canUseInstantLocal`. |
| Was something forcing network? | **Yes — failed instant-local gate**, then health probe + stream RTT. Server joke path already avoided OpenAI/MarketState. |

---

## AFTER (in-extension — surgical fix)

| hop | ms | notes |
|-----|---:|-------|
| click/send → handler | ~0 | |
| API-base / health probe | **0** | skipped |
| fetch / SSE | **0** | skipped |
| local pool pick → bubble | **0–10** | measured 10ms first joke; 0ms “another” |

Focused verify:

```text
ok: first joke 10ms
ok: diversity unique 10/10
ok: another 0ms — different from prior
AFTER_HOPS {"healthProbeMs":0,"fetchStartMs":0,"firstSseMs":0,"bubbleRenderMs":10,"networkNecessary":false}
```

---

## Files changed

| file | change |
|------|--------|
| `.tmp/karen-final-integration/extension/casual-chat.js` | JOKE_POOL + `pickJokeReply` (history + session ring); `isJokeRequest` / `isJokeFollowUp`; `localCasualReply` uses pool (removed ladder/scarecrow hardcodes) |
| `.tmp/karen-final-integration/extension/content.js` | `canUseInstantLocal` allows joke + joke follow-up **before** network |
| `.tmp/karen-final-integration/scripts/test-extension-joke-instant.mjs` | focused gate + diversity + timing |
| `.tmp/karen-final-integration/scripts/_measure-joke-hops.mjs` | BEFORE network hop tracer (measurement only) |

**Not touched:** MarketState, market intelligence, Redis, OpenAI joke path, `buildDeskMarketIntelligence`, agent 5aa94967 scope.

---

## Verification

| Check | Result |
|-------|--------|
| `node scripts/test-extension-joke-instant.mjs` | PASS |
| `npx tsc --noEmit` | PASS |
| No OpenAI for jokes | PASS (local pool only) |
| No MarketState | PASS |
| Diversity / no immediate scarecrow repeat | PASS |

---

## Bottom line

The slow hop was **not** joke generation — it was the **instant-local gate miss** that forced a **health probe + Vercel RTT** (~0.5–1.8s). Jokes are now answered **in-extension** from the diversity pool with history/session avoidance, with **0 network hops**.
