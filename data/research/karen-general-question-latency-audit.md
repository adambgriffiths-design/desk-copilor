# KAREN — General question latency root-cause audit

**Date:** 2026-08-14  
**Mode:** PROFILE / TRACE ONLY. No code changes. No new cache. No tick engine. No replay. No commit/push/deploy. No `buildStructureFacts` / EQH work. No extra `next-dev`. No 5-read marathon.  
**Constraint:** 8GB RAM — tiny targeted probes only.

**Sources reused:**

| File | Role |
|---|---|
| `karen-latency-by-request-type.md` | In-process clocks: GENERAL ~895ms intel=0; MARKET READ median ~22s; grass ~12ms |
| `karen-speed-connection-priority-audit.md` | Shared resource / hung `:3000` / dual next-dev risk |
| `karen-voice-bottleneck-audit.md` | Intent ≪1ms; market-state only on trading refresh path |
| `karen-chart-read-noreply.md` | Berlin → GENERAL / casual; clean `:3000` casual SSE ~7s once; later hang |
| `app/api/chat/stream/route.ts` + `lib/chat-engine.ts` | Code-path proof |
| This session | In-process classify probe; `/api/health` timeout on `:3000` |

---

## Probe status

| Probe | Result |
|---|---|
| `GET http://127.0.0.1:3000/api/health` (5s) | **TIMEOUT** — TCP Listen on PID 21624, app hung |
| Process snapshot | **Two** `next dev` chains; start-servers ~**1081 MB** + ~**304 MB** WS |
| HTTP `/api/chat/stream` | **Skipped** (health hung; do not restart / do not add next-dev) |
| In-process classify (no OpenAI, no market I/O) | **Ran** — see routing table below |

Prior live numbers from `karen-latency-by-request-type.md` are the clock source of truth for clean-path totals.

---

## Routing proof (in-process, this session)

| Phrase | mentorIntent | desk route | tradingStream | isCasual | entersMarketPipeline | classifyMs |
|---|---|---|---|---|---|---:|
| `What is the capital of Berlin?` | `GENERAL_CHAT` | casual · stream | **false** | **true** | **false** | ~54 |
| `What is 2 + 2?` | `GENERAL_CHAT` | casual · stream | **false** | **true** | **false** | ~7 |
| `Do you like grass?` | `GENERAL_CHAT` | casual · persona | **false** | **true** | **false** | ~19 |
| `What's the capital of Germany?` | `GENERAL_CHAT` | casual · stream | **false** | **true** | **false** | ~27 |
| `Give me the read` | `CURRENT_MARKET_READ` | trading · current_market_read | **true** | **false** | **true** | ~1 |

Notes:

- `shouldRefreshMarketState(GENERAL_CHAT)` returns **true** by default (fall-through), but that flag is only consumed on the **trading** SSE `done.timings` path. Casual early-returns before `streamChatReply` / intel / quality gate.
- `needsWebSearch("capital of …")` is **explicitly false** — no Tavily.
- `trySnapshotChatReply` returns **null** immediately for casual/general (`isCasualChat` guard) — **no** `buildDeskMarketIntelligence`.

---

## End-to-end stage table

### A) `What is the capital of Berlin?` (general knowledge → casual stream)

Trace: USER → intent → routing → API → (no market) → LLM → casual SSE → frontend.

