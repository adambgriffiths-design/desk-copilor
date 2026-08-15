# KAREN — GENERAL_CHAT slowness / failure diagnosis

**Date:** 2026-08-15  
**Mode:** INVESTIGATE ONLY — no product fixes, no commit/push/deploy  
**Symptom:** Karen slower; sometimes `"I'm having trouble responding right now — try that again."` on trivial GENERAL_CHAT (`what's the capital of Berlin` ×2; also `tell me a joke`).

---

## Verdict (one line)

**Exact failure point:** `/api/chat/stream` casual path throws **`Not a casual question`** (HTTP 500 JSON) **or** the extension falls back to `CASUAL_LLM_FAILURE_REPLY` after stream/backend failure — **not** market/Redis/trading misroute. Production **1.4.64** still rejects informal **`whats …`** (no apostrophe); workspace tree already classifies those as casual. Local Next was **down** this session; extension prefers localhost and can stick to a dead/hung base.

---

## Exact failure string

| Location | Constant |
|---|---|
| `lib/casual-chat-intent.ts` | `CASUAL_LLM_FAILURE_REPLY` |
| `extension/casual-chat.js` / `extension/content.js` | mirrored same string |

Published when:

1. **API:** `streamCasualChatReply` throws → route outer `catch` → `{"error":"Not a casual question"}` (500), **or** SSE `{type:"error"}`.
2. **Extension:** `replyCasual` after empty/error/failure copy → `localCasualReply()` → for any `isGeneralConversation` / standalone general turn, extension returns **the canned failure line** (no joke canned mirror).

This is **not** `THREAD_CLARIFY_REPLY` (“still on this…”).

---

## Trace (UI → response)

```
UI enqueueUserMessage
  → handleUserMessage
  → classifyMentorIntent / mustUseTradingStream / shouldRouteCasual
  → replyCasual (casualOnly: true)          // trading path NOT taken for these phrases
  → ensureBackend / resolveApiBase          // prefers localhost:3020/3000 then Vercel
  → background desk-copilot-chat-stream
  → POST {base}/api/chat/stream
       repairConversationalStt (workspace route; may be weaker/missing on prod 1.4.64)
       isCasual / tryCasualChatReplyInstant
         → joke: deterministic instant (no OpenAI)
         → capital: instant null → streamCasualChatReply (gpt-4o-mini)
       SSE delta/done  OR  HTTP 500 {"error":"Not a casual question"}
  → extension accept / on error → localCasualReply → CASUAL_LLM_FAILURE_REPLY
```

---

## Checklist answers

| # | Question | Answer |
|---|---|---|
| 1 | Accidental GENERAL_CHAT → trading/market? | **NO** (in-process + prod). Mentor `GENERAL_CHAT`, desk `casual · stream`, `tradingStream=false`, `clearlyTrading=false`. |
| 2 | Unnecessary OpenAI? | Capital: **1 call required** (no deterministic capital table). Joke: **0** on healthy API (instant canned). |
| 3 | Duplicate OpenAI? | Extension retries stream **once** on failure copy/empty (`replyCasual`). Worst case **2** OpenAI attempts after a soft failure — not the primary Berlin 500 path (fails before model). |
| 4 | Timeout/retry loops? | Stream abort **90s** (background + content). Not hit on prod Berlin fail (~150–350ms). Hung localhost can burn toward that timeout then fail. |
| 5 | Redis for GENERAL_CHAT? | **NO**. `hydrateDecisionMemoryFromStore` only on non-casual decision-history queries. |
| 6 | Market data for GENERAL_CHAT? | **NO**. No Yahoo/Tickstream/intel/DecisionEnvelope/quality gate on casual early-return. |
| 7 | Streaming/SSE timeout? | Possible when pointed at hung local; **not** the prod `whats` 500 (fast). |
| 8 | Swallowed exceptions? | Casual stream `catch` posts SSE error; route outer catch returns JSON 500. Extension catch → **publishes failure template as a normal bubble**. |
| 9 | Response parsing failures? | N/A on 500 JSON. On success, `acceptApiCasualReply` can null a bad reply → treated as failure → local fallback. |
| 10 | Recent regression? | **Prod lag:** health `1.4.64` vs workspace `1.4.84` / extension `1.4.131`. Informal `whats` + STT repair fixes exist in working tree / research notes but **are not on prod**. Local `npm run dev` **not listening** this session. |

