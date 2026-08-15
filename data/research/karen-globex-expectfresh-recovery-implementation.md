# KAREN — Globex expectFresh + open-market recovery (implementation)

**Date:** 2026-08-15 (Saturday)  
**Mode:** IMPLEMENT in isolated worktree only — **no apply to primary**, no commit / push / deploy  
**Worktree:** `.tmp/karen-market-closed-unify/` (detached HEAD / v1.4.73 baseline lineage)  
**Design:** `data/research/karen-market-closed-vs-feed-broken-design.md`  
**Priors:** `karen-market-closed-unify-report.md`, `karen-open-market-live-data-investigation.md`, `karen-general-chat-fix-verification.md`  
**Not touched:** `.tmp/karen-six-feature-clean/`, Redis / decision memory / envelope, continuous recorder, verdict-engine, interpretation/replay, secrets  

---

## Verdict

**Implemented in isolated worktree.** Karen now has an explicit CME Globex equity-index calendar classifier (`expectFresh`) that separates:

| Condition | Meaning |
|-----------|---------|
| **CLOSED / HOLIDAY / EARLY_CLOSE + old print** | **NORMAL** closed UX |
| **OPEN + old print** | **DATA_FEED_STALE / BROKEN** messaging |

Open-market Tickstream Last recovery is gated on `expectFresh===true` and the existing **60s** live gate. Dead/hung localhost falls through to Vercel (ported from general-chat-fix). Freshness thresholds were **not** raised.

---

## Key invariant (enforced)

```
MARKET CLOSED + OLD PRICE = NORMAL
MARKET OPEN  + OLD PRICE = DATA PROBLEM
expectFresh=false → never LIVE, never “feed broken” from age alone
Yahoo old close → never painted as LIVE recovery
```

---

## What shipped (4 pieces)

### 1. CME Globex calendar classifier

**New** `lib/cme-globex-session-status.ts`

- Injected `asOf` only (deterministic).
- Reuses `getEstMinutes` / `getEstDateKey` / `cmeSessionDateKey` (+ thin `cmeSessionDateKeyFromDate` wrapper) — **no second session-day system**.
- Regular schedule: Sun 18:00 ET → Fri 17:00 ET; Mon–Thu 17:00–18:00 maintenance; Fri≥17:00→Sun&lt;18:00 weekend closed.
- Explicit CME equity-index holiday / early-close table (2025–2027 curated; not inferred from Sat/Sun/stale/UK bank holidays).
- Returns `{ marketState, expectFresh, reason, nextOpenEt?, estDateKey, cmeSessionKey, estMinutes }`.
- Helpers: `shouldRecoverLastFromQuote`, `classifyClosedVsBrokenUi`, `uiMessageForClosedVsBroken`.

`/api/quote` additive metadata (response unchanged otherwise):

- `marketState`
- `expectFresh`
- `lastPrintAgeMs`
- `marketReason`
- `nextOpenEt`

Yahoo last print is still returned when Tickstream is rejected by the **unchanged** 60s gate — but never labeled live via metadata (`expectFresh` is calendar-only).

### 2. Open-market recovery (`expectFresh=true` only)

In `extension/content.js`:

- When TV Last is missing/stale, `/api/quote` may recover Last **only if**:
  - `expectFresh === true`
  - source is `tickstream_live` / `tickstream_quote`
  - `lastPrintAgeMs ≤ LIVE_PRICE_MAX_AGE_MS` (60s)
- `noteLivePrice` accepts print timestamp so age is honest (does not restamp Yahoo as “now”).
- Yahoo / non-tickstream while open → **no** LIVE recovery paint.
- When `expectFresh === false`, last print may still show with **real age** under closed UX.

### 3. Localhost → Vercel failover

Ported `extension/api-config.js` from `.tmp/karen-general-chat-fix/`:

- Prefer live localhost when healthy.
- **800ms** live confirm before trusting cached local.
- On dead/timeout/hung local: clear trust and **fall through to Vercel** (no degraded sticky localhost).
- `extension/background.js`: use `cachedBase || resolveApiBase()` so local bases are allowed.

### 4. Closed vs broken UI messaging

`updateMarketBarUI` / `syncHeaderStatus`:

