# Karen live decision freshness

**Date:** 2026-08-14  
**Mode:** audit only. Production files not modified. SSE / extension streaming not touched.  
**Code read:** `lib/incremental-market-engine.ts`, `lib/market-intelligence.ts`, `lib/chat-engine.ts`, `lib/market-data.ts`, `lib/analysis-quality-gate.ts`, `lib/analysis-triggers.ts`, `lib/structure.ts`, `lib/level-interaction.ts`, `lib/mentor-intent.ts`, `data/research/karen-live-context-reuse.md`, `scripts/test-live-context-reuse.ts`  
**Probe (no engine changes):** `npx tsx scripts/test-live-decision-freshness.ts`

**Verdict:** Karen is **request-current**, not tick-current. A new “give me the read” with a live last print stays decision-current for ≥0.25 MNQ prints, new 1m/5m/15m/daily *identity*, and session/AMD/macro. The cached `DecisionEnvelope` **can go stale between ticks** — and on some same-minute follow-ups it is *designed* to.

Goal shape (not implemented): **fast tick state + latest valid structural state = current decision**. Not every-tick full rebuild. Not cache forever.

---

## TICK FRESHNESS

There is **no live tick loop** into the shared engine. `applyTick` is only reached from `syncLiveEngineFromFeed` → `syncSeries`, which runs when chat / snapshot / verdict / levels **request** intelligence.

Last print into that request:

| Source | When | Notes |
|---|---|---|
| `chartLastPrice` (TV) | Extension body | Rounded to 0.25 MNQ |
| Tickstream | `maybeResolveTickstreamFallback` if TV missing | Skipped on follow-up `skipLivePriceOverlay` |
| Yahoo 1m close | Fallback | **45s cross-request TTL**; `/api/levels` uses this only |

Reuse key last-print rule (verified in code, not only the reuse report):

```167:169:lib/incremental-market-engine.ts
  if (Math.abs(prev.lastPrice - next.lastPrice) >= LIVE_CONTEXT_PRICE_EPS) {
    return { hit: false, reason: "price" };
  }
```

`LIVE_CONTEXT_PRICE_EPS = 0.25` (1 MNQ tick). **Exactly 0.25 is a MISS.** Sub-tick noise HITs. Anchor is the last *miss* key, so 0.20+0.20 still misses on the second request (no creep).

On HIT, `applyTick` is **not called**. Forming-bar H/L from Yahoo is ignored. Quiet ticks never update `ctx.daily.lastClose`.

`shouldRunKarenAnalysis("tick", [])` is false unless a structural event fired. Chat ignores that flag: a user read always goes through intel + quality gate (unless follow-up skip).

**Every tick:** no. **Every price change ≥ 0.25 on a new read with overlay:** yes (engine `applyTick`, then full observation/interpretation/envelope — not a historical rebuild).

---

## 1M FRESHNESS

Bar identity in the reuse key (verified):

```121:129:lib/incremental-market-engine.ts
export function liveMarketBarFingerprint(data: MarketFeed): string {
  /** Identity only — forming-bar OHLC is covered by last-print epsilon, not exact close. */
  const id = (bars: Bar[]) => {
    if (!bars.length) return "empty";
    const a = bars[0]!;
    const b = bars[bars.length - 1]!;
    return `${bars.length}|${a.time.getTime()}|${b.time.getTime()}`;
  };
  return [id(data.m1), id(data.m5), id(data.m15), id(data.daily)].join("||");
}
```

Forming-bar OHLC is **not** in the key. Probe: Yahoo high patched to 30217 with last print still 30214 → **HIT**, `currentDayHigh` stayed 30214.25, PDH stayed `UNTOUCHED`.

New closed 1m (count or lastTime) → `bars` MISS → `applyClosedBar` + 1m structure rebuild (`eqhForce: true`). Not a full history rebuild unless seek/HTF length/session.

`asOf` in `buildDeskMarketIntelligenceInner` is `new Date()`, then `sliceFeedAt` drops bars after that clock. A 1m bar timestamped in the future relative to `asOf` is invisible (probe: 15m bar *after* asOf did not change the key).

---

## STRUCTURE FRESHNESS

