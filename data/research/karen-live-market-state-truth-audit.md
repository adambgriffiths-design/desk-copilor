# Karen live market-state truth audit

**Date:** 2026-08-14  
**Mode:** AUDIT ONLY — no production edits, no commit/push/deploy, no next-dev, no OpenAI/HTTP marathons.  
**Code read:** `lib/level-interaction.ts`, `lib/structure.ts`, `lib/levels.ts`, `lib/market-data.ts`, `lib/incremental-market-engine.ts`, `lib/observation-engine.ts`, `lib/observation-facts.ts`, `lib/decision-envelope.ts`, `lib/conversational-query.ts`, `lib/market-intelligence.ts`, prior reports below.  
**Probes:** `npx tsx scripts/probe-pdh-visibility-cases.ts` (disposable); prior `scripts/test-live-decision-freshness.ts` findings reused. Production engines not modified.

**Prior reports consulted:**
- `data/research/karen-live-decision-freshness.md`
- `data/supervisor/results/research-market-state-truth-audit.md`
- `data/supervisor/results/research-pdc-status-verification.md`
- `data/supervisor/results/research-pdc-level-provenance.md`

---

## Verdict

Local data-layer PDH semantics **match the intended ICT contract** when the engine actually sees the extreme: wick-through = `BREACHED` (not taken); body close beyond = `CLOSED_BEYOND` (= qualifying taken); retract on the same forming bar demotes take → breach.  

**Stale / visibility gaps can still produce false trading statements** — chiefly **false UNTOUCHED / “not swept”** when 30217 never reached the engine, and **provisional / frozen “taken”** on forming-bar `CLOSED_BEYOND` or same-minute follow-up cache. The historical **false PDH TAKEN while price is below PDH** (side-blind sweep) is fixed in this tree; do not re-invent a `TAKEN` or `INVALIDATED` status for PDH.

---

## Actual status names (do not invent)

From `lib/level-interaction.ts` `NamedLevelStatus`:

| Enum | PDH meaning in current code |
|---|---|
| `UNTOUCHED` | No 1m tag of the level in lookback (40) |
| `TESTED` | High stopped 1 tick (0.25) short of PDH |
| `TOUCHED` | Exact tag of PDH without trading through |
| `BREACHED` | High traded through PDH; close not beyond |
| `CLOSED_BEYOND` | Body close > PDH **and** high ≥ PDH — **only** qualifying “taken” |
| `SWEPT` | Reserved for EQH/EQL wick detector — **not** emitted by `classifyLevelInteraction` for PDH |
| `INVALIDATED` | Present on the type; **never set** by PDH/PDL classifiers. EQH lifecycle / connection reload use the word elsewhere |

**There is no `TAKEN` status string.** Spoken / observation “taken” is `taken: true` iff `isQualifyingTaken(status)` → `status === "CLOSED_BEYOND"` **and** provenance gates pass (`canProvePdhTaken`: `pdhSource === "cme_session_1m"`, qualifying candle id/time/price, quality not stale/missing).

**PDC** is **not** a sweepable pool. It uses `classifyReferenceCloseInteraction` via `isReferenceInteractionLevel("pdc")`; excluded from `detectLiquiditySweeps` / `liquidity.sweep.pdc` facts.

---

## End-to-end chain (SOURCE → SPOKEN)

```
SOURCE DATA
  TV last / Tickstream / Yahoo 1m OHLC (+ Yahoo 1d fallback)
  → overlay last print (chat/snapshot/verdict); /api/levels often Yahoo-only
        │
TRANSFORM
  CME Globex 18:00 ET session windows (market-data / levels)
  → PDH/PDL/PDC from prior Globex 1m aggregate (pdhSource=cme_session_1m)
  → current session / Asia / London / NY H-L from session bars
  → incremental applyTick: forming 1m H/L = max/min of prints seen
  → syncSeries same-length: copy Yahoo OHLC then applyTick (only if reuse MISS)
        │
STATE
  ctx.daily.previousDayHigh / currentDayHigh / lastClose
  ctx.htfPdArrays.previousDay.{high,low,close}
  ctx.sessions.* High/Low
  structureFacts.levelInteractions[pdh|pdl|…]  ← classifyLevelInteraction
  structureFacts.liquiditySweeps               ← PDH/PDL only if CLOSED_BEYOND
  structureFacts.mss / m1UnfilledFvgs / REH-REL
        │
DECISION ENVELOPE
  observation.liquidity.levels[].{status,taken,candleId,…}
  observation-facts liquidity.pdh value “… — BREACHED|CLOSED_BEYOND|not swept”
  decision-envelope liquidity_sweep_pdh outcome true only if taken===true + proof
  quality-gate / live intel reuse may freeze envelope (see freshness audit)
        │
SPOKEN OUTPUT
  answerFromIntelligence → fact_lookup liquidity.pdh / liquidity topic
  formatStructureCompact / LLM prompt: “liquidity taken” only if CLOSED_BEYOND
  mentor / DEEP paths still consume intel object (follow-up can freeze it)
```

