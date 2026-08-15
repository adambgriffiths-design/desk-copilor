# KAREN — Decision Timeline View Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes, no commit/push/deploy, no trading-logic / tick-engine / DB work  
**Scope:** Can Karen expose a simple chronological timeline of **recorded** `DecisionEnvelope` records only?  
**Evidence:** code paths + `npm run test:decision-history-time-travel` (**58 passed, 0 failed**) + prior integrity audit; no fabricated live records

---

## EXISTS: PARTIAL

**Storage + point/compare retrieval of recorded DecisionEnvelopes exists.**  
**A productized chronological “timeline view” (API / mentor list intent / UI that lists all recorded decisions with the ideal field set) does not.**

Do **not** confuse with `lib/decision-timeline.ts` / desk-tracker scrubber — that is a **different** in-memory tracker timeline (phase / verdict / watching), **not** DecisionEnvelope history.

---

## HOW TO USE

### 1. Authoritative ring (list / latest / previous / empty)

Module: `lib/decision-envelope-history.ts`

| Need | API |
|------|-----|
| Full chronological list (append order, max 80) | `getDecisionEnvelopeHistory("LIVE" \| "HISTORICAL")` |
| Latest recorded | `latestDecisionEnvelope(lane)` |
| Decision at-or-before timestamp | `findDecisionAtOrBefore(lane, targetAsOf, opts?)` |
| Clear (tests only) | `clearDecisionEnvelopeHistory(lane?)` |
| Record (pipeline / PIT) | `recordDecisionEnvelopeHistory({ asOf, lane, envelope, verdict, stateHash, … })` |

Lanes **never mix**. LIVE records from `runDeskPipeline` when not suppressed (`lib/desk-pipeline.ts`). HISTORICAL records on explicit PIT capture (`force: true`) / historical UI. Process-local memory only — restart → empty ring → honest miss.

### 2. Mentor time-travel (single point or pair compare — not a full list)

| Surface | Role |
|---------|------|
| `lib/decision-history-query.ts` | Parse clock / lookback / what-changed |
| `lib/decision-time-travel.ts` | `answerLiveDecisionHistoryQuery`, `answerHistoricalDecisionTimeTravel`, `formatAtTimeReply` |
| `app/api/chat/stream/route.ts` | LIVE: if `isDecisionHistoryTimeQuery(lastUser)` → time-travel reply (SSE) |
| Historical UI / fixture session | HISTORICAL PIT path (banner: `HISTORICAL / FIXTURE — NOT LIVE MARKET DATA`) |

Example mentor questions (recorded envelopes only on LIVE; HISTORICAL may PIT-rebuild into HISTORICAL ring):

- “What was your decision at 09:31?”
- “What was your decision 10 minutes ago?”
- “What changed?” / “Why did your decision change?”
- “What was different between 09:31 and 10:20?”

Empty → deterministic `NO DECISION AVAILABLE` / `*_decision_missing` (no invention on this path).

Regression: `npm run test:decision-history-time-travel`

### 3. Not DecisionEnvelope timeline

| Surface | What it is |
|---------|------------|
| `lib/decision-timeline.ts` + `GET/POST app/api/desk-tracker` | Desk-tracker candle-close scrubber (`TimelineEntry`: phase, status_color, watching) |
| Extension `dc-decision-timeline` | Consumes **desk-tracker** timeline JSON, not envelope history |

### 4. Ideal-field projection (conceptual — for a future view only)

From one `DecisionEnvelopeHistoryEntry` **without** re-running market logic:

```
timestamp     → entry.asOf (index) / entry.recordedAt (wall write)
decisionKey   → synthesize at read: `{fixtureId|lane}@{barIndex}|{stance}|{verdict}|{asOf}`
                (same as entryToSnapshot; NOT persisted on entry)
stance        → entry.stance / entry.envelope.stance  (long|short|flat|wait|monitor)
verdict       → entry.verdict / marketState.verdict   (LONG|SHORT|WAIT|NO_TRADE)
                TRADE vs WAIT ≈ toLegacyPipelineVerdict() → "trade"|"wait"|"no trade"
thesis        → entry.thesis / entry.envelope.thesis
invalidation  → entry.invalidation
confidence    → entry.confidence
entry status  → NOT on history entry / envelope (see FIELDS MISSING)
```

---

## FIELDS AVAILABLE

On stored `DecisionEnvelopeHistoryEntry` / nested `envelope`:

| Ideal field | Available? | Source |
|-------------|------------|--------|
| timestamp | **Yes** | `asOf`, `recordedAt`; optional `asOfEst` |
| decisionKey | **Partial** | Synthesized in `entryToSnapshot` / at-time replies; **input `decisionKey` accepted but never written onto entry** |
| stance LONG/SHORT/FLAT | **Yes** | `stance` (`long`\|`short`\|`flat`\|`wait`\|`monitor`) — not uppercase enums |
| verdict TRADE/WAIT | **Partial** | Stored as pipeline `TradingVerdict`: `LONG`\|`SHORT`\|`WAIT`\|`NO_TRADE`. Legacy TRADE/WAIT via `toLegacyPipelineVerdict` only — not a dedicated history field |
| thesis | **Yes** | `thesis` / `envelope.thesis` (`what`, `whyNow`, …) |
| entry status | **No** on envelope history | See missing |
| invalidation | **Yes** | `invalidation` `{ price, condition }` |
| confidence | **Yes** | `confidence` |

