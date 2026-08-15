# KAREN — Event-current trade impact study

**Date:** 2026-08-14  
**Mode:** Research synthesis only — no tick engine, no code changes, no commit/push/deploy.  
**Primary measured source:** prior run documented in `data/research/karen-request-vs-event-impact.md` (`scripts/research-request-vs-event-impact.ts`, n=20).  
**Supporting audits (inferred / architecture):** `karen-live-decision-freshness.md`, `karen-architecture-roadmap.md` §3–4, `karen-live-market-state-truth-audit.md`, `karen-decision-architecture.md` (stance vocabulary only).

This file is the go/no-go digest for **chat copilot** vs **automation/robot**. It does not invent a new tick engine or fabricate fills/PnL.

---

## Method

### Request-current (control)

Today’s product shape: intelligence / envelope built **when something asks** (chat, snapshot, verdict, levels). Between requests the engine is idle.

Sparse checkpoint used in the measured study: **1m bar close** — incremental engine initialized on prefix through bar `i`, last print = close. Matches “trader asks after the bar prints” more than “follow-up same minute with frozen envelope.”

Live reuse (not re-simulated as the control arm here, but relevant to chat UX):

- Fingerprint = bar identity + last print ≥0.25 MNQ + session; **forming OHLC not in key**
- Same-minute follow-ups can skip price and return the prior intel object
- On HIT, `applyTick` is skipped → Yahoo forming high can be dropped (**MEASURED** in freshness n=1 PDH probe)

### Event-simulated (treatment)

**Not** a true tick path. Prior script treatment:

1. Structural snapshot at closed bar `i-1`
2. `applyTick(open)` then `applyTick` to the decision-relevant extreme (PDH/PDL touch side if any, else larger wick side)
3. Decision taken **at** that extreme (before close retrace)
4. No `initialize` every event

**OHLC limit (labeled):** 1m H/L overstates what a last-print overlay might have seen and understates a true tick path inside the bar.

### Meaningful difference rule

A difference counts as **meaningful** only if it changes at least one of:

- LONG/SHORT vs FLAT/WAIT (or monitor treated as flatish)
- entry availability
- stop / invalidation
- target
- whether a high-quality setup would be missed

**High-quality (HQ)** (from measured script): `canDeliverVerdict` **or** long/short with entry **or** wait with numeric entry zone.

### What was measured vs inferred

| Claim class | Label | Source |
|---|---|---|
| Layer counts on n=20 scenarios | **MEASURED** | `karen-request-vs-event-impact.md` / script |
| Example stance / entry / outcome flips | **MEASURED** | same |
| “Karen is request-current, silent between ticks” | **MEASURED** (code + probe) | freshness audit |
| PDH unseen wick → UNTOUCHED on reuse HIT | **MEASURED** state-only n=1 | freshness + market-state truth |
| Real fills, slippage, live robot PnL | **NOT MEASURED** | — |
| Week CME (6880×1m) event rates | **NOT MEASURED** (WEEK_CAP=0) | impact script limits |
| True tick-by-tick path inside a 1m bar | **NOT MEASURED** | OHLC proxy only |

Excluded from go/no-go: freshness PDH probe alone (state-only, n=1). Replay CLI vs pipeline SHORT/WAIT discrepancy is a **research-path** issue, not event-current evidence (`karen-replay-decision-discrepancy-audit.md`).

---

## Counts (meaningful only)

Primary sample: **n = 20** scenarios (synthetic-ny-am 12 + nq-aug12-2026-cme 8). Warmup 60. LOOKAHEAD = 20 bars (outcome **proxy**, not broker fills).

### Headline

| Layer | Meaningful count | Share of n=20 | Notes |
|---|---:|---:|---|
| **1. STATE** | **12** | 60% | Raw script state diffs = 19; **7 state-only** (forming H/L / tag / envelope noise with no stance·entry·stop·target·HQ-miss) dropped as not meaningful |
| **2. DECISION** | **12** | 60% | Script decision layer already = stance / entry / stop / target — all 12 meaningful |
| **3. TRADE-OUTCOME** | **4** | 20% | Stance polarity, entry availability, or LOOKAHEAD taken/missed/stopped/target proxy differs |

### High-quality subset

| Metric | Count | Share |
|---|---:|---|
| HQ scenarios | **5** | 25% of n |
| HQ ∩ meaningful decision | **5** | **100%** of HQ |
| HQ ∩ trade-outcome | **4** | **80%** of HQ |

### By fixture (raw script layers; meaningful filter applies globally above)

| Source | n | state (raw) | decision | trade-outcome | HQ |
|---|---:|---:|---:|---:|---:|
| synthetic-ny-am | 12 | 12 | 8 | 3 | 3 |
| nq-aug12-2026-cme | 8 | 7 | 4 | 1 | 2 |

### Trade-outcome layer status

**INCOMPLETE for real trading P&amp;L.** What exists is a **lookahead proxy** on OHLC (entry touch → stop/target within 20 bars). Missing for a complete layer-3 claim:

- Broker / robot fill model (partial fills, queue, slippage)
- Intra-bar path dependence beyond single H/L extreme
- Week+ sample with non-sparse HQ LONG/SHORT mix
- Live event stream (TV / Tickstream) vs historical OHLC extremes

Do **not** treat 20% as a precise population rate — descriptive of this capped sample only.

---

## Evidence — CHAT COPILOT

Surface: user asks for a read on request. Product is already request-current.

