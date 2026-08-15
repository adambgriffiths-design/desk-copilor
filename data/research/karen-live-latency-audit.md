# Karen live latency audit

**Date:** 2026-08-14T17:21:08.988Z  
**Backend:** in-process `streamChatReply` (same functions as `/api/chat/stream`). Next `/api/health` on `:3000`/`:3001` was hung, so HTTP T0/T11/T12 could not be measured on the wire.  
**Exact phrase:** `Give me the read`  
**requestIds:** `live-lat-mst7nal1-1` … `live-lat-mst7quso-5`, follow-up `live-lat-follow-mst7r5w1`  
**Not modified:** replay, architecture-v1, trading logic. Spans are measurement-only.

## Routing (exact phrase)

- mentor intent: `CURRENT_MARKET_READ`
- desk route: `trading`
- `mustUseTradingStream`: **true**
- `needsFullChartRead`: false
- `isChartReadCommand`: false
- extension stealScreenshot: **false**
- API `needsChartRead` bounce: **false**

This phrase **does** enter the TEXT trading stream (not the screenshot path). Earlier `get the read` / `CHART_READ_EMPTY_RESPONSE` is a different exact-command path.

## How to read the clocks

T0 = script submit (in-process ≈ T1).  
T2 = intent. T3 = Yahoo bars. T4 = Tickstream/live price.  
T5 was originally marked at intel *start* (before Yahoo), so printed **T5-T4 is negative**. Corrected **MARKET CONTEXT = T6−T4** (engine + observation after price). Instrumentation now marks T5 after T4 for any future run.

**HTTP UI vs this run:** `app/api/chat/stream/route.ts` still **buffers every LLM token**, then sends one `delta`. In-process TTFT below is **first OpenAI token**. On the live panel, the trader would not see text until **T10** (full generation).

## Corrected per-run buckets

| Run | TOTAL | Yahoo T3-T2 | Tickstream T4-T3 | Context T6-T4 | Decision T7-T6 | LLM T10-T8 | LLM TTFT T9-T8 | Rest of gen T10-T9 | Cache | Price source |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | 54880 | 575 | **8342** | **40651** | 41 | 4918 | 1505 | 3413 | miss | tickstream_live |
| 2 | 39567 | 319 | 106 | **27806** | 397 | 6986 | 1536 | 5450 | miss | tickstream_quote |
| 3 | 22828 | 3 | **8150** | 7963 | 16 | 6678 | 1223 | 5455 | hit | tickstream_live |
| 4 | 39917 | 289 | 119 | **35120** | 57 | 3964 | 1163 | 2801 | miss | tickstream_quote |
| 5 | 12717 | 16 | 404 | 7438 | 59 | 4641 | 855 | 3786 | hit | tickstream_quote |

Yahoo 45s cache **expires during a 12–55s read**, so runs 2 and 4 refetch (duplicate Yahoo). Tickstream `*_live` path is ~8s; `*_quote` is ~0.1–0.4s.

### RUN 1 (`live-lat-mst7nal1-1`)
TOTAL 54880 · TTFT (first LLM token) 51467 · intel=1 llm=1

### RUN 2 (`live-lat-mst7okc2-2`)
TOTAL 39567 · TTFT 34117 · T8-T7 prompt/learned-rules **3946ms** extra after envelope

### RUN 3 (`live-lat-mst7pg1m-3`)
TOTAL 22828 · TTFT 17373 · Yahoo hit, Tickstream live 8150ms

### RUN 4 (`live-lat-mst7pytt-4`)
TOTAL 39917 · TTFT 37116

### RUN 5 (`live-lat-mst7quso-5`)
TOTAL 12717 · TTFT 8931 · warmest run (Yahoo hit + quote)

## Follow-up: Why not short? (`live-lat-follow-mst7r5w1`)

