# Karen architecture roadmap (evidence synthesis)

**Date:** 2026-08-14  
**Mode:** synthesis only. No implementation. No new engine, tick loop, cache layer, candidate filter, replay rewrite, or SSE rewrite. No commit / push / deploy. `app/api/chat/stream/route.ts` was not edited (SSE first-token work may still be in flight). No extra `next-dev`.

This is the **live chat copilot** roadmap (latency, reuse, freshness, reliability). It is **not** `karen-decision-architecture-roadmap.md` (research architecture-v1 freeze / TRAIN-VAL-OOS / ablation). Do not mix those tracks.

**Research incremental replay is a separate problem.** It is already **PASS / 4.44×** (`karen-incremental-replay-parity.md`). Do not use that speedup as a reason to rebuild live architecture.

---

## Source files

| File | Present? | Role |
|---|---|---|
| `data/research/karen-live-latency-audit.md` | **Yes** | Before-reuse in-process clocks (5× `Give me the read` + follow-up) |
| `data/research/karen-live-context-reuse.md` | **Yes** | Reuse implemented; 49/49 tests; after-reuse benches |
| `data/research/karen-latency-by-request-type.md` | **Yes** | Profile only; 8 classes × 5 trials + new-bar probes (~26 min) |
| `data/research/karen-live-decision-freshness.md` | **Yes** | Request-current vs tick-current; stale paths; probe A–G |
| `data/research/karen-sse-streaming.md` | **Missing** | SSE work still in flight; do not treat as done |
| `data/research/karen-sse-streaming-before.json` | Partial | Incomplete HTTP probe (aborts / 404 / one buffered 200) |
| `data/research/karen-chart-read-noreply.md` | **Yes** | Live reliability / empty chart-read; 1.4.119 then 1.4.128 |
| `data/research/karen-incremental-replay-parity.md` | **Yes** | Research replay only — already PASS; do not redo |

Supporting (not re-litigated here): `karen-wait-followup.md` (structured WAIT path exists), `karen-research-candidate-filter-audit.md` (**not safe** to enable), `karen-research-readiness-audit.md` + `project-control-blocker-board.md` (historical NQ / PDH live FAIL), `karen-connection-reliability.md` (prod still 1.4.64 when last probed).

**This turn did not run a historical impact study.** Cheap fixtures exist and are named in §4; no new numbers were invented.

---

## What is already true (do not relitigate)

Live market-context reuse is **implemented and tested (49/49)**.

Latency (in-process), from the latency audit + reuse report:

| | Before reuse | After reuse (Bench A) |
|---|---:|---:|
| TOTAL median | 39.6s | 20.3s |
| TOTAL worst | 54.9s | 33.1s |
| MARKET CONTEXT median | 27.8s | 7.9s |
| Warm HIT | n/a | ~4s LLM (context 1–16ms) |
| “Why not short?” | 9.7s rebuild | HIT 6–36ms (unit 0.8–1.5ms; one LLM bench 153ms) |

By request type (reuse already landed):

- General knowledge ~**895ms**, casual ~**12ms**, **stay OFF** the market pipeline (intel=0).
- Cold market read still ~**89s**.
- Repeated read median ~**49s** because **miss:bars** after a slow prior (new 1m).
- Warm HIT reads ~**4s**.
- Same-bar WAIT follow-ups **2–12ms** on HIT; miss tail still tens of seconds (worst “Why not short?” **100.7s**).

Karen is **request-current, not tick-current**. That is a **design tradeoff**, not automatically a bug.

Fingerprint today: bar identity (1m/5m/15m/daily `count|first|lastTime`), last print **≥ 0.25 MNQ** on new reads, session/AMD/macro. **Forming-bar OHLC is not in the key.** Follow-ups in the same wall-clock minute can ignore price. Unseen intra-bar extremes (e.g. PDH wick never overlayed) can leave PDH **UNTOUCHED**.

Intended shape **if** a tick/event layer is ever built (not a build order):

