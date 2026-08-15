# Karen conversation / voice red team

**Date:** 2026-08-14  
**Scope:** Conversation state, Turn 2 silent fail, follow-up intent, voice **routing** (not live mic). No production trading / PDH / Aug 12 liquidity edits.

**Run:** `npm run test:karen-redteam-conversation` → **98 passed, 0 failed**.

## Turn 1 vs Turn 2

Turn 1 `"Give me a read on the chart."` streamed. Turn 2 `"why are you leaning that way"` showed the user bubble and nothing else.

**First differing stage: STREAM END**, not INTENT. Intent already matched `EXPLAIN_PREVIOUS_MARKET_READ`.

SSE `done` rendered the reply; `streamChatFromPort` only `finish()`ed on a later port `done`. If the HTTP body stayed open, Turn 1’s Promise hung, the queue stayed busy, Turn 2 never dispatched.

**Fix:** finish the client stream on SSE `done`. Cancelled turns must not `settleIdle()` unless they still own `requestId`.

## State machine

`IDLE → REQUESTING → STREAMING → COMPLETE → IDLE` or `ERROR → IDLE`. 20 consecutive simulated text turns, 0 silent voids.

## Mentor vs WAIT (routing only)

Follow-up is not a fresh `CURRENT_MARKET_READ`. Invalidation / change / liquidity keep their intents. Coaching wording vs always-WAIT is market-state (other agent).

Bare `Why?` after a wait-worded read classifies `WAIT_EXPLANATION` (correct). After a non-wait read it is `EXPLAIN_PREVIOUS_MARKET_READ`.

## Voice

Same dispatch as TEXT. Stream fail → visible ERROR → IDLE → user can ask again. Mic not required for this file.

## Safety / assistant

Deploy, push, git commit, and order-placement patterns are blocked at supervisor dispatch. `"place a buy order…"` is PARTIAL (unsupported for execution), not a silent market void.

## Related

Voice latency ranking and scorecard: `data/research/karen-voice-bottleneck-audit.md`.
