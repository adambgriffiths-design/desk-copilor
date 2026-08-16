# KAREN — liquidity timing / freshness representation audit

**DATE:** 2026-08-16  
**SCOPE:** PIT-safe information at decision time about when liquidity levels formed, when they were tested / breached / swept / closed-beyond, and the qualifying candle / tick.  
**COMPARE:** Internal engine state vs `featuresAtT` (`liquidity_repr_v0` / `liquidity_repr_v1`).  
**EDGE_CLAIM:** NONE  
**OUTCOMES:** NO  
**VAL / HOLDOUT / unlock / ALS:** not inspected  

Related SoT: [`karen-liquidity-internal-vs-featuresAtT.md`](./karen-liquidity-internal-vs-featuresAtT.md), [`karen-liquidity-representation-v1.md`](./karen-liquidity-representation-v1.md)

---

## STATUS (2026-08-16) — **PASS**

| Gate | Result |
|------|--------|
| Wire session `*Time` → `obs.liquidity.levels[].formedAt` (asia / london / ny_rth) | **DONE** — `lib/observation-engine.ts` `buildLiquidityLevels` |
| PD `formedAt` retained | **DONE** |
| `liquidity_repr_v1` stamp pass-through (`formedAt`, `qualifyingTickAt`, `qualifyingTickPrice`, `candleId`) | **DONE** — `lib/liquidity-stamp-features.ts` |
| Outcome-blind freq (smoke n=12) | **PASS** — 100% level rows with `formedAt`; session 72/72; PD 36/36; HTF stack 12/12 |
| Full Y=1500 dump enrich | **PROGRESSIVE** — 12/1075 merged (8GB host; ~14s/asOf PIT rebuild); use `--merge --skip-enriched --limit=N` batches |

Freq artifact: [`karen-liquidity-representation-freq-partial.md`](./karen-liquidity-representation-freq-partial.md)

**NEXT (locked):** full liquidity map (priority #2) — NY-pre, ORG, gaps, REH/REL, EQH/EQL — **not started**.

---

## Verdict (short)

| Question | Answer |
|----------|--------|
| What exists at decision time? | Per named PD/session level: final `status`, `formedAt` (PD + asia/london/ny_rth when `*Time` present), optional qualifying tick `{at, price, candleId}`, plus separate `liquiditySweeps[]` event times. |
| What is lost into `featuresAtT`? | With `liquidity_repr_v1` stamp/enrich: **almost nothing of the obs level-row timing**. Always lost: raw sweep-array / interaction-array history, `atLabel`, intermediate status ladder, interactions older than the 40×1m lookback, pools not on the named level list (#2). |
| Can freshness be represented deterministically? | **Yes** — ages are pure functions of known unix timestamps and decision `asOf`. No new detector vocabulary required. |
| Smallest justified upgrade | **DONE** — session extreme `*Time` → `formedAt` for asia/london/ny_rth. |

---

## 1. What Karen has internally at decision time (PIT)

All times below are **unix seconds** (not ms). Consumers that need ISO use `isoFromUnix` (tolerates sec or ms).

### 1.1 Formation (“when the level existed as this price”)

| Source | Fields | Semantics |
|--------|--------|-----------|
| `ctx.daily.pdhFormedAt` / `pdcFormedAt` | number? | Bar time when previous-day high / close source printed (`lib/levels.ts`) |
| `ctx.sessions.asiaHighTime` / `asiaLowTime` / `london*Time` / `nyPre*Time` / `nyRth*Time` / `nyPm*Time` | number? | Bar time when that session extreme was **printed** (`sessionHighLowWithTimes`) |
| `ctx.org.formedAtTime` | number? | ORG open presentation time (ORG not on `obs.liquidity.levels`) |
| REH/REL pools | `startTime`, `endTime?` | Pool formation window on `structureFacts.relativeEqualPools` |
| EQH/EQL research (`LiquidityArea`) | `formedAtLabel`, lifecycle times incl. `sweptAt` | Separate research path — not folded into desk `obs.liquidity.levels` |

**Mapped onto `obs.liquidity.levels[]` (`buildLiquidityLevels` in `lib/observation-engine.ts`):**

- `formedAt` for `pdh` / `pdl` ← `pdhFormedAt`; `pdc` ← `pdcFormedAt`
- Session levels: `asia_*` ← `asia*Time`, `london_*` ← `london*Time`, `ny_rth_*` ← `nyRth*Time`

### 1.2 Interaction / sweep / breach (“when price interacted”)

| Layer | What it records | Qualifying candle / tick |
|-------|-----------------|--------------------------|
| `classifyLevelInteraction` / `classifyReferenceCloseInteraction` (`lib/level-interaction.ts`) | Highest-ranked status in last **40** 1m bars | `QualifyingTick`: `timestamp`, `price`, `candleId` |
| `obs.liquidity.levels[]` | Folded: `status`, `qualifyingTickAt`, `qualifyingTickPrice`, `candleId`, `why`, `taken` | From `levelInteractions` |

**Lookback constraint (hard):** lookback = 40 (≈40 minutes of 1m). Pre-lookback interactions are invisible — detector horizon, not stamp loss.

### 1.3 Levels present on the observation surface

`buildLiquidityLevels` emits only: PDH, PDL, PDC, Asia H/L, London H/L, NY RTH H/L.  
NY-pre, ORG, NDOG/NWOG, REH/REL, EQH/EQL = priority **#2** (map completeness).

---

## 2. What `featuresAtT` carries

### `liquidity_repr_v1` (SoT)

Per level when present on obs: `id?`, `label`, `price`, `side?`, `taken`, `status?`, `source?`, `why?`, **`formedAt`**, **`qualifyingTickAt`**, **`qualifyingTickPrice`**, **`candleId`**.

Helpers: `lib/liquidity-stamp-features.ts`. Enrich: `scripts/karen-dv-enrich-liquidity-stamps-v1.ts`.

---

## 3. Outcome-blind frequency (smoke)

| Metric | Value |
|--------|------:|
| Stamps | 12 |
| Level rows with `formedAt` | 108 / 108 (100%) |
| PD rows with `formedAt` | 36 / 36 (100%) |
| Session asia/london/ny_rth with `formedAt` | 72 / 72 (100%) |
| Stamps with qualifyingTick* | 11 / 12 |
| Stamps with candleId | 11 / 12 |

---

## Governance

OUTCOMES_TOUCHED: **NO**  
UNLOCK: PARKED  
EDGE_CLAIM: NONE  
Priority #1 timing: **PASS** → #2 map / #3 sequence still **NOT_STARTED**.