```
FAST TICK / EVENT STATE  (price thresholds, level crosses, session transitions)
+ LAST VALID STRUCTURAL SNAPSHOT  (incremental, not full rebuild)
= CURRENT DECISION
```

Not every tick → full rebuild. Not cache forever → stale decision. **Do not build this until the impact study in §4 says tradable outcomes move.**

---

## 1. What we optimized vs what we only measured

| Item | Status | Evidence |
|---|---|---|
| Live fingerprint reuse (engine + intel + same-minute follow-up) | **Done** | `karen-live-context-reuse.md`: 49/49 `test:live-context-reuse`. HIT = identical structure/stance/thesis (clocks excluded). |
| Skip intel rebuild on HIT “Why not short?” / WAIT follow-ups | **Done** (HIT path) | Before: 9683ms always rebuilt. After HIT: 2–12ms typical; 6–36ms burst; 0.8–1.5ms unit. `followup_rebuilds_intel=no`. |
| Yahoo same-request pin (`AsyncLocalStorage`) | **Done** | Reuse report: `sameObject=true`, second fetch **0ms**. 45s **cross-request** TTL not extended. |
| Structured WAIT / why-not / invalidation copy | **Done** (presentation) | `karen-wait-followup.md`: `mentor_structured`, no vague “clear signal”. |
| Conversational read → TEXT stream (not screenshot) | **Done in code, live TV unverified** | `karen-chart-read-noreply.md`: 1.4.119 routing; 1.4.128 `"get the read"` / `"Give me the read"` → TEXT. Unit 85/85 text-read, 135/135 intent. Live TV **not driven**. |
| Casual “Berlin” failure bubble | **Done in code, live TV unverified** | 1.4.128: never publish `CASUAL_LLM_FAILURE_REPLY` as instant success. Local casual SSE 1/1 before hung `:3000`. |
| Research incremental replay (`CURRENT` vs `OPTIMIZED`) | **Done (research only)** | `karen-incremental-replay-parity.md`: **PASS**, PIT PASS, **4.44×** checkpoint (89.72s → 20.22s). Default remains CURRENT. **Not live architecture.** |
| Live latency clocks (before reuse) | **Profiled** | `karen-live-latency-audit.md`: median 39567ms, context 27806ms, HTTP first UI token ≈ TOTAL because SSE buffered. |
| Latency by request class (after reuse) | **Profiled** | `karen-latency-by-request-type.md`: 5×8 classes + new-bar probes. HIT vs miss separated. |
| Freshness / stale paths | **Profiled** | `karen-live-decision-freshness.md`: code + `test-live-decision-freshness.ts`. Scenarios A–G. PDH 30214→30217→30215 probe. |
| HTTP SSE first-visible-token | **Still open** (in flight) | `karen-sse-streaming.md` **missing**. Before JSON: 3/5 reads aborted or 404; **1/5** SSE 200 with `deltaCount=1`, `firstVisibleMs=83424` ≈ `totalMs=83436`. Casual stream already flushes. Do not start a second rewrite. |
| Cold / `miss:bars` context cost | **Still open** | Cold **88999ms** (context **80240ms**, Tickstream live 8267ms). New-bar read **52491ms** (context 45935ms). Simulated new-bar follow-ups 34–110s (Yahoo identity fight — not a clean incremental bar). |
| Follow-up **miss** tail | **Still open** | `shouldRefreshMarketState=false` still calls `buildDeskMarketIntelligence` on `miss:bars` / `miss:price`. Why? 6.9–80s; Why not short? **100676ms**; Waiting **35941ms**. |
| Tickstream `*_live` ~8s | **Profiled, still open** | Latency audit: 2/5 reads ~8s live vs 0.1–0.4s quote. Request-type: 8–10s on some misses. |
| Yahoo 45s TTL < miss-path duration | **Profiled, still open** | Consecutive misses refetch Yahoo. Request pin only helps **inside** one request. |
| Quality-gate `state_hash` omits structure | **Profiled, still open** | Freshness: `candleHash \| lastPrice \| quality.flag`. Probe: stale TV ≥20 candles + new Yahoo 1m, same lastPrice → ctx PDH `BREACHED`, **envelope object unchanged**. |
| Live TV + unpacked 1.4.128 | **Still open** | Chart-read report: live TV + mic **0/N**. Connection report: TV hops UNVERIFIED. Prod was **1.4.64** and bounced `needsChartRead`. |
| PDH / live market-state truth | **Still open** | Blocker board: local fixture PASS, **prod LIVE FAIL** (old detector + no deploy). Freshness: unseen 30217 wick → PDH `UNTOUCHED`. Separate bugs; both are truth, not latency. |
| Tick / event layer | **Still open — do not build** | No trade-outcome counts. Freshness shows **state** gaps only. |
| Request-current vs tick-current **impact study** | **Specified, not run** | §4. Fixtures exist; this turn did not execute it. |
| Historical NQ months / research backtest / OOS | **Still open (research track)** | On disk: 1 day (1381 bars) + 1 week (6880). NT GUI download **not started**. Not live-latency critical path. |
| Candidate filtering for research replay | **Profiled — do not enable** | Aug 12 NY AM: filters 100% fire or 0% fire. Not safe. Not live critical path. |

