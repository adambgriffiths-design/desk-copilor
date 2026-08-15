# KAREN — Plain-English Response Layer for Market Answers

**Date:** 2026-08-15  
**Mode:** Presentation-only — DecisionEnvelope / quality-gate / observation SoT unchanged  
**Deploy:** No production deploy. No commit/push.  
**Trees:** primary `lib/` + `.tmp/karen-final-integration/`

---

## ROOT CAUSE

User-facing market paths were dumping **internal labeled contracts** into chat/voice:

1. **Quality-gate FAIL** (`chat-engine` stream / instant / non-stream) concatenated  
   `waitReason` + `qualityGate.envelopeText`  
   → full `formatCanonicalEnvelopeForPrompt` / seven-layer dump  
   (`HTF CONTEXT:`, `CURRENT STRUCTURE:`, `TRADE DIRECTION: NONE`, …).

2. **Deterministic mentor formatters** always emitted uppercase section labels:  
   `formatMentorTradeSpoken` → `TRADE DECISION:` / `MENTOR VIEW:`  
   `formatWhyNotDirectionFollowUp` → `WHY NOT LONG:`  
   `formatStructuredWaitFollowUp` → `WAITING FOR:` / `LONG CONDITION:`  
   `formatStructuredInvalidationFollowUp` → `INVALIDATION:` / `STANCE:`

Prompt / debug / `formatQualityGateForPrompt` correctly need those labels. Normal chat does not.

---

## FORMATTER USED

Extended **one** presentation module: `lib/decision-contract-output.ts`.

| API | Role |
|-----|------|
| `DecisionPresentationMode` `"plain" \| "structured"` | Mode switch |
| `resolveUserPresentationMode()` | User default **plain**; `KAREN_DECISION_DEBUG=1` → **structured** |
| `formatMentorTradeSpoken(env, { mode })` | Plain first-person stance opener; structured keeps MENTOR/TRADE labels |
| `formatWhyNotDirectionFollowUp(..., { mode })` | Plain: `I'm not long/short because…` |
| `formatStructuredWaitFollowUp(..., { mode })` | Plain: `I'm waiting for…` |
| `formatStructuredInvalidationFollowUp(env, { mode })` | Plain: `This view is invalidated if…` |
| `formatQualityGateSpokenReply(gate, { mode })` | Plain WAIT explanation **without** envelope dump; structured = legacy dump |
| `hasInternalDecisionLabels(text)` | Guard for tests / audits |

Defaults of existing formatters remain **`structured`** when `mode` is omitted (backward compatible for prompts/tests). User-facing wires pass `resolveUserPresentationMode()`.

**Not weakened:** `formatQualityGateForPrompt`, `formatCanonicalEnvelopeForPrompt`, `formatUnifiedDecisionOutput`, `evaluateAnalysisQualityGate`, DecisionEnvelope builders.

---

## FILES CHANGED

### Primary
- `lib/decision-contract-output.ts` — plain/structured presentation layer
- `lib/chat-engine.ts` — quality-gate spoken + instant-read + follow-ups → plain
- `lib/mentor-coaching.ts` — coach answers → plain
- `lib/conversational-query.ts` — interpretation lines → plain
- `lib/verdict-engine.ts` — spoken brief → plain (panel stays unified/structured)
- `lib/voice-analysis-narrator.ts` — envelope opener → plain
- `lib/research/replay/historical-ui.ts` — historical fixture replies → plain
- `scripts/test-karen-plain-english-market-replies.ts` — **new** focused tests
- `scripts/test-karen-instant-read-llm-skip.ts` — accept plain stance opener on hit

### Integration tree (synced / wired)
- `.tmp/karen-final-integration/lib/decision-contract-output.ts` (copy)
- `.tmp/karen-final-integration/lib/chat-engine.ts` (quality-gate + instant + wait wire)
- `.tmp/karen-final-integration/scripts/test-karen-plain-english-market-replies.ts`

### Coordination
- Did **not** edit mentor-intent stance routing, hardening extension files, or quality-gate evaluation logic (concurrent agents 8e5e0a81 / 43703673).

---

## BEFORE / AFTER EXAMPLES

### Quality-gate WAIT (missing OHLC)

**Before:**
```
WAIT — 1m OHLC missing; daily OHLC missing

HTF CONTEXT: daily — bullish
CURRENT STRUCTURE: 1-minute — bullish
TRADE DIRECTION: NONE
…
```

**After (plain):**
```
I'm WAITING because 1m OHLC missing; daily OHLC missing. I won't call a long or short until those observations are confirmed.
```

**After (debug `KAREN_DECISION_DEBUG=1`):** legacy waitReason + envelopeText dump preserved.

### Why not long

**Before:**
```
WHY NOT LONG: LONG not supported — no structured evidence
CURRENT STANCE: …
WAITING FOR: …
```

**After:**
```
I'm not long because …. Until then I'm WAITING.
```

### Market read / stance (instant path)

**Before:**
```
TRADE DECISION: WAIT — named trigger required on the 1-minute; WAIT FOR: …. MENTOR VIEW: HTF context is …
```

**After:**
```
I'm WAITING because …. Higher-timeframe context is daily bullish; current structure on the 1-minute is bullish. I'm waiting for …. This view is invalidated if ….
```

---

## TEST RESULTS

```
npx tsx scripts/test-karen-plain-english-market-replies.ts
→ 32 passed, 0 failed

npx tsx scripts/test-karen-instant-read-llm-skip.ts
→ 51 passed, 0 failed
```

Covered:
- same stance before/after (plain vs structured)
- whyNow / invalidation facts preserved (voice digit normalization accounted for)
- no hallucinated sentinel prices
- uncertainty (low confidence / unproven chain) preserved
- why not long / waiting for → direct plain English
- debug/structured quality-gate still shows CONTEXT / STRUCTURE

---

## TYPECHECK

`npx tsc --noEmit -p tsconfig.json`:

- **No new errors** in changed presentation files (`decision-contract-output`, `chat-engine`, `mentor-coaching`, `conversational-query`, `verdict-engine`, `voice-analysis-narrator`, `historical-ui`).
- Pre-existing project errors remain in unrelated modules (`continuous-decision-recorder`, `incremental-market-engine`, `replay-fixtures`, …).

---

## SAFETY NOTES

- Stance / whyNow / invalidation / conflict facts are copied from the envelope — not paraphrased by an LLM.
- Quality gate **canDeliverVerdict** logic unchanged; only the spoken surface when the gate fails.
- Prompt injection (`formatQualityGateForPrompt`) still uses full labeled envelope.
- Debug: `KAREN_DECISION_DEBUG=1` restores labeled dumps for user paths.