MSS / BOS / FVG / swings are **not** a separate cache key. They invalidate only via `bars` / `price` / `session`.

On a price MISS, `applyTick` rebuilds 1m structure only if:

- forming high/low **expands**, or
- close path / wick expansion **crosses `trackedPrices`** (PDH/PDL/session H/L/FVG/EQH/ORG/…)

Quiet 0.25 close that does not expand range and does not cross a tracked level still updates lastClose/bias/PD (`applyPriceDerived`) but **skips** `rebuildOneMinuteStructure`.

HIT skips `applyTick` entirely, so a forming-bar wick that never appeared as last print never reaches structure detectors.

`detectMss` / FVG / REH scan the current 1m series, including the **forming** bar. A forming close can print an MSS event (probe at 30217: `level_interaction,mss`) that disappears conceptually when the close retraces — the next tick rebuilds from current OHLC.

---

## LIQUIDITY FRESHNESS

PDH/PDL **taken** is `CLOSED_BEYOND` only (`isQualifyingTaken`). Wick-through is `BREACHED`, not a take. That is the existing ICT data-layer contract (`lib/level-interaction.ts`).

Concrete probe: **Price=30214, PDH=30216, tick 30217, return 30215.**

| Step | Forming H/C | PDH status | `fullRebuilds` |
|---|---|---|---:|
| init 30214 | 30214.25 / 30214 | `UNTOUCHED` | 1 |
| applyTick 30217 | **30217 / 30217** | **`CLOSED_BEYOND`** (forming close > PDH) | 1 |
| applyTick 30215 | **30217 / 30215** | **`BREACHED`** (high kept; take revoked) | 1 |
| jump 30214→30215, never saw 30217 | 30215 / 30215 | `UNTOUCHED` (sweep lost) | 1 |
| reuse HIT, Yahoo high=30217, print 30214 | high not applied | `UNTOUCHED` | — |

So: **if the engine sees the 30217 print**, internal state keeps the sweep wick (`formingH=30217`) without a historical rebuild. **Taken** is live-provisional on the forming close and correctly drops to `BREACHED` when the print comes back. **If the request never carries 30217** (Yahoo 45s stale high + last print already back at 30215), the sweep never happened.

EQH/EQL wick-`SWEPT` is a different detector. It only runs when `refreshEqhIfNeeded` runs (`hlChanged` / bar close / force). Same miss: unseen intra-bar extreme.

---

## HTF FRESHNESS

Reuse key includes 5m/15m/daily **count + first + last time**, not forming HTF OHLC.

- New HTF bar (count/lastTime, sliced at asOf) → `bars` MISS. `syncSeries` `htfChanged` is **length-only** → `fullRebuild` (“htf sync rebuild”). Probe: 15m append `fullRebuilds` 1→2.
- Forming 15m high +30, same count/time, same last print → **HIT**. Even on a MISS that only `applyTick`s 1m, `applyPriceDerived` does **not** lift `timeframe15m.high`. Probe: forming 15m high+30 left `fullRebuilds` unchanged.

Daily *current-day* H/L **is** updated from the 1m forming bar on `applyTick`. HTF bias hints use the last fullRebuild 15m/5m range vs live price. Intra-bar 15m/5m extreme can be stale until the next HTF bar is appended (up to 5m/15m).

---

## CACHE INVALIDATION

Fingerprint vs reuse report (do not trust the report blindly):

| Claim in `karen-live-context-reuse.md` | Code |
|---|---|
| 1m/5m/15m/daily `count\|first\|lastTime` | **True** (`liveMarketBarFingerprint`) |
| Forming-bar OHLC not in key | **True** |
| Last print ≥ 0.25 → `price` MISS | **True** (`>= 0.25`) |
| Session = `id\|amdPhase\|macroWindow` | **True** (`liveMarketSessionKey`) |
| Chat messages not in key | **True** |
| Derived structure invalidates via bars/price/session only | **True as keyed**; **false as completeness** — wick/HTF forming OHLC can change structure without those keys |
| Type comment on `LiveMarketReuseKey` (“+ last OHLC”) | **Stale** — that is `barSeriesFingerprint`, not the reuse key |

Three caches, three keys:

