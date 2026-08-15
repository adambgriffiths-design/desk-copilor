# Karen — LLM QUALITY GATE envelope dedupe cut

**Date:** 2026-08-15  
**Scope:** Safest payload cut from `karen-llm-payload-size-audit.md` only.  
**Constraint:** No ICT / market-intel / history / envelope-semantics / health changes. No commit / push / deploy.

## Change

QUALITY GATE `envelopeText` no longer injects `formatUnifiedDecisionOutput` (structured envelope **plus** a MENTOR/TRADE wrapper that re-stated FACTS / STANCE / THESIS / TARGET / INVALIDATION / CONFLICTS).

It now uses `formatCanonicalEnvelopeForPrompt`:

1. `formatDecisionEnvelope(env)` once (full seven-layer + layers + REASONING CHAIN)
2. Unique presentation lines only: `STANCE ROLE`, `WAIT FOR` (when stance is wait)

`CONCEPT EVIDENCE` was omitted from the prompt form: it is a short re-summary of rows already present in `REASONING CHAIN` (`detected` / `used` / `impact`). Visible UI paths still use `formatUnifiedDecisionOutput` unchanged.

## Files changed

| File | Change |
|---|---|
| `lib/decision-contract-output.ts` | Added `formatCanonicalEnvelopeForPrompt` |
| `lib/analysis-quality-gate.ts` | `envelopeText` uses canonical formatter instead of unified |

## Size check (fixture `synthetic-ny-am@50`, chars/4)

| Block | Before | After | Saved |
|---|---:|---:|---:|
| Envelope blob in QUALITY GATE | 7 104 chars / **~1 776 tok** | 4 590 chars / **~1 148 tok** | **~628 tok** |
| Full QUALITY GATE block | 8 833 chars / **~2 209 tok** | 6 318 chars / **~1 580 tok** | **~629 tok** |

Matches audit estimate (~640 input tokens from dropping the nested re-statement wrapper).

## Semantics

- Envelope **fields** unchanged: same `DecisionEnvelope` object; structured labels and values identical to `formatDecisionEnvelope`.
- No ICT logic, stance rules, or health semantics changed.
- Dedupe only: each decision field appears once in the QUALITY GATE prompt (plus `STANCE ROLE` / optional `WAIT FOR` which are presentation helpers, not new market truth).

## Health

`GET http://127.0.0.1:3020/api/health` → **200** (existing server; not restarted).