---

## 2. Where time actually goes (by request class)

Clocks are **in-process** unless noted. HTTP trading SSE still hides incremental tokens until the coded buffer/flush lands; casual SSE already flushes.

### 2.1 Class medians (hit **and** miss mixed)

From `karen-latency-by-request-type.md` (n=5 unless noted):

| Request | Median TOTAL | Main cost | Notes |
|---|---:|---|---|
| Repeated `Give me the read` | **49318ms** | CONTEXT on `miss:bars` (4/5 crossed a new 1m) | Prior read lasted >60s → cannot be same-bar |
| `Give me the read` | **22389ms** | LLM on HIT; CONTEXT on cold/miss | Fastest HIT 3713ms; cold 88999ms |
| `Why?` | **6862ms** | CONTEXT on miss | HIT 12ms / 127ms |
| `Get the read` (TEXT, not vision) | **4863ms** | LLM | Miss #5: 103392ms |
| General knowledge | **895ms** | gpt-4o-mini | intel=0 every trial |
| `Why not short?` | **95ms** | none on HIT | One miss: **100676ms** |
| `What are you waiting for?` | **72ms** | none on HIT | One miss: 35941ms |
| Casual chat | **12ms** | canned, no LLM | intel=0 |

### 2.2 Separate: cold miss vs warm HIT vs follow-up HIT vs follow-up miss

| Path | n (this evidence) | TOTAL | MARKET CONTEXT | LLM | Legitimate? |
|---|---|---:|---:|---:|---|
| **Cold miss** (`miss:cold`, full initialize) | 1 | **88999ms** | **80240ms** | n/a (quality_gate) | **Legitimate** first process fill of ~7647 1m bars. Slow, but not a cache bug. |
| **Warm HIT** (`live_context=hit`) | 5 tagged HIT reads | **~3955ms** median-ish (3713 / 3955 / 4330; one HIT still **22389ms** from slow LLM) | **4–21ms** | 3.5–20s | **Legitimate LLM**. Context already solved. Remaining wait is generation + SSE buffer. |
| **Warm miss:bars / miss:price** | many | 38–110s typical | 20–105s | ~3–18s if a read | **Mostly legitimate invalidation** (new 1m or ≥0.25 print). Cost is the problem, not the miss. Immediate repeat after an 80s read **cannot** HIT. |
| **Follow-up HIT** (same wall-clock minute) | 2–12ms class; 4/5 Why-not, 4/5 Waiting | **2–12ms** (Why-not 3/9/95/1281ms HIT set) | ~0–24ms | none (`mentor_structured`) | **Correct.** Envelope of the spoken WAIT. |
| **Follow-up miss** (`refresh=false` but key moved) | Why? 3 miss; Why-not 1; Waiting 1; sim new-bar 5 | **7–101s** (Why-not worst **100676ms**) | 7–100s | none | **Unnecessary for “explain the last spoken WAIT”.** Necessary only if the product wants a **new** decision. Same-minute freeze vs new-bar rebuild is the product choice — today it rebuilds and the trader waits tens of seconds. |
| **New-bar market read** (real Yahoo 1m) | 1 | **52491ms** | **45935ms** | 5944ms | Legitimate new identity (7670→7672). Incremental engine still expensive. |
| **Simulated `applyClosedBar` then follow-up** | 5 | 34–110s | 34–100s | n/a | **Do not treat as clean incremental cost** — Yahoo `syncSeries` often disagreed (last time moved backwards) → `fullRebuilds`. |