- source: **`mentor_structured`** (no LLM)
- TOTAL: **9683ms**
- Yahoo miss + Tickstream quote + **full intel rebuild** (`mentor_followup_intel=1`)
- `shouldRefreshMarketState` was **false**, but `tryDeterministicMentorFollowUp` still calls `buildDeskMarketIntelligence`
- **FOLLOW-UP REUSES EXISTING ENVELOPE: NO**

## Summary

| Metric | Median | Worst |
|---|---:|---:|
| TOTAL | **39567ms** | **54880ms** |
| TIME TO FIRST LLM TOKEN (in-process) | 34117ms | 51467ms |
| TIME TO FIRST UI TOKEN (HTTP as coded) | ≈ TOTAL | ≈ TOTAL |
| MARKET DATA (Yahoo + Tickstream) | 425ms | 8917ms |
| MARKET CONTEXT (engine after price) | **27806ms** | **40651ms** |
| DECISION (envelope/quality gate) | 57ms | 397ms |
| LLM (full generation) | 4918ms | 6986ms |
| STREAM (HTTP buffer) | not on wire; code holds until T10 | same |
| UI (in-process remaining tokens) | ~3.8s | 5.5s |

**MEDIAN LIVE LATENCY:** 39567ms  
**WORST LIVE LATENCY:** 54880ms  
**TIME TO FIRST TOKEN:** 34117ms in-process first LLM token; **~40s on the panel** because SSE is buffered.

**BIGGEST BOTTLENECK:** **B. MARKET CONTEXT COMPUTATION** — `syncLiveEngineFromFeed` / observation after price (median **27.8s**, worst **40.7s**).  
**SECOND BIGGEST:** **E. LLM TOTAL GENERATION** (median **4.9s**, worst **7.0s**) — and on HTTP this is fully silent because of **F. STREAM TRANSPORT** buffering. Tickstream `*_live` (~8s) is the worst **A. MARKET DATA** spike, not the median.

### Waiting-on (measured)

| | What | Verdict |
|---|---|---|
| A | MARKET DATA | Yahoo usually &lt;600ms; Tickstream live **~8s** on 2/5 reads |
| B | MARKET CONTEXT | **Dominant** 7–41s |
| C | DECISION ARCHITECTURE | **Negligible** 16–397ms |
| D | LLM TTFT | 0.9–1.5s after prompt is ready |
| E | LLM TOTAL GENERATION | 4–7s |
| F | STREAM TRANSPORT | HTTP **hides D**; UI waits for E |
| G | FRONTEND RENDERING | not measured (no TV panel) |
| H | RETRIES / RECONNECTS | none in these six runs |
| I | UNNECESSARY DUPLICATE WORK | **YES** (below) |

**DUPLICATE WORK:** **YES**

- One user read → **1 intel + 1 envelope + 1 LLM** (no double LLM).
- Intent classified **twice** (route + `buildChatSystemPrompt`).
- Yahoo cache 45s **shorter than a slow read**, so consecutive reads refetch.
- Quality gate builds envelope; LLM then **rewrites** the same read in prose.
- HTTP stream **drops incremental tokens** until complete.
- Follow-up **rebuilds market intel (~9.7s)** even when `marketStateRefresh=false`.

**FOLLOW-UP REUSES EXISTING ENVELOPE:** **NO**

## Recommended first optimization (not implemented)

**Skip / reuse incremental live-engine snapshot when the bar fingerprint is unchanged** (still run Tickstream overlay + quality gate). Do not strip concepts, provenance, or the quality gate.

**EXPECTED SPEEDUP:** median read **~40s → ~6–12s** (drop ~28s context; keep ~5s LLM + occasional Tickstream). Warm fingerprint-hit reads could approach **LLM-only ~5s**, or **~1.5s TTFT** if SSE is flushed (second optimization, not first).

Follow-up expected: **~9.7s → &lt;100ms** if the existing envelope is reused when `shouldRefreshMarketState` is false.

Replay / architecture-v1 / trading rules were not changed. No commit/push/deploy.
