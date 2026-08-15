# Karen — Indefinite wait-state audit

**Date:** 2026-08-14  
**Mode:** READ-ONLY audit. No trading-logic changes. No commit / push / deploy.  
**Abort cross-check:** `data/research/karen-quality-gate-followup-abort-audit.md` — **does not exist**. Cross-checked against `data/research/karen-sse-streaming-before.json` (`error: "This operation was aborted"`) and `explainError` / SSE abort wiring instead.

---

## Verdict

**Highest-risk indefinite-wait path:** Yahoo OHLC fetch (`fetchBars` / `fetchAllTimeframes` / `marketFetchInFlight`) has **no `AbortSignal` / no hard timeout**. A hung Yahoo call can block `buildDeskMarketIntelligence` for the full client SSE window (~90s), then surface as an unexplained **`This operation was aborted`** — not as “market data unavailable.”

**Safest fix (no trading logic):** Put a hard `AbortSignal.timeout` on Yahoo (and Tickstream REST) fetches; fail/clear `marketFetchInFlight` on abort; map abort errors in SW + `explainError` to an explicit market-data / request-timeout message.

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **WAITING FOR DATA** | Request still blocked on upstream I/O (Yahoo / Tickstream / TV / LLM / SSE). |
| **DATA UNAVAILABLE** | Upstream finished or was raced; observations insufficient → structured WAIT / QUALITY_GATE. |
| **REQUEST ABORTED** | Client or SW cancelled the in-flight HTTP/SSE (`AbortController`, disconnect, watchdog). |
| **BACKEND ERROR** | HTTP 5xx / thrown API error with a message. |
| **STREAM ERROR** | SSE `type: error` or port disconnect mid-stream. |
| **VALID WAIT DECISION** | Quality gate / envelope says WAIT with a concrete reason (not a hang). |

---

## Wait inventory

### 1. Yahoo OHLC (`lib/market-data.ts`)

| Field | Value |
|-------|--------|
| **Path** | `fetchBars` → `fetchAllTimeframes` → `fetchAllTimeframesCached` → MI / levels / verdict / snapshot |
| **Expected max** | ~1–5s warm; cold miss historically 7–100s+ (see latency audits) |
| **Actual timeout** | **None** on `fetch()` — no `AbortSignal.timeout` |
| **On timeout** | N/A at fetch layer; only platform / client abort eventually |
| **User-facing** | Often delayed; when client aborts → raw **`This operation was aborted`** (see §Abort) |
| **Retry** | Coalesce via `marketFetchInFlight` (shared waiter), not a user retry |
| **Request aborted?** | Only when outer caller aborts; Yahoo itself is not cancelled by the 25s chat race |
| **Class** | **WAITING FOR DATA** → can become **REQUEST ABORTED** with wrong UX |

**Poisoning:** One hung `marketFetchInFlight` makes later callers `await` the same promise with no deadline (`yahoo_cache=coalesced`).

---

### 2. Chat prompt market build — 25s race (`lib/chat-engine.ts` `buildChatSystemPrompt`)

| Field | Value |
|-------|--------|
| **Expected max** | ≤25s for market block |
| **Actual timeout** | `Promise.race` **25000ms** → `"Market data timed out"` |
| **On timeout** | Catch sets `marketDataWarning`; **does not abort** Yahoo/Tickstream; **`qualityGate` stays undefined** |
| **User-facing** | LLM may still answer with a note; **QUALITY_GATE may not fire** (gate only runs if intel built) |
| **Retry** | No automatic retry |
| **Request aborted?** | No — race loser keeps running |
| **Class** | Soft **DATA UNAVAILABLE** / degraded prompt — **not** a clean VALID WAIT DECISION |

---

### 3. Mentor / snapshot intel — **no 25s race** (`lib/chat-engine.ts`)

| Path | Timeout |
|------|---------|
| `buildIntelForMentorFollowUp` → `buildDeskMarketIntelligence` | **None** (catch retries once with `forceFresh: false` — can double-wait) |
| `tryDeterministicMentorFollowUp` (refresh path) | **None** |
| `trySnapshotChatReply` | **None** |

Called from `app/api/chat/stream/route.ts` **before** `streamChatReply` when `tradingStream` / mentor follow-up.  
**Class:** **WAITING FOR DATA** with only the outer SSE 90s client abort as backstop.

---

### 4. Tickstream live / quote (`lib/tickstream/stream-snapshot.ts`, `quote.ts`)

| Field | Stream path | REST quote |
|-------|-------------|------------|
| **Expected max** | ≤8s (`DEFAULT_STREAM_WAIT_MS`) | Hundreds of ms |
| **Actual timeout** | Wait capped at **8000ms**, then unsubscribe/close | **None** on `fetch` |
| **On timeout / fail** | Returns `null` → no price overlay | Throw → catch → try stream / null |
| **User-facing** | Indirect via missing price → QUALITY_GATE / WAIT | Same |
| **Retry** | Quote then stream (local only; Vercel skips WS) | No |
| **Request aborted?** | Stream wait ends; WS not AbortSignal-tied | No |
| **Class** | Bounded **WAITING FOR DATA**; fail → **DATA UNAVAILABLE** |