### 2.3 Bucket map (waiting-on)

| Bucket | Cold / miss | Warm HIT | Follow-up HIT | Follow-up miss |
|---|---|---|---|---|
| A. Market data | Yahoo usually <600ms; Tickstream `*_live` **~8–10s** on some misses | 62–368ms typical | skipped on same-minute skip path | Yahoo+Tickstream again |
| B. Market context | **Dominant 20–80s** | **1–21ms** | **0–5ms** | **Dominant 7–100s** |
| C. Decision envelope | 16–397ms (negligible) | 0–9ms | n/a | n/a |
| D. LLM TTFT (in-process) | after context | **0.6–1.2s** typical | n/a | n/a |
| E. LLM total | n/a or 3–20s | **3.5–11s typical; 20s outlier** | none | none |
| F. Stream transport | HTTP ≈ TOTAL until flush lands | **hides D**; panel waits for E | structured `done` | waits for B |
| G. Frontend | not measured (no TV panel in these runs) | same | same | same |
| I. Duplicate work | Yahoo 45s expires during a slow read; intent classified twice; quality gate then LLM rewrite | LLM rewrite of an already-gated envelope | none | rebuilds intel the trader did not ask to refresh |

**General / casual never enter B.** That is a pass on the “only spend expensive compute when required” principle.

### 2.4 Legitimate vs unnecessary slowness

**Legitimate**

- Cold initialize (~80s context) — empty engine, thousands of 1m bars.
- New closed 1m / session / ≥0.25 last print on a **new read** — fingerprint is doing its job.
- Warm HIT LLM ~4s — the read is prose over an existing envelope.
- Tickstream live ~8s — acquisition spike, not context math.
- Research replay CURRENT ~90s / 6 checkpoints — **research**, already has OPTIMIZED 4.44×.

**Unnecessary (for a chat copilot)**

- HTTP trading SSE buffering: in-process TTFT 0.6–1.2s on HIT, panel waits ~full LLM (and ~full TOTAL on miss). One successful wire sample: **one delta at 83.4s**, 9397 chars.
- Follow-up with `refresh=false` paying 7–101s because a 1m printed during the previous slow turn.
- Quality gate + LLM rewriting the same gated read (HIT path still ~4s of prose).
- Yahoo refetch because 45s TTL < miss-path duration.

**Not a reuse failure**

- Repeated-read median 49s: 4/5 were real `miss:bars` after a >60s prior. Hit rate in Bench A was **2/5 (40%)** because NY 1m kept printing.

---

## 3. Freshness vs performance

**Request-current is OK for chat IF missed intra-bar events rarely change tradable outcomes.** That “if” is **unmeasured** at layer 3 (see §4). It is **not** automatically OK for automated execution (stops, level crosses, session transitions).

Karen does **not** run a tick loop. `applyTick` runs only when a request builds intelligence. Between questions the envelope is silent-stale by architecture.

### 3.1 What the fingerprint actually covers

Verified in freshness audit against code (not only the reuse report):

