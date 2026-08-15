# KAREN — Complete Decision History Integrity Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no commit/push/deploy, no new cache/tick/replay rewrite  
**Scope:** LIVE **or** HISTORICAL DecisionEnvelope store → retrieve without hindsight contamination  
**Modules:** `lib/decision-envelope-history.ts`, `lib/decision-history-query.ts`, `lib/decision-time-travel.ts`, `lib/research/replay/historical-ui.ts`, LIVE record path in `lib/desk-pipeline.ts`  
**Regression:** `npm run test:decision-history-time-travel` → **58 passed, 0 failed**  
**Probe:** `.tmp-decision-history-integrity-probe.ts` (audit-only; not product)

---

## Case matrix (1–10)

| # | Case | LIVE | HISTORICAL |
|---|------|------|------------|
| 1 | One decision at T → retrieve at T → exact same | **PASS** (same entry ref; stance/thesis/asOf match) | **PASS** (exact 09:31 lookup; fields present) |
| 2 | Decision changes at T+5 → ask about T → still T | **PASS** | **PASS** (between/since uses earlier PIT snap) |
| 3 | Ask about T+5 → later decision | **PASS** (`findDecisionAtOrBefore(T+5)` → later) | **PASS** |
| 4 | No decision → deterministic miss; no reconstruct | **PASS** (`live_decision_missing` / NO DECISION AVAILABLE) | **PASS** (08:31; no invention) |
| 5 | Multiple same minute → deterministic ordering | **PASS*** (append order; same hash+stance within 60s **dedup keeps first**) | **PASS** (barIndex / nearest-previous deterministic) |
| 6 | Same decisionKey repeatedly → same stored | **PARTIAL** (dedup by `stateHash`+stance; **`decisionKey` not persisted**) | **PASS** (synthesized key stable per fixture@barIndex\|stance\|verdict\|asOf) |
| 7 | Market state changes after → earlier not rewritten | **PASS** (prior entry price/thesis/asOf frozen) | **PASS** (PIT rebuild + stored ring immutable) |
| 8 | Future market data exists → earlier must not use it | **PASS** (`asOf > target` excluded) | **PASS** (`ReplayDataCutoff` + `assertNoFutureLeak`; truncated parity in suite §6) |
| 9 | Session boundary → no leak | **FAIL** (EST minute-of-day only; prior-day 09:31 returned) | **PASS** with session `barIndex` cap |
| 10 | LIVE vs HISTORICAL/FIXTURE isolation | **PASS** | **PASS** (separate rings; suppress LIVE auto-record; banners) |

\*Same-minute different stance/hash both retained in order; identical hash+stance collapsed.

---

STORAGE:
In-memory dual rings (`LIVE` max 80, `HISTORICAL` max 80) via `recordDecisionEnvelopeHistory`. Authoritative `DecisionEnvelope` stored whole (`stance`, `thesis`, `conflictLog`, `invalidation`, `layers`, `reasoningChain` with `detected`/`usedInDecision`). Market snapshot identity via `stateHash` + optional `marketState.snapshotId` / price / HTF / structure. `asOf` + `recordedAt` timestamps. LIVE pipeline records from `runDeskPipeline` when not suppressed. HISTORICAL records on PIT lookup (`force: true`) / historical-ui. **Gap:** input `decisionKey` accepted but **never written** onto the entry object. LIVE same-minute dedup drops later thesis/evidence when `stateHash`+stance unchanged within 60s. Process-local only (restart clears history → honest miss).

RETRIEVAL:
“What was your decision at HH:MM?” / “N minutes ago” / between / what-changed parse via `parseDecisionHistoryQuery` → `answerLiveDecisionHistoryQuery` or `answerHistoricalDecisionTimeTravel`. Retrieval returns the **stored / PIT DecisionEnvelope** for that point — not a re-decide from later chart state. LIVE uses `findDecisionAtOrBefore` (filters `asOf > target`) or clock map on LIVE ring. HISTORICAL rebuilds at fixture bar with cutoff (no future bars). Empty → deterministic `NO DECISION AVAILABLE` / `*_decision_missing` (no invention on this path). Soft LIVE lookback skew: `maxSkewMs = max(lookback, 15m)` can label a ~20m-old entry as “10m ago” (mislabel, not future leak).

TIMESTAMP INTEGRITY:
`asOf` is the decision time index; `recordedAt` is wall-clock write time. Case 1–2–7 probes: retrieve-at-T returns original `asOf`; later market/decision entries do not mutate earlier rows. HISTORICAL `asOf` is fixture bar time; session `barIndex` caps look-ahead within fixture. **LIVE risk:** clock queries match EST HH:MM only — no calendar/session date — so “at 09:45” can bind a prior session’s entry (case 9 FAIL). LIVE `asOf` may fall back to `state.updatedAt` / now if `lastBarTime` missing (skew risk).

