# KAREN — Live latency gap analysis

**When:** 2026-08-14 (analysis only)  
**Mode:** EXISTING MEASUREMENTS ONLY — no implementation, no live Yahoo/Tickstream runs, no next-dev, no commit/push/deploy  
**Stage labels:** `lib/live-latency-trace.ts` — `market_data_*`, `market_context_*`, `decision_envelope_complete`, `llm_*`, `sse_first_visible_token`, `final_response`

## Sources

| Label | Doc |
|---|---|
| A Historical | `karen-weekend-e2e-historical-ui.md` |
| B Warm HIT | `karen-live-context-reuse.md` (+ post-opt summary in `karen-live-latency-remeasure-post-opts.md`) |
| C New 1m MISS | `karen-live-latency-audit.md`, `karen-latency-by-request-type.md`, `karen-cold-newbar-context-profile.md`, `karen-structure-facts-incremental.md`, `karen-htf-append-only.md` |
| Trace schema | `karen-live-latency-instrumentation.md` |

**UNAVAILABLE** = not broken out in that source. Numbers are never invented.

---

## 1. Table A vs B vs C

All times in **ms**. Live trading SSE historically **buffers until generation completes**, so panel first-visible ≈ `final_response` when buffering holds.

| Stage | A. HISTORICAL FIXTURE | B. WARM LIVE HIT | C. NEW 1m LIVE MISS |
|---|---:|---:|---:|
| **Path / sample** | `synthetic-ny-am@50` weekend E2E; `dataMode=HISTORICAL_FIXTURE` | Reuse Bench A r4–5 (`live_context=hit`) | Audit median/worst + request-type new-bar / cold; miss reason `bars` / `cold` |
| **HIT / MISS** | N/A (fixture — not live reuse key) | **HIT** | **MISS** (`bars` new 1m; cold = `cold`) |
| **market data** (`market_data_complete − …`) | **0** — Yahoo/Tickstream **not requested** | Yahoo+tick still acquired on reads; HIT context skips engine. Follow-up HIT ≈ **0** Tickstream. Read HIT DATA **62–368** (request-type warm HIT) | Audit median **~425**, worst **~8917** (Tickstream `*_live` **~8s** on 2/5). New-bar read DATA **137**. Cold DATA **8617** (tick **8267**) |
| **market context** (`market_context_complete − market_data_complete`) | UNAVAILABLE as leaf; whole path **895** | **1–16** (Bench A); request-type HIT **4–21** | Audit median **27806**, worst **40651**. New-bar read **45935**. Cold **80240**. Fixture CPU post-opt pure 1m apply **~579–759** (not live wall) |
| **DecisionEnvelope** | UNAVAILABLE (in 895 total) | Reused / assemble **&lt;10** typical; request-type HIT **0–9** | Audit **16–397** (median **57**). New-bar **34**. Cold **63** |
| **LLM** (full gen) | UNAVAILABLE inside 895 (fixture mentor/replay path) | **3712–4629** (Bench A HIT); request-type HIT typical **3.5–4.3s** | Audit median **4918**, worst **6986**. New-bar read **5944** |
| **first token** | **895** (= final; in-process fixture) | LLM TTFT **618–646** (Bench A); in-process first token after context ≈ TTFT when HIT | In-process TTFT audit median **34117** (dominated by pre-LLM). New-bar **47542**. LLM TTFT after ready **~0.9–1.5s** |
| **SSE** (first visible) | **895** (in-process; not live panel wire) | ≈ **TOTAL** if trading SSE still buffered (flush not re-proven on wire in post-opt remeasure) | ≈ **TOTAL** (audit: HTTP buffers until T10 / final) |
| **final response** | **895** | **3816–4832** (Bench A HIT) | Audit median **39567**, worst **54880**. New-bar read **52491**. Cold **88999** (quality_gate, LLM n/a) |
| **Engine leaves (when measured)** | Fixture path — no live `syncLiveEngineFromFeed` | Structure/HTF **0** (skipped on HIT) | Pre-opt pure 1m shared miss **2697**; structure **1076–2332**; EQH force **232–1262**. Post-opt fixture: structure **373–601**, EQH **~200**, m5 append **2685** (was **11315**), m15 **1069** (was **11075**). Live post-opt end-to-end: **UNAVAILABLE** |

### Compact totals

| | A Historical | B Warm HIT | C New 1m MISS |
|---|---:|---:|---:|
| Final | **895** | **~3.8–4.8s** | **~40s median** (audit); **~52s** real new-bar; **~89s** cold |
| Dominant stage | Entire fixture path (~895) | **LLM** | **market context** |