| Input | Invalidates? |
|---|---|
| 1m/5m/15m/daily `count\|first\|lastTime` | Yes → `bars` |
| Forming-bar OHLC | **No** |
| Last print ≥ 0.25 MNQ (exactly 0.25 = MISS) | Yes on **new reads** with overlay → `price` |
| Session id + AMD + macro | Yes → `session` → full `initialize` |
| New chat message | **No** |
| Same wall-clock minute follow-up | **No price check** — returns the same intel object |

Three caches, three keys: engine reuse (bars+session+print), intel reuse (same, or follow-up clock), quality-gate (`candleHash|lastPrice|quality` — **structure omitted**).

### 3.2 Stale paths (from freshness audit)

Highest-risk, as written:

1. **Follow-up same minute** — envelope frozen while PDH can be taken and given back. Includes “what changed just now”.
2. **Missed intra-bar extreme** — last print never showed 30217; Yahoo forming high stale or HIT-skipped. Probe: Yahoo high patched to 30217, print 30214 → **HIT**, `currentDayHigh` stayed 30214.25, PDH **UNTOUCHED**.
3. **Stale TV snapshot ≥20 candles** + new Yahoo 1m, same lastPrice → intel structure updates, **quality gate returns the previous envelope object**.
4. **HTF forming range** — 15m/5m high taken intra-bar; decision still uses last HTF rebuild range. Forming 15m high+30, same print → **HIT**.
5. **No request** — nothing updates.

PDH probe (n=1 synthetic, **state** only — not a trade-outcome study):

| Step | PDH status |
|---|---|
| init 30214 | `UNTOUCHED` |
| applyTick 30217 | `CLOSED_BEYOND` (forming close) |
| applyTick 30215 | `BREACHED` (high kept; take revoked) |
| jump 30214→30215, never saw 30217 | `UNTOUCHED` (sweep lost) |
| reuse HIT, Yahoo high=30217, print 30214 | `UNTOUCHED` |

Forming-bar `CLOSED_BEYOND` then `BREACHED` is **live-provisional take**, not a cache bug. ICT “taken” after a 1m **closes** back below is correctly false. **Unseen** 30217 is the real gap.

Scenarios A–G (freshness): A HIT valid; B MISS iff ≥0.25; C MISS only if the crossing print is the overlay; D new 1m yes; E structural event only if detectors actually ran; F session yes; G HTF **close** yes, forming HTF OHLC **no**.

### 3.3 Recommendation (chat vs automation)

| Product | Request-current | Tick/event layer |
|---|---|---|
| **Chat copilot** | **Keep.** Trader asks; answer is current as of that request’s overlay + fingerprint. Warm HIT ~4s LLM is the right cost shape. Do not rebuild structure every tick to make chat feel live. | **Only if** §4 shows a significant share of **high-quality** setups missed or flipped by intra-bar events (layer 3). Until then, treat wick/PDH gaps as **truth bugs** (overlay + HIT-skip of forming H/L), not as a reason to start a tick loop. |
| **Automation / robots** | **Insufficient for risk.** Stops, level crosses, and session transitions can happen with no chat request. Silent-stale between ticks is a risk architecture, not a UX tradeoff. | **Still not “full rebuild every tick.”** If ever built: fast tick/event state + last valid structural snapshot. **Do not build now.** Need layer-3 evidence first. |

Related but **not** a freshness-cache issue: PDH **false-taken on prod** (side-blind sweep + Yahoo EST calendar vs Globex) is a **market-state truth** FAIL on the deployed object (`project-control-blocker-board.md`). Local fixture PASS; no deploy this program. Do not conflate with the unseen-wick HIT skip.

---

## 4. Impact-study spec (define, do not run full study)

**Question:** Would tick-current (or event-driven intra-bar H/L / level crosses) change enough **tradable outcomes** to justify the complexity?

**Do not count every state difference as meaningful.**

### 4.1 Three layers

