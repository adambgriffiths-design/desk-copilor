# Karen request-current vs event-current impact study

**Date:** 2026-08-14  
**Mode:** measurement only — no tick engine, no architecture-v1 / trading-logic / ICT / live-reuse / SSE changes. No OpenAI.  
**Script:** `scripts/research-request-vs-event-impact.ts`

---

## Question

Would simulated event-driven intra-bar H/L (and level crosses) change enough **tradable outcomes** vs today’s **request-current** bar-close reads to justify a tick/event layer?

---

## Arms

| Arm | Definition |
|---|---|
| **Control** | Request-current at **1m bar close**: incremental engine initialized on prefix through bar `i` (full closed OHLC + last print = close). Fingerprint semantics of live reuse are the product default; this arm is the sparse “ask at the close” checkpoint. |
| **Treatment** | From structural snapshot at `i-1`, `applyTick(open)` then `applyTick` to the decision-relevant extreme (PDH/PDL touch side if any, else larger wick side) on the incremental path (**no** `initialize` every event). Decision taken **at** that extreme before close retrace. |

**OHLC limit (labeled):** 1m bars cannot reconstruct ticks that never appear as high/low. Treatment uses bar H/L as the intra-bar extreme — this **overstates** what a last-print overlay might have seen and **understates** a true tick path inside the bar.

**Excluded from go/no-go:** the prior synthetic PDH probe (30214→30217, n=1 state-only) from `karen-live-decision-freshness.md`.

---

## High-quality definition

A scenario is **high-quality** if either arm has:

1. `canDeliverVerdict === true` (quality gate), **or**
2. stance `long`/`short` with an entry zone, **or**
3. stance `wait` with a numeric entry zone

---

## Layer definitions

| Layer | Counts when |
|---|---|
| **1. STATE** | PDH/PDL status, forming H/L (≥0.25), or non-trade envelope fingerprint fields differ |
| **2. DECISION** | Stance / pipeline verdict / trade direction / entry / stop / target differ |
| **3. TRADE-OUTCOME** | Tradable change: LONG/SHORT vs FLAT/WAIT/MONITOR, entry availability, material stop/target on a directional arm, or lookahead proxy taken/missed/stopped/target differs (`LOOKAHEAD=20` bars) |

Meaningful for go/no-go = **(3)** and/or clear **(2)** that implies tradable change (already folded into layer-3 flags).

---

## Counts (primary result)

| Metric | Count | Share |
|---|---:|---:|
| **Total scenarios** | **20** | 100% |
| **State differences** | **19** | 95.0% |
| **Decision differences** | **12** | 60.0% |
| **Trade-outcome differences** | **4** | 20.0% |
| **High-quality scenarios** | **5** | 25.0% |
| **High-quality ∩ decision diff** | **5** | 100.0% of HQ |
| **High-quality ∩ trade-outcome diff** | **4** | 80.0% of HQ |
| State-only (no decision/outcome) | 7 | 35.0% |

### By fixture

| Source | n | state | decision | trade-outcome | HQ |
|---|---:|---:|---:|---:|---:|
| synthetic-ny-am | 12 | 12 | 8 | 3 | 3 |
| nq-aug12-2026-cme | 8 | 7 | 4 | 1 | 2 |

---

## Go / no-go (measurement recommendation)

| Product | Recommendation |
|---|---|
| **Chat copilot** | NO-GO for a chat tick/event layer — keep request-current for copilot UX. Layer-3 flips exist, but they are mid-bar vs bar-close timing; a trader who asks at the close already sees closed OHLC. Do not rebuild every tick for chat feel. |
| **Automation / robots** | SOFT-GO / provisional — trade-outcome and HQ flip rates are elevated in this small sample, enough to keep an automation event-state layer on the roadmap, not enough to start building without a larger real-CME (week) pass. |

Decision rule from roadmap: ~1–2% trade-outcome → keep request-current for chat; significant high-quality miss/flip → evidence for tick/event layer primarily for automation.

---

## Limits / honesty