---

### 5. QUALITY_GATE (`lib/analysis-quality-gate.ts` + stream route)

| Field | Value |
|-------|--------|
| **Expected max** | Sync after intel exists |
| **Actual timeout** | N/A |
| **On “fail”** | `streamChatReply` throws `QUALITY_GATE:WAIT — …`; route returns SSE `done` with WAIT text |
| **User-facing** | Explicit WAIT / missing OHLC / price / structure (VALID WAIT) |
| **Retry** | No |
| **Request aborted?** | No |
| **Class** | **VALID WAIT DECISION** / **DATA UNAVAILABLE** |

**Important:** Gate does **not** run if market build timed out or never completed → hang/abort path skips this honest WAIT.

---

### 6. Chat SSE (extension + SW)

| Layer | Expected | Actual timeout | On timeout | User-facing | Retry | Abort |
|-------|----------|----------------|------------|-------------|-------|-------|
| Content `streamChatFromPort` | ≤90s | **90000** | Reject timeout error | “Chat timed out after 90 seconds — click RECONNECT…” | Casual path may retry stream once | Port disconnect |
| SW `desk-copilot-chat-stream` | ≤90s | `ac.abort()` at **90000** | Catch posts SSE `error` | Often **`This operation was aborted`** (DOMException text) | No | **Yes** — aborts fetch |
| UI watchdog | 95s | `CHAT_STREAM_TIMEOUT_MS + 5000` | `cancelActiveChatStream` + force reset | “Chat timed out — click RECONNECT…” | No | Disconnect port → SW abort |
| Server `/api/chat/stream` | LLM + MI | **No `maxDuration`** in route / `vercel.json` | Platform default only | Depends on client | No | Client abort cancels body read; server work may continue |

**Class:** Bounded client wait; abort UX is **STREAM ERROR** / **REQUEST ABORTED**, often mislabeled.

---

### 7. `getTurnExtras` / `ensureBackend`

| Path | Expected | Actual | On timeout | User-facing | Retry | Abort |
|------|----------|--------|------------|-------------|-------|-------|
| `getTurnExtras` | Chart price extras | **8000ms** race → `{}` | Continues without chart price | Silent degrade | No | No |
| `ensureBackend` / `pingBackend` | Health | bgSend **15–18s**; cached localhost may proceed on slow health | Offline copy / RECONNECT | Offline message | Ping fail streak soft-continue | bgSend timeout only |
| Connection reconnect | Backoff | Max **10** retries (`MAX_RECONNECT_RETRIES`) | FAILED state | Status line | Yes, capped | N/A |

**Class:** Bounded; not indefinite.

---

### 8. Chart read / live-verdict / market snapshot

| Path | Expected | Actual timeout | On timeout | User-facing | Retry | Abort |
|------|----------|----------------|------------|-------------|-------|-------|
| `waitForVerdict` | ~8–15s UI copy | **90000** | `CHART_READ_API_TIMEOUT` | `explainError` chart → “timed out after 2 minutes…” | Fallback chain | No (waiter only) |
| SW `live-verdict` | Vision + Yahoo | **120000** `apiFetch` | Timed-out error string | Friendly timeout via `explainError` | Fallbacks in `runChartRead` | AbortSignal.timeout |
| Snapshot fallback race | Fast desk read | **15000** `snapshot_timeout` | Log + next fallback | Degraded WAIT if all fail | Screenshot → local WAIT | No |
| `MARKET_SNAPSHOT` SW | Snapshot | **20000** | Timeout error | Fast-fact / chart fail copy | Relaxed cache sometimes | Yes |
| Levels draw | Overlay | **60000** | Timeout | levels `explainError` | No | Yes |

Server routes (`market-snapshot`, `levels`, `market-intelligence`, `live-verdict`) call Yahoo/MI **without** the chat 25s race.

---

### 9. LLM (OpenAI)

| Path | Timeout | Notes |
|------|---------|--------|
| `streamChatReply` / casual stream | **None** on OpenAI client | Client SSE 90s aborts fetch; may yield **REQUEST ABORTED** |
| Non-stream chat / verdict | Client **90–120s** | Server create has no AbortSignal |

**Class:** **WAITING FOR DATA** (model); outer abort → **REQUEST ABORTED**.

---

## Abort ↔ market-data failure (cross-check)

Abort audit file **missing**. Observed chain:

1. Yahoo / MI hangs (no fetch AbortSignal).  
2. SW `AbortController` fires at 90s **or** content disconnects port / watchdog.  
3. `fetch` rejects with **`This operation was aborted`** (see `karen-sse-streaming-before.json`).  
4. SW posts `{ type: "error", error: e.message }` verbatim.  
5. `explainError(err, "chat")` only special-cases strings containing `"timed out"` / network / etc. — **not** `"aborted"`.  
6. User sees unexplained abort text → feels like “signal is aborted without reason,” not **DATA UNAVAILABLE**.