| Layer | What it is | Example from existing probe | Counts toward go/no-go? |
|---|---|---|---|
| **1. STATE DIFFERENCE** | PDH tag, wick, forming high, wording, envelope fields that do not change the trade | 30217 unseen → PDH `UNTOUCHED` vs `CLOSED_BEYOND`/`BREACHED` | **No** |
| **2. DECISION DIFFERENCE** | Stance / entry / stop / target / thesis actually differ | LONG vs WAIT; stop moved; target moved; thesis flipped | Report, but **not** the rule |
| **3. TRADE-OUTCOME DIFFERENCE** | The decision difference would have changed a tradable result: taken, missed, stopped, target | Entry available vs missed; stop would have been hit; target would have been hit; liquidity/structure event changes the **actionable** thesis | **Yes — this is the 1–2% vs significant-share rule** |

A difference is meaningful for layer 3 only if it changes a potentially tradable outcome:

- LONG vs SHORT
- LONG/SHORT vs FLAT/WAIT
- entry becomes available or is missed
- stop/invalidation changes materially
- target changes materially
- a liquidity/structure event changes the actionable thesis

### 4.2 Control vs treatment

| Arm | Definition |
|---|---|
| **Control** | Today’s **request-current reuse** (fingerprint as implemented: bar identity + last print ≥0.25 on new reads + session; forming OHLC **not** in key; same-minute follow-ups skip price). Sample “requests” as sparse checkpoints (e.g. once per minute, or once per N seconds), **not** every tick. |
| **Treatment** | **Simulated** tick-current / event-driven: apply intra-bar highs/lows and level crosses onto the last valid structural snapshot **without** a full historical rebuild. Not `initialize` every tick. Not live Yahoo/Tickstream in the loop. |

Compare stance, entry, stop, target, missed setups. Categorise differences and root causes (unseen wick, follow-up freeze, HTF forming range, quality-gate weak hash, session, new 1m). Report **counts for all three layers**. Go/no-go uses **layer 3**, especially among **high-quality** setups (not every WAIT).

### 4.3 Decision rule (later)

- If only **~1–2%** of decisions have a **trade-outcome** difference → **keep request-current for chat**.
- If a **significant share of high-quality setups** are missed or flipped because of intra-bar events → evidence to justify a tick/event layer — **primarily for automation risk, not chat UX**.

### 4.4 Fixtures already on disk (this turn did not run the study)

| Fixture | Size | Fit |
|---|---|---|
| `data/replay-fixtures/synthetic-ny-am.json` | synthetic | Identity / reuse tests already use this. Good for **layer-1** wick/PDH probes (freshness script already did n=1). Too small for layer-3 rates. |
| `nq-aug12-2026-cme` | **1381** × 1m | One CME day. Candidate-filter audit: architecture-v1 stance mix on a 12-checkpoint sparse sample was **100% wait/flat** (10 flat, 2 wait). **INFRASTRUCTURE**, not EDGE. A smoke of layer 2/3 here can return “no trades to flip.” |
| `nq-week-aug05-aug12-2026-cme` | **6880** × 1m | One week. Still not months. Integrity WARNING (session-boundary gaps). |

**Limits if a cheap smoke is ever run:** 1-minute OHLC **cannot** reconstruct ticks that never appear as bar high/low. Treatment must use **bar H/L as the intra-bar extreme**, which **overstates** what a last-print overlay would have seen and **understates** true tick path inside the bar. Label that. Do not use Yahoo live. Do not full-rebuild every minute of the week as a “tick simulation.” Do not interpret empty LONG/SHORT on Aug 12 as proof that intra-bar events never matter.

**Already measured (layer 1 only):** freshness PDH probe, **n=1** synthetic scenario. **Layer 2 count: none. Layer 3 count: none.** That n=1 must not be used as go/no-go.

**Out of scope for this study:** rewriting live engine, wiring incremental replay into production Karen, candidate filters, architecture-v1 changes.

---

## 5. Prioritized roadmap

