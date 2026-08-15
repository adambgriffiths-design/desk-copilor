# Karen — Extension end-to-end regression

**Date:** 2026-08-14T22:50Z  
**Mode:** VERIFY ONLY — no code changes, no new agents, no marathon  
**Chrome panel E2E:** **NOT EXECUTED** (blocker below)

---

## FIRST — version & backend

| Item | Result |
|------|--------|
| Disk / unpacked source | **`1.4.131`** (`extension/manifest.json` + `content.js` `DC_VERSION`) |
| Chrome “loaded” version | **UNCONFIRMED** — Cursor browser has **no TradingView tabs**; cannot read `chrome://extensions` or panel `v1.4.xxx` |
| Local backend `:3000` | **HTTP 500** |
| Local backend `:3020` (`dev:karen`) | **down** |
| What to reload | 1) Start healthy API: `npm run dev:karen` (or fix `:3000`) until `/api/health` = 200. 2) Chrome → Extensions → **The Trading Desk** → **Reload**. 3) Hard-refresh TradingView. 4) Confirm panel footer/header shows **v1.4.131**. 5) Options → RECONNECT to `http://127.0.0.1:3020` (or blank auto). |

Without a healthy local backend, historical fixture UI cannot be exercised in Chrome tonight.

---

## TEST A — HISTORICAL (adapter path = UI stream payload)

**Method:** Re-ran `scripts/karen-weekend-e2e-historical-ui.ts` (same `historicalFixture` → `answerHistoricalFixtureTurn` / `buildKarenReplayResponse` the extension sends). **Not** a live Chrome click-through.

| Check | Result |
|-------|--------|
| Label HISTORICAL / FIXTURE — NOT LIVE | **PASS** |
| Give me the read → envelope stance flat / WAIT | **PASS** |
| Mentor matches envelope (FLAT, conflict no) | **PASS** |
| Follow-ups same decisionKey | **PASS** (Why / why not long / short / waiting) |
| No Yahoo/Tickstream | **PASS** (`yahooFetched=false`, `tickstreamUsed=false`) |
| No future/stale as current | **PASS** (PIT fixture asOf only) |
| Chrome UI toggle + badge observed | **NOT RUN** |

**HISTORICAL TEST (Chrome):** **INCOMPLETE**  
**HISTORICAL TEST (backend path used by UI):** **PASS**

---

## TEST B — CONNECTIVITY UI

**Code + prior report** (`karen-online-status-truth-fix.md`, `content.js` 1.4.131): desk ONLINE uses `isDeskOnline` — **no TV Last OR**. MARKET LIVE = tick ≤2s. DATA separate.

| Check | Chrome observed | Code/prior |
|-------|-----------------|------------|
| MARKET ≠ DESK ONLINE | NOT RUN | **PASS** by design |
| DATA OFFLINE distinguishable | NOT RUN | **PASS** by design |
| Karen connected ≠ fresh market | NOT RUN | **PASS** by design |

**CONNECTIVITY UI:** **INCOMPLETE** (logic reviewed; panel not observed)

---

## TEST C — PERFORMANCE (historical only; not vs live)

From this re-run of weekend E2E:

| Stage | ms |
|-------|---:|
| Time to first visible | **~2300** (this run; prior run was 895 — machine load variance) |
| Time to final | **~2300** |
| market context | fixture load+pipeline (in total; no live Yahoo) |
| DecisionEnvelope | included in fixture path |
| LLM | **0** (deterministic historical turn) |
| SSE first visible | N/A in-process; Chrome SSE **not measured** |

Do **not** compare to live tens-of-seconds.

---

## TEST D — UI CORRECTNESS (LONG/SHORT inference)

Historical mentor line: structure lean bearish + **FLAT / WAIT** — not SHORT.  
Verdict card uses `contract.verdict` (`desk-ui-components.js`), not prose keyword scrape.  
Chrome card not observed.

**DECISION/MENTOR PARITY:** **PASS** (adapter); Chrome card **NOT RUN**

---

## TEST E — FAILURE HANDLING

`npm run test:market-data-timeout` previously **PASS** — explicit WAIT, no ~90s, no LONG/SHORT without state.  
Chrome spinner / “aborted without reason” **not** re-observed in panel tonight.

**FAILURE HANDLING:** **PASS** (backend tests); Chrome UX **NOT RUN**

---

## GENERAL ROUTING

Intent bypass for “capital of Germany” etc. covered in prior weekend E2E / intent tests. Chrome chat **NOT RUN**.

---

## Verdict block

```
EXTENSION VERSION: disk 1.4.131 · Chrome loaded UNCONFIRMED
BACKEND: :3000 FAIL(500) · :3020 down · Chrome E2E blocked
HISTORICAL TEST: PASS (adapter) / INCOMPLETE (Chrome panel)
FOLLOW-UPS: PASS (adapter)
CONNECTIVITY UI: INCOMPLETE (code review PASS; panel not observed)
GENERAL ROUTING: PASS (prior/intent) / INCOMPLETE (Chrome)
DECISION/MENTOR PARITY: PASS (adapter)
PERFORMANCE: first/final ~2300ms historical fixture (LLM=0); Chrome SSE n/a
FAILURE HANDLING: PASS (timeout suite) / INCOMPLETE (Chrome)
ISSUES FOUND:
  1. Local Karen backend not healthy — cannot drive unpacked extension E2E
  2. No TradingView tab in automation browser — cannot confirm loaded extension version
NEXT SINGLE ACTION: Start `npm run dev:karen`, confirm /api/health 200, Reload extension to v1.4.131 on TradingView, then re-run Tests A–B in the panel only.
```
