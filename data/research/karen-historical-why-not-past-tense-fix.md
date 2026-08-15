# KAREN — Past-tense wait follow-up routing fix

**Date:** 2026-08-15  
**Mode:** smallest safe fix — no commit/push/deploy  
**Reference:** `karen-historical-why-not-integrity-audit.md`

---

## Bug

| Phrase | Before | After |
|--------|--------|-------|
| `What are you waiting for?` | `WAIT_EXPLANATION` | unchanged |
| `What were you waiting for?` | `GENERAL_CHAT` (no envelope bind) | `WAIT_EXPLANATION` (same path as `are`) |

Audit FAIL cells: WAITING-FOR × LONG/SHORT/WAIT/NO_TRADE × LIVE/HISTORICAL (8/8) — all past-tense routing miss.

---

## Root

`lib/mentor-intent.ts` wait detectors matched `what (is|are|'s) … waiting for` only — not past-tense `were`. Product never entered the recorded-envelope wait formatter path.

---

## Fix

Extend **existing** wait-follow-up detection so `were` routes identically to `are`:

1. **`lib/mentor-intent.ts`**
   - `isPriorReadFollowUpPhrase` — accept `were`
   - `isWaitExplanation` — accept `were` / `why were you waiting`
   - `resolveFollowUp` — same `why were` tense
2. **`lib/conversational-intent.ts`** — `MARKET_ANAPHORA` includes `(?:are|were) you waiting for` (same MARKET_FOLLOWUP gate as present tense)
3. **`extension/casual-chat.js`** — mirror anaphora pattern

Same intent → same formatters (`formatStructuredWaitFollowUp` / prior-read bind). No second intent, formatter, envelope rewrite, trading/thesis/historical retrieval, PIT, or LLM when deterministic prior-read applies.

---

## Integrity (unchanged behavior once routed)

- Returns original **WAITING FOR** from DecisionEnvelope
- Preserves stance / verdict / thesis / whyNow / invalidation / waiting-for / decisionKey
- No later-market rewrite on the structured wait path

---

## Tests

```text
npm run test:karen-wait-followup
→ 142 passed, 0 failed

npm run test:decision-history-time-travel
→ passed=127 failed=0
```

Regression asserts: `What were you waiting for?` → `WAIT_EXPLANATION` + prior-read follow-up (items 1–10 suite still green).

---

## Out of scope (untouched)

Redis / DB / recorder / short-circuit / LLM / session-boundary / commit / push / deploy

---

## Stop

Impl + tests complete.

---

## Re-verify (2026-08-15)

**ALREADY DONE** — no code change.

| Suite | Result |
|-------|--------|
| `npm run test:karen-wait-followup` | 142 passed, 0 failed |
| `npm run test:decision-history-time-travel` | passed=127 failed=0 |
| `npm run test:karen-intent-routing` | 135 passed, 0 failed |

Probe: `are` / `were` both → `WAIT_EXPLANATION` + prior-decision bind on LIVE and HISTORICAL (same decisionKey / WAITING FOR).
