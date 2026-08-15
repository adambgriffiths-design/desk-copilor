# Karen — speed + connection priority audit

**Date:** 2026-08-14  
**Mode:** READ-ONLY synthesis. No implementation. No tick engine. No 5-read marathon. No architecture-v1 rewrite. No new caches. No extra next-dev. No commit/push/deploy. No process kills.  
**Method:** Existing research reports + current tree spot-check (`flushTradingLlmDeltas`, `peekLiveDeskIntelligenceCache`, explain-last path). Process list only. No new latency marathon.

**Sources (all present):**

| File | Role |
|---|---|
| `karen-live-latency-audit.md` | Before-reuse clocks |
| `karen-live-context-reuse.md` | Reuse landed; HIT/MISS benches |
| `karen-latency-by-request-type.md` | By-class hit/miss after reuse |
| `karen-sse-streaming.md` | SSE flush landed in code; HTTP after aborted |
| `karen-cold-newbar-context-profile.md` | Fixture CPU for cold / pure-1m / HTF-coincident |
| `karen-connectivity-regression-audit.md` | Green ONLINE semantics; 1.4.128 |
| `karen-architecture-roadmap.md` | Prior ranked roadmap (partially stale vs tree) |
| `karen-wait-followup.md` | Structured WAIT + **explain-last just landed** |
| `karen-connection-reliability.md` | Hop chain; receiving-end fix 1.4.118 |
| `karen-chart-read-noreply.md` | TEXT routing 1.4.119→1.4.129 |

---

## 1. SPEED BOTTLENECK TABLE

Numbers cited from reports only. **Legitimate** = fingerprint/product correctly requires work. **Unnecessary** = pays that work when the trader did not ask for a new decision, or transport hides already-ready tokens.

| Path | TOTAL (cited) | Where wall-clock goes | Legitimate? | Unnecessary? |
|---|---|---|---|---|
| **Warm HIT** (`live_context=hit`) | **~3.7–4.8s** typical (reuse Bench A runs 4–5: 4832 / 3816ms; request-type HIT set ~3713–4330ms; one HIT **22389ms** from slow LLM) | Yahoo+Tickstream **62–368ms**; MARKET CONTEXT **1–21ms**; DecisionEnvelope **0–9ms**; LLM **3.5–11s** typical (outlier ~20s); in-process TTFT **0.6–1.2s** after prompt | LLM rewrite of gated read | HTTP trading SSE historically buffered until done (before flush: one wire sample first visible **83424ms** ≈ total **83436ms**, `deltaCount=1`). Flush **in code** (`flushTradingLlmDeltas`); **HTTP after not measured** (SSE report ABORT). |
| **Genuine new-1m MISS** (`miss:bars` / cold) | Cold **88999ms** (CTX **80240ms**); real Yahoo new-bar read **52491ms** (CTX **45935ms**, LLM 5944ms); miss repeats **38–110s** | Market data: Yahoo usually **&lt;600ms**, Tickstream `*_live` **~8–10s** on some misses; **MARKET CONTEXT dominates 20–105s**; envelope **0–63ms** | New closed 1m / cold initialize / HTF length change must invalidate | Live wall ≫ fixture CPU: cold fixture **~7.8–8.1s**, pure 1m **1.3–3.1s**, HTF-coincident **~8–10s**. Extra live tax = I/O + GC/RAM thrash + occasional fullRebuild. On every pure 1m: full `buildStructureFacts` re-scan (**1.1–2.3s**) + `eqhForce=true` (**0.2–1.3s**). Yahoo **45s TTL &lt; miss-path** → duplicate Yahoo across consecutive misses. |
| **Follow-up HIT** (same-minute / fingerprint HIT) | **2–12ms** typical Why?; Why-not **3 / 9 / 95 / 1281ms** HIT set; Waiting **2–95ms**; reuse burst **36ms**; unit **0.8–1.5ms** | No LLM (`mentor_structured`). Same-minute skip: no Yahoo/Tickstream/engine. Else Yahoo-only + fingerprint HIT → CTX **~0–24ms** | Explain last spoken WAIT/envelope | None when HIT |
| **Follow-up MISS — explain-last** (`Why?` / `Why not short?` / waiting / invalidation) | **Before explain-last land:** Why? **6.9 / 29 / 80s**; Why-not worst **100676ms**; Waiting **35941ms** (CTX rebuild despite `refresh=false`) | Was: Yahoo+Tickstream + full intel rebuild | Product wants prior spoken call | **Unnecessary** to rebuild for “explain last.” **Code just landed** (`karen-wait-followup.md`): on clock MISS use `peekLiveDeskIntelligenceCache` / `getLastPipelineResult()` — still no Yahoo. **Not re-profiled after land.** |
| **Follow-up MISS — what-changed** (`What changed?` / new read) | Same class as new-bar / miss:bars when refresh allowed | Full market path | **Legitimate** refresh | Distinguished from explain-last: `CHANGE_ANALYSIS` **may** refresh; `CURRENT_MARKET_READ` always may |

