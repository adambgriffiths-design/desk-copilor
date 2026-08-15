# KAREN — Duplicate / stale request audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes  
**Method:** Code trace of extension queue + background AbortController + `/api/chat/stream` + Yahoo coalesce. One controlled logical sequence (R1 then R2), not a live marathon.

---

## Controlled sequence (logical)

| Step | Actor | Action |
|------|--------|--------|
| R1 | User | Trading ask: `Give me the read` (TEXT stream / forceMarket) |
| — | System | `enqueue` → `drainQueue` → `handleUserMessage` → `runStreamingChat` → background `fetch(/api/chat/stream)` → Yahoo/context/envelope/LLM |
| R2 | User | Follow-up while R1 still running, e.g. `Why?` **or** barge-in / new voice turn |

Two UI paths matter:

1. **Typed text queue** (`enqueueUserMessage` / `drainQueue`)  
2. **Voice barge-in / new voice turn** (`cancelActiveChatStream`)

---

## REQUEST 1 lifecycle

1. `conversation.beginTurn` + unique `requestId`  
2. `armChatUiLoading` → `chatBusy = true`  
3. `streamChatFromPort` opens `desk-copilot-chat-stream` port; sets `activeChatStreamPort`  
4. Background: `AbortController` + **90s** timeout; `fetch(..., signal: ac.signal)` to `/api/chat/stream`  
5. Server: `buildDeskMarketIntelligence` inside `runWithMarketDataRequestScope` → Yahoo (`fetchAllTimeframesCached`, may set `marketFetchInFlight`) → engine/context → quality gate / envelope → OpenAI stream  
6. SSE deltas → UI bubble; `done` → finish; `chatBusy` cleared  

**Abort wiring on R1:** None until client disconnects port or 90s timeout.  
**`/api/chat/stream`:** Does **not** read `request.signal` / pass abort into Yahoo or OpenAI (`chat-engine` has no AbortSignal on completions).

---

## REQUEST 2 lifecycle

### A) Typed follow-up while R1 in flight

- Message is **queued** (`msgQueue`); UI shows `Queued (N)…`  
- `drainQueue` is **serial**: `await handleUserMessage(item)` before next  
- R2 **does not start** until R1’s `handleUserMessage` returns  
- **Does not** call `cancelActiveChatStream` for a normal text follow-up  

→ R2 waits behind R1 (follow-up latency includes leftover R1 work). No parallel UI streams for two text turns.

### B) Voice barge-in / new voice turn

- `cancelActiveChatStream` → `activeChatStreamPort.disconnect()`  
- Background `port.onDisconnect` → `ac.abort()` → **client fetch aborted**  
- UI stops consuming SSE; `turnGen` guards ignore stale deltas  

→ UI is superseded. **Server may still finish** Yahoo/context/LLM (see below).

### C) Chart read vs chat

- Queue waits on `verdictBusy` only if the **peeked** message needs a chart read  
- A non-chart follow-up can run while a chart read is busy → **possible parallel** chart + chat paths

---

## OVERLAP

| Scenario | UI overlap? | Backend overlap? |
|----------|-------------|------------------|
| Text R2 while text R1 running | **No** (queued) | **No** for second chat stream (serial) |
| Voice barge-in during R1 | UI cancelled | **Yes risk** — R1 work may continue after fetch abort |
| Second chat stream without cancel (bug path) | `activeChatStreamPort` **overwritten** without disconnecting prior | **Yes** if two ports opened |
| Two servers / two tabs | Independent | Independent Yahoo coalesce per process |
| R1 Yahoo in flight + R2 (after barge-in) | New UI request | May **coalesce** on same `marketFetchInFlight` or start new after clear |

---

## DUPLICATE WORK

| Concern | Finding |
|---------|---------|
| Duplicate market-context builds | **Serial text:** one build per turn. **Barge-in + new read:** second build can start while first may still run on server → **duplicate context** possible |
| Duplicate Yahoo/Tickstream | Cross-request **45s cache** + **`marketFetchInFlight` coalesce** reduce duplicates; barge-in orphan + new forceFresh can still refetch. Pin ALS is **per request scope**, not cross-request cancel |
| Multiple LLM requests | **Yes risk** on barge-in: OpenAI stream for R1 not cancelled in `streamChatReply`; R2 starts another completion |
| Stale SSE to UI | Port disconnect stops posts (`portOpen=false`). Voice `turnGen` drops deltas. Typed path serial → low stale-bubble risk |
| Old request updates UI after newer | **Mitigated** for voice (`turnGen`); **low** for typed queue. Residual: if `activeChatStreamPort` overwritten without cancel, old port could still finish into a disconnected promise while new stream writes UI |
| Follow-ups waiting behind obsolete request | **Yes** on typed queue — R2 waits for full R1 (including slow context/LLM) |
| Aborted requests continuing expensive backend work | **Yes** — disconnect aborts HTTP client; route **does not** propagate abort to Yahoo/engine/OpenAI |

---

## STALE RESPONSE RISK

| Risk | Severity | Notes |
|------|----------|-------|
| Stale assistant bubble from old SSE | **Low–medium** | Voice guarded; typed serial; overwrite-without-cancel is a footgun |
| Stale `lastVerdict` / memory from completed orphan R1 | **Medium** | Orphan R1 completing after barge-in can still mutate server caches (`lastPipeline`, live intel, Yahoo cache) even if UI ignored it |
| Follow-up answers obsolete R1 | **Medium** | User waits; answer is for R1 then R2 runs — not wrong, but feels “stuck behind obsolete work” if user wanted cancel |
| `signal is aborted` leaking to UI | **Previously seen** | Client abort / 90s; timeout recovery maps many cases to WAIT — barge-in still surfaces disconnect errors sometimes |

---

## SAFE FIX (design only — do not implement here)

1. **Always supersede:** before opening a new chat stream, `cancelActiveChatStream` (don’t only overwrite `activeChatStreamPort`).  
2. **Propagate abort:** pass `request.signal` (or client abort) through `buildDeskMarketIntelligence` / Yahoo / OpenAI `signal` so barge-in stops CPU+tokens.  
3. **Optional:** cancel-in-flight on typed “new turn” if product wants interrupt-not-queue for trading reads.  
4. **Ignore orphan completions** for cache writes when `requestId` ≠ latest (or skip `rememberLiveDeskIntelligence` after abort).  
5. Keep serial queue **or** document that follow-ups intentionally wait.

---

## Deliverable block

```
REQUEST 1 lifecycle: enqueue → serial handleUserMessage → port+fetch(/api/chat/stream) → Yahoo/context/envelope/LLM SSE → done; abort only on disconnect/90s; server ignores request.signal
REQUEST 2 lifecycle: TEXT = queued until R1 finishes (no cancel); VOICE barge-in = disconnect+abort client fetch + turnGen ignore; may start new stream while R1 server work continues
OVERLAP: Text chat streams serial (no UI overlap). Voice/chart paths can overlap with backend orphans. activeChatStreamPort overwrite without prior disconnect is unsafe if ever concurrent.
DUPLICATE WORK: Yahoo coalesced/cached when shared; context+LLM can duplicate after barge-in because server work is not aborted. Typed follow-ups do not duplicate in parallel — they wait.
STALE RESPONSE RISK: UI mostly protected (queue + turnGen); stale lastPipeline/intel/cache from orphan R1 = medium; follow-ups blocked behind obsolete R1 = medium UX
SAFE FIX: Cancel prior port before new stream; wire AbortSignal through market fetch + OpenAI; optionally gate cache writes on latest requestId
```

Stop. No code changes. No commit/push/deploy.