---

## Timing by stage

### A) In-process (workspace tree, no HTTP) — 2026-08-15

| Phrase | classifyMs | instantMs | Path |
|---|---:|---:|---|
| `what's the capital of Berlin` | ~96 | ~17 | `casual_stream_openai` (instant null) |
| `whats the capital of berlin` | ~8 | ~12 | `casual_stream_openai` |
| `tell me a joke` | ~12 | ~5 | **`casual_instant`** (canned joke) |
| `What is the capital of Germany?` | ~6 | ~3 | `casual_stream_openai` |

Intent / route: **≤ ~100ms**. Instant path for joke: **~16ms total**.

### B) Production `https://desk-copilor.vercel.app` (v1.4.64) — live curl this session

| Probe | Status | ms | Result |
|---|---|---:|---|
| `GET /api/health` | 200 | ~384 | `{"ok":true,"version":"1.4.64"}` |
| `tell me a joke` | 200 SSE | ~138–209 | Instant canned joke, **openai_calls=0** |
| `What is the capital of Germany?` + `casualOnly` | 200 SSE | ~790–1438 | gpt-4o-mini deltas → Berlin |
| `what's the capital of Germany` + `casualOnly` | 200 SSE | ~822 | OK |
| **`whats the capital of Germany`** (+/− casualOnly) | **500** | **~140–230** | **`{"error":"Not a casual question"}`** |
| **`whats the capital of Berlin`** + `casualOnly` | **500** | **~131–344** | **same error** |
| `what's the capital of Berlin` + `casualOnly` | 200 SSE | ~798 | OK (model answers) |
| `What is the capital of Berlin?` + `casualOnly` | 200 SSE | ~872 | OK |

Clean capital LLM wall-clock when accepted: **~0.8–1.4s** (matches prior median ~895ms in `karen-general-question-latency-audit.md`).

### C) Local Next this session

| Check | Result |
|---|---|
| `http://127.0.0.1:3000/api/health` | **DOWN** (connection refused) |
| Listeners 3000/3001/3010/3020 | **none** |

### D) Known-fast comparison (prior profile, clean path)

| Path | Median | Market? |
|---|---:|---|
| GENERAL_KNOWLEDGE casual stream | ~895ms | No |
| Preference instant (`Do you like grass?`) | ~12ms | No |
| CURRENT_MARKET_READ trading | ~22s median (warm HIT ~4s) | Yes |

---

## OpenAI / Redis / market

| Item | Capital (Berlin/Germany) | Joke |
|---|---|---|
| OpenAI called? | **YES** when stream gate accepts (1× `gpt-4o-mini`, max_tokens 160) | **NO** on healthy API |
| OpenAI on prod `whats` fail? | **NO** — throws before `completions.create` | n/a |
| Redis? | **NO** | **NO** |
| Market data / intel / envelope / QG? | **NO** | **NO** |

---

## Exact error / exception

```text
Error: Not a casual question
```

Thrown in `lib/chat-engine.ts` → `streamCasualChatReply` when all of:

- `!isCasualChat(question, …)`
- `!isInCasualThread(messages)`
- `!isGeneralConversation(question)`

Route surfaces as:

```json
{"error":"Not a casual question"}
```

HTTP **500**, Content-Type `application/json` (not SSE). Extension maps that to stream error → `localCasualReply` → canned trouble line.

---

## Why `whats` fails on prod but works in workspace

1. **Prod 1.4.64** still fails informal **`whats the capital of …`** (no apostrophe, often no `?`) at the **stream gate**.
2. **Workspace** `isGeneralConversation` / `isStandaloneGeneralTurn` + `repairConversationalStt` (`whats`→`what's`) make `streamGateOk=true` for the same strings (in-process probe).
3. Extension **always** sends `casualOnly: true` for `replyCasual`, so a false casual gate still enters `streamCasualChatReply` and **throws** instead of falling through gracefully.
4. Voice/STT and some typed inputs commonly emit **`whats`** without apostrophe → high chance of hitting the prod gate bug even when the user *meant* `what's`.