---

## Concrete scenario: 30214 → 30217 → 30215, PDH = 30216

Fixture: Globex prior session forms PDH **30216**; forming bar starts H=30214.25 C=30214.

### Pure bar classifier (ground truth)

| Forming H / C | `classifyLevelInteraction` | `isQualifyingTaken` |
|---|---|---|
| 30214.25 / 30214 | `UNTOUCHED` | false |
| 30217 / 30217 | `CLOSED_BEYOND` | true |
| 30217 / 30215 | `BREACHED` | false |
| 30215 / 30215 (never 30217) | `UNTOUCHED` | false |
| 30216 / 30215.5 | `TOUCHED` | false |
| 30215.75 / 30215 | `TESTED` | false |

### PDH status matrix — four visibility cases

| Visibility | What the engine did | Forming H/C after | PDH status | Qualifying taken | Matches intent? |
|---|---|---|---|---|---|
| **1. Engine saw 30217 print** (at 30217) | `applyTick(30217)` expands H+C | 30217 / 30217 | **`CLOSED_BEYOND`** | **true** | Yes — provisional take on forming close |
| **1b. Same, after return to 30215** | `applyTick(30215)`; high kept | 30217 / 30215 | **`BREACHED`** | **false** | Yes — take revoked on same unclosed 1m |
| **2. Bar high contains 30217** (init/sync with H=30217, C=30215; never printed 30217 as last) | Full OHLC present in feed | 30217 / 30215 | **`BREACHED`** | **false** | Yes |
| **3. Yahoo forming high = 30217**, last print still 30214 | Live reuse **HIT** → `applyTick` **skipped**; Yahoo high **not merged** | engine still 30214.25 / 30214 | **`UNTOUCHED`** | **false** | **No vs chart** — false negative |
| **3b. Yahoo high = 30217 + price MISS** (e.g. print 30215) | `syncSeries` copies Yahoo OHLC then `applyTick` | 30217 / 30215 | **`BREACHED`** | **false** | Yes |
| **4. Neither source saw 30217** | Jump `30214→30215` only | 30215 / 30215 | **`UNTOUCHED`** | **false** | Correct for engine; **false vs chart** if wick happened off-feed |

**When PDH should be each status (intended = current classifiers):**

| User word | Actual enum / flag | When |
|---|---|---|
| UNTOUCHED | `UNTOUCHED` | No tag in current Globex session 1m lookback |
| BREACHED | `BREACHED` | High through PDH, close ≤ PDH |
| CLOSED_BEYOND | `CLOSED_BEYOND` | Close > PDH and high ≥ PDH |
| TAKEN | **not an enum** — `taken=true` only with `CLOSED_BEYOND` + `canProvePdhTaken` | Same as CLOSED_BEYOND with Globex proof |
| INVALIDATED | **not used for PDH** | No classifier path sets it |

---

## Field-by-field truth (source → spoken)

### PDH / PDL

- **Source:** Prior CME Globex 1m session H/L (`aggregateSessionBar` / extreme bar), not Yahoo calendar daily when 1m present (`pdhSource=cme_session_1m`).
- **Transform:** Side-aware `classifyLevelInteraction` on **current** Globex session bars only (`pdIds` → `sessionM1`).
- **Taken:** `CLOSED_BEYOND` only; wick = `BREACHED`. Opposite-side close below a high does **not** take PDH (prior CRITICAL bug fixed).
- **Spoken:** Fact value `… — not swept` / `— BREACHED` / swept note when `taken===true`. Envelope cites `liquidity_sweep_pdh` only when proven.

### PDC

- **Source:** Prior Globex last 1m close (`sessionCloseBar`) — e.g. 30216.25 vs Yahoo settlement 30188.50 (provenance audit).
- **Transform:** `classifyReferenceCloseInteraction` (must **tag** the level; entirely-below bars do not count as take).
- **Not** in `liquiditySweeps`. No `liquidity.sweep.pdc` fact.
- **Spoken:** Status on `liquidity.pdc`; must not be narrated as a PDH raid.

### Session highs/lows + current day H/L

- **Source:** Session window bars (Asia/London/NY) + current Globex session aggregate; `applyTick` lifts `currentDayHigh/Low` from forming 1m.
- **Interaction:** Same named statuses via `classifyLevelInteraction` / sweeps for `*_high`/`*_low`/ORG tops.
- **Risk:** Asia “yesterday” still uses local `setDate` path (prior PARTIAL). Forming extremes only as good as last print / Yahoo merge.

### Liquidity taken / breached / untouched

- Authoritative: `structureFacts.levelInteractions` + observation `status`/`taken`.
- Sweeps list gated: PDH/PDL enter `liquiditySweeps` only if interaction is `CLOSED_BEYOND`.
- EQH/EQL `SWEPT` (wick) is a **different** detector — do not collapse into PDH taken.

### Forming-bar extremes