### Bucket map (HIT vs MISS)

| Bucket | Warm HIT | Genuine new-1m MISS | Follow-up HIT | Follow-up MISS (pre–explain-last numbers) |
|---|---|---|---|---|
| Yahoo | 0–6ms hit / ≤~575ms miss | often miss after long prior | skipped or pin | paid again |
| Tickstream | 62–368ms quote typical | `*_live` **~8s** spike | skipped on same-minute | paid again |
| Market context / structure / liq / FVG | **1–21ms** | **20–80s+** live; fixture pure-1m structure **~70–75%** of bar path | **0–5ms** | **7–100s** |
| DecisionEnvelope | **0–9ms** | **16–397ms** (negligible) | n/a (structured) | n/a |
| LLM | **3.5–11s** (HIT bottleneck) | +3–18s if read | none | none |
| SSE / frontend | Flush coded; wire after **unproven**; casual already flushes | panel waits on CTX then LLM | structured `done` | waits on CTX |

**Dominant remaining compute after reuse:** genuine cold / `miss:bars` MARKET CONTEXT — not DecisionEnvelope, not warm HIT context.

---

## 2. CONNECTION FAILURE TABLE

From `karen-connectivity-regression-audit.md` + `karen-connection-reliability.md`. States: `DISCONNECTED | CONNECTING | CONNECTED | DEGRADED | RECONNECTING | FAILED`.

| Failure / risk | EXPECTED | ACTUAL (code / observed) | Recovery | Duplicates |
|---|---|---|---|---|
| **Green ONLINE ≠ usable backend+market** | Green = health + usable market path | **FAIL claim.** CSS `.dc-online` / `● LIVE` = `CONNECTED` **OR** `hasFreshTvLast()` (TV tick ≤2s). TV Last alone can paint green while DATA DEGRADED. Snapshot `CONNECTED` needs `backendUp` + pulse ≤60s — not health alone. | RECONNECT / fresh pulse | n/a |
| **120s local health cache** | Fresh `/api/health` JSON `ok:true` | `trustCachedLocal` / `HEALTH_TTL_MS` (120s) can return `{ ok: true, degraded: true }` **without** fresh health body | Manual RECONNECT clears cache | Coalesced `probePromise` OK |
| **TCP listen, app hung** | Not CONNECTED from TCP alone | **Observed** `:3000` listener + health timeout; `probeBase` fails unless cache lies | Cache TTL / clear on RECONNECT | None |
| **Health 200 ≠ levels/chat** | Heavy routes may fail independently | Prod: health **183–581ms** OK; `/api/levels` **&gt;25s timeout**; snapshot **14.5s** no last price; casual stream **377ms** OK | Do not raise timeouts | None |
| **Receiving-end (SW sleep)** | Wake SW, no tab reload | **Fixed 1.4.118:** wake 300→2400ms ×4; old permanent “Close tab” latch removed | ≤~4.5s wake budget (unit) | Keepalive single port OK |
| **Duplicate WS / voice / tracker** | One session per rev | **Fixed 1.4.118** rev guards; Realtime closes leftover before new | Reinject same rev returns early | Unit PASS |
| **Reconnect ×10 storm** | ≤1 in-flight probe/timer | Unit/sim: no timer thrash; manual RECONNECT **resets retryCount** (never reaches FAILED via max-retries) | Auto loop max 10 | OK |
| **`pingFailStreak &lt; 3` optimism** | Fail closed sooner | Content can keep treating backend as up briefly | Heartbeat 60s | `pingInFlight` OK |
| **Rev / deploy skew** | Extension matches API | Extension **1.4.128+** vs local package **1.4.84** vs prod **1.4.64** (still bounced `needsChartRead` when last probed) | Deploy / use local Ready | Submodule rev lag WATCH |
| **Chart-read empty / timeout** | Conversational → TEXT stream | Routing fixed **1.4.119–1.4.129** in code; live TV **0/N unverified** | Fallthrough to TEXT | Screenshot path still for ANALYSE MARKET |
| **Live TV + mic E2E** | Prove ticks/STT/TTS | **UNVERIFIED** every connection audit | — | — |

