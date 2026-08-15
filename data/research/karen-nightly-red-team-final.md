# KAREN — Six-Feature Red-Team Verification

**Date:** 2026-08-15 (resumed after STOP)  
**Clean tree:** `.tmp/karen-six-feature-clean/`  
**Baseline:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Probes:** `scripts/red-team-A-E-F-memory.ts`, `red-team-B-G-time-session.ts`, `red-team-C-D-mode-instant.ts`, `red-team-B-last-decision-repro.ts`, `red-team-E-mutability-repro.ts`

## OVERALL: CONDITIONAL

Core lane isolation, Redis failure honesty, session boundaries, mode routing, and instant-read guards **PASS** with executable evidence. Two **REAL BUGS** remain: (1) L1 decision history stores/returns shared `DecisionEnvelope` object references (same-isolate history can be rewritten after record); (2) LIVE path does not answer `last_recorded` / natural “last decision” queries (returns `null`). Not SAFE for production until E is fixed; B gap is medium.

---

### A MEMORY:
**PASS** (6/6)

| Attack | Expected | Actual | Classification | Severity |
|--------|----------|--------|----------------|----------|
| LIVE as HISTORICAL | no leak | no leak | PASS | INFO |
| fixture A in B | hydrate B only | aInB=false bOk=true | PASS | INFO |
| stale L1 after Redis fail | clear → empty | ok=false len=0 | PASS | INFO |
| malformed Redis JSON | skip bad → empty | ok=true len=0 | PASS | INFO |
| empty Redis list | empty | ok=true len=0 | PASS | INFO |
| duplicate decisionKey | both retained when state differs | count=2 | PASS (design: dedupe≠key) | INFO |

Evidence: `npx tsx scripts/red-team-A-E-F-memory.ts` → A section 6 passed.

---

### B TIME TRAVEL:
**CONDITIONAL / FAIL on last-decision** (6/7 probe suite; last-decision REAL BUG)

| Attack | Expected | Actual | Classification | Severity |
|--------|----------|--------|----------------|----------|
| decision at 9:30 | exact prior entry | src=live_decision_at_time | PASS | INFO |
| wait at 9:30 | no later leak | leaked=false | PASS | INFO |
| changed 9:30–9:45 | compare reply | kind=between src=live_decision_between | PASS | INFO |
| later cannot rewrite past | 9:30 stable | againPast=true againLater=false | PASS | INFO |
| weekend Fri→Sat | honest miss | miss=true friLeak=false | PASS | INFO |
| “What was your last decision?” | latest LIVE | kind=none, ans=null | **FAIL / REAL BUG** | MED |
| “last recorded decision” (LIVE) | latest LIVE | kind=last_recorded, ans=null | **FAIL / REAL BUG** | MED |

Evidence: `red-team-B-G-time-session.ts`; smallest repro `red-team-B-last-decision-repro.ts`.  
Root cause: parser only matches “last recorded …”; LIVE `answerLiveDecisionHistoryQuery` has **no** `last_recorded` branch (historical path does) → falls through to `null`.

---

### C MODE SWITCHING:
**PASS** (11/11)

GENERAL_CHAT, CURRENT_MARKET_READ, CHANGE_ANALYSIS, WAIT present/past, DECISION_HISTORY time-query detect, trading→casual→trading, past-wait follow-up, empty→GENERAL_CHAT — all executable PASS via `classifyMentorIntent` / `parseDecisionHistoryQuery`.

Evidence: `npx tsx scripts/red-team-C-D-mode-instant.ts` C section.

---

### D INSTANT READ:
**PASS** (12/12)

Flag on/off, deterministic envelope_instant hit, historical fixture blocked, tradingStream false blocked, WAIT/history intents skipped, malformed invalidation skipped, canDeliverVerdict false skipped, request-scoped API (no module lastEnv). Zero OpenAI calls on probed path (pure function).

Evidence: `red-team-C-D-mode-instant.ts` D section. Note: synthetic cross-request merge both null’d on validation; request-scoping still evidenced by API shape + independent calls.

---

### E DECISION INTEGRITY:
**FAIL** (1/3 PASS; 2 REAL BUGS)