---

## 2. Why historical ≪ live new-bar (measured causes)

Gap: **~895ms** (A) vs **tens of seconds** (C). Not DecisionEnvelope (ms-class on both live paths).

| Cause | Measured evidence | A | C |
|---|---|---|---|
| **No live I/O** | Weekend E2E: Yahoo/Tickstream requested = **no** | 0 ms market feed | Yahoo usually &lt;600ms; Tickstream `*_live` **~8s** spikes; cold tick **8267ms** |
| **MARKET CONTEXT rebuild** | Audit: context median **27.8s**, worst **40.7s**; new-bar read context **45.9s**; cold **80.2s** | Fixture / replay — not `syncLiveEngineFromFeed` at live depth | MISS `bars` / `cold` forces engine work |
| **Engine depth / rebuild class** | Cold profile fixture initialize **~7.8–8.1s** @ 1380 bars; live cold `lastFullMs≈80s`. HTF-coincident fullRebuild fixture **~8–10s** pre append-only; m5 append was **11.3s** | Small synthetic slice @ bar 50 | Live NQ depth + GC; miss often `FULL×1` or multi struct/EQH |
| **Structure / EQH on every new 1m** | Pre-opt pure 1m structure **1.1–2.3s**; EQH force every closed bar | Not on live miss path | Part of context wall; post-opt fixture lowers leaves but **live wall not re-measured** |
| **LLM after context** | Audit LLM **4–7s**; new-bar **5944ms** | Not the 895 vs 40s gap (LLM alone ≪ context) | Adds after context; SSE buffer makes UI wait for full gen |
| **SSE buffering** | Audit / reuse: trading stream holds tokens until complete → first UI ≈ final | In-process first=final **895** | Hides in-process LLM TTFT; does **not** explain 20–80s pre-LLM wait |

**Exact answer:** Historical is fast because it never enters the live market-data + live-engine context path. Live new-bar is slow because **`market_context` after price** dominates (measured **~28–80s** on miss/cold), with secondary live-only I/O (Tickstream live **~8s**) and then LLM **~4–7s**. Envelope is negligible.

Warm HIT (B) proves the split: same live Yahoo/tick overlay + spoken LLM, but context **1–16ms** → total **~4s**. The tens-of-seconds gap is **MISS-path context**, not “LLM is slow” and not “historical is a different product number by chance.”

---

## 3. Single largest remaining **live-only** bottleneck

**`market_context` (live engine / observation after price) on MISS `bars` / `cold`.**

- Measured live: median **~28s** (audit), **~46s** (real new-bar read), **~80s** (cold).
- Absent on historical (A) and effectively absent on warm HIT (B: **1–16ms**).
- Not DecisionEnvelope, not LLM TTFT after ready, not SSE (SSE only hides post-prompt tokens).

Path caveat (post-opt fixture, live wall **UNAVAILABLE** tonight): after StructureFacts incremental + HTF append-only, fixture pure-1m engine is **sub-second–low-second**; m5 coincident append still **~2.7s**. Those leaves do not yet replace the **measured live** context wall until a RTH LIVE_LATENCY_TRACE remeasure.

---

## 4. Safest optimization target (no implementation)

**For closing historical ↔ live new-bar gap (MISS path):** next safest leaf already identified and parity-scoped — **EQH force-off / `updateEqhEqlLiquidity` reuse** on closed-bar (stop `eqhForce=true` every bar). Detectors / architecture-v1 / ICT untouched; StructureFacts + HTF append-only already done.

Do **not** treat SSE flush or LLM shortening as the fix for tens-of-seconds new-bar: those matter on **HIT** (~4s LLM-bound) after context is already cheap.

Do **not** run another live 5-read marathon until RTH + healthy API + `LIVE_LATENCY_TRACE=1` can publish post-opt live A/B/C walls.

---

## 5. Stage-label map (reference)

| Report column | Trace stage(s) |
|---|---|
| market data | `market_data_started` → `market_data_complete` (T3→T4; Yahoo + Tickstream) |
| market context | `market_context_started` → `market_context_complete` (T5→T6) |
| DecisionEnvelope | `decision_envelope_complete` (T7) |
| LLM | `llm_request_started` → `final_response` gen window (T8→T10 / done) |
| first token | `llm_first_token` (T9); in-process ≠ panel when SSE buffers |
| SSE | `sse_first_visible_token` (T11) |
| final response | `final_response` (T12) |

---

## STOP

Report only. No code, no benches, no deploy. Live post-opt end-to-end remains **UNAVAILABLE** per `karen-live-latency-remeasure-post-opts.md`.
