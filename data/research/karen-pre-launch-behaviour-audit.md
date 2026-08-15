# KAREN — Pre-Launch Behaviour Quality Audit

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/` (primary shipset)  
**Mode:** AUDIT + FIX classes of bugs — no prod deploy, no commit/push  
**Coordinate (not clobbered):** response variability `79fc055a`, actionable trade semantics, latency `09e0c93d`, plain-English presentation layer

---

## Executive verdict

**Ready for human smoke test** with known residual gaps (listed per section). Canonical contracts (history kinds, WAIT never invents trade, CME closed vs open-stale, conversation initiation) are green. This pass closed class-level holes in **paraphrase fallthrough → LLM**, **anaphoric follow-ups**, **plain history chrome leaks**, **why-not OpenAI skip**, and **raw failure UX**.

---

## ROUTING

| Severity | Status |
|----------|--------|
| Gap | **PASS** (residual: MED for bare `when?` / comparative without prior levels) |

### Key findings
- History product intents still beat CMR / GENERAL_CHAT when parsed (`isDecisionHistoryTimeQuery` → stream short-circuit, `openaiCalls: 0`).
- Paraphrase class expanded: `last trade?`, `taken anything today`, `any trades?`, `been long today`, `why no long`, `u bullish?` (via STT `u`→`you`).
- Precedence fix: `last LONG or SHORT` no longer stolen by `last_side`.
- Anaphoric `what happened to it/that` after joke/casual no longer unconditionally steals into `setup_outcome` (stream gate).

### Fixes made
| File | Class fix |
|------|-----------|
| `lib/decision-history-query.ts` | Paraphrase classes + long-or-short precedence + `isAnaphoricSetupOutcomePhrase` |
| `lib/mentor-intent.ts` | Wait anaphora, why-no, bias slang, progressive `tell me more`, history product mirror |
| `lib/conversational-normalize.ts` | `im`→`i'm`, `u`→`you` |
| `lib/casual-chat-intent.ts` | STT repair on normalize/initiation; market progressive ≠ casual |
| `app/api/chat/stream/route.ts` | Anaphoric setup_outcome gate; why-not short-circuit |

### Remaining gaps
- Bare `when?` after a history time mention still not a dedicated anaphora class (MED).
- Abbreviation-only `pdh?` relies on fact/trading gates — fragile if casual wins (LOW).

### Failure record (closed)
```
PROMPT: last trade? / taken anything today? / why no long / u bullish?
PREVIOUS: LIVE history LONG→NO_TRADE or WAIT read
EXPECTED: hist / why-not / bias — no LLM invent
ACTUAL (before): parse none → trading LLM risk
FIRST BROKEN HOP: decision-history-query / parseWhyNotDirection / bias regex
ROOT CAUSE: exact-phrase inventory
MINIMAL FIX: synonym classes + STT normalize
TEST: scripts/test-karen-pre-launch-behaviour.ts + actionable/history precedence
```

---

## FOLLOW-UP CONTEXT

| Severity | Status |
|----------|--------|
| Gap | **PASS** with residual MED |

### Key findings
- `and now?` / `still waiting?` → `WAIT_EXPLANATION` when prior market wait.
- `what you waiting for` (STT drop) → wait class.
- `tell me more` / `go on` / `explain that differently` after market → mentor follow-up, not casual “say more”.
- `what happened to it?` after joke → does **not** force setup_outcome (stream); after market/history → still history.

### Fixes made
- `isWaitStatusAnaphora`, expanded `isBareMentorFollowUp` / `isPriorReadFollowUpPhrase` / `resolveFollowUp`.
- Casual gate refuses progressive/rephrase when recent assistant looks like market.

### Remaining gaps
- Bare `when?` after “last SHORT was at …” (MED).
- `what about the low?` still depends on level extractors matching plain-English synonyms (LOW–MED; comparative suite covers labeled forms).
- `why?` after joke loses market thread (no `lastMarketAssistant` pointer) (MED).

### Failure record (closed)
```
PROMPT: and now? / still waiting? / tell me more
PREVIOUS: I'm WAITING for …
EXPECTED: wait / deepen prior read
ACTUAL (before): GENERAL_CHAT / casual
FIRST BROKEN HOP: mentor-intent resolveFollowUp / isCasualChat
ROOT CAUSE: missing anaphora + progressive classes
MINIMAL FIX: wait-status + bare progressive + casual market guard
TEST: test-karen-pre-launch-behaviour.ts
```

---

## PLAIN ENGLISH

| Severity | Status |
|----------|--------|
| Gap | **PASS** (debug structured preserved) |