DECISIONKEY INTEGRITY:
HISTORICAL / reply path synthesizes `decisionKey` as `{fixtureId\|lane}@{barIndex}|{stance}|{verdict}|{asOf}` at snapshot time — stable for same PIT inputs; present on at-time replies. LIVE recorder **does not persist** caller `decisionKey`; entry identity for dedup is `stateHash`+stance (+fixture/bar for HISTORICAL). Repeated same hash+stance within 60s returns the **same stored entry** (case 6 behavioral PASS via dedup, schema PARTIAL). Audit field check lists `decisionKey(persisted)` as missing on LIVE ring entries.

FUTURE-DATA LEAKAGE:
**PASS** for retrieval contamination. LIVE: `findDecisionAtOrBefore` ignores `asOf > target`; probe with future-dated entry still returns past thesis. HISTORICAL: `ReplayDataCutoff.assertNoFutureLeak` + slice checks; suite proves injected future bar fails and early envelope stance matches truncated rebuild. Residual: LIVE soft-skew may answer with an **older** entry than requested lookback (not future data). Record-time honesty (pipeline must have used then-available market) is assumed for LIVE stored envelopes.

LIVE/HISTORICAL ISOLATION:
**PASS.** Separate arrays; `lane`/`dataMode` never mixed. Historical builds use `withDecisionHistorySuppressed` so LIVE auto-record does not fire; HISTORICAL uses `force` for explicit PIT capture. Suite §7: after historical build LIVE ring empty of HISTORICAL labels; after LIVE insert historical still only HISTORICAL; answers carry distinct banners (`LIVE — CURRENT SESSION HISTORY` vs `HISTORICAL / FIXTURE — NOT LIVE MARKET DATA`). Probe: LIVE thesis not present in HISTORICAL ring.

MULTIPLE-DECISION HANDLING:
Deterministic append order. LIVE: within 60s, identical `stateHash`+stance → keep first (second discarded). Different stance or hash → both kept; latest at-or-before target wins. HISTORICAL: one PIT decision per barIndex/clock hit; nearest-previous when exact clock missing. No reconstruction of a missing timestamp from later envelopes (case 4).

WHAT-CHANGED:
`compareDecisionSnapshots` compares **two recorded snapshots** only (refuses if earlier.asOf > later.asOf). Formatted sections: (1) MARKET STATE CHANGE (price/htf/structure/displacement/fvg), (2) INTERPRETATION, (3) DECISION CHANGE (stance/verdict/tradeDirection/conflicts/invalidation) + DECISION CHANGED YES/NO. Wired for between / since / why_changed / what_changed on both lanes. Does **not** re-run the market from “today” onto the earlier clock. Suite §4–5 cover changed vs unchanged HISTORICAL pairs.

TRADE-EXECUTION CLAIM SAFETY:
Compare/at-time paths do **not** claim a trade was executed, filled, or entered. Spoken lines use `formatMentorTradeSpoken` → label `TRADE DECISION:` meaning **stance/read**, not a fill ledger. False-positive audit regex on “fill” matched **“unfilled FVG”** in evidence prose — not an execution claim. No execution-record gate is required on this path because it never asserts fills; mentors must not treat DecisionEnvelope history as trade ledger (separate trade-history hallucination concern).

TESTS:
`npm run test:decision-history-time-travel` — **58 passed, 0 failed** (parse, exact/nearest, missing, changed/unchanged, future-leak, LIVE/HISTORICAL isolation). Suite is strong on HISTORICAL PIT; LIVE minutes-ago / session-boundary / soft-skew / decisionKey persistence are covered by this audit probe, **not** locked in that regression file. Companion: `test:decision-envelope` available but not required for this run.

PASS/FAIL:
**CONDITIONAL PASS** — Core integrity holds: store → retrieve at T without hindsight, T+Δ later decision, empty → deterministic miss, no future-asOf into past answers, no rewrite of earlier envelopes, LIVE/HISTORICAL isolation, what-changed compares recorded states without execution claims. **FAIL gaps blocking a clean PASS:** (1) LIVE session-boundary clock leak across calendar days, (2) `decisionKey` not persisted on stored entries, (3) LIVE soft 15m skew mislabels lookback, (4) LIVE same-minute dedup can drop thesis/evidence drift. HISTORICAL path for the same scenarios is largely **PASS**.

---

## Field verification (retrieved historical / LIVE entry)

| Field | LIVE ring | HISTORICAL snapshot |
|-------|-----------|---------------------|
| timestamp (`asOf`) | Yes | Yes |
| decisionKey | Synthesized at reply; **not on entry** | Synthesized; stable |
| market snapshot identity | `stateHash` / `snapshotId` | `stateHash` (+ bar) |
| stance | Yes | Yes |
| thesis | Yes | Yes |
| evidence | `layers.facts` / chain | Yes |
| conflicts | `conflictLog` | Yes |
| invalidation | Yes | Yes |
| detected vs used | On `envelope.reasoningChain` when present | Present on PIT envelopes |

---

## Stop

Audit complete. No remediation code, commit, push, or deploy performed.
