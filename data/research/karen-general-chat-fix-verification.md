# KAREN — GENERAL_CHAT slowness / localhost fallback — FIX VERIFICATION

**Date:** 2026-08-15  
**Mode:** FIX in isolated worktree only — **primary product tree NOT applied**  
**Worktree:** `.tmp/karen-general-chat-fix/` (detached `74183b2` + surgical patches)  
**Source diagnosis:** `data/research/karen-general-chat-slowness-diagnosis.md`  
**STOP:** Report complete. Apply to primary left for Adam. No commit / push / deploy.

---

## Verdict

**Fixed in isolated worktree.** Informal `whats …` now passes the casual stream gate; jokes stay deterministic; dead/hung localhost falls through to Vercel in **≪ 90s** (measured **~0.4–1.0s**); `casualOnly` no longer hard-500s on `Not a casual question` when a soft path exists. GENERAL_CHAT remains off trading / Redis / market.

---

## Exact files changed (worktree only)

| File | Change |
|---|---|
| `extension/api-config.js` | Brought localhost-preferring resolver (matches live extension / diagnosis); **removed degraded cached-localhost returns**; **800ms live confirm** before trusting cached local; on local fail/timeout clear trust and **fall through to Vercel** |
| `extension/casual-chat.js` | Informal `what(?:'?s)?` / `who(?:'?s)?` / … gate; **joke canned reply before** `CASUAL_LLM_FAILURE_REPLY` in `localCasualReply` |
| `lib/casual-chat-intent.ts` | Same informal STT gate in `isGeneralConversation` |
| `app/api/chat/stream/route.ts` | `casualOnly` soft fallback: canned `casualChatFallback` **or** `streamCasualChatReply(..., { force: true })` instead of raw 500 `Not a casual question` |
| `lib/chat-engine.ts` | Optional `{ force?: boolean }` on `streamCasualChatReply` for soft fallback only |

**Not touched:** continuous recorder, `verdict-engine.ts`, six-feature clean patch, interp-decision tree, Redis/CME/market/decision memory / QG / trading paths.

**Primary worktree product files:** not written by this task (hashes differ; apply deferred).

---

## Reproduce (before) — this session

| Probe | Result | ms |
|---|---|---:|
| `127.0.0.1:3000/3020` health | DOWN | ~2s |
| Vercel `/api/health` | 200 `1.4.64` | ~376 |
| Prod `whats the capital of Berlin` + `casualOnly` | **500** `{"error":"Not a casual question"}` | ~559 |
| Prod `what's the capital of Berlin` + `casualOnly` | 200 SSE (Berlin/Germany) | ~1036 |
| Prod `tell me a joke` + `casualOnly` | 200 SSE canned joke, instant | ~240 |

Root causes matched diagnosis: (1) informal `whats` fails `^(what)\b` gate on prod/HEAD; (2) extension can stick to dead/hung localhost then burn toward 90s stream abort → failure template.

Gate microbench (regex only):

| Phrase | beforeGate | afterGate |
|---|---|---|
| `whats the capital of Berlin` | **false** | **true** |
| `what's the capital of Berlin` | true | true |
| `What is the capital of Germany?` | true | true |
| `tell me a joke` | true | true |

---

## Tests run (worktree)

### 1) In-process gate + instant — `npx tsx .tmp-verify-general-chat-fix.ts`

| Phrase | classifyMs | streamGateOk | tradingStream | clearlyTrading |
|---|---:|---|---|---|
| `whats the capital of Berlin` | 7 | **true** | false | false |
| `what's the capital of Berlin` | 2 | true | false | false |
| `What is the capital of Berlin?` | 0 | true | false | false |
| `whats the capital of Germany` | 0 | true | false | false |
| `tell me a joke` | 1 | true | false | false |

| Phrase | instantMs | Path | OpenAI |
|---|---:|---|---|
| `tell me a joke` | **5** | `casual_instant` canned ladder joke | **0** |
| `whats the capital of Berlin` | 1 | instant null → would `casual_stream` (≤1 LLM) | n/a (no key in shell) |

### 2) Extension localCasualReply + localhost→Vercel — `node .tmp-verify-ext-api-config.mjs`

