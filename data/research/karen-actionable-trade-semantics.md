# KAREN — Actionable Trade Semantics

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Scope:** LAST RECORDED / LAST ACTIONABLE / ambiguous “last decision” composite UX  
**Coordinate:** current-stance live MarketState → sibling agent (CURRENT_MARKET_READ); not redesigned here

---

## Exact report fields

```text
CURRENT STANCE: PASS (live CURRENT_MARKET_READ — history declines; see stance-handoff)
LAST RECORDED STATE: PASS
LAST ACTIONABLE DECISION: PASS
AMBIGUOUS LAST DECISION (composite): PASS
LAST COMPLETED / INVALIDATED IDEA: PASS (when later envelope exists; honest miss otherwise)
NEVER INVENT LONG/SHORT FROM WAIT: PASS
NEVER GENERAL_CHAT FOR HISTORY: PASS
TYPECHECK: PASS
FOCUSED REGRESSION: PASS
```

---

## Product contract (enforced)

| Concept | Meaning | Path | Example phrase |
|---------|---------|------|----------------|
| **CURRENT STANCE** | Live desk/MarketState call | `CURRENT_MARKET_READ` (not hist) | “What is your current stance?” |
| **LAST RECORDED STATE** | Literal newest DecisionEnvelope (any stance) | `last_recorded` | “What was your last recorded decision?” |
| **LAST ACTIONABLE TRADE** | Newest genuine LONG or SHORT only | `last_directional` | “What was your last actual trade decision?” |
| **Ambiguous “last decision”** | Composite: recorded + actionable when they differ | `last_decision` | “What was your last decision?” |
| **Side lookup** | Last LONG or last SHORT | `last_side` | “When were you last long?” |
| **Trade today** | Session has any LONG/SHORT | `trade_today` | “Have you taken a trade today?” |
| **Previous setup** | Last actionable thesis | `previous_setup` | “What was your previous setup?” |
| **Setup outcome** | Later recorded supersede / invalidation if present | `setup_outcome` | “What happened to it?” |

### Ambiguous preferred UX (before → after)

**Seed:** LONG @ 13:00 → … → NO_TRADE @ 13:30

| Phrase | Before | After |
|--------|--------|-------|
| “What was your last decision?” | Directional-only: “My last LONG was at …” (hid newest NO_TRADE/WAIT) | `My latest recorded stance is NO_TRADE. My last actionable decision was LONG at [time].` |
| “What was your last actual trade decision?” | LONG | LONG (unchanged explicit path) |
| “What was your last recorded decision?” | Newest NO_TRADE | Newest NO_TRADE |
| WAIT-only stack + “last decision?” | Directional miss only | `My latest recorded stance is NO_TRADE. No LONG or SHORT decision has been recorded.` — **never invents LONG/SHORT** |

When newest recorded **is** already LONG/SHORT, ambiguous collapses to the actionable reply (no false WAIT composite).

---

## First broken hop (pre-fix)

1. **Parser hop:** Ambiguous “last decision” was classified as `last_directional` only → preferred composite UX impossible.
2. **Mentor hop:** History phrases fell through to `GENERAL_CHAT` (stream already short-circuited via `isDecisionHistoryTimeQuery`, but classification lied).

---

## Smallest fix

1. Split query kinds in `decision-history-query.ts` (`last_decision` vs `last_directional` + side/today/setup). Leave “current stance” to live CMR (stance-handoff).
2. Composite formatter in `decision-time-travel.ts` (`formatAmbiguousLastDecisionReply` / `answerAmbiguousLastDecision`).
3. Side filter on `findLatestDirectionalDecision`.
4. Mentor: history phrases → `CHANGE_ANALYSIS` (not `GENERAL_CHAT`); current stance stays `CURRENT_MARKET_READ`.

---

## Files changed

| File | Change |
|------|--------|
| `lib/decision-history-query.ts` | New kinds + parse precedence |
| `lib/decision-envelope-history.ts` | `side` filter on directional find |
| `lib/decision-time-travel.ts` | Composite + side/today/setup/outcome handlers |
| `lib/mentor-intent.ts` | History phrases ≠ GENERAL_CHAT |
| `scripts/test-actionable-trade-semantics.ts` | **New** multi-turn extension-shaped matrix |
| `scripts/test-last-decision-semantics.ts` | Updated expectations |
| `scripts/test-extension-market-read-last-decision.ts` | Updated |
| `scripts/test-extension-shape-hardening.ts` | Updated |
| `scripts/red-team-B-last-decision-repro.ts` | Updated |

**Not touched (coordinate):** plain-English formatter agent, stance MarketState capture/payload, preview pin.

---

## Verification

```text
npx tsx scripts/test-actionable-trade-semantics.ts   → PASS
npx tsx scripts/test-last-decision-semantics.ts      → PASS
npx tsx scripts/test-extension-market-read-last-decision.ts → PASS
npx tsx scripts/red-team-B-last-decision-repro.ts    → PASS
npx tsx scripts/test-extension-shape-hardening.ts    → PASS
npx tsc --noEmit -p tsconfig.json                    → PASS
```

---

## Multi-turn sequence (extension-shaped)

Same LIVE history across turns (LONG → WAIT → WAIT → NO_TRADE):

1. current stance → live CMR (hist declines); last recorded → NO_TRADE  
2. last recorded → NO_TRADE  
3. last decision (ambiguous) → composite NO_TRADE + LONG  
4. last actual trade decision → LONG only  
5. when last long → LONG  
6. when last short → honest miss  
7. taken a trade today → Yes, LONG  
8. previous setup → LONG thesis  
9. what happened to it → superseded by later NO_TRADE  

---

## STOP

No production deploy. No commit/push. Actionable trade semantics gate is green.
