# Karen live context reuse

**Date:** 2026-08-14  
**Implemented:** reuse the existing live-engine / DecisionEnvelope snapshot when the market-state fingerprint is unchanged. Smallest safe change — engine detectors, architecture-v1, ICT, weighting, liquidity, decision rules, provenance, and PIT were not rewritten. SSE buffering was not changed.

**Backend:** in-process `streamChatReply` / `tryDeterministicMentorFollowUp` (same functions as `/api/chat/stream`). Did not start extra next-dev servers.

## Invalidation fingerprint

Reuse key: `buildLiveMarketReuseKey(feed, asOf, lastPrice)` → `formatLiveMarketReuseFingerprint`.

HIT only when **all** of these match the snapshot used to construct the last `DecisionEnvelope`:

| Input | What is compared | MISS reason |
|---|---|---|
| **1m + 5m + 15m + daily identity** | `count \| firstTime \| lastTime` per series | `bars` — new closed bar (timestamp or count). Forming-bar OHLC is **not** in this key. |
| **Last print** | absolute vs previous overlay, epsilon **0.25 MNQ** (1 tick; same as `majorLevelInteraction` / TV-backend agree) | `price` |
| **Session / AMD / macro** | `resolveSessionContext(asOf)` → `id\|amdPhase\|macroWindow` | `session` — forces full `initialize` so `activeSession` updates |
| **Cold / symbol** | no prior snapshot | `cold` |

**Derived structure is not a separate cache.** MSS/BOS, FVG, liquidity, and HTF state change only when bars, last print, or session change, so they invalidate via `bars` / `price` / `session`.

**A new chat message is not in the key and does not invalidate.**

### Follow-up fast path

When `shouldRefreshMarketState` is false (`Why?`, `Why not short?`, `What are you waiting for?`, `What would invalidate this?`):

1. If cached intel exists **and** session is unchanged **and** wall-clock 1-minute equals the snapshot `asOf` minute → reuse immediately (no Yahoo, no Tickstream, no engine).
2. Else Yahoo only (`skipLivePriceOverlay`, no Tickstream) and apply the bar+price fingerprint. Same-bar HIT still skips the engine rebuild.

### Yahoo request pin

`fetchAllTimeframesCached` pins the acquired bars on `AsyncLocalStorage` for **one request**. If the 45s cross-request TTL expires mid-request, later calls in that scope return the **same object**. The 45s TTL is **not** extended across requests.

Pin check (this session): `sameObject=true`, first=319–600ms, second=**0ms**.

## Correctness tests

`npm run test:live-context-reuse` — **49 passed, 0 failed** (synthetic-ny-am; identity path does not use live Yahoo).

Stale protection:

- same bar → **HIT**
- new closed 1m bar → **MISS** `bars`
- price &lt; 0.25 → **HIT**; price ≥ 0.25 → **MISS** `price`
- forming-bar 0.10 OHLC noise with same last print → **HIT**
- new session (overnight → NY PM, same bars) → **MISS** `session`
- another chat message → fingerprint unchanged

HIT vs FRESH REBUILD (reset engine, rebuild from the same fixture): **identical** market-context fingerprint, facts/provenance, structure, HTF bias, conflicts, thesis, stance, trade direction, target, invalidation. Clocks (`built_at`, `updatedAt`) excluded.

Follow-up unit: `tryReuseLiveDeskIntelligence` **0.29–0.55ms**; structured `Why not short?` **0.8–1.5ms** after warmup; no `mentor_followup_intel` rebuild.

## Before (audit, no reuse)

From `data/research/karen-live-latency-audit.md` — 5× `Give me the read` + `Why not short?`.

| Metric | Median | Worst |
|---|---:|---:|
| TOTAL | **39567ms** | **54880ms** |
| MARKET CONTEXT | **27806ms** | **40651ms** |
| LLM | 4918ms | 6986ms |
| first LLM token (in-process) | 34117ms | 51467ms |
| Follow-up Why not short? | **9683ms** (full intel rebuild) | |
| Envelope reuse | **NO** | |

