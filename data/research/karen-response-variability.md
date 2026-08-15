# KAREN — Response Variability + Repetition Memory

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/` (+ primary sync)  
**Mode:** Presentation / session memory only — DecisionEnvelope SoT untouched  
**Deploy / commit:** No

---

## Exact report fields

```text
SEMANTIC CONSISTENCY: PASS (stance/prices/invalidation locked across variants)
DUPLICATE RATE (jokes ×10 adjacent): 0
UNIQUE RESPONSES (jokes ×10): 10/10
UNIQUE RESPONSES (ask-me ×10): 10/10
WAIT ×10 WORDING VARIANTS: ≥3 (observed 5) · facts identical
LONG ×10 WORDING VARIANTS: ≥3 (observed 4) · direction/prices/invalidation identical
REPHRASE FOLLOW-UP (say that differently → WAIT_EXPLANATION): PASS
FLAGGED OPENINGS (10 mixed turns): 0/10
LATENCY (50 plain renders): ~10ms · OpenAI calls: 0
TYPECHECK: PASS
FOCUSED TESTS: PASS (variability + plain-english)
```

---

## ROOT CAUSE

1. **Stock prose:** Plain-English formatters always emitted one fixed sentence shape  
   (`I'm WAITING because…`, `I'm waiting for…`, `My latest recorded stance is…`).
2. **No conversation-wide repetition memory:** Casual fallback always returned the same ladder joke;  
   "another" / "tell me a joke" ×N could not exclude recent content.
3. **Follow-ups isolated:** "another" / "say that differently" were not anchored to prior intent  
   (joke vs wait explain vs ask-me).

Deterministic routing was never the bug — **deterministic prose** was.

---

## Approach (three layers — kept separate)

| Layer | Role | Must not |
|-------|------|----------|
| **1. Semantic result** | Envelope / history / quality-gate / snapshot facts | Change for variety |
| **2. Conversational renderer** | Structure/opening/compression variants from locked payload | Call OpenAI; invent reasons |
| **3. Repetition memory** | Session ring + chat-history fingerprints/ids/openings | Touch DecisionEnvelope / trading memory |

```text
semantic payload → conversational renderer (+ memory avoid-list) → final response
```

---

## Files

### New
- `lib/conversational-renderer.ts` — stance / wait / why-not / invalidation / quality-gate / history leads / levels / closed / ack
- `lib/response-repetition-memory.ts` — lightweight session ring; message mining; `selectFromPool` / `pickDiverseIndex`
- `lib/casual-diversity.ts` — joke pool (15) + ask-me pool (12); follow-up resolution
- `scripts/test-karen-response-variability.ts` — sequence tests

### Extended
- `lib/decision-contract-output.ts` — plain formatters → renderer (`render` opts)
- `lib/casual-chat-intent.ts` — joke / ask-me / rephrase via diversity + memory
- `lib/decision-time-travel.ts` — history leads via renderer; plain mentor spoken
- `lib/mentor-intent.ts` — `isBareMentorFollowUp` accepts rephrase / another (keeps prior mentor intent)
- `lib/chat-engine.ts` — instant-read accepts varied stance openings
- `lib/market-snapshot.ts` — price / PDH/PDL / insufficient via renderer
- `scripts/test-karen-plain-english-market-replies.ts` — openings loosened; facts/labels still gated

**Not clobbered:** history kind routing (`decision-history-query`), latency agent Instant-read LLM skip semantics (still 0 OpenAI on hit).

**Follow-up (2026-08-15):** History cold-isolate bypass fixed — see `data/research/karen-history-response-variability-gap.md` (messages threaded into renderer; plain lane banners suppressed).

---

## Behaviour notes

- **Trading:** Same WAIT/LONG/SHORT/NO_TRADE; locked tail always includes because + trigger + invalidation + uncertainty.
- **Jokes:** Exclude recent ids/text; recycle only when pool exhausted.
- **Closed ≠ feed broken:** `renderMarketClosedLine` never says "feed problem".
- **GENERAL_CHAT:** More generative variation allowed; deterministic casual paths use local pools only.

---

## Tests run

```bash
npx tsx scripts/test-karen-response-variability.ts   # 117 passed
npx tsx scripts/test-karen-plain-english-market-replies.ts
npx tsc --noEmit -p tsconfig.json
```
