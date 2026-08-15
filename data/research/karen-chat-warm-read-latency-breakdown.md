# KAREN — Chat warm-read latency breakdown (AUDIT ONLY)

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no commit/push/deploy, no live marathon  
**Phrase:** warm `Give me the read` (`CURRENT_MARKET_READ` / `trading_stream`) with **`live_context=hit`**  
**Live sample tonight:** **NOT RUN** — CME closed (weekend); do not fabricate. Prefer prior warm HIT benches.

**Primary evidence (warm HIT only):**

| Source | What |
|--------|------|
| `karen-live-context-reuse.md` Bench A runs 4–5 | TOTAL **4832 / 3816**; CTX **16 / 1**; LLM **4629 / 3712**; TTFT **618 / 646** |
| `karen-latency-by-request-type.md` WARM HIT aggregate | n=5 HIT TOTAL ~**3713–4330** typical (outlier **22389** slow LLM); DATA **62–368**; CTX **4–21**; ENV **0–9**; LLM **3.5–20s** |
| `karen-speed-connection-priority-audit.md` | Warm HIT summary ~**3.7–4.8s** LLM-bound |
| `karen-llm-payload-size-audit.md` | TTFT **~618–989**; rest of gen **~3.0–3.7s** |
| `karen-sse-streaming.md` / `karen-first-visible-token-path.md` | SSE flush coded; **HTTP after-flush UNAVAILABLE**; Chrome paint never timed |
| `karen-continuous-state-speed-audit.md` | Confirms warm HIT chat remains LLM-bound ~**3.7–4.8s** |
| `lib/live-latency-trace.ts` | Stage names: `request_received` → … → `llm_request_started` → `llm_first_token` → `sse_first_visible_token` → `final_response` |

**Explicitly excluded:** old pre-reuse MISS medians (~28–40s MARKET CONTEXT). Those are STALE and not this path.

**Layer legend:** **in-process** = Node bench / LIVE_LATENCY_TRACE marks · **wire** = HTTP SSE to extension · **Chrome** = DOM paint

---

## Stage breakdown (one warm HIT “Give me the read”)

Times are **elapsed contribution** of that stage on the warm HIT path (not cumulative wall unless noted). Where a stage was not isolated, value is UNKNOWN or bounded.

| Stage | Measured ms | Layer | Notes |
|-------|------------:|-------|-------|
| **request start** | **~0** (T0 / `request_received` baseline) | in-process | Script/backend receive mark; not a cost center |
| **market intelligence retrieval** | **62–368** (Yahoo+Tickstream DATA on HIT reads) | in-process + network | Warm HIT still acquires overlay on market-read path; follow-up HIT can skip Tickstream. **Not** the old 28–40s rebuild |
| **context reuse** | **1–21** (Bench A **1–16**) | in-process | `live_context=hit` — engine rebuild skipped; MARKET CONTEXT stage |
| **prompt construction** | **~0–tens** (envelope **0–9**; no separate large HIT mark) | in-process | DecisionEnvelope assemble + quality-gate prompt. One cold-audit T8−T7 ~3946ms is **MISS-path / not warm HIT** — do not cite as warm |
| **LLM request start** | mark `llm_request_started` (t8) after prompt ready | in-process | OpenAI call begins; pre-LLM wall on HIT ≈ DATA+CTX+ENV ≪ 0.5s |
| **LLM time-to-first-token** | **618–989** (Bench A HIT **618 / 646**; typical **~0.6–1.2s** after prompt) | in-process ← OpenAI | First streamed token at server; **not** Chrome first paint |
| **LLM generation** (after first token → done) | **~3000–4000** (e.g. 3712−646≈**3066**; 4629−618≈**4011**) | OpenAI | Decode wall; dominates TOTAL |
| **LLM wall (TTFT + generation)** | **~3712–4629** typical warm HIT | in-process | Full `T10−T8`; request-type HIT also **3491–4788** common |
| **SSE first visible token** | **UNKNOWN** (post-flush wire) | wire | **Before** flush (1 historical sample, not warm HIT): first visible ≈ final. **Code now** flushes per token (`flushTradingLlmDeltas`); HTTP after-flush **never measured** (SSE report ABORT). If flush works: expect ≈ TTFT enqueue (~0.6–1.2s after prompt), not ≈ TOTAL |
| **final token / `final_response`** | **~3713–4832** typical TOTAL | in-process | Bench A **3816–4832**; request-type HIT fastest **3713**, median-ish **~3955** |
| **frontend rendering** | **UNKNOWN** | Chrome | Extension sync `updateStreamingAssistant` on delta; paint lag never instrumented. Expected ≪ LLM if deltas arrive |

### Canonical warm HIT samples (in-process)

**Reuse Bench A (HIT):**

| Run | TOTAL | Context | LLM | TTFT | Reuse |
|----:|------:|--------:|----:|-----:|-------|
| 4 | 4832 | 16 | 4629 | 618 | HIT |
| 5 | 3816 | 1 | 3712 | 646 | HIT |

**Request-type warm HIT examples (`live_context=hit`):**

| TOTAL | DATA | CTX | ENV | LLM | TTFT (in-proc) |
|------:|-----:|----:|----:|----:|---------------:|
| 3713 | 62 | 4 | 0 | 3643 | 874 |
| 3955 | 368 | 21 | 9 | 3491 | 1207 |
| 4330 | 103 | 7 | 0 | 4217 | 600 |

---

## Stack picture (warm HIT)

```
[~0] request start
[62–368 ms] market data overlay (Yahoo/Tick)     ← small vs LLM
[1–21 ms]   context reuse HIT                    ← solved
[~0–9 ms]   envelope / prompt assemble           ← negligible
[────────── LLM wall ~3.7–4.6 s ──────────]
   [0.6–1.2 s] TTFT
   [~3.0–4.0 s] remaining generation             ← LARGEST
[SSE first visible] UNKNOWN on wire post-flush
[Chrome paint]      UNKNOWN
[final]             ≈ TOTAL ~3.7–4.8 s
```

---

## SINGLE LARGEST CONTRIBUTOR:

**LLM full generation wall (~3.7–4.6 s)** — specifically **post-TTFT decode (~3.0–4.0 s)** as the biggest single slice; the whole LLM stage is **~90–97%** of known warm HIT TOTAL. Market context reuse is already **1–21 ms** and is **not** the bottleneck.

## TOTAL WARM (known):

**~3.7–4.8 s** in-process (Bench A **3816–4832 ms**; request-type HIT cluster **~3713–4330 ms**). Outlier HIT **22389 ms** = slow LLM, still LLM-bound (CTX 5 ms).

## WHAT IS UNKNOWN:

- Tonight / CME-open live `LIVE_LATENCY_TRACE` wall-clock (weekend — **not fabricated**)
- Post-SSE-flush **wire** first-visible on warm HIT (`deltaCount`, first delta size, firstVisible vs TTFT)
- **Chrome** paint delay (never timed)
- Post StructureFacts/HTF-opt **live** HIT remeasure (fixture ≠ live Yahoo/Tick; warm HIT LLM path unchanged by those opts)
- Exact isolated **prompt-construction** ms on warm HIT (bounded as small; no dedicated HIT mark)

---

## Stop

Audit complete. No code changes. No commit/push/deploy. No live run while CME closed.