| Case | Result |
|---|---|
| `tell me a joke` local fallback | **canned joke** (not failure template) |
| capital phrases local fallback | failure template only if stream never attempted (unchanged; server/LLM owns capital) |
| Local `3020` DOWN → Vercel health | **fellThrough=true**, **totalMs=367**, under 15s / 90s |
| Hung TCP (no HTTP response) 800ms confirm → Vercel | **fellThrough=true**, **totalMs=944** (vs prior risk of ~90s stream abort) |
| api-config guards | live confirm `probeBase(..., 800)`; no `health probe failed — using cached localhost`; clears local on fail |

### 3) Soft fallback + trading isolation — `npx tsx .tmp-verify-soft-fallback.ts`

| Check | Result |
|---|---|
| Soft canned joke | true (ladder joke) |
| GENERAL_CHAT phrases → `tradingStream` / `clearlyTrading` | **false / false** |
| Stream route Redis/market/QG refs | **none** in casual path |
| Live OpenAI force/normal stream | **SKIPPED** (no `OPENAI_API_KEY` in verification shell) — gate + force API present; capital live LLM left for apply-time smoke |

---

## Before / after timings (summary)

| Scenario | Before | After (worktree verified) |
|---|---|---|
| Informal `whats the capital of Berlin` gate | reject → 500 ~150–560ms (prod) | **accept** classify ≤7ms; streamGateOk |
| Joke healthy path | ~150–240ms, 0 OpenAI (prod OK); failure template if local dead | **instant ~5ms**, 0 OpenAI; local fallback also joke |
| Localhost unavailable | sticky cached local → stream hang toward **90s** then failure template | probe fail **~13ms** + Vercel **~354ms** ≈ **367ms** |
| Localhost hung | same 90s risk | **800ms** confirm timeout + Vercel **~137ms** ≈ **944ms** |
| `casualOnly` + gate miss | HTTP 500 JSON `Not a casual question` | canned SSE soft fallback **or** forced casual LLM (no raw 500 for that case) |

---

## Goals checklist

| Goal | Status |
|---|---|
| Trivial GENERAL_CHAT must not wait on dead/hung localhost | **PASS** (≤1s fallthrough measured) |
| Localhost unavailable/unhealthy → Vercel | **PASS** |
| Informal STT `whats the capital of Berlin` ≠ `Not a casual question` | **PASS** (gate + soft fallback) |
| Jokes deterministic/instant when possible | **PASS** (0 OpenAI instant; extension mirror) |
| No trading/Redis/market for GENERAL_CHAT | **PASS** |
| Capital ≤1 LLM | **PASS by path** (instant null → single stream); live OpenAI call not run in this shell |
| No failure-template when Vercel healthy | **PASS for joke + gate**; capital uses LLM/stream when base resolves to Vercel |
| Joke 0 OpenAI when deterministic | **PASS** |

---

## Remaining risk

1. **Apply not done** — primary / production still on old gate (`whats` → 500 on prod `1.4.64`) until Adam merges worktree patches + deploys.
2. **Live capital LLM** not exercised here (no API key in verification env). Smoke after apply: `whats` / `what's` / `What is` capital → Berlin, ≤1 `gpt-4o-mini`.
3. **Local-only custom base** still fails closed (by design) — does not silently use Vercel if user forced localhost-only.
4. **800ms local confirm** adds a small tax when cached local is stale/dead before Vercel; far cheaper than 90s stream timeout.
5. **`force: true` soft path** only when extension already sent `casualOnly` — do not widen to non-casualOnly without review.
6. Worktree `api-config.js` is the localhost-preferring lineage (primary dirty tree), not HEAD’s Vercel-only file — apply must use this file, not revert to Vercel-only HEAD.

---

## How to apply (Adam — out of scope here)

Copy/merge these five files from `.tmp/karen-general-chat-fix/` into primary, reload extension, smoke the four scenarios above. Do **not** pull six-feature / interp-decision / recorder / verdict-engine.

---

## STOP

Verification complete. Isolated worktree holds the fix. Primary product code not applied. No commit / push / deploy.