Rank is **why + expected payoff + risk + chat vs future automation**. Do not treat this as a build sprint for all rows.

| Rank | Candidate | Why | Expected payoff | Risk | Chat vs automation |
|---|---|---|---|---|---|
| **1** | **SSE first-visible-token** (complete the in-flight flush; measure HTTP) | HIT path is already LLM-bound. In-process TTFT **0.6–1.2s**; panel waits until generation completes. Wire sample: `deltaCount=1`, first visible **83424ms** ≈ total. Casual stream already flushes. | Warm read: first **visible** token ~TTFT instead of ~4–20s (HIT) or ~TOTAL (miss). Does **not** shrink cold 80s context. | Low if display deltas stay unvalidated and final polish still runs (`lib/sse-trading-flush.ts` already states that split). **Another agent may be landing this — do not start a parallel rewrite.** | **Chat UX.** Irrelevant to robots. |
| **2** | **Follow-up miss tail** | `refresh=false` still rebuilds on `miss:bars`. Trader asked about the **spoken** WAIT; paid **7–101s**. HIT path already 2–12ms. | Follow-ups stay milliseconds even if a 1m printed. Product: freeze envelope for Why/invalidation of the last read; optionally refresh only for “what changed”. | Medium: freezing across a real new bar can be **stale** (freshness path 1). Must split “explain last read” vs “what changed now”. | **Chat.** Automation should not use this freeze. |
| **3** | **Live reliability 1.4.128 verify** (TradingView, unpacked, local API — not prod 1.4.64) | Empty `(chart_read)` and Berlin canned failure were **routing / swallow** bugs. Code claims TEXT stream for `Give me the read`. Live TV **0/N**. Prod bounce still documented at 1.4.64. Phase 1 is OPEN. | If still broken, latency work never reaches the trader. If PASS, conversational read is the TEXT path already profiled. | Low (measurement). Do not start extra `next-dev` if one is Ready. Do not deploy unless asked. | **Chat.** Blocks believing live numbers. |
| **4** | **Cold / `miss:bars` context cost** | Dominant remaining compute: cold **80s**, new-bar **~46s** context, miss repeats **20–105s**. Reuse cannot help a genuine new 1m. Research OPTIMIZED 4.44× is **not** this work. | Median live read could approach HIT+LLM (~4s) **plus** a cheaper incremental bar, instead of 40–90s. | **High.** Easy to break structure, PIT, or force full rebuilds (sim new-bar already fought Yahoo identity). Do not rewrite architecture-v1 or detectors. | Chat **and** any future robot. Highest performance prize, highest foot-gun. |
| **5** | **PDH / live market-state truth** | Two evidence threads: (a) prod still old false-taken detector; (b) request-current HIT can miss a PDH wick. Blocker board: do not start Phase 2 while Phase 1 live panel is on old prod. | Spoken PDH tag matches Globex + overlay. Stops traders acting on a false take. | High if formulas are “fixed” again. Deploy of **already-local** side-aware path is a release choice, not a redesign. Wick-high-water is a **tick-state** feature — fold into §4, don’t special-case. | Chat truth now; automation risk later. |
| **6** | **Impact study (§4)** | Only way to answer the architectural question without building a tick loop. | Go/no-go for rank 7. Layer-1 n=1 already exists; layer 3 does not. | Low if scoped to existing 1d/1w OHLC and labeled limits. High if someone “just adds a tick loop” instead. | Measurement for **both**; go/no-go is mainly **automation**. |
| **7** | **Tick / event layer** | Fast tick state + last structural snapshot. Catches level crosses / session transitions without full rebuild. | Only if layer 3 says high-quality setups are missed/flipped. | **Very high** if built on speculation. Wrong shape = full rebuild every tick (forbidden) or cache-forever (already stale). | **Automation first.** Chat should stay request-current unless §4 is loud. |
| **8** | **Historical NQ ingest / research backtest / OOS** | Research track: 1 day + 1 week on disk; months missing; NT GUI not started. Needed for EDGE claims, not for live TTFT. | Enables architecture-v1 OOS later. Incremental replay already PASS on Aug 12. | Running per-bar months is already known **not viable** (~8.6s/snapshot). Do not launch. | Research. **Not** live copilot critical path. |