| Stage | CALLED? | START | END | DURATION | Evidence |
|---|---|---|---|---|---|
| USER MESSAGE (panel enqueue) | YES | T0 | T0+ε | ~ms | `enqueueUserMessage` → `handleUserMessage` |
| Intent (`classifyMentorIntent`) | YES | t2 | t2 | **~1–54ms** | Probe + voice audit ≪1ms typical |
| Desk route / `mustUseTradingStream` | YES | t2 | t2 | included above | `casual · stream`, tradingStream=false |
| Extension casual branch (`replyCasual`) | YES | after intent | before trading | — | `!tradingQ && shouldRouteCasual` early return |
| API `POST /api/chat/stream` | YES (when healthy) | HTTP | HTTP | network + handler | Same route as trading; body diverges |
| Voice interpret | NO | — | — | — | Casual/non-trading skips interpret |
| Chart-read bounce `needsChartRead` | NO | — | — | — | Guarded out for general |
| Mentor structured follow-up | NO | — | — | — | Not follow-up / not tradingStream |
| `trySnapshotChatReply` | YES call / **NO intel** | — | null | ~0 | Early null for casual |
| Yahoo / Tickstream / market data | **NO** | — | — | n/a | Profile: yahoo=none ×5 |
| `buildMarketContextAt` / engine | **NO** | — | — | n/a | engine=untouched |
| `buildDeskMarketIntelligence` | **NO** | — | — | **intel=0** | Profile + early return |
| DecisionEnvelope | **NO** | — | — | n/a | Profile ENV n/a |
| Trading quality gate | **NO** | — | — | — | Only `streamChatReply` path |
| Trading SSE path (`flushTradingLlmDeltas`) | **NO** | — | — | — | Casual branch returns earlier |
| Instant casual (`tryCasualChatReplyInstant`) | YES → null (knowledge) | — | null | ~ms | Failure copy skipped; stream instead |
| LLM `streamCasualChatReply` (gpt-4o-mini) | **YES** | T8 | T10 | **median 879ms** (846–2674) | Profile GENERAL_KNOWLEDGE |
| Casual SSE (delta flush) | **YES** | first token | done | TTFT median **614ms** | Flushes deltas (not trading buffer) |
| Frontend render | YES | first delta | done | ≈ TTFT→TOTAL | |

**Clean-path TOTAL (profile):** median **895ms** (fastest 862 / worst 2716).

### B) `Give me the read` (market read → trading stream)

| Stage | CALLED? | DURATION (profile) |
|---|---|---|
| Intent / route | YES | CURRENT_MARKET_READ · trading · current_market_read · tradingStream=true |
| Yahoo + Tickstream | **YES** | DATA median **420ms** (62–8617) |
| MARKET CONTEXT / intel | **YES** | CTX **4–80240ms** (hit ~4–21ms; miss/cold 20–80s+) |
| DecisionEnvelope | **YES** | **0–63ms** |
| Quality gate | **YES** (can short-circuit) | cold sample quality_gate TOTAL **88999ms** |
| LLM (trading model) | YES on deliverable path | median **~3906ms** on HIT samples |
| Trading SSE | **YES** | historically buffered until complete; flush coded, wire after unproven |
| **TOTAL** | | median **22389ms** (HIT ~3.7–4.3s; miss 76–89s; cold ~89s) |

### C) Phrase trio (same classifier family, different reply source)

| Phrase | Path | TOTAL (profile / code) | Market work? |
|---|---|---:|---|
| `What is the capital of Berlin?` | casual_stream (gpt-4o-mini) | ~**0.9–2.7s** clean; **hung** if `:3000` dead | **NO** |
| `What's the capital of Germany?` | casual_stream | median **895ms** | **NO** |
| `What is 2 + 2?` | casual_stream (same as capital) | same class as general knowledge (LLM) | **NO** |
| `Do you like grass?` | **casual_instant** canned | median **12ms** | **NO** |
| `Give me the read` | trading_stream + intel | median **22389ms** | **YES** |

---

## Does a general question enter market systems?

| System | Enters? | Proof |
|---|---|---|
| Market data acquisition | **NO** | intel builds 0/0/0/0/0; yahoo=none |
| Tickstream | **NO** | DATA n/a |
| Yahoo | **NO** | yahoo=none |
| `buildMarketContextAt` / incremental engine | **NO** | engine=untouched |
| `buildDeskMarketIntelligence` | **NO** | early casual return + snapshot null |
| DecisionEnvelope | **NO** | ENV n/a |
| Trading quality gate | **NO** | QUALITY_GATE only on `streamChatReply` |
| Trading SSE path | **NO** | `isCasual` → `streamCasualChatReply` Response |

