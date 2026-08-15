# KAREN — Same-request CURRENT_MARKET_READ instant-read LLM skip

**Date:** 2026-08-15  
**Mode:** IMPLEMENTATION — smallest safe Design A  
**No commit / push / deploy**

References: `karen-instant-read-llm-skip-audit.md`, `karen-compact-read-output-audit.md`

---

## IMPLEMENTED

| File | Change |
|------|--------|
| `lib/chat-engine.ts` | Feature flag `KAREN_INSTANT_READ_LLM_SKIP` (default OFF); `tryInstantReadFromQualityGate`; `tryCurrentMarketReadFastPath` (one `buildChatSystemPrompt` then `formatMentorTradeSpoken`); `prebuiltPrompt` on `ChatPromptInput` so LLM fallback does not re-run the gate; `openai_calls` latency notes |
| `app/api/chat/stream/route.ts` | When `tradingStream` + LIVE + flag + `CURRENT_MARKET_READ` → call fast path **before** `streamChatReply`; on success `sseDone` with `reply` + `decisionEnvelope` + `responseSource=envelope_instant` (OpenAI never called) |
| `scripts/test-karen-instant-read-llm-skip.ts` | Focused regression tests 1–17 |
| `package.json` | `test:karen-instant-read-llm-skip` |

---

## FAST PATH

```
POST /api/chat/stream
  → tradingStream === true
  → !historical
  → KAREN_INSTANT_READ_LLM_SKIP enabled
  → mentorIntent === CURRENT_MARKET_READ ("Give me the read")
  → tryCurrentMarketReadFastPath
       → buildChatSystemPrompt → evaluateAnalysisQualityGate (THIS request only)
       → canDeliverVerdict && valid DecisionEnvelope
       → formatMentorTradeSpoken(envelope)
       → sseDone({ reply, decisionEnvelope, responseSource: "envelope_instant", timings.openaiCalls: 0 })
  → DOES NOT call streamChatReply / OpenAI
```

Envelope source: **current request** quality-gate result only.  
No lastPipeline / LIVE ring / Redis / Analyse RAM / HISTORICAL / PIT / recorder.

---

## OPENAI CALLS

| Path | Calls |
|------|-------|
| Successful deterministic CURRENT_MARKET_READ | **0** |
| Fast-path quality-gate fail | **0** (existing QUALITY_GATE reply) |
| Flag off / non-read / invalid / missing envelope | **1** via existing `streamChatReply` |

---

## FALLBACK

Existing LLM / gate behaviour when any of:

- `KAREN_INSTANT_READ_LLM_SKIP` unset/false (default)
- `tradingStream !== true`
- intent ≠ `CURRENT_MARKET_READ`
- `historicalFixture` present
- `canDeliverVerdict !== true`
- envelope missing or `validateDecisionEnvelope` fails
- `formatMentorTradeSpoken` cannot produce MENTOR VIEW + TRADE DECISION

On soft miss after one prompt build: `prebuiltPrompt` passed into `streamChatReply` (no second pipeline).

---

## FEATURE FLAG

| Name | Default |
|------|---------|
| `KAREN_INSTANT_READ_LLM_SKIP` | **OFF** (opt-in: `1` / `true` / `yes`) |

---

## TESTS

```
npm run test:karen-instant-read-llm-skip
→ 51 passed / 0 failed
```

Coverage map:

1. CURRENT_MARKET_READ + valid → skip  
2. Stance / thesis from same-request envelope  
3. WAIT FOR preserved  
4. LONG preserved (formatter)  
5. SHORT preserved (formatter)  
6. WHY NOT LONG/SHORT via existing follow-up formatter; not on instant path  
7. Conflict yes/no preserved  
8. Missing/invalid → LLM fallback  
9. `canDeliverVerdict=false` → no instant  
10. Non-CURRENT_MARKET_READ unchanged  
11. Historical never uses LIVE instant  
12. LIVE decision-history query not instant  
13. Analyse untouched (no file changes)  
14. Redis decision-memory untouched  
15. SSE `done` + `decisionEnvelope` + `responseSource`  
16. Zero OpenAI on deterministic path  
17. Fallback retains single OpenAI create path  

---

## LATENCY

| Metric | Value |
|--------|-------|
| Before (warm HIT baseline) | **~3.7–4.8 s** (prior audit; LLM ~90–97%) |
| After (fixture same-request gate+format) | **gateMs≈6, formatMs≈0, totalDeterministicMs≈6** (fixture path; not full live intel stack) |
| LIVE warm HIT TOTAL with flag ON | **UNKNOWN** (weekend / market closed — not fabricated) |

Expected direction when LIVE warm HIT is measured: remove LLM wall (~3–4.8 s); exact TOTAL remains UNKNOWN until measured with `LIVE_LATENCY_TRACE=1`.

---

## PARITY

Verified:

- Spoken text from `formatMentorTradeSpoken` only (no invented prose)
- Same-request `DecisionEnvelope` identity on skip
- Stance / WAIT FOR / conflict labels
- LONG/SHORT stance roles via formatter
- WHY NOT LONG/SHORT still via `formatWhyNotDirectionFollowUp` on follow-ups
- Extension-safe fields: `type=done`, `reply`, `decisionEnvelope`, `responseSource=envelope_instant`

---

## UNCHANGED

- ICT / trading / market calculations  
- DecisionEnvelope schema  
- QUALITY GATE semantics (only consume result)  
- Redis / decision-memory backend  
- Continuous recorder  
- Session-boundary / historical PIT / decision-history routers  
- Analyse / live-verdict routes  
- SSE flush implementation (`flushTradingLlmDeltas` untouched)  
- Model / temperature / prompts  
- Cross-request Analyse↔Chat reuse (explicitly not introduced)

---

## Return block

```
IMPLEMENTED:
lib/chat-engine.ts; app/api/chat/stream/route.ts; scripts/test-karen-instant-read-llm-skip.ts; package.json; data/research/karen-instant-read-llm-skip-implementation.md

FAST PATH:
POST /api/chat/stream → tradingStream + CURRENT_MARKET_READ + flag → tryCurrentMarketReadFastPath → formatMentorTradeSpoken → sseDone(envelope_instant); no streamChatReply/OpenAI

OPENAI CALLS:
0 on successful deterministic CURRENT_MARKET_READ; 1 on LLM fallback via streamChatReply

FALLBACK:
flag off / non-CURRENT_MARKET_READ / !tradingStream / historical / !canDeliverVerdict / missing|invalid envelope / formatter fail → existing LLM or QUALITY_GATE path

TESTS:
npm run test:karen-instant-read-llm-skip — 51 passed / 0 failed

LATENCY:
before ~3.7–4.8s warm HIT baseline; after fixture gate+format ~6ms (openai=0); LIVE=UNKNOWN

PARITY:
stance/thesis/WAIT FOR/conflict/LONG/SHORT formatter; decisionEnvelope on done; responseSource=envelope_instant

UNCHANGED:
ICT / envelope schema / QUALITY GATE semantics / Redis / recorder / session / historical / SSE flush / model / temp / prompts / Analyse
```

---

## Stop

Implementation + tests + report complete. No commit / push / deploy.