Apostrophe forms (`what's` / `What is …?`) **succeed** on current prod in ~0.8–1.4s — so intermittent “works then fails” can be **phrasing / STT** plus **backend base**, not market load.

---

## Why joke can also show the failure line

On a healthy API, joke is **instant** (~150ms) and never needs OpenAI.

Failure modes that still show the canned line:

1. **Backend offline / hung localhost** → `ensureBackend` false **or** stream errors → `localCasualReply`.
2. Extension `localCasualReply` short-circuits **all** general turns to `CASUAL_LLM_FAILURE_REPLY` **before** any joke canned text (server `casualChatFallback` has the trader-ladder joke; extension mirror does **not**).

So joke failure is **almost certainly connection / stream failure**, not “joke needs the model.”

---

## Shared connection hazard (slowness + false ONLINE)

`extension/api-config.js`:

- Prefers **localhost:3020/3000/…** over Vercel.
- Can return **trusted cached localhost** when health is slow/failed (`degraded: true`) for up to **120s**.
- `ensureBackend` can also proceed on “slow local health” cache.

This session: **no local listener**. A sticky/hung local base makes trivial chat wait like a dead market read, then land on the failure template — **without** entering trading code.

Prior notes: `karen-chart-read-noreply.md`, `karen-general-question-latency-audit.md`, `karen-speed-connection-priority-audit.md`.

---

## Likely cause (ranked)

1. **Primary (Berlin on prod):** Informal **`whats …`** (and similar unrepaired STT) rejected by prod **1.4.64** `streamCasualChatReply` gate → **`Not a casual question`** → extension publishes `CASUAL_LLM_FAILURE_REPLY`. Deploy skew vs fixed workspace.
2. **Primary (slowness / joke + Berlin when “backend looks up”):** Extension stuck on **dead/hung localhost** while prod is fine; 90s stream abort or fast connection error → same canned line. Local Next **down** now.
3. **Amplifier:** Extension `localCasualReply` over-uses failure copy for general turns (incl. joke) instead of server-parity canned replies.
4. **Not causal:** Redis, CME, decision memory, liquidity, quality gate, accidental trading pipeline.

---

## Smallest proposed fix (DO NOT IMPLEMENT)

**Ship one of these (smallest first):**

1. **Deploy** the casual STT/repair + `isGeneralConversation` / stream-gate fixes already in the workspace to production so `whats the capital of …` passes the same gate as `what's` / `What is …?` (close **1.4.64 → current** gap).  
2. **One-line resilience:** In `/api/chat/stream`, if `casualOnly` and `streamCasualChatReply` would throw `Not a casual question`, **repair + re-check** or return a soft SSE/done fallback instead of raw 500 — never leave the extension with only the failure template.  
3. **Extension (tiny):** In `localCasualReply`, mirror the server joke canned reply; **never** treat `CASUAL_LLM_FAILURE_REPLY` as a successful instant answer without a prior real stream attempt; on local health fail, **fall through to Vercel** instead of trusting cached localhost.

Optional verify after fix (manual): prod curl `whats the capital of Berlin` + `casualOnly` → 200 SSE naming Berlin; joke still instant; RECONNECT with local down still answers via Vercel.

---

## Evidence sources

| Source | Role |
|---|---|
| Live prod curl (this session) | Exact 500 + timings |
| `.tmp-general-chat-slowness-probe.ts` | Local route/instant path |
| `.tmp-probe-local-gate.ts` | Workspace streamGateOk |
| `app/api/chat/stream/route.ts`, `lib/chat-engine.ts`, `lib/casual-chat-intent.ts` | Code path |
| `extension/content.js` `replyCasual` / `localCasualReply` | UI failure publication |
| `extension/api-config.js` | Localhost preference / cache |
| `karen-chart-read-noreply.md`, `karen-general-question-latency-audit.md`, `karen-intent-routing.md` | Prior Berlin / informal-whats audits |

---

## STOP

Diagnosis complete. No product code modified. No commit / push / deploy.