- Week fixture (nq-week-aug05-aug12-2026-cme, 6880×1m) not loaded this pass — WEEK_CAP=0 to bound RAM/time after synthetic+aug12.
- Fairness: treatment extremes are bar H/L events, not true ticks; control is bar-close request-current, not mid-bar last-print-only HIT skip.
- Sample n=20 is modest; percentages are descriptive of this sample only — do not invent precision.
- Wall time: 165.7s; RSS 88→572 MB; heap 18→64 MB.
- Cap: MAX_SCENARIOS=20, warmup=60.
- Aug12 candidate-filter history: sparse architecture-v1 stance mix can be mostly wait/flat — empty LONG/SHORT must **not** be read as proof intra-bar events never matter.
- No live Yahoo/Tickstream; no full rebuild every minute of the week as a “tick simulation.”

---

## Example diffs (decision or outcome)

- **synthetic-ny-am** `2026-08-12T14:05:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `long/LONG` pdh=UNTOUCHED; layers state=true dec=true out=true; stance flat/WAIT→long/LONG, outcome no_trade→missed
- **synthetic-ny-am** `2026-08-12T14:10:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `long/LONG` pdh=UNTOUCHED; layers state=true dec=true out=true; stance flat/WAIT→long/LONG, outcome no_trade→missed
- **synthetic-ny-am** `2026-08-12T14:15:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `flat/WAIT` pdh=UNTOUCHED; layers state=true dec=true out=false; entry, target
- **synthetic-ny-am** `2026-08-12T14:20:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `flat/WAIT` pdh=UNTOUCHED; layers state=true dec=true out=false; entry
- **synthetic-ny-am** `2026-08-12T14:25:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `flat/WAIT` pdh=UNTOUCHED; layers state=true dec=true out=false; entry
- **synthetic-ny-am** `2026-08-12T14:30:00.000Z` (synthetic_sparse): control `wait/WAIT` pdh=UNTOUCHED → treatment `flat/WAIT` pdh=UNTOUCHED; layers state=true dec=true out=true; stance wait/WAIT→flat/WAIT, entry, outcome missed→no_trade
- **synthetic-ny-am** `2026-08-12T14:35:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `monitor/NO_TRADE` pdh=UNTOUCHED; layers state=true dec=true out=false; stance flat/WAIT→monitor/NO_TRADE, target
- **synthetic-ny-am** `2026-08-12T14:40:00.000Z` (synthetic_sparse): control `flat/WAIT` pdh=UNTOUCHED → treatment `monitor/NO_TRADE` pdh=UNTOUCHED; layers state=true dec=true out=false; stance flat/WAIT→monitor/NO_TRADE, target
- **nq-aug12-2026-cme** `2026-08-12T13:30:00.000Z` (wide_wick): control `wait/WAIT` pdh=TOUCHED → treatment `flat/WAIT` pdh=UNTOUCHED; layers state=true dec=true out=true; stance wait/WAIT→flat/WAIT, pdh TOUCHED→UNTOUCHED, outcome missed→no_trade
- **nq-aug12-2026-cme** `2026-08-12T13:32:00.000Z` (wide_wick): control `flat/WAIT` pdh=TOUCHED → treatment `flat/WAIT` pdh=TOUCHED; layers state=true dec=true out=false; entry
- **nq-aug12-2026-cme** `2026-08-12T13:34:00.000Z` (wide_wick): control `wait/SHORT` pdh=TOUCHED → treatment `wait/SHORT` pdh=TOUCHED; layers state=true dec=true out=false; entry
- **nq-aug12-2026-cme** `2026-08-12T13:35:00.000Z` (wide_wick): control `flat/WAIT` pdh=TOUCHED → treatment `flat/WAIT` pdh=TOUCHED; layers state=true dec=true out=false; entry

---

## Method note

Per scenario the control arm is a **bar-close** request. Treatment evaluates **at** the intra-bar extreme (high or low) via `applyTick` from the prior snapshot — not after both extremes and a close fill. When close already matches the extreme print (doji at high/low), arms can still match; provisional mid-bar tags (e.g. forming `CLOSED_BEYOND` vs close `BREACHED`) are the intended layer-1/2 signal.

The live fingerprint HIT that **skips** applying Yahoo forming high while last print is unchanged is a **different** failure mode (freshness n=1). This study does not re-count that single PDH example as layer-3 evidence.
