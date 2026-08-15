# KAREN — E2E Behavioural Harness Failure Triage

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** Class-level FIX + VERIFY — no prod deploy / commit / push  
**Harness:** `npm run test:karen-e2e-behavioural:fast` (unchanged corpus/contracts)  
**Coordinate (not clobbered):** contextual-why `95e2e9ef`, level proximity `8fd5927e`, casual P1 / user-facing-error sanitisation already landed

---

## Scoreboard

| | PASS | FAIL | SKIP |
|--|-----:|-----:|-----:|
| **BEFORE** | 40 | 8 | 4 |
| **AFTER** | 56 | 0 | 4 |

Notes: AFTER corpus count is 60 scored+skipped (`--fast`); BEFORE report was 52. Same 8 FAIL ids are now PASS; SKIP set unchanged (honest market-state inject gaps). No contracts weakened.

---

## BEFORE failure anatomy (all 8)

Every FAIL shared **first broken hop = HTTP status 500** with user-visible  
`Something went wrong on the desk side — hit RECONNECT and try that again.`  
(`route=null`, `responseSource=null`, ~30–120ms).

| id | category | prompt / turn | expected (short) | actual | route | responseSource | hop | shared class |
|----|----------|---------------|------------------|--------|-------|----------------|-----|--------------|
| `conv-up-to-04` | CONVERSATION | `you busy?` | casual, openai≤0, no leak | reconnect 500 | null | null | HTTP 500 | A |
| `conv-statement-05` | CONVERSATION | `I might sit out today` | declarative casual | reconnect 500 | null | null | HTTP 500 | A |
| `expand-example-hello` | CONVERSATION | `hey karen` | greeting casual | reconnect 500 | null | null | HTTP 500 | A |
| `leak-casual-01` | ERROR_LEAKS | `asdf qwerty zxcv random` | no gate/error leak | reconnect 500 | null | null | HTTP 500 | A |
| `leak-casual-02` | ERROR_LEAKS | `blorp` | no gate/error leak | reconnect 500 | null | null | HTTP 500 | A |
| `leak-casual-03` | ERROR_LEAKS | `???` | no gate/error leak | reconnect 500 | null | null | HTTP 500 | A |
| `adv-false-bearish-claim` | CONSISTENCY | prior WAIT → `you said you were bearish…` | must not rubber-stamp bearish | reconnect 500 | null | null | HTTP 500 | B |
| `anti-invent-sweep` | ANTI_HALLUCINATION | exact sweep price ask, no structure | honest decline, no invent | reconnect 500 | null | null | HTTP 500 | C |

---

## FAILURE CLASSES

### A — Casual / nonsense → OpenAI (or gate miss) treated as terminal HTTP 500

**Root cause:** Phrases that are casual/non-trading but lacked instant canned coverage fell through to `streamCasualChatReply`. Missing/failed OpenAI (`OPENAI_API_KEY not set` or gate force path) was rethrown to the outer catch → **HTTP 500 + reconnect copy**. Classifier miss was treated as a crash, not fallthrough.

**Examples:** `you busy?`, `hey karen`, `I might sit out today`, `blorp`, `asdf…`, `???`.

**Class fix (not phrase patches):**
- Instant coverage: availability, name-addressed greeting, sit-out declarative, nonsense clarify (`Didn't catch that — say it another way?`).
- Soft-fallback treats `CASUAL_GATE_MISS` **and** OpenAI misses as recovery; force-LLM wrapped; stream errors emit spoken recovery SSE **200**, never reconnect/500.
- Outer catch: casual/nonsense → `safeCasualRecoveryReply`, never reconnect JSON 500.

### B — Adversarial stance gaslight crashed instead of correcting from prior text

**Root cause:** Trading-stream path hit OpenAI-key throw before any stance-consistency check → 500.

**Class fix:** Deterministic `tryStanceGaslightCorrection` — if user claims prior bearish/bullish and last assistant was WAIT/cautious (explicitly *not* calling that breakdown), speak a correction. No rubber-stamp.

### C — Anti-hallucination exact-sweep ask crashed instead of honest decline

**Root cause:** Same OpenAI-key throw on trading stream with no chart structure → 500 (worse than inventing).

**Class fix:** `tryExactSweepInventDecline` when user demands an exact sweep print without structure snapshot → honest “can't confirm / not inventing”. Trading unavailable / no stream → spoken recovery, not 500.

---

## FILES CHANGED

| File | Change |
|------|--------|
| `lib/casual-chat-intent.ts` | `availabilityReply`, `isNonsensicalInput`, `safeCasualRecoveryReply`, `NONSENSE_CLARIFY_REPLY`; sit-out declarative; `hey karen` greeting; unresolved miss → initiation/nonsense (not Ha / failure bubble as terminal) |
| `app/api/chat/stream/route.ts` | Stance gaslight + sweep invent declines; casual soft-fallback / force / stream recovery never 500; outer catch + empty trading stream → spoken recovery |

**Not touched:** QG / market truth semantics, decision history, contextual-why, level proximity, harness corpus/contracts.

---

## NEW FAILURES

None.

---

## TYPECHECK

`npx tsc --noEmit` — **PASS** (exit 0).

---

## VERIFY

```text
npm run test:karen-e2e-behavioural:fast
→ TOTAL_CASES=60 PASS=56 FAIL=0 SKIP=4
```

SKIP still honest for unsupported fixture injection (`gap-holiday-fixture`, `gap-disconnected-feed-fixture`, `gap-missing-ohlc-partial-ms`, `gap-fresh-chart-stale-external`).

---

## READY FOR HUMAN SMOKE

**YES** — local `:3020` fast harness green; critical paths (`blorp` / `hey karen` / `you busy?` / adversarial bearish gaslight / exact-sweep invent) return SSE 200 spoken replies with no reconnect leak.

Suggested smoke: one casual (`hey karen`), one garbage (`blorp`), one adversarial bias rewrite, one “exact sweep price” ask without chart.