- `applyTick` only expands H/L from the **price argument** (`Math.max(last.high, price)`).
- Reuse HIT ignores Yahoo forming OHLC updates → **missed wick** (case 3).
- Forming `CLOSED_BEYOND` is live-provisional; retracting close on same minute correctly becomes `BREACHED` without full rebuild.

### Structure (MSS / swings)

- Rebuilt on tick when H/L expands or tracked level crossed; otherwise skipped.
- HIT skips rebuild entirely → forming wick invisible to MSS/FVG detectors too.

### FVGs

- `detectM1UnfilledFvgs` / first-presented on current 1m series including forming bar when structure rebuild runs.
- Same visibility dependency as PDH (need applyTick / bar sync).

### HTF levels

- Reuse key / sync: 5m/15m/daily **identity** (count + first/last time), not forming HTF OHLC.
- Forming 15m high expansion does **not** invalidate reuse or lift HTF range on tick-only path (freshness audit).
- New HTF bar length → full rebuild.

---

## Stale → false trading statement risks

| Risk | Direction | Mechanism | Severity |
|---|---|---|---|
| **Missed 30217 wick** (case 3 HIT / case 4) | False **UNTOUCHED** / “not swept” while chart wick through PDH | Reuse HIT skips Yahoo high; or last print never showed extreme | **High** (false calm) |
| **Forming CLOSED_BEYOND then retract** | Transient **taken** then correct BREACHED | Forming close > PDH while 1m open | **Medium** — correct per live OHLC; dangerous if spoken as confirmed session take |
| **Follow-up same wall-clock minute** | Frozen envelope: taken↔not-taken lag | Intel reuse ignores price (`karen-live-decision-freshness.md`) | **High** for “what changed” / liquidity-now |
| **Quality-gate weak `state_hash`** | Envelope identity reused while PDH status moved | `candleHash\|lastPrice\|quality` omits structure/sweeps | **High** with stale TV snapshot ≥20 candles |
| **Yahoo 45s TTL + no overlay** (`/api/levels`) | Stale OHLC / last | Levels path without TV last | **Medium** |
| **No request between ticks** | Silent stale | Engine only advances on chat/snapshot/verdict | **By design / High between questions** |
| **Side-blind PDH take** (price below PDH) | False **TAKEN** | Old `close < PDH` on highs | **CRITICAL historically — fixed in this tree** |
| **Wrong PDH price (calendar daily)** | Wrong level + wrong status | Yahoo daily vs Globex | **CRITICAL historically — fixed when 1m present** |
| **PDC/PDO sweep facts → “PD liquidity taken”** | Model says PDH taken | Non-pool sweeps in prompt | **Fixed in this tree** (excluded + CLOSED_BEYOND gate) |
| **HTF forming extreme** | Stale HTF range in bias/levels | Forming 15m/5m OHLC not in key | **Medium** |
| **Empty observation levels on bad quality** | Deterministic fact_lookup silent; LLM may still see structure compact / ctx | `buildLiquidityLevels` returns `[]` if unknown quality | **Medium** (probe: no `liquidity.pdh` fact without chart snapshot) |

**Highest-priority false statement class remaining:** not the old “PDH taken while Last below PDH”, but **“PDH untouched / not swept” while the chart already wicked 30217** because the request never carried that extreme (HIT-skip Yahoo high, or tick gap).

---

## Does current code match intended statuses?

| Contract | Match? |
|---|---|
| Wick ≠ taken; body close beyond = taken | **Yes** (`BREACHED` vs `CLOSED_BEYOND`) |
| Forming take revoked when close returns below on same bar | **Yes** (probe 1a→1b) |
| PDH side-aware (no sell-side take of a high) | **Yes** in `detectLiquiditySweeps` + `classifyLevelInteraction` |
| Globex PDH/PDC provenance | **Yes** when `cme_session_1m`; Yahoo fallback → `taken="unknown"` |
| PDC not a sweepable pool | **Yes** |
| Visibility-complete live truth (every chart wick) | **No** — request-current, reuse HIT drops Yahoo forming high |
| `INVALIDATED` for PDH | **N/A** — unused; do not invent |
| Spoken always mirrors `levelInteractions` | **Partial** — gated by observation quality, follow-up freeze, LLM path |

---

## Probe commands (re-run)

```text
npx tsx scripts/probe-pdh-visibility-cases.ts
npx tsx scripts/test-live-decision-freshness.ts
```

Disposable probe path: `scripts/probe-pdh-visibility-cases.ts` (audit-only; not wired in package.json).

---

## Return summary

**PDH matrix (30214→30217→30215, PDH 30216):**  
(1) saw print → `CLOSED_BEYOND` then `BREACHED`;  
(2) bar high has 30217 → `BREACHED`;  
(3) Yahoo high only + reuse HIT → **`UNTOUCHED` (stale miss)**; Yahoo high + price MISS → `BREACHED`;  
(4) neither saw 30217 → `UNTOUCHED`.

**Stale-false risks:** missed-wick false calm; forming/follow-up/quality-gate false or lagging take; historical false take fixed locally.  

**Code vs intent:** classifier semantics match; live visibility / cache layers do not always match the chart.
