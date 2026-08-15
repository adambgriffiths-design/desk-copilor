# KAREN — General Chat Pronoun / Elliptical Context

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** FIX + VERIFY — no prod deploy, no commit/push  
**Scope:** Multi-turn anaphora / elliptical follow-ups across GENERAL_CHAT, MARKET_LEVEL, DECISION_HISTORY, MARKET_READ  
**Coordinate:** level-comparative-followup (b5c51b0c), response variability (79fc055a), pre-launch audit (85cb9036) — shared patterns, not clobbered

---

## Exact report fields

```text
FIRST BROKEN HOP: PASS (identified + fixed)
ROOT CAUSE: PASS
GENERAL_CHAT FOLLOW-UPS: PASS
DOMAIN PRESERVATION: PASS
PERSONA HONESTY: PASS
RESPONSE DIVERSITY: PASS
TYPECHECK: PASS
FOCUSED REGRESSION: PASS (≥28 multi-turn + matrix + related suites)
```

---

## Reproduction (extension-shaped)

| Turn | User | Actual (before) | Expected |
|------|------|-----------------|----------|
| 1 | do you like chinese food | Yeah — I'm always down for that… | Preference/evaluation language |
| 2 | what do you like about it | I'm having trouble responding right now — try that again. | Continue; resolve **it → Chinese food** |

---

## FIRST BROKEN HOP

```text
extension input
  → canUseInstantLocal (persona gate)
  → localCasualReply WITHOUT resolving “it”
  → CASUAL_LLM_FAILURE_REPLY   ← FIRST BROKEN HOP
```

### Hop trace

1. **Extension input** — OK (`chatHistory` retained).
2. **Context resolver** — **MISSING** (no anaphora expansion before standalone handling).
3. **Intent** — `isKarenPreferenceQuestion("what do you like about it")` matched bare `do you like` → treated as standalone persona.
4. **Route** — `canUseInstantLocal` → instant local path (never streamed with history).
5. **API** — skipped.
6. **Response** — `localCasualReply` → no FOOD_WORDS on follow-up → `isGeneralConversation` → **failure canned**.
7. **Rendering** — correctly showed the failure string (not a lost reply).

Server mirror (if stream/sanitize fell through): subject hack produced `Yeah — about it is solid…` — also wrong, but the live extension bug was the failure hop above.

---

## Root cause

1. **No discourse resolver** for short follow-ups (`it/that/this/them/one/another`, `tell me more`, `why?`, etc.) before standalone casual/persona handling.
2. **Extension instant-local persona short-circuit** treated anaphoric preference questions as standalone.
3. **`CASUAL_LLM_FAILURE_REPLY` used too early** when context could resolve the referent.
4. **Persona copy** fabricated physical experience (“I'm always down for that”).
5. Secondary: domain sniff could flip GENERAL_CHAT → MARKET_READ on assistant prose containing “long desk sessions”; history “why did you take it” / level “how far … from it” needed sticky domain preservation.

---

## Fixes (shipset)

| Area | Change |
|------|--------|
| **New** `lib/conversation-context-resolve.ts` | Detect anaphora/ellipticals; extract referent; expand question; preserve domain; GENERAL_CHAT answers; preference language helpers |
| `lib/casual-chat-intent.ts` | Resolve GENERAL_CHAT follow-ups **before** `blocksCasualFallback`; topic openers; no “about it is solid”; honest preference openers |
| `lib/web-search-intent.ts` | Anaphoric “about it/them” ≠ standalone `isKarenPreferenceQuestion` |
| `lib/desk-persona.ts` | Prompt: resolve pronouns; no fabricated physical experiences |
| `lib/level-comparative-followup.ts` | “how far are we from it” distance phrase |
| `lib/decision-history-query.ts` + `mentor-intent.ts` | “why did you take it/that” → history product intent |
| `extension/casual-chat.js` | Mirror resolver + honest prefs + history-aware `localCasualReply` |
| `extension/content.js` | `canUseInstantLocal`: anaphora only if local can resolve; else stream with history |

**Not changed:** trading decision semantics / DecisionEnvelope truth.

---

## Domain preservation

| Prior domain | Follow-up | Stays |
|--------------|-----------|--------|
| GENERAL_CHAT | what do you like about it | GENERAL_CHAT / casual |
| MARKET_LEVEL (PDL named) | how far are we from it | MARKET_LEVEL (not casual) |
| MARKET_LEVEL | has it been swept | MARKET_LEVEL / MARKET_READ (not casual) |
| DECISION_HISTORY | why did you take it | DECISION_HISTORY |
| DECISION_HISTORY | what happened to it | DECISION_HISTORY (existing setup_outcome) |

---

## Test results

```text
npx tsx scripts/test-karen-general-chat-pronoun-context.ts  → ALL PASS
  - matrix (chinese/Japan/sci-fi/joke/cars/interesting)
  - ≥28 two-turn conversations with pronouns/ellipticals
  - domain preservation (PDL / swept / last LONG / previous setup)
  - persona honesty + preference variant diversity
  - extension-shaped instant path for chinese → about it

npx tsx scripts/test-casual-fallback.ts                     → ALL PASS
npx tsx scripts/test-karen-comparative-level-followups.ts   → ALL PASS
npx tsc --noEmit -p tsconfig.json                           → PASS
```

---

## Persona contract (enforced)

- Warm / opinionated OK.
- Prefer: “ranks high”, “I'm partial to”, “variety beats…”.
- Avoid: “I'm always down for Chinese food”, “As an AI I cannot eat”.

---

## Failure handling

`I'm having trouble responding right now` remains **last resort** for true general questions with no deterministic answer and no LLM — not for resolvable anaphora.
