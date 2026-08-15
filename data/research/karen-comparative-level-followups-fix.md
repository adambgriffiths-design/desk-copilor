# KAREN — Comparative Level Follow-ups Fix

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Scope:** Anaphoric comparative questions after Karen names two (or more) levels  
**Coordinate:** Did not redesign actionable-trade / plain-english / anti-hallucination paths

---

## Exact report fields

```text
ROOT CAUSE: PASS (identified + fixed)
ANAPHORA → PRIOR LEVELS: PASS
NOT GENERAL_CHAT / NOT CASUAL: PASS
ABSOLUTE DISTANCE PLAIN ENGLISH: PASS
NO FULL CHART READ: PASS
OPEN LIVE PRICE: PASS
CLOSED / WEEKEND LAST-CLOSE (not LIVE): PASS
OPEN + NO TRUSTWORTHY PRICE → HONEST UNAVAILABLE: PASS
SLOT FOLLOW-UPS (low/high): PASS
COLOUR "which one" STILL CASUAL: PASS
TYPECHECK: PASS
FOCUSED REGRESSION: PASS
SIBLING REGRESSIONS (actionable / plain-english / anti-hallucination): PASS
```

---

## ROOT CAUSE

Three stacked failures — not a single hop:

1. **Anaphora / routing:** Phrases like `which is closer?`, `which one is nearest?`, `how far away are they?`, `what about the low?` lack trading keywords. `looksCasualPhrase` / `isCasualFollowUp` treated `which one` / `what about` as casual. Mentor fell through to **GENERAL_CHAT**. Desk route → `casual/stream`.

2. **Lost level context:** `extractConversationContext` only recovered MSS/NWOG/NDOG/FVG topics — **not** PDH/PDL prices from the prior assistant turn — so nothing could resolve “which one / they / the low”.

3. **No comparative arithmetic path:** Even when `which one is closer to current price?` hit snapshot/`price` intent, `needsWebSearch` matched `current`+`price` **before** the trading gate → `isCasualChat` true → `trySnapshotChatReply` returned null. There was **no** absolute-distance formatter.

Weekend note: closed market was conflated with “no data” on casual fallthrough; once comparative owns the turn, last/close is used and labeled (never LIVE).

---

## Exact before / after

**Seed (prior assistant):**  
`Previous day high is 24865.00. Previous day low is 24800.00.`  
**Price:** `24818` (18 pts from PDL, 47 from PDH)

| User follow-up | Before | After |
|----------------|--------|-------|
| `which one is closer to current price?` | Casual / web-ish / GENERAL_CHAT (or no distance answer) | `PDL is closer — 18 pts vs 47 to PDH.` |
| `which is closer?` | Casual / GENERAL_CHAT | same closer reply |
| `which one is nearest?` | Casual / GENERAL_CHAT | same closer reply |
| `how far away are they?` | Casual / GENERAL_CHAT | `PDH is 47 pts away; PDL is 18 pts away.` |
| `how many points?` | Casual / GENERAL_CHAT | distances reply |
| `what about the low?` | Casual / GENERAL_CHAT | `Previous day low is 24800.00.` |
| `and the high?` | Casual / GENERAL_CHAT | `Previous day high is 24865.00.` |
| Weekend + Friday print | Often “unavailable” / casual | `Using Friday's close, PDL is the nearer level — 18 pts vs 47 to PDH.` |
| Open + no live tick | Invent / casual | `I don't have a trustworthy current price…` |
| `which one` after favourite colour | Navy (casual) | Navy (unchanged) |

---

## Smallest fix

New pure module + thin routing wires (no freshness threshold loosening; Yahoo/old never labeled LIVE):

1. **`lib/level-comparative-followup.ts`** — extract prior levels; detect closer/distance/slot follow-ups; absolute pt distances; OPEN live vs CLOSED last/close preface.
2. **Gates** — `isCasualChat` / `wouldRouteCasual` / `classifyMentorIntent` / `needsWebSearch` refuse casual/GENERAL_CHAT/web when prior named levels + comparative anaphora.
3. **Stream + snapshot** — early `responseSource: "level_compare"` short-circuit (works even with `casualOnly`); `trySnapshotChatReply` answers before casual null-out.
4. **Extension mirror** — `casual-chat.js` + `desk-route-intent.js` route to `snapshot/level_compare`.

---

## Files changed

| File | Change |
|------|--------|
| `lib/level-comparative-followup.ts` | **New** — extract / detect / price basis / answer |
| `lib/casual-chat-intent.ts` | Comparative + prior levels ≠ casual; `isClearlyTrading` optional recent |
| `lib/web-search-intent.ts` | `current`+`price` with closer/trading ≠ web search |
| `lib/desk-route-intent.ts` | `snapshot/level_compare`; wouldRouteCasual respects follow-up |
| `lib/mentor-intent.ts` | Prior levels + comparative → `CURRENT_MARKET_READ` |
| `lib/chart-question-intent.ts` | Explicit closer-to-price → `level` (anaphora stays context-gated) |
| `lib/conversational-query.ts` | `lastLevels` on conversation context |
| `lib/chat-engine.ts` | Comparative answer inside `trySnapshotChatReply` |
| `app/api/chat/stream/route.ts` | Early level_compare short-circuit |
| `extension/casual-chat.js` | Mirror detect + exports |
| `extension/desk-route-intent.js` | Mirror route gate |
| `scripts/test-karen-comparative-level-followups.ts` | **New** extension-shaped OPEN/CLOSED matrix |

**Not touched (coordinate):** decision-history / actionable-trade formatters, plain-english presentation layer, anti-hallucination red-team fixtures, freshness thresholds in `chart-live-price` / `data-quality-check`.

---

## Verification

```text
npx tsx scripts/test-karen-comparative-level-followups.ts  → PASS
npx tsc --noEmit -p tsconfig.json                          → PASS
npx tsx scripts/test-actionable-trade-semantics.ts         → PASS
npx tsx scripts/test-karen-plain-english-market-replies.ts → PASS
npx tsx scripts/test-karen-anti-hallucination-red-team.ts  → PASS
```

`test-scoped-chart-qa.ts` still fails on pre-existing `buildDrawingLevels emits REH line` (unrelated to this fix).

---

## Preview

- Integration `package.json` version: **1.4.76**
- Prior noted preview `https://desk-copilor-hfdksc1vi-adam-b45d.vercel.app` was **1.4.75** (older).
- Redeployed preview (this fix): **https://desk-copilor-ag0d6shv6-adam-b45d.vercel.app** (1.4.76)
- Inspect: https://vercel.com/adam-b45d/desk-copilor/5ACGoHSsXsJdHqFZ7YayAEcdKGkn
- **No production promotion.**

---

## STOP

No commit/push. Comparative level follow-up gate is green in the integration tree.