### Not on the critical path

- **Candidate filtering** — measured unsafe on Aug 12 NY AM (100% or 0%).
- **Speculative multi-level cache** — three caches already; adding layers without a key that includes forming H/L will cache the stale PDH miss.
- **Rewriting architecture-v1** — frozen. Research overlays only after months of PIT NQ.
- **Making every request equally fast** — general/casual are already cheap; cold initialize will not be 12ms; do not route them through intel to “share a cache.”

---

## 6. What not to do

- Do **not** implement a tick loop, event bus, or “current decision” merger this pass.
- Do **not** full-rebuild market context every tick (or every 0.25 print).
- Do **not** cache forever on same bar identity while Yahoo/TV already swept a level.
- Do **not** mix research incremental replay (PASS / 4.44×) into live architecture, or redo that parity suite.
- Do **not** overwrite in-flight SSE work in `app/api/chat/stream/route.ts`; do not start a second flush implementation.
- Do **not** start extra `next-dev` if one is Ready; do not treat hung `:3000` as a reason to pile servers.
- Do **not** commit / push / deploy from this synthesis.
- Do **not** enable research candidate filters.
- Do **not** rewrite architecture-v1, ICT take rules, or weights to chase latency.
- Do **not** treat layer-1 PDH tag changes as proof that tick-current would change P&L.
- Do **not** run a 6-month per-bar baseline.
- Do **not** parse NT `.ncd`; historical months are a **manual GUI export** later.
- Do **not** claim live TradingView reliability is verified.
- Do **not** invent SSE-after numbers; `karen-sse-streaming.md` is missing.

---

## Return (this synthesis)

### Ranked roadmap (short)

1. SSE first-visible-token — complete/measure in-flight flush (chat UX).  
2. Follow-up miss tail — don’t pay 7–101s to explain the last WAIT.  
3. Verify live 1.4.128 on TV (local API).  
4. Cold / `miss:bars` context cost (hard, high payoff).  
5. PDH / live market-state truth (prod object + unseen wick).  
6. Impact study (three layers; layer 3 decides).  
7. Tick/event layer **only if** §4 says so — automation risk, not chat.  
8. Historical NQ / backtest / OOS — research track, not live critical path.

### Request-current vs tick-current

- **Chat copilot:** keep **request-current**. It is the right tradeoff unless the impact study shows intra-bar events changing tradable outcomes on high-quality setups. Warm HIT ~4s LLM + millisecond follow-ups is the intended shape; remaining pain is SSE buffer, follow-up miss tail, and expensive genuine new-bar context.  
- **Automation:** request-current is **likely insufficient for risk**. That still does **not** mean rebuild structure every tick. Shape if ever built: fast tick/event state + last valid structural snapshot. **Do not build it until layer-3 evidence exists.**

### Single highest-evidence next action (do not implement in this pass)

**Complete and measure HTTP first-visible-token on the trading stream after the in-flight SSE flush — do not start a second rewrite.**

Evidence: HIT context is already 1–21ms; in-process TTFT is 0.6–1.2s; the panel still waits for full generation (reuse + request-type audits; one wire 200 with `deltaCount=1`, first visible ≈ 83.4s total). That is the largest **proven** remaining wait on the path reuse already won, and it does not require a new engine.

If that flush is already owned by another agent, the next **owned** action is a **measurement**: live 1.4.128 TradingView verify (conversational `Give me the read` → one spoken TEXT read, no `CHART_READ_EMPTY_RESPONSE`), still without extra `next-dev`.

Do **not** start the tick/event layer. Do **not** run the full impact study until someone explicitly takes §4 with the three-layer rule and the fixture limits above.