- `expectFresh=false` (CLOSED / HOLIDAY / EARLY_CLOSE) → shared closed UX (`STALE`/`UNAVAILABLE` badge), reason string, **never LIVE**.
- `expectFresh=true` + age gates fail → “Market open · data stale / feed problem” — **never “market closed”**.
- Existing badge vocabulary retained (`LIVE` | `STALE` | `UNAVAILABLE` | …).

---

## Thresholds (unchanged)

| Gate | Value | Status |
|------|------:|--------|
| TV LIVE UI | **2s** | unchanged (`TICK_LIVE_MAX_AGE_MS = 2000`) |
| Tickstream / live acceptance | **60s** | unchanged (`LIVE_PRICE_MAX_AGE_MS = 60_000`) |
| Observation stale bar | **120s** | unchanged (`STALE_BAR_SEC = 120`) |
| Connection market fresh | **60s** | unchanged |

No invent-ticks path. No weekend threshold inflation.

---

## Files changed (worktree only)

| File | Change |
|------|--------|
| **New** `lib/cme-globex-session-status.ts` | Classifier + recovery/UI helpers + holiday table |
| **New** `scripts/test-cme-globex-session-status.ts` | Design 16 + Adam 16 + adjacency |
| **New** `scripts/test-expectfresh-recovery-gate.ts` | Recovery gate + closed vs broken messages |
| **New** `scripts/test-api-config-failover.mjs` | api-config guards + live fallthrough timing |
| `app/api/quote/route.ts` | Additive session metadata |
| `extension/api-config.js` | Localhost-prefer + Vercel failover (ported) |
| `extension/background.js` | Allow local `cachedBase` in resolve path |
| `extension/content.js` | expectFresh recovery, closed UX, age-honest noteLivePrice |
| `tsconfig.tsbuildinfo` | incidental tsc cache |

**Untracked leftover (prior probe, not required):** `.tmp-market-closed-unify-probe.ts`

**Primary worktree product code:** not applied by this task.  
**Six-feature clean tree:** untouched.

---

## Tests run

| Test | Result |
|------|--------|
| `npx tsx scripts/test-cme-globex-session-status.ts` | **ok** (39 checks) |
| `npx tsx scripts/test-expectfresh-recovery-gate.ts` | **ok** |
| `node scripts/test-api-config-failover.mjs` | **ok** (local→Vercel ~368ms; hung→Vercel ~980ms) |
| `npx tsx scripts/test-connection-state.ts` | **ok** |
| `npx tsx scripts/test-chart-live-price.ts` | **ok** |
| `npx tsx scripts/test-tickstream-quote-unit.ts` | **ok** (10 passed) |
| `npx tsc --noEmit` | **ok** (exit 0) |
| Forbidden scan on changed files (`continuous-decision-recorder`, `decision-memory-material`, `withManualAnalysePriority`) | **clean** |

### Pre-existing / out of scope

- Primary worktree already had unrelated dirty files before this task; **not** modified for this feature.
- Open Globex browser verification of TV→Tickstream recovery **not** claimed (market closed Saturday; code-path + unit gates only).
- Observation `stale_bar` weekend reinterpretation for decide-path left as design “later” — not required for this shipset.

---

## Forbidden / safety checklist

| Rule | Status |
|------|--------|
| Isolated worktree only | **PASS** |
| No commit / push / deploy | **PASS** |
| No six-feature clean touch | **PASS** |
| No freshness threshold raise | **PASS** |
| No Yahoo-as-LIVE | **PASS** (recovery gate rejects Yahoo) |
| No UK bank holiday as CME holiday | **PASS** (2026-08-31 OPEN, not HOLIDAY) |
| No Redis / recorder / verdict-engine / decision-layer edits | **PASS** |

---

## Apply notes (for Adam — not done)

To promote later: copy the listed worktree files into primary (or cherry-pick once committed from the worktree). Re-run the four new/focused scripts + `tsc --noEmit` after apply. Smoke during next Globex open: kill TV ticks briefly and confirm Tickstream ≤60s recovers Last as non-invented STALE/LIVE-by-age only when `expectFresh=true`.

**STOP.** No apply to primary. No commit / push / deploy.