## After — live 5-read + follow-up

Two in-process LLM benches (same phrase as the audit). Each 5-read set takes longer than one 1-minute bar during NY hours, so **MISS on `bars`/`price` is correct invalidation**, not a failed cache.

### Bench A — HIT chain once two reads landed in the same 1m

| Run | TOTAL | Context | LLM | TTFT | Reuse |
|---:|---:|---:|---:|---:|---|
| 1 | 33146 | 27453 | 5504 | 954 | MISS cold |
| 2 | 20346 | 7872 | 4266 | 989 | MISS price |
| 3 | 27851 | 23614 | 3475 | 771 | MISS bars |
| 4 | **4832** | **16** | 4629 | 618 | **HIT** |
| 5 | **3816** | **1** | 3712 | 646 | **HIT** |
| Follow-up Why not short? | **153** | 5 | — | — | **HIT** (Yahoo+fingerprint; Tickstream skipped) |

| Metric | Median | Worst |
|---|---:|---:|
| TOTAL | **20346ms** | **33146ms** |
| MARKET CONTEXT | **7872ms** | **27453ms** |
| LLM | **4266ms** | 5504ms |
| LLM TTFT | **771ms** | 989ms |
| TIME TO FIRST TOKEN (in-process) | 17069ms | 28596ms |
| Follow-up | **153ms** | |
| Cache hit rate (5 reads) | **2/5 (40%)** | |

Warm HIT reads are **LLM-bound ~3.8–4.8s** (context 1–16ms).

### Bench B — live tape, every read crossed a new 1m / 0.25 print (correct MISS)

5/5 MISS (`cold` / `bars` / `price`). Median TOTAL 49944ms. Follow-up 33553ms because a **new 1m bar** had closed (`live_context=miss:bars`). This is the stale-protection path working, not a regression of the HIT path.

### Rapid intel-only burst (no LLM)

One cold `buildDeskMarketIntelligence` then five immediate rebuilds:

| | ms | Result |
|---|---:|---|
| cold | 50406 | MISS cold |
| burst 1 | 37875 | MISS bars |
| burst 2 | 20946 | MISS price |
| burst 3 | 526 | MISS bars (incremental, not full rebuild) |
| burst 4 | **58** | **HIT** |
| burst 5 | **72** | **HIT** |
| Follow-up Why not short? | **36** | **HIT**, `followup_rebuilds_intel=no` |

Same-minute follow-up in an earlier LLM bench: **6ms**. Unit test: **0.8–1.5ms**.

## Before / after (primary: Bench A, same method as the audit)

| Metric | Before | After |
|---|---:|---:|
| TOTAL median | 39567ms | **20346ms** |
| TOTAL worst | 54880ms | **33146ms** |
| MARKET CONTEXT median | 27806ms | **7872ms** |
| MARKET CONTEXT worst | 40651ms | **27453ms** |
| Warm HIT context | n/a | **1–19ms** |
| Warm HIT total | n/a | **~3.8–4.8s** (LLM) |
| Follow-up | 9683ms rebuild | **6–153ms HIT** (36ms burst; 1.5ms unit) |
| Cache hit rate (5 LLM reads) | 0% envelope | **2/5 (40%)** — other 3 were real bar/price changes |
| LLM median | 4918ms | 4266ms |
| LLM TTFT | ~0.9–1.5s after prompt | **618–989ms** on HIT reads |

## Remaining SSE issue (not in this task)

`app/api/chat/stream/route.ts` still buffers every LLM token and sends one `delta` at the end. In-process TTFT above is the first OpenAI token; on the live panel the trader still waits until generation completes (~LLM total). Flush-on-token is a separate optimization.

Replay / architecture-v1 / trading rules were not changed. No commit / push / deploy.