**Verdict:** Green ONLINE does **not** mean a usable backend **and** market path. Independent hops (MARKET / DATA / KAREN / CHAT) are correct design; green OR with TV Last is the false-confidence bug.

---

## 3. LOCAL RESOURCE BOTTLENECK TABLE

Snapshot at audit time. **Do not kill.** Classify desk-copilot vs Cursor.

| PID | Kind | CommandLine (truncated) | CPU (s) | WS / PM | Note |
|---|---|---|---|---|---|
| **8160** | desk-copilot **next-dev server** | `…\next\dist\server\lib\start-server.js` | ~9.5 | ~119 MB WS | Listening **`:3000`** (only Listen port in 3000/3001/3010/3020) |
| **23636** | desk-copilot next CLI | `next dist\bin\next` **dev** | ~2.3 | ~40 MB | Parent of start-server |
| **16056** | cmd | `next dev` | ~0 | ~8.5 MB | Shell wrapper |
| **24064** | npm | `npm-cli.js` **run dev** | ~0.7 | ~33 MB | One `npm run dev` chain |
| **15216** | desk-copilot **leftover profiler** | `tsx` → `scripts/research-request-vs-event-impact.ts` | **~131** | **~655 MB WS / ~1 GB PM** | **Leftover research script — high mem/CPU** |
| **12240 / 17148 / 15312** | npx/tsx/cmd wrappers | same profiler chain | low | ~0–53 MB | Supporting leftover profiler |
| **10372** | esbuild (desk-copilot) | `@esbuild\win32-x64\esbuild.exe --service=0.28.2 --ping` | ~0.2 | ~1.4 MB | Likely tied to tsx profiler |
| **7008 / 14812 / …** | **Cursor** | Cursor helper `node.exe` → `tsserver.js` / typings | high on tsserver (~72s) | tsserver ~534 MB WS | IDE — not desk-copilot app |
| Discord / Notion / Cursor utility NodeServices | other apps | embedded Node | — | — | Ignore for Karen |

**Findings:**

- **One** active `next-dev` on **:3000** at this snapshot (earlier listing in the same session had shown **two** `start-server.js` instances ~135 MB + ~551 MB — treat duplicate next-dev as a **recurring risk**, not necessarily present every second).
- **Leftover profiler** `research-request-vs-event-impact.ts` is the clearest local resource bottleneck (~0.65–1 GB + elevated CPU).
- Prior SSE session: machine **disk 100% / RAM 92%** — do not resume HTTP/in-process marathons on 8GB.
- No kill performed.

---

## 4. What is already fixed

