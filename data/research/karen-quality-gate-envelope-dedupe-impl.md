# Karen — QUALITY GATE envelope dedupe (implementation)

**Date:** 2026-08-15  
**Scope:** SAFE QUALITY-GATE ENVELOPE DEDUPE only (~640 token cut from `karen-llm-payload-size-audit.md`).  
**Constraint:** No Analyse↔Chat reuse / Redis / shared store. No ICT / market / stance / model / cache / DB changes. No commit / push / deploy.

## Change

Canonical DecisionEnvelope emission for LLM QUALITY GATE is `formatDecisionEnvelope` (via `formatCanonicalEnvelopeForPrompt`).

**Before:** `envelopeText` used `formatUnifiedDecisionOutput`, which nests a full `formatDecisionEnvelope` then re-states FACTS / STANCE / THESIS / TARGET / INVALIDATION / CONFLICTS / CONCEPT EVIDENCE.

**After:** `envelopeText` uses `formatCanonicalEnvelopeForPrompt`:

1. `formatDecisionEnvelope(env)` exactly once  
2. Unique presentation extras only: `STANCE ROLE`, `WAIT FOR` (when wait)

Visible UI / spoken / `formatAnalysisContract` paths still use `formatUnifiedDecisionOutput` unchanged.

## Files

| File | Change |
|---|---|
| `lib/decision-contract-output.ts` | `formatCanonicalEnvelopeForPrompt` — canonical once + STANCE ROLE / WAIT FOR |
| `lib/analysis-quality-gate.ts` | `envelopeText` ← canonical (not unified) |
| `scripts/test-quality-gate-envelope-dedupe.ts` | Focused regression suite |
| `package.json` | `test:quality-gate-envelope-dedupe` |

## Measurement (fixture `synthetic-ny-am@50`, chars/4)

Same assembly path as the payload-size audit. TTFT not measured (no live LLM call this session).

TOKENS BEFORE: **2209** (QUALITY GATE full block with unified `envelopeText`; 8833 chars)

TOKENS AFTER: **1580** (QUALITY GATE full block with canonical `envelopeText`; 6319 chars)

TOKENS SAVED: **629** (~628 on envelope blob alone: 1776 → 1148)

TTFT BEFORE: **UNKNOWN**

TTFT AFTER: **UNKNOWN**

DECISION PARITY: **PASS** — canonical text starts with exact `formatDecisionEnvelope`; stance / whyNow / invalidation / WAIT|FLAT|LONG|SHORT labels unchanged; QUALITY GATE instruction prose preserved; `validateDecisionEnvelope` still 0 errors; historical recorded WHY/`whyNow` path unchanged; mentor wait-followup suite still passes; LIVE vs HISTORICAL isolation untouched by this cut.

TESTS:

| Suite | Result |
|---|---|
| `npm run test:quality-gate-envelope-dedupe` | **41 passed, 0 failed** — envelope once; canonical unchanged; validation; WAIT/FLAT; LONG/SHORT formatter parity; historical fixture gate |
| `npm run test:decision-history-time-travel` | **92 passed, 0 failed** — historical verdict + WHY / whyNow / recorded-only |
| `npm run test:karen-wait-followup` | **134 passed, 0 failed** — mentor follow-ups / envelope reuse |

## Explicit non-goals (not done)

- Analyse↔Chat runtime share / Redis / shared store  
- Shortening other prompts or QUALITY GATE rules  
- Model / temperature / trading logic / market context / caching / DB  
- Continuous recording / Analyse short-circuit changes  
- Commit / push / deploy  
