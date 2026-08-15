# Karen — Voice Mentor V2

**Date:** 2026-08-14  
**Track:** Spoken mentor routing + hearing (pickup), compared with [karen-voice-assistant-evaluation.md](./karen-voice-assistant-evaluation.md).  
**Code under test:** extension **v1.4.112**, npm package **1.4.84**.  
**Not done:** Live TradingView microphone session. Latency numbers below are configured constants + classifier tests, not a stopwatch on the desk.

NATURAL CONVERSATION V2: spoken English should hit the market brain, not persona filler. Trading execution, chart-draw, and REH dual-side detection were not modified.

---

## Why pickup was hard

Quiet / natural desk speech was treated as silence or clipped:

| Cause | Before (v1.4.106–110) | After (v1.4.112) |
|---|---|---|
| Realtime `server_vad` threshold | **0.34** (still deafer than needed; OpenAI default 0.5) | **0.22** |
| Prefix padding | **300 ms** — first syllable often dropped (“what will you do” → “Calculate…”) | **450 ms** |
| Silence to end utterance | **400 ms** — mid-pause cuts | **500 ms** (still under 900) |
| Fallback Whisper min speech | **240 ms**, 3 frames, noise floor `median × 3.2` | **160 ms**, 2 frames, `median × 2.4` |
| Echo guard after Karen speaks | Fixed **3.2 s** on acks, **4 s** at casual start, **20 s** after a snapshot | Speech-length tail via `echoSuppressTailMs` (**350–1800 ms**). Speak-done still blocks true speaker echo. |

Whisper prompt now includes *what are you seeing / what will you do / what's your call / calculate* so those desk phrases transcribe more stably.

---

## Why “Calculate what you will do” became small talk

That line is a typical STT garble of “what will you do” / “calculate what you’ll do” / “what’s your call”.

1. No trading lexicon (`chart`, `bias`, `mnq`…) → `isNonTradingConversation` → **casual**.
2. Casual local fallback has no food/identity/joke match → **`Ha — say more, I'm listening.`** (`CLARIFY_MORE_REPLY`).
3. On a trading desk that is an identity failure: an ambiguous “what will you do” should be a **grounded current market read**, not social filler.

Mentor classifier now maps those phrases to `CURRENT_MARKET_READ` → desk route **trading** (coaching from frozen intel). Screenshot chart-read stays on explicit *get the read / read the chart*. Bitcoin, pizza, jokes, “huh?” stay `GENERAL_CHAT`.

---

## What changed

- `lib/mentor-intent.ts` + `extension/mentor-intent.js` (valid JS IIFE, in the content-script list).
- VAD constants in `lib/voice-quick-reply.ts`, extension Realtime + fallback Whisper.
- Echo tails in `extension/content.js` (no 20 s deaf window after a snapshot).
- Routing: mentor market turns before casual in `lib/desk-route-intent.ts` and the extension mirror; `isClearlyTrading` includes mentor turns; identity no longer matches “what are you seeing”.
- Spoken cap uses teaching length (NORMAL 3–5 sentences, DEEP 5–8) instead of always two.
- Golden CSV: “what do you see” / “what are you seeing” / “calculate what you will do” → `trading · current_market_read`.

**Version to reload:** Chrome extension **1.4.112** (manifest + `content.js` only; chart-draw / tv-bridge not bumped).

---

## How to verify

1. Reload the unpacked extension; header should read **v1.4.112**.
2. Speak **quietly / naturally** after a short Karen line — pickup should start on the first syllable, not only after a raised voice.
3. Say **“what are you seeing”** → market read (“Right now I’m seeing…”), not “say more”.
4. Say a garbled **“calculate what you will do”** (or “what will you do” / “what’s your call”) → market read / call, **not** “Ha — say more”.
5. “Tell me a joke” / “who are you” still casual. Do not expect every room noise to become a command (threshold 0.22 + min speech 160 ms + echo match on her last words).

---

## Comparison vs V1 eval

| Metric | V1 (eval) | V2 (this pass) |
|---|---|---|
| **INTENT ACCURACY** | Spoken coaching questions often hit persona/casual | Eight mandated phrases + STT garbles classify as mentor market intents (`npm run test:voice-mentor`) |
| **CURRENT-READ ACCURACY** | “What are you seeing?” / “what do you see” screenshot or small talk | `CURRENT_MARKET_READ` → trading coaching; explicit “get the read” still screenshot |
| **FOLLOW-UP CONTEXT** | Bare “why?” often casual | Pending + last-intent follow-up (`why?` after wait → `WAIT_EXPLANATION`) |
| **CHANGE ANALYSIS** | “What changed?” weak | `CHANGE_ANALYSIS` mentor intent |
| **LIQUIDITY EXPLANATION** | EQH “why does that matter” missed | `EQH_EQL_EXPLANATION` (reads `eqhEqlRows`, no new detector) |
| **TEACHING QUALITY** | Voice crushed to 2 sentences / 320 chars | NORMAL 5 sent / 900 chars; DEEP 8 / 1400; FAST_FACT stays short |
| **AVERAGE RESPONSE LATENCY** | VAD silence 400 ms; 20 s echo after snapshot | VAD silence 500 ms; echo tail ≤ 1.8 s. No live-mic timing this session |
| **VOICE QUALITY** | Deaf at 0.34 + clipped prefix + long echo | Easier pickup; still ignores TV hiss / sub-160 ms bursts |
| **REMAINING FAILURES** | — | Live mic not re-measured. Very quiet speech under 0.22 may still miss. Heavy accent STT can still garble past the new phrases. Snapshot ticks (“what’s the market doing”) stay JSON status, not coaching — by design. |

Tests intended: `npm run test:voice-mentor`, `test:voice`, `test:routing`, `test:conversation-routing`, `test:casual-fallback`, `test:conversation-chains`, `test:voice-quality`.