Also on entry (useful for timeline rows): full `envelope`, `conflicts`/`conflictLog`, `stateHash`, optional `marketState`, `fixtureId`, `barIndex`, `lane`.

At-time mentor reply already surfaces: asOf, decisionKey (synth), stance, verdict, confidence, spoken trade decision, thesis, conflicts, invalidation, market state snippet.

---

## FIELDS MISSING

1. **`entryStatus` (ACTIVE / WAIT / EXTENDED)** — lives on execution scaffold (`lib/execution-plan.ts` / ICT features), **not** copied onto `DecisionEnvelopeHistoryEntry` or `DecisionEnvelope`. Envelope has prose `logicOrder.execution` / WAIT FOR lines, not structured entry status.
2. **Persisted `decisionKey` on ring entries** — synthesized at reply time only (integrity audit case 6 PARTIAL).
3. **Literal TRADE/WAIT verdict column** — must map from LONG\|SHORT vs WAIT\|NO_TRADE if that label is required.
4. **Product timeline surface** — no HTTP list endpoint, no mentor “show my decision timeline” intent, no UI that iterates `getDecisionEnvelopeHistory` into chronological rows.

---

## LATEST / PREVIOUS / MULTIPLE / EMPTY BEHAVIOR

| Case | Behavior | Evidence |
|------|----------|----------|
| **Latest** | `latestDecisionEnvelope(lane)` → last ring entry or `null` | Helper + why-changed uses `live[live.length-1]` |
| **Previous** | `findDecisionAtOrBefore` / why-changed with `live[length-2]` vs latest / clock+compare | `answerLiveDecisionHistoryQuery`; integrity audit cases 1–3 |
| **Multiple** | Append order; LIVE max 80; same `stateHash`+stance within 60s **dedup keeps first**; different stance/hash both kept | `recordDecisionEnvelopeHistory`; tests + integrity probe |
| **Empty** | Deterministic miss: `NO DECISION AVAILABLE` / `live_decision_missing` / “Ask for a read first” — **no reconstruct from later market data** on LIVE path | `lookupLiveAtClock`, minutes-ago miss; suite missing cases |

HISTORICAL clock miss without bars → same miss language. HISTORICAL **at-time** may **PIT-build** a decision at a fixture bar (recorded into HISTORICAL ring) — that is fixture replay, not inventing from “later” live ticks; still not a multi-row timeline UI.

---

## RECONSTRUCTION RISK

| Risk | Assessment |
|------|------------|
| LIVE timeline from ring only | **Low** — `getDecisionEnvelopeHistory("LIVE")` returns stored envelopes; retrieval filters `asOf > target` |
| Confusing desk-tracker timeline for DecisionEnvelope timeline | **High if miswired** — different schema, can look like a “decision timeline” without envelopes |
| HISTORICAL at-time PIT rebuild | **Acceptable for fixture research** when labeled HISTORICAL; must not be sold as “live recorded timeline” |
| Mapping TRADE/WAIT or entryStatus from later market/execution | **Do not** — would invent fields not on the recorded envelope |
| LIVE session clock (HH:MM only, no calendar day) | **Known integrity gap** (prior audit case 9) — can bind wrong-day entry; not future leak, but wrong row |

**Rule for any timeline view:** project **only** fields present on stored entries; never recompute stance/verdict/entry from current bars.

---

## LIVE RECORDS AVAILABLE FOR TEST: NO

- Rings are **in-process memory** only; this audit session has **no** durable LIVE DecisionEnvelope store to inspect.
- Shape/behavior evidence: **empty LIVE ring** after HISTORICAL builds in `test:decision-history-time-travel` §7; **HISTORICAL** ring populated from fixture PIT; integrity probe / weekend smoke use in-process rings only.
- Do **not** treat test HISTORICAL entries as live session history.

---

## FIRST MISSING LINK

**No consumer exposes `getDecisionEnvelopeHistory` as a chronological DecisionEnvelope timeline** (HTTP list / mentor “list all recorded decisions” / UI rows).

Storage + latest/previous/empty + point-in-time mentor answers already exist. Secondary gap for the ideal row schema: **`entryStatus` is not recorded on the envelope history entry.**

---

## SAFE NEXT STEP

**(Document only — do not implement in this audit.)**

1. Add a **read-only** helper or API that returns `getDecisionEnvelopeHistory(lane).map(projectRow)` with fields present on the entry (asOf, synthesized decisionKey, stance, verdict, thesis summary, invalidation, confidence) — **no** market recompute, **no** entryStatus until it is recorded at write time.
2. Keep desk-tracker `decision-timeline` clearly labeled as **non-envelope**.
3. Optionally persist `decisionKey` at `recordDecisionEnvelopeHistory` time (integrity gap) before relying on it as a stable timeline id.
4. Do **not** invent LIVE rows for demos; use HISTORICAL fixture ring only with HISTORICAL banner if a sample timeline is needed.

---

## Stop

Audit complete. No code changes, commit, push, or deploy.