| Evidence | Label | Implication for chat |
|---|---|---|
| New read with overlay ≥0.25 MNQ → price MISS → `applyTick` | MEASURED | Ask-time read stays decision-current for print-driven level crosses |
| Same-minute follow-up can freeze envelope (“what changed”) | MEASURED | Truth / UX bug; fix with selective refresh — **not** a full event loop for every chat turn |
| Reuse HIT drops Yahoo forming high (PDH stays UNTOUCHED) | MEASURED n=1 state | Overlay / HIT-skip truth bug; not justification to rebuild structure every tick for chat feel |
| Control = bar-close vs treatment = mid-bar extreme: 4 trade-outcome flips | MEASURED n=20 | Timing: trader who asks **at close** already sees closed OHLC; mid-bar robot timing ≠ copilot ask timing |
| HQ flips (4/5) are mid-bar availability vs close | MEASURED | Chat does not need continuous event state to answer “what’s the read now?” if the request carries print + bars |
| Warm HIT ~ms–seconds LLM shape preferred in roadmap | INFERRED product | Event layer would not buy chat latency |

**Verdict — Chat copilot:** **NO-GO** for an event-current / tick layer. Keep request-current. Pursue targeted truth fixes (always merge forming H/L on HIT; refresh tick-state on “what changed”) without a tick engine.

---

## Evidence — AUTOMATION / ROBOT

Surface: would act on events with no human ask. Silent-stale between ticks is a **risk architecture**, not a UX tradeoff.

| Evidence | Label | Implication for automation |
|---|---|---|
| No live tick loop into shared engine; idle until request | MEASURED | Robot without an event feed never sees stops / crosses / session flips |
| Trade-outcome diffs **4 / 20 (20%)**; HQ ∩ outcome **4 / 5 (80%)** | MEASURED | Small sample but **well above** roadmap “~1–2% keep request-current” chat rule; provisional signal for automation event-state |
| Examples: flat/WAIT → long/LONG with outcome `no_trade→missed` (synthetic 14:05, 14:10) | MEASURED | High-quality setup available at extreme, absent at close checkpoint |
| Example: wait→flat + entry / `missed→no_trade` (synthetic 14:30; aug12 13:30 with PDH status flip) | MEASURED | Entry availability and liquidity tag timing change actionable thesis |
| Stops / level crosses / session transitions with no chat request | INFERRED | Request-current is insufficient for automated risk |
| Target shape if ever built: fast tick state + last structural snapshot | INFERRED roadmap | Not full rebuild every tick |
| Week fixture not loaded; true ticks not available | LIMIT | Soft evidence only — do not start build on n=20 alone |

**Verdict — Automation / robot:** **SOFT-GO / provisional.** Keep an automation-scoped event-state layer on the roadmap. **Do not build yet** until a larger real-CME pass (week+) confirms layer-3 rates among HQ setups. Shape remains: event/tick overlay + last valid structure — never `initialize` every print.

---

## Example meaningful diffs (from measured run)

| Fixture | asOf | Control → Treatment | Layers | Why meaningful |
|---|---|---|---|---|
| synthetic-ny-am | 14:05Z | flat/WAIT → long/LONG | state+dec+out | LONG vs FLAT; HQ miss (`no_trade→missed`) |
| synthetic-ny-am | 14:10Z | flat/WAIT → long/LONG | state+dec+out | same |
| synthetic-ny-am | 14:30Z | wait/WAIT → flat/WAIT | state+dec+out | entry availability; outcome `missed→no_trade` |
| nq-aug12 | 13:30Z | wait/WAIT → flat/WAIT; PDH TOUCHED→UNTOUCHED | state+dec+out | entry + liquidity thesis + outcome proxy |
| synthetic-ny-am | 14:15–14:25Z | flat/WAIT → flat/WAIT | state+dec | entry and/or target changed (no layer-3 proxy) |
| nq-aug12 | 13:32–13:35Z | wait/flat variants | state+dec | entry diffs without outcome proxy flip |

Full list: `karen-request-vs-event-impact.md` § Example diffs.

---

## Verdict summary

| Surface | Pursue event-current? | Recommendation |
|---|---|---|
| **Chat copilot** | **No** | Keep request-current. Fix HIT-skip / follow-up truth bugs as overlays, not a tick engine. |
| **Automation / robot** | **Maybe (provisional)** | Event-state layer justified enough to stay roadmap-priority for risk; **blocked on larger CME layer-3 sample** before implementation. |

Roadmap decision rule applied:

- Chat: trade-outcome flips exist but are **timing artifacts vs ask-at-close**; do not rebuild every tick for chat feel.
- Automation: HQ miss/flip share in this sample is **significant** → evidence **for** event-state later, **primarily for automation**, not chat UX.

---

## What NOT measured

1. True tick-by-tick / Tickstream / TV continuous feed outcomes  
2. Broker fills, slippage, partial fills, queue position  
3. Realized PnL / expectancy of event-current vs request-current  
4. Full `nq-week-aug05-aug12-2026-cme` (6880×1m) — WEEK_CAP=0 this pass  
5. Mid-bar last-print-only HIT-skip as the **control** (study used bar-close control)  
6. Session-transition and HTF-forming extremes as separate layer-3 buckets  
7. Production live Yahoo TTL races under load  
8. Any new historical marathon or engine rewrite this turn  

---

## Sources

- `data/research/karen-request-vs-event-impact.md` — primary MEASURED counts  
- `data/research/karen-live-decision-freshness.md` — request-current architecture + PDH probe  
- `data/research/karen-architecture-roadmap.md` §3–4 — layer definitions + go/no-go rule  
- `data/research/karen-live-market-state-truth-audit.md` — wick visibility / HIT-skip  
- `scripts/research-request-vs-event-impact.ts` — arms, HQ, LOOKAHEAD proxy (not re-run this turn)

**STOP.** No implementation.