1. **Engine reuse** (`liveReuseAnchor`) — bars + session + last print. HIT → skip `applyTick`.
2. **Intel reuse** (`liveIntelCache`) — same fingerprint, or follow-up clock (session + **wall-clock 1-minute**, **no price**).
3. **Quality-gate reuse** (`lastGateCache`) — `state_hash = candleHash \| lastPrice \| quality.flag`. **Structure/sweeps/session omitted.**

Follow-up path (`shouldRefreshMarketState === false`): Why / why not short / waiting for / invalidation / EQH / liquidity explanation / **“what changed”**. `tryReuseLiveDeskIntelligence` returns the **same intel object** if still in the same wall-clock minute. LLM path can skip intel entirely (`PREVIOUS READ — conversation`).

Yahoo: 45s TTL is **not** busted by a 0.25 tick. Request pin keeps one object for the rest of that request. Overlay is supposed to carry last print; `/api/levels` has no overlay.

---

## STALE DECISION RISK

**Can the cached DecisionEnvelope go stale between ticks? Yes.**

```
TICK ──(only on request)──► last print overlay
        │
        ├─ |Δpx| < 0.25 or no overlay + Yahoo 45s HIT
        │     applyTick skipped  →  LIVE STATE frozen
        │
        └─ price/bars/session MISS
              applyTick / applyClosedBar / initialize
                    │
                    ▼
           MARKET CONTEXT SNAPSHOT
              HIT → cached intel object
              MISS → observation + interpretation
                    │
                    ▼
           DECISION ENVELOPE
              quality-gate HIT on weak state_hash possible
              follow-up → prior envelope by design
                    │
                    ▼
           USER RESPONSE
```

Highest-risk stale paths:

1. **Follow-up same minute** — envelope frozen while PDH can be taken and given back. Includes “what changed just now”.
2. **Missed intra-bar extreme** — last print never showed 30217; Yahoo forming high stale or HIT-skipped.
3. **Stale TV snapshot ≥20 candles** + new Yahoo 1m, same lastPrice → intel structure updates, **quality gate returns the previous envelope object** (probe: PDH `BREACHED` in ctx, envelope identity unchanged). Hydrated-from-Yahoo path *does* change `candleHash` and invalidates the gate.
4. **HTF forming range** — 15m/5m high taken intra-bar, decision still uses last HTF rebuild range.
5. **No request** — nothing updates. Karen is silent-stale by architecture.

Forming-bar `CLOSED_BEYOND` at 30217 then `BREACHED` at 30215 is **not** a cache bug; it is live-provisional take on an unclosed 1m. ICT “taken” after the 1m **closes** back below is correctly false.

---

## Test scenarios A–G

| ID | Scenario | Should invalidate | Does invalidate | Result |
|---|---|---|---|---|
| **A** | Same bar, no relevant state change | No | **No (HIT)** | Reuse valid |
| **B** | Price changes materially, same bar | Yes if ≥0.25 and it can change bias/levels/thesis | **Yes if ≥0.25 (`price`)**; **No if &lt;0.25** | 1 MNQ tick is enough; sub-tick HIT is correct for MNQ |
| **C** | Price crosses PDH/PDL/PDC | Yes if relevant to take/tag | **Yes if the crossing print is the request overlay** (`price` MISS → `applyTick` → `majorLevelInteraction`) | 30214→30217: `CLOSED_BEYOND`. Return 30215: `BREACHED`, high kept. Jump 30214→30215: **UNTOUCHED** |
| **D** | New 1m close | Yes | **Yes (`bars`)** | Incremental 1m structure, not full history |
| **E** | New MSS/BOS/FVG/liquidity event | Yes | **Only if** bars/price/session miss actually runs detectors | Forming wick with same print: **HIT, event dropped**. Seen print: structure rebuild, no full history |
| **F** | Session transition | Yes | **Yes (`session`)** → `initialize` full rebuild | AMD/macro included in key |
| **G** | HTF candle closes | Yes | **Yes (`bars` + length `fullRebuild`)** | Forming HTF OHLC: **does not invalidate** |

---

## Event table