### Key findings
- User default remains `resolveUserPresentationMode() === "plain"`.
- History formatters previously dumped `DecisionKey:` / `STANCE:` / `THESIS:` / panel chrome even in plain mode.
- Plain history now: spoken lead + thesis facts; keys only when `KAREN_DECISION_DEBUG=1`.
- `INTERNAL_DECISION_LABEL_RE` extended for DecisionKey / PREVIOUS DECISION / EVIDENCE / etc.

### Fixes made
| File | Change |
|------|--------|
| `lib/decision-time-travel.ts` | Plain branches for at-time / directional / composite / previous setup |
| `lib/decision-contract-output.ts` | Label regex expanded |

### Remaining gaps
- Lane banner `LIVE — CURRENT SESSION HISTORY` still prepended (tests / lane SoT); mild chrome (LOW).
- Diversity openings may put context before stance on some CMR variants (coordinate with variability agent — MED for “answer first”).

### Failure record (closed)
```
PROMPT: What was your last recorded decision?
EXPECTED: plain stance + thesis, no DecisionKey
ACTUAL (before): DecisionKey / STANCE / THESIS dump
FIRST BROKEN HOP: formatAtTimeReply always structured body
ROOT CAUSE: presentation mode not applied to history chrome
MINIMAL FIX: plain body templates
TEST: test-karen-pre-launch-behaviour.ts + test-karen-plain-english-market-replies.ts
```

---

## RESPONSE DIVERSITY

| Severity | Status |
|----------|--------|
| Gap | **PASS** (owned by concurrent agent; tests adapted) |

### Key findings
- Stable brain / variable mouth via `conversational-renderer` + `response-repetition-memory` — not redesigned here.
- Added `explain that differently` to rephrase class so diversity can re-render.
- Existing history tests updated to accept composite/recorded-only lead variants (no pinning to one canned sentence).

### Remaining gaps
- Cold isolate resets diversity memory (inherent).
- Trade-today one-liners mostly fixed wording (LOW).

---

## LATENCY

| Severity | Status |
|----------|--------|
| Gap | **PASS** for new deterministic wires; residual MED on CMR default |

### Key findings
| Path | OpenAI |
|------|--------|
| Decision history hit | 0 |
| Level compare hit | 0 |
| WAIT_EXPLANATION + last pipeline | 0 |
| **Why-not + last pipeline (NEW)** | **0** |
| CURRENT_MARKET_READ | Instant skip only if `KAREN_INSTANT_READ_LLM_SKIP=1` (default OFF) |

### Fixes made
- `tryStructuredWhyNotFollowUpFromLastPipeline` in `lib/chat-engine.ts`, wired in stream route before casual/LLM.

### Remaining gaps
- Instant-read LLM skip still opt-in (latency agent territory) (MED).
- Why-not without last pipeline still falls through (honest miss → LLM risk) (LOW–MED).

### Failure record (closed)
```
PROMPT: why not long? / why no long?
PREVIOUS: WAIT pipeline cached
EXPECTED: plain why-not, openaiCalls: 0
ACTUAL (before): EXPLAIN_PREVIOUS → OpenAI
FIRST BROKEN HOP: stream route (only WAIT short-circuit)
ROOT CAUSE: formatter existed, not wired
MINIMAL FIX: mirror wait wire for why-not
TEST: export/wire assertions in test-karen-pre-launch-behaviour.ts
```

---

## HISTORY

| Severity | Status |
|----------|--------|
| Gap | **PASS** |

### Product contract (reconfirmed)
| Concept | Kind / path |
|---------|-------------|
| Current stance | Live CMR (`kind: none`) |
| Last recorded | `last_recorded` |
| Ambiguous last decision | `last_decision` composite |
| Last actionable | `last_directional` |
| Side / today / setup / outcome | dedicated kinds |
| WAIT → invent LONG/SHORT | blocked |

### Fixes made
- Paraphrase coverage; long-or-short precedence; anaphoric setup gate; plain chrome strip.

### Remaining gaps
- `previous setup` = latest actionable, not prior-to-current (documented product alias; MED UX).
- Live CMR vs ring recorded can diverge without explicit “live vs recorded” labels (MED — stance-handoff territory).

---

## MARKET DATA

| Severity | Status |
|----------|--------|
| Gap | **PASS** |

### Key findings
- CME Globex: weekend / maintenance / holiday / early close / open+stale vs closed+old — covered by `test-cme-globex-session-status.ts` (42 checks).
- Yahoo ≠ live Tickstream; closed+old = normal; open+old = problem.
- No changes required this pass.