`extension/api-config.js` `isProbeTimeout` treats `/timeout|aborted/i` for probes, but chat SSE error path does **not** reuse that mapping for user copy.

QUALITY_GATE WAIT copy is honest when intel exists. The abort path **bypasses** the gate and loses the market-data reason.

---

## Paths that can wait indefinitely or unreasonably long

| Rank | Path | Why |
|------|------|-----|
| **1** | Yahoo `fetchBars` + `marketFetchInFlight` | No AbortSignal; coalesced hang; only ~90s client abort |
| **2** | `buildDeskMarketIntelligence` on mentor/snapshot/API routes | No 25s race; depends on (1) |
| **3** | OpenAI stream without server abort | Can burn full 90s after slow Yahoo |
| **4** | Tickstream REST quote | No AbortSignal (usually fast; secondary) |
| **5** | Local next-dev hung `:3000` | Health/stream wait until client timeout (ops, not code timeout) |

**Not indefinite (bounded):** Tickstream stream wait 8s; turn extras 8s; chat SSE 90s; verdict waiter 90s; live-verdict client 120s; reconnect ≤10 attempts; QUALITY_GATE sync.

---

## Single highest-risk path (detail)

```
USER trading ask
  → content runStreamingChat / forceMarket
  → SW fetch /api/chat/stream (AbortSignal 90s)
  → tryDeterministicMentorFollowUp OR streamChatReply → buildDeskMarketIntelligence
  → fetchAllTimeframesCached → fetchBars(Yahoo)   ← NO TIMEOUT
  → [optional] chat-only Promise.race 25s does NOT cancel Yahoo
  → hung Yahoo keeps marketFetchInFlight alive (coalesce poison)
  → at ~90s SW ac.abort()
  → error "This operation was aborted"
  → UI explainError passthrough
```

**Expected max duration:** Yahoo should fail or return within ~10–20s.  
**Actual:** Unbounded until client abort (~90s) or platform kill.  
**User-facing:** Unexplained abort, **not** WAIT / market-data unavailable.  
**Retry:** No automatic clear of hung inflight.  
**Aborted:** Yes (client), after unreasonable wait.

---

## Safest fix (recommended; no trading logic)

1. **`lib/market-data.ts`:** Pass `signal: AbortSignal.timeout(YAHOO_FETCH_MS)` (e.g. 12–15s per chart call, or one budget for `fetchAllTimeframes`). On abort/timeout, clear `marketFetchInFlight` and throw a stable error: `Yahoo market data timed out`.  
2. **`lib/tickstream/quote.ts`:** Same pattern (e.g. 5–8s).  
3. **Optional single wrapper:** `buildDeskMarketIntelligence` with one AbortSignal so mentor/snapshot/API share the same budget (don’t rely only on chat `Promise.race`).  
4. **UX:** In SW chat-stream catch + `explainError`, map `/aborted|AbortError|TimeoutError/i` → explicit “Market data or desk request timed out — click RECONNECT and try again.” Never show bare “This operation was aborted.”  
5. **Do not** change QUALITY_GATE thresholds, envelope rules, or trade direction logic.

---

## Related research (existing)

- `data/research/karen-live-latency-audit.md` — Yahoo + Tickstream cost before LLM  
- `data/research/karen-sse-streaming.md` / `karen-sse-streaming-before.json` — 90–120s aborts, `"This operation was aborted"`  
- `data/research/karen-wait-followup.md` — VALID WAIT presentation (separate from hangs)  
- `data/research/karen-connection-reliability.md` — levels >25s timeouts  

---

## Summary table (quick)

| Wait | Expected max | Actual timeout | On timeout | User-facing | Retry | Aborted |
|------|--------------|----------------|------------|-------------|-------|---------|
| Yahoo OHLC | ~seconds | **none** | hang / coalesce | often abort text | coalesce only | via outer 90s |
| Chat MI race | 25s | **25s** | warning; no abort Yahoo | may skip gate | no | no |
| Mentor/snapshot MI | seconds | **none** | hang to 90s | abort / empty | one soft retry | outer only |
| Tickstream stream | 8s | **8s** | null price | WAIT / gate | quote→stream | n/a |
| Tickstream quote | <1s | **none** | throw→fallback | same | to stream | no |
| QUALITY_GATE | sync | n/a | WAIT SSE done | WAIT reason | no | no |
| Chat SSE | 90s | **90s** | error / watchdog | timeout **or** abort | casual retry | **yes** |
| getTurnExtras | 8s | **8s** | `{}` | silent | no | no |
| ensureBackend | ~15–18s | bgSend timeout | offline / cached local | RECONNECT | ping streak | timeout only |
| waitForVerdict | 90s | **90s** | API_TIMEOUT | friendly timeout | fallbacks | no |
| live-verdict client | 120s | **120s** | timed out | friendly | fallbacks | **yes** |
| LLM | tens of s | none server | client abort | abort / timeout | no | outer |