| Attack | Expected | Actual | Classification | Severity |
|--------|----------|--------|----------------|----------|
| mutate envelope after record | frozen L1 | why=MUTATED_WHY stance=long | **FAIL / REAL BUG** | **HIGH** |
| mutate retrieved entry | isolated copies | why=MUTATED_VIA_HIT stance=short | **FAIL / REAL BUG** | **HIGH** |
| Redis hydrate freeze | SoT original | FROZEN_WHY_NOW_TOKEN / wait / FROZEN-KEY | PASS | INFO |

Evidence: `red-team-E-mutability-repro.ts`:
```json
{"bug_shared_ref_after_caller_mutate":{"whyNow":"MUTATED_WHY","stance":"long","what":"MUTATED_THESIS"}}
{"bug_shared_ref_via_getter":{"whyNow":"MUTATED_VIA_HIT","stance":"short"}}
{"redis_sot_intact":{"whyNow":"FROZEN_WHY_NOW_TOKEN","stance":"wait","decisionKey":"FROZEN-KEY"}}
```
Root cause: `recordDecisionEnvelopeHistory` stores `envelope: input.envelope` by reference; `getDecisionEnvelopeHistory` shallow-copies the array only. JSON persist protects Redis/cross-isolate; **same-isolate L1 historical answers can be rewritten**.

**Not fixed** (per red-team rules).

---

### F REDIS FAILURE:
**PASS** (6/6)

Missing Redis → ram-only OK; HTTP fail hydrate → honest miss; timeout → clear L1; partial persist → local kept + unavailable flag; cold isolate after failed persist → miss not invent.

Evidence: `red-team-A-E-F-memory.ts` F section.

---

### G SESSION BOUNDARY:
**PASS** (5/5)

Prior-session same HH:MM blocked; nearest-previous same-session only; holiday/weekend gap no fill; session transition prefers current 09:30; CME key deterministic.

Evidence: `red-team-B-G-time-session.ts` G section.

---

### H PATCH PURITY:
**PASS** (carried forward)

Forbidden product modules absent; only test/comment references to `live-latency-profile`. Recorder not shipped.

---

## REAL BUGS

1. **E — Shared envelope reference corrupts L1 history (HIGH)**  
   - Repro: `scripts/red-team-E-mutability-repro.ts`  
   - Fix direction: deep-clone envelope (and thesis/invalidation) at record time; return deep clones from getters / find* APIs.

2. **B — LIVE `last_recorded` / “last decision” unanswered (MED)**  
   - Repro: `scripts/red-team-B-last-decision-repro.ts`  
   - `"What was your last decision?"` → parse `none` → null  
   - `"What was your last recorded decision?"` → parse `last_recorded` → LIVE answerer returns null (no branch)  
   - Fix direction: broaden parser; add LIVE handler mirroring historical `latestDecisionEnvelope("LIVE")`.

## HARNESS-ONLY ISSUES

- Instant-read test optional `require("../lib/live-latency-profile")` (absent in clean shipset) — cosmetic purity only (Area H).
- Duplicate `decisionKey` allowed by design (stateHash/stance/time dedupe) — document, not a harness failure.

## UNVERIFIED ITEMS

- Full end-to-end `/api/chat/stream` with live OpenAI call-count metering (D asserts zero OpenAI via pure skip path only).
- Real Upstash network timeout/credential paths (F used injected failing backends; no live secrets used).
- Holiday calendar beyond weekend CME session-key gaps.

## RECOMMENDED FIXES

1. **Must:** deep-clone on `recordDecisionEnvelopeHistory` + defensive clones on read APIs (bug E).  
2. **Should:** LIVE `last_recorded` handler + accept “last decision” phrasing (bug B).  
3. Optional: uniqueness/index on `decisionKey` if product requires key identity.  
4. Re-run `red-team-A-E-F-memory.ts` and `red-team-B-last-decision-repro.ts` after fixes.

---

## Confirmations

| Check | Status |
|-------|--------|
| Primary WT changed | **NO** (only `data/research/` reports) |
| Patch applied | **NO** |
| Commit | **NO** |
| Push | **NO** |
| Deploy | **NO** |
| Recorder shipped | **NO** |

---

## Probe run summary

| Suite | Passed | Failed |
|-------|--------|--------|
| A+E+F | 13 | 2 (both E) |
| B+G | 11 | 1 (B last decision; last_recorded confirmed separately) |
| C+D | 23 | 0 |
| H | carried PASS | 0 |