### Remaining gaps
- Holiday table curated through ~2027 only (documented).

---

## FAILURE UX

| Severity | Status |
|----------|--------|
| Gap | **PASS** |

### Fixes made
- `extension/content.js` `explainError`: never returns raw `msg`; no “Desk returned an empty reply”; friendly reconnect copy; strips JSON/HTTP/stack-looking text.

### Remaining gaps
- Stream `{ error: message }` bodies still depend on client mapping (LOW if explainError covers).
- Route-debug UI can still show internal route names when debug enabled (OK).

### Failure record (closed)
```
PROMPT: (network / 500 / empty)
EXPECTED: friendly reconnect line
ACTUAL (before): raw exception / HTTP body / “Desk returned empty reply”
FIRST BROKEN HOP: explainError default return msg
ROOT CAUSE: passthrough
MINIMAL FIX: generic friendly fallback
TEST: content.js pattern assertions in test-karen-pre-launch-behaviour.ts
```

---

## MULTI-TURN

| Severity | Status |
|----------|--------|
| Gap | **PASS** for covered matrices; residual MED for full ≥30 adversarial suite |

### Covered this pass / existing
- Actionable multi-turn LONG→WAIT→NO_TRADE (9 turns) — PASS.
- History precedence matrix — PASS.
- Pre-launch paraphrase + follow-up classes — PASS.
- Conversation initiation — PASS.
- Topic-switch poison: joke → `what happened to it?` gated — fixed at stream.

### Remaining gaps
- Full ≥30 conversations × 5–10 turns human/adversarial harness not fully automated (MED).
- Progressive ladder `stance → why → tell me more → walk me through` length/DecisionKey lock not asserted end-to-end (LOW–MED).

### Smoke matrix (human)
1. Market WAIT → `and now?` → `why no long` → `tell me more` → joke → `what happened to it?` → `last trade?` → `current stance` → PDL ask → `which is closer?`
2. Paraphrases: `taken anything today?`, `u bullish?`, `im bored`, `what you waiting for`
3. Weekend: closed+Friday print vs open+stale wording

---

## TYPECHECK

| Status |
|--------|
| **PASS** — `npx tsc --noEmit -p tsconfig.json` (shipset) |

### Focused regressions run
```text
npx tsx scripts/test-karen-pre-launch-behaviour.ts     → PASS (51)
npx tsx scripts/test-actionable-trade-semantics.ts     → PASS
npx tsx scripts/test-last-decision-semantics.ts        → PASS
npx tsx scripts/test-history-intent-precedence.ts      → PASS
npx tsx scripts/test-karen-plain-english-market-replies.ts → PASS (32)
npx tsx scripts/test-conversation-initiation.ts        → PASS
npx tsx scripts/test-cme-globex-session-status.ts      → PASS (42)
npx tsc --noEmit -p tsconfig.json                      → PASS
```

---

## READY FOR HUMAN SMOKE TEST

| Gate | Result |
|------|--------|
| Class fixes landed in shipset | YES |
| Focused regressions + typecheck | PASS |
| Prod deploy / commit / push | **NOT done** (per brief) |
| Blocking for smoke | **NO** — residual gaps are MED/LOW, not ship-stoppers for a controlled smoke |

### How to smoke-test (extension against shipset/API)
1. Load extension pointed at the integration/preview API (not prod unless already pinned).
2. Run the multi-turn matrix above on a live chart session (or closed Saturday for calendar UX).
3. Confirm: no `DecisionKey` / `QUALITY_GATE` / `CHART_READ_REQUEST_ROUTING` / raw JSON in chat; wait/history/why-not feel instant; jokes don’t poison “what happened to it?”; `im bored` starts a conversation.
4. Spot-check: current stance (live) ≠ last recorded when they differ — both answers should feel labeled by context.

### Files touched (shipset)
- `lib/conversational-normalize.ts`
- `lib/decision-history-query.ts`
- `lib/mentor-intent.ts`
- `lib/decision-time-travel.ts`
- `lib/decision-contract-output.ts`
- `lib/chat-engine.ts`
- `lib/casual-chat-intent.ts`
- `lib/response-repetition-memory.ts`
- `app/api/chat/stream/route.ts`
- `extension/content.js`
- `scripts/test-karen-pre-launch-behaviour.ts` **(new)**
- `scripts/test-actionable-trade-semantics.ts` / `test-last-decision-semantics.ts` / `test-history-intent-precedence.ts` (diversity-tolerant asserts)

---

## STOP

No production deploy. No commit/push. Human smoke test is the next gate.