| Item | Evidence |
|---|---|
| Live fingerprint reuse (engine + intel) | `karen-live-context-reuse.md` — 49/49 tests; warm HIT CTX **1–21ms**; totals **~3.8–4.8s** LLM |
| Same-minute / HIT follow-up skips rebuild | Before **9683ms** → after HIT **2–153ms** (unit 0.8–1.5ms) |
| Yahoo same-request pin | Second fetch **0ms** inside one request |
| Structured WAIT / why-not / invalidation copy | `karen-wait-followup.md` — `mentor_structured`, no vague “clear signal” |
| **Explain-last vs what-changed split** | Just landed: explain-last must not rebuild on clock MISS (`peekLiveDeskIntelligenceCache`); what-changed may refresh |
| Conversational read → TEXT stream (not screenshot steal) | Chart-read / 1.4.128–1.4.129 routing; unit text-read **85/85** |
| Casual failure bubble not published as success | 1.4.128 |
| Trading SSE flush-on-token (code) | `lib/sse-trading-flush.ts` + `route.ts` `flushTradingLlmDeltas`; unit PASS |
| Receiving-end SW wake / no permanent Close-tab latch | 1.4.118; `test:connection` PASS |
| Duplicate Realtime/voice/tracker reinject guards | 1.4.118 |
| General/casual stay off market pipeline | intel=0; medians **895ms** / **12ms** |
| Research incremental replay (research only) | PASS / 4.44× — **not** live architecture |

---

## 5. What is still genuinely broken

| Item | Evidence | Severity |
|---|---|---|
| **Cold / genuine `miss:bars` context still tens of seconds live** | Cold CTX **80s**; new-bar CTX **46s**; miss repeats **20–105s**. Fixture shows CPU should be ~8s / ~1–3s / ~8–10s — live wall still far higher | **P0 performance** |
| **Pure new-1m still full structure + forced EQH** | Cold-newbar: `buildStructureFacts` every bar; `eqhForce=true` → `eqhEqlReused=0` | **P0 compute** |
| **HTTP first-visible after SSE flush unproven** | Before: first visible ≈ total; after marathon **ABORT** (RAM/disk). Unit only | **P1 UX** (HIT path) |
| **Explain-last miss path not re-measured after land** | Code claims no Yahoo on MISS; last profile still shows **7–101s** miss tails | **P1 verify** |
| **Tickstream `*_live` ~8–10s** | Latency + request-type audits | **P2 I/O** |
| **Yahoo 45s TTL &lt; miss-path duration** | Duplicate Yahoo across slow misses | **P2** |
| **Green ONLINE false confidence** | TV Last OR; 120s health cache; hung TCP | **P1 connection truth** |
| **Live TV + unpacked extension unverified** | Chart-read / connectivity: **0/N** | **P1 reliability** |
| **Prod API behind (1.4.64)** when last probed | `needsChartRead` bounce; levels timeout | **P1 if using prod** |
| **Local resource pressure** | Leftover profiler ~0.65–1GB; prior 8GB freeze; possible duplicate next-dev recurrence | **P1 ops** |
| Quality-gate `state_hash` omits structure; unseen wick / PDH truth | Freshness / blocker board — truth, not TTFT | Separate track |
| Tick/event layer | Explicitly **do not build** until trade-outcome impact study | Out of scope |

---

## 6. The SINGLE safest highest-impact next fix

**Prove the already-landed trading SSE flush on HTTP with one warm-HIT `Give me the read` against the existing `:3000` — no 5-read marathon, no extra next-dev, no OpenAI storm beyond that single read.**

**Why this one:**

1. Warm HIT context is **already solved** (CTX **1–21ms**). Remaining HIT wait is LLM + whether the panel sees tokens early.
2. Flush code is **already in the tree** (`flushTradingLlmDeltas`); the only gap is the aborted wire proof (before: first visible **83424ms** ≈ total, `deltaCount=1`).
3. Lowest risk: measurement / confirmation, not engine rewrite, not caches, not tick loop, not architecture-v1.
4. Expected if live: `deltaCount ≫ 1`, first visible ≈ in-process TTFT (**~0.6–1.2s** after prompt ready), total unchanged (~4s HIT).

**If that probe already shows flush working:** next owned fix is **re-measure explain-last on a deliberate `miss:bars` clock** (confirm **no** Yahoo/intel rebuild — should be ms, not 7–101s). Only after that: cold-newbar’s safest engine step — **stop `eqhForce=true` on `afterClosedBar`** (use existing `updateEqhEqlLiquidity`), still without rewriting structure/ICT.

**Do not** start tick engine, large benchmarks, architecture-v1 rewrite, or extra next-dev. **Do not** kill processes from this audit — list only (leftover `research-request-vs-event-impact` is the obvious manual cleanup candidate when the user chooses).

---

*End of audit. No implementation performed.*