**Verdict:** Accidental market-pipeline entry is **disproven** for these phrases.

---

## Delay bucket (A–G) — do not assume

| Bucket | General (Berlin / Germany / 2+2) | Market read | Notes |
|---|---|---|---|
| **A Intent** | ~ms | ~ms | Not the delay |
| **B API/network** | tiny when healthy; **∞ when hung** | same host | **This session: health TIMEOUT** |
| **C LLM** | **Dominant on clean path** (~0.9s mini) | Dominant on warm HIT (~3.5–11s) | Different models/prompts |
| **D SSE buffering** | **No** (casual flushes) | Was yes; flush in code | Not why general ≈ read |
| **E Frontend** | Can wait if `processingQueue` busy | Same queue | Serializes behind in-flight read |
| **F Accidental market pipeline** | **NO** | intentional YES | Code + profile |
| **G Other shared bottleneck** | **YES when apparent equality** | drives the hang | Dual next-dev + hung `:3000` + 8GB RAM |

---

## Why it *feels* like a market read

Clean measurements contradict the complaint:

- General knowledge median **895ms**, intel=0.
- Market read median **22389ms** (warm HIT still **~4s** LLM).

So “roughly as long as a market read” is **not** the clean casual path. Observed equality comes from **G + B (+ optionally E)**:

1. **Hung `:3000`** — health timed out this session; chart-read audit already saw Berlin casual OK once (~7s), then trading probe hung the same process. Any chat/stream then waits like a dead market read.
2. **Dual `next-dev`** — ~1.0 GB + ~0.3 GB WS on 8GB — event-loop / GC starvation shared by all routes.
3. **Frontend `processingQueue`** — if a market read is in flight, the next general question does not dispatch until that turn finishes → wall-clock looks like market latency even though routing never entered intel.

---

## Scorecard (requested return block)

```
GENERAL QUESTION TOTAL: ~895ms clean (profile median; Berlin/Germany casual_stream); hung/timeout if :3000 dead
MARKET READ TOTAL: ~22389ms profile median (warm HIT ~3.7–4.3s; cold/miss 52–89s+)
GENERAL QUESTION PATH: USER → GENERAL_CHAT → casual · stream → /api/chat/stream → NO market/intel/envelope/QG → gpt-4o-mini casual SSE (flush) → UI
MARKET READ PATH: USER → CURRENT_MARKET_READ → trading stream → Yahoo+Tickstream → buildDeskMarketIntelligence → DecisionEnvelope/QG → trading LLM → trading SSE → UI
SHARED BOTTLENECK: Hung/contended :3000 (health TIMEOUT) + dual next-dev RAM; optional frontend processingQueue serialization
UNEXPECTED MARKET WORK: NONE (intel=0; Yahoo/Tickstream/engine/envelope/QG/trading-SSE all NO)
SSE CONTRIBUTION: Casual flushes deltas (not the bottleneck); trading historically buffered until done
LLM CONTRIBUTION: Clean general ≈ entire cost (~0.9s gpt-4o-mini); warm market HIT ≈ 3.5–11s trading LLM after cheap CTX
ROOT CAUSE: General does not take market-read time on the clean path — perceived parity is shared hung/contended Next (and/or queue-behind-read), not accidental intel. Clean delay is C (LLM) only.
SINGLE SAFEST FIX: Restore one healthy :3000 (no second next-dev) and re-time one Berlin SSE — do not touch market pipeline, EQH, or caches. If healthy and still slow, inspect processingQueue / concurrent market turn — not routing.
```

---

## Principle check

Only spend expensive computation when required.

- General knowledge / math → **must** stay off market pipeline → **PASS** (code + profile).
- Preference (`Do you like grass?`) → instant → **PASS** (~12ms).
- Market read → full trading path → expected expensive.

No implementation performed.