Latency: HIT context **1–16ms** (reuse report). Follow-up unit **0.8–1.5ms**. Price/bars MISS still pays observation/interpretation (hundreds of ms to tens of s if Yahoo/Tickstream miss) — engine tick itself is sub-ms; **there is no per-tick envelope**. Session/HTF miss adds `initialize`/`fullRebuild`.

| EVENT | CURRENT BEHAVIOUR | SHOULD INVALIDATE CACHE | DOES INVALIDATE | LATENCY | RISK OF STALE DECISION |
|---|---|---|---|---|---|
| Every tick | Not consumed. Engine idle until a request. | No (tick-state only) | No | n/a | **High** between questions |
| Every price change | New read: MISS if \|Δpx\|≥0.25 vs last overlay; HIT otherwise. Follow-up: ignored inside the same wall-clock minute. | Invalidate envelope only if the print can change thesis/levels; always refresh **tick state** | Partial — 0.25 on new reads only | HIT ~1–16ms context; MISS = incremental tick + full intel pipeline | **Medium** (follow-up freeze; 45s Yahoo without overlay) |
| Every 1m candle close | `bars` MISS on count/lastTime. Forming OHLC ignored. | Yes for structure | Yes for identity; **no** for forming H/L alone | Incremental bar + intel pipeline | **Low** on new read if Yahoo identity moved; **medium** if 45s cache hides the new bar |
| Every structural event | No dedicated key. Detectors run on tick/bar if `applyTick`/`applyClosedBar` ran. | Yes | Only as a side effect of bars/price/session | Same as those misses | **Medium–high** for unseen wicks / HIT-skipped Yahoo high |
| Every session transition | `session` MISS → `initialize` | Yes | Yes (id + AMD + macro) | Full rebuild + intel | **Low** on new read |
| Every liquidity event | PDH take = forming/closed `CLOSED_BEYOND`. Wick = `BREACHED`. EQH needs H/L rebuild. | Yes if take/tag/sweep changes the thesis | If the print/bar that produced it was applied | Incremental if seen | **High** if extreme never overlayed; **low** if 30217 was a request print |
| Every HTF state change | New 5m/15m/daily identity → `bars` + length `fullRebuild`. Forming HTF OHLC ignored. | Yes on HTF close; tick-state for forming H/L | Close: yes. Forming: **no** | Full rebuild on length change | **Medium** intra-bar HTF extremes |

---

## RECOMMENDED ARCHITECTURE

Do not implement here. Target:

**FAST TICK STATE** (every overlay print, cheap): last print, forming 1m H/L high-water mark, distance to tracked levels, provisional `TOUCHED`/`BREACHED`/`CLOSED_BEYOND`.  
**LATEST VALID STRUCTURAL STATE** (on 1m close, HTF close, session/AMD, confirmed MSS/FVG/EQH): swings, FVGs, HTF ranges, session windows.  
**CURRENT DECISION** = structural snapshot + tick overlay. Rebuild the envelope when structural state changes **or** tick state crosses a decision-relevant level. Otherwise reuse the envelope and rewrite only last print / distance / provisional level status.

Not: full observation+interpretation+LLM on every 0.25 print.  
Not: HIT forever on same bar identity while Yahoo high already swept PDH.  
Not: same-minute follow-up that answers “what changed” from a frozen envelope.

Concrete gaps to close later (still audit-only):

1. Always `applyTick` / merge forming H/L even on fingerprint HIT; keep envelope HIT separate from tick-state HIT.
2. Persist intra-bar high-water mark so 30214→30217→30215 does not require the 30217 request if Yahoo high eventually shows it — and do not drop Yahoo high on HIT.
3. Follow-up: freeze envelope for Why/invalidation of the *spoken* read; refresh tick state (and envelope) for “what changed” / liquidity-now.
4. Quality-gate key must include structure/reuse fingerprint, not only `candleHash|lastPrice|quality`.
5. Lift 5m/15m high/low from 1m ticks, or put forming HTF H/L in the tick layer.
6. Treat forming-bar `CLOSED_BEYOND` as provisional in the spoken take, or wait for a **closed** 1m — pick one and use it consistently.

---

## Probe

`scripts/test-live-decision-freshness.ts` (not wired in `package.json`). Re-run: `npx tsx scripts/test-live-decision-freshness.ts`.
