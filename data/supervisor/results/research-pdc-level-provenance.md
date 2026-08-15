# PDC level provenance

**Date:** 2026-08-14  
**Scope:** Previous Day Close **price** correctness (CME Globex session) — not TAKEN/swept first  
**Not in scope:** ICT hierarchy redesign, P&L, commit/push/deploy, PDH/PDL (except shared session window)

---

## Report card

| Field | Value |
|---|---|
| **FIRST WRONG STAGE** | `sliceDailyForAsOf` / HTF prev bar **close** when Yahoo daily was the source (or production still on Yahoo-daily prev). Wrong property = **close price**, not interaction status. |
| **EXACT PROPERTY** | `htfPdArrays.previousDay.close` → observation/market-state `PDC` / Analyse `LIQUIDITY: PDC …` |
| **SOURCE (wrong)** | Yahoo `MNQ=F` **1d** calendar/settlement close |
| **OLD VALUE** | **30188.50** |
| **CORRECT VALUE** | **30216.25** (last 1m close of prior CME Globex session) |
| **SOURCE CANDLE TIMESTAMP** | `2026-08-13T20:59:00.000Z` = **16:59 ET** Thu (session key `2026-08-13`) |
| **SESSION WINDOW** | Globex prior session `2026-08-13`: **2026-08-12 18:00 ET → 2026-08-13 16:59 ET** (roll at 18:00 ET; daily halt ~17:00–18:00) |
| **KAREN INPUT BEFORE** | PDC **30188.50** (Analyse panel: `PDC 30188.50 taken` alongside PDH 30273.25 / PDL 29780.50 — H/L matched Globex; **close was Yahoo**) |
| **KAREN INPUT AFTER (local)** | PDC **30216.25**, `pdhSource=cme_session_1m`, `pdcFormedAt=1786611540` (16:59 ET), brief: `PDC 30216.25 (CME Globex last 1m; Yahoo settlement 30188.50 ignored)` |
| **ROOT CAUSE** | Yahoo daily **close ≠ Globex last-trade close** (same session often shares O/H/L). Settlement/calendar close **30188.50** was emitted as PDC while TradingView ETH/Globex previous-day close tracks the **16:59** last print **30216.25**. |
| **FIX** | Prefer prior Globex 1m `aggregateSessionBar(...).close` (= `sessionCloseBar`); never mix Yahoo close with Globex H/L. Add provenance: `previousDayClose`, `pdcFormedAt`, `yahooDailyClose` (diagnostic), market-state `pdcSource`/`pdcFormedAt`, PD brief line. |
| **TESTS** | `npx tsx scripts/test-market-state-truth.ts` — **85 passed, 0 failed** (includes `PDC LEVEL PROVENANCE` Globex≠Yahoo) |
| **BUILD** | `npm run build` **FAIL** — pre-existing unrelated type error in `app/api/chat/stream/route.ts:325` (async iterator). PDC modules exercised via tsx tests. |
| **LIVE** | **PARTIAL** — local Yahoo+1m probe (no TV Last/PDC attach). Backend provenance below. TV chart price not invented. |

---

## End-to-end chain

```
Yahoo 1m (7d) + Yahoo 1d
  → cmeSessionDateKey (18:00 ET roll)
  → priorCmeSessionKey / barsInCmeSession
  → aggregateSessionBar / sessionCloseBar   ← PDC PRICE
  → computeHtfPdArrays.previousDay.close
  → market-state.levels.pdc + observation liquidity PDC
  → PD brief / Analyse / Karen prompt
```

Fallback only when prior Globex 1m missing: `yahoo_daily_fallback` (settlement close) — must not be treated as proved Globex PDC for TAKEN.

---

## LIVE probe (local, 2026-08-14 ~10:17 ET)

| Candidate | Close | Notes |
|---|---|---|
| Globex last 1m (16:59 ET) | **30216.25** | Correct PDC |
| RTH 16:15 ET | 30207.75 | ORG/RTH anchor — **not** PDC |
| Yahoo 1d | **30188.50** | Wrong PDC (user/Karen old value) |
| Local Karen emit | **30216.25** | `cme_session_1m` |

PDH/PDL from same Globex session: **30273.25 / 29780.50** (match Analyse H/L; only close was wrong).

**TradingView:** With **ETH/Globex** session template, previous-day close ≈ last trade before 17:00 halt (~16:59) → expect **~30216.25**. RTH template uses ~16:00/16:15 (**30207.75**). Yahoo settlement (**30188.50**) is a third convention. This audit does not invent a TV screenshot price — **PARTIAL**.

---

## TAKEN / BREACHED / UNTOUCHED (after level is correct)

Apply only to the **correct** level **30216.25**:

| Status | Rule (existing) | PDC note |
|---|---|---|
| UNTOUCHED | No tag | Default until interaction |
| TESTED / TOUCHED / BREACHED | Wick/tag rules | Not “taken” |
| CLOSED_BEYOND | Body close beyond | For highs/lows pools |
| **Sweepable?** | **No** — `pdc` excluded from sweepable pools (`lib/structure.ts`) | Do **not** treat close-through PDC as a PDH raid; do **not** use liquidity detector to paper over a wrong price |

Provenance first; interaction second.

---

## Files touched

- `lib/market-data.ts` — `sessionCloseBar`, Globex-close docs on `aggregateSessionBar`
- `lib/levels.ts` — PDC source bar + no Yahoo/Globex mix; `pdcFormedAt` / `yahooDailyClose`
- `lib/types.ts` — daily provenance fields
- `lib/observation-engine.ts` — PDC `formedAt` = close candle
- `lib/market-state.ts` / `market-state-build.ts` — `pdcSource`, `pdcFormedAt`
- `lib/pd-arrays.ts` — Karen brief provenance line
- `scripts/test-market-state-truth.ts` — fixture Yahoo 30188.50 vs Globex 30216.25

No commit / push / deploy.
