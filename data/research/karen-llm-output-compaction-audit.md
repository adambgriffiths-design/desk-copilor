# KAREN — LLM OUTPUT COMPACTION AUDIT

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no code changes, no commit/push/deploy  
**Target:** remaining **~3–4 s post-TTFT decode** on warm `Give me the read` (`CURRENT_MARKET_READ` / `trading_stream`) when the mentor LLM still runs  
**Cross-ref:** `karen-llm-output-generation-audit.md`, `karen-compact-read-output-audit.md`, `karen-instant-read-llm-skip-audit.md`, `karen-instant-read-llm-skip-implementation.md`, `karen-llm-payload-size-audit.md`, `karen-sse-streaming-before.json`  
**Live tonight:** NOT RUN (weekend). No fabricated `completion_tokens`.

---

## Scope note (instant skip vs remaining decode)

`KAREN_INSTANT_READ_LLM_SKIP` **now exists** (default **OFF**). When ON + deliverable gate + same-request envelope → `tryCurrentMarketReadFastPath` / `formatMentorTradeSpoken` → **0 OpenAI calls** (`responseSource=envelope_instant`). That path has **no post-TTFT decode**.

This audit addresses the **remaining** warm-HIT decode wall when the flag is **OFF** (or fast path soft-misses to LLM): quality-gate–forced visible re-narration under `streamChatReply`.

Do **not** modify DecisionEnvelope SoT or trading/ICT logic. Do **not** re-touch INPUT envelope dedupe (−629 input tok already shipped).

---

## VISIBLE OUTPUT PATH

**Default (flag OFF) — decode path responsible for ~3–4 s post-TTFT:**

```
POST /api/chat/stream
  → tradingStream=true ("Give me the read" / CURRENT_MARKET_READ)
  → tryDeterministicMentorFollowUp only if needsStructuredWaitFollowUp
       (Why? / wait / why-not / explain-prior — NOT first CURRENT_MARKET_READ)
  → [flag OFF] skip tryCurrentMarketReadFastPath
  → streamChatReply
       buildChatSystemPrompt
         → evaluateAnalysisQualityGate → DecisionEnvelope SoT
         → formatQualityGateForPrompt
              “Copy the DECISION ENVELOPE… Seven layers… FACTS|INTERPRETATION|…
               REASONING CHAIN… MENTOR VIEW vs TRADE DECISION”
              + envelopeText (canonical / unified fields already in prompt)
       → if !canDeliverVerdict → QUALITY_GATE:… (no LLM)
       → else OpenAI gpt-4o stream:true
            max_tokens = voiceMaxTokens → **550** (text / voiceInput=false)
            NO stream_options.include_usage
  → flushTradingLlmDeltas → SSE {type:"delta"} per token (intended)
  → polishReply + enforceVisibleDecisionContract(full, envelope)
  → SSE {type:"done", reply, replyReplaced?, decisionEnvelope?}
```

**Flag ON (not the remaining decode problem):** same route → `isInstantReadLlmSkipEnabled()` → `tryCurrentMarketReadFastPath` → `formatMentorTradeSpoken` → `sseDone` / `envelope_instant` / `openai_calls=0`.

**Prompt files that force length:** `lib/analysis-quality-gate.ts` (`formatQualityGateForPrompt`) + `lib/chat-prompt.ts` (`CHAT_SYSTEM_PROMPT` MENTOR/TRADE + seven-layer + labeled dump list). Style line “2–8 short lines” is contradicted by the gate copy rules.

**Authoritative decision exists before OpenAI.** LLM is presentation / re-narration only.

---

## COMPLETION TOKENS

**Instrumentation: SHIPPED overnight (dirty WT).** Live magnitudes still **UNKNOWN** until CME-open warm HIT.

| Signal | Present? |
|--------|----------|
| `stream_options.include_usage` / `usage.completion_tokens` on `streamChatReply` | **YES** (overnight) |
| Usage capture in `flushTradingLlmDeltas` | **YES** → `noteLlmUsage` |
| `generateChatReply` usage logging | **YES** |
| Format line / `timings.profile.counters` | **YES** (`prompt_tokens`, `completion_tokens`, `total_tokens`) |

Cap only: **550** `max_tokens` (text). Whether typical warm HIT hits the cap: **UNKNOWN** until live A/B. Do not invent token counts.

Evidence: `karen-completion-tokens-instrumentation.md`.

---

## OUTPUT CHARS

**UNKNOWN** for successful LLM body (`replyReplaced=false` warm HIT).

| Proxy | Chars | Notes |
|-------|-------|--------|
| Wire `karen-sse-streaming-before.json` run (Give me the read) | **9397** | `replyReplaced=true` — enforce → `formatUnifiedDecisionOutput`; **not** LLM completion size |
| Fixture reasoningChain JSON (payload audit) | ~**3160** | INPUT envelope body driver; regen into visible text is the intended decode load |
| `formatMentorTradeSpoken` (deterministic) | ~**192** (FLAT sample cite) | Instant-skip / follow-up size; not default LLM output |
| Deterministic follow-ups (wire) | 319 / 776 / 1035 | Why? / why-not / waiting — not CURRENT_MARKET_READ LLM |

Post-TTFT wall (measured benches, prior audits): **~3.0–4.0 s** (e.g. Bench A ~4011 / ~3066 ms). Warm HIT TOTAL ~3.7–4.8 s; LLM ~90–97%.

---

## REQUESTED STRUCTURE

Forced by QUALITY GATE + CHAT system style when LLM runs:

1. **Copy DECISION ENVELOPE** (stance + chain as SoT)  
2. **Seven layers first:** HTF CONTEXT → CURRENT STRUCTURE → TRADEABLE OPPORTUNITY → TRADE DIRECTION → TARGET → INVALIDATION → OVERALL STANCE  
3. **STRATEGIC BIAS → TACTICAL BIAS → EXECUTION**  
4. **FACTS | INTERPRETATION | DECISION | INVALIDATION**  
5. **REASONING CHAIN** (full rows)  
6. **MENTOR VIEW** vs **TRADE DECISION** (mandatory labels)  
7. **WAIT FOR:** exact condition when stance=wait; CONFLICT log when HTF≠tactical; thesis completeness (what / whyNow / timeframe / toward / fromWhere / invalidates)  
8. Cap **550** tokens; style claims “2–8 short lines” (conflict)

Extension verdict UI (`extension/desk-verdict-ui.js`) prefers structured `decisionEnvelope` / analysis contract for stance/invalidation panels — chat bubble text is not the sole SoT consumer.

---

## REPEATED/REDUNDANT

**YES — prompt-forced OUTPUT duplication of INPUT SoT.**

| Visible mandate | Redundant vs envelope already in prompt / `done.decisionEnvelope`? |
|-----------------|---------------------------------------------------------------------|
| Full **REASONING CHAIN** re-emit | **YES** — chain already in envelope (~3160 char JSON fixture) |
| **FACTS \| INTERPRETATION \| DECISION** blocks | **YES** — `env.layers.*` |
| Seven-layer dump after MENTOR/TRADE | **YES** — `formatDecisionEnvelope` / `env.read.*` |
| CONCEPT EVIDENCE re-list | **YES** — covered by chain |
| Full THESIS field dump in prose | **Partial** — needed gist only for chat; full line already in envelope |
| `formatUnifiedDecisionOutput` after enforce fail (~7–9k chars) | **YES / worse** — still paid full LLM decode first |

---

## ALREADY IN ENVELOPE

Present on `DecisionEnvelope` before LLM (and typically attached on SSE `done`):

- **Trading decision:** `stance`, `read.overallStance`, `read.tradeDirection`, `logicOrder.execution`  
- **Thesis / whyNow:** `thesis.what`, `thesis.whyNow`, `thesis.timeframe`, `toward`, `fromWhere`, `invalidates`, `complete`  
- **Invalidation:** `invalidation.condition` / `read.invalidation`  
- **WAIT FOR raw material:** thesis / execution / invalidation (presenter: `waitForLine`)  
- **Conflict:** `conflictLog`, `conflictResolution`  
- **Stance role:** derived (`stanceRoleLine`) — also added in `formatCanonicalEnvelopeForPrompt` extras  
- **HTF / tactical leans + horizons:** `read.htfContext`, `read.currentStructure`, `primaryHorizon`  
- **REASONING CHAIN / FACTS / INTERPRETATION / confidence / target**

LLM adds **phrasing only** when `canDeliverVerdict`. No second ICT engine.

---

## SMALLEST SAFE REDUCTION

Preserve **DecisionEnvelope SoT** and trading logic unchanged. Change **visible OUTPUT mandates only** (prompt + enforce alignment), or leave LLM and use the existing flag:

**A. Compact LLM (smallest prompt/enforce cut if product keeps gpt-4o voice):**

Mandate short labeled reply only:

1. **MENTOR VIEW** — HTF + current-structure leans (named horizons) + brief whyNow gist  
2. **TRADE DECISION** — **stance role** + thesis gist (what / toward / fromWhere)  
3. **WAIT FOR:** when stance=wait  
4. **Invalidation** (one line)  
5. **Conflict** yes/no + one REASON when disagree  
6. Keep **MENTOR VIEW / TRADE DECISION** labels (enforce requires separation)

**Stop requiring** regenerating full REASONING CHAIN, FACTS|INTERPRETATION|DECISION blocks, and seven-layer re-dump in chat text (those ride envelope / SSE JSON).

**Must co-change** `enforceVisibleDecisionContract` / `validateVisibleDecisionText` so compact text **passes** — otherwise short decode still gets replaced by ~7–9k unified dump after paying full generation.

**B. Zero-decode (already built, default OFF):** enable `KAREN_INSTANT_READ_LLM_SKIP` for CURRENT_MARKET_READ when deliverable — uses `formatMentorTradeSpoken` (~192 chars) which already carries TRADE DECISION + MENTOR VIEW + conflict + WAIT FOR material. Extension still gets `decisionEnvelope`. Largest latency win; style = spoken contract, not freeform prose.

Do **not** change envelope builders, ICT, Redis, INPUT gate dedupe, or Analyse cross-isolate reuse for this cut.

---

## ESTIMATED TOKEN REDUCTION

**UNKNOWN** (no `completion_tokens`; no A/B).

Structural bounds only (not measured savings):

| Bound | Value |
|-------|--------|
| Hard cap | **550** completion tokens |
| Compact target order-of-magnitude | ~**50–150** tok if ≈ `formatMentorTradeSpoken` / short MENTOR+TRADE (~192–600 chars) |
| Instant skip | **100% of completion tokens removed** (0 OpenAI) — not a “reduction %”, a skip |

Any invented % on post-TTFT ~3–4 s is forbidden. Directionally: fewer completion tokens → shorter decode; quantified ms/% = **UNKNOWN**.

---

## RECOMMENDATION

1. **If speed is primary:** prefer measuring/enabling existing **`KAREN_INSTANT_READ_LLM_SKIP`** (default OFF) — removes the entire post-TTFT decode for deliverable CURRENT_MARKET_READ; DecisionEnvelope SoT unchanged; extension contract via `decisionEnvelope` preserved.  
2. **If LLM prose must stay:** compact QUALITY GATE **visible** rules (stop full envelope/chain regen) **and** align `enforceVisibleDecisionContract` so short MENTOR+TRADE+WAIT FOR+conflict+invalidation+stance-role replies are valid.  
3. **Instrument** `completion_tokens` (`stream_options.include_usage`) on the next warm HIT A/B before claiming token or latency %.  
4. Do **not** touch DecisionEnvelope SoT, trading logic, or INPUT envelope dedupe for this slice.

---

## Exact return block

```
VISIBLE OUTPUT PATH:
Default (KAREN_INSTANT_READ_LLM_SKIP OFF): POST /api/chat/stream → trading_stream CURRENT_MARKET_READ → streamChatReply → formatQualityGateForPrompt (“copy envelope/chain” + seven layers + FACTS|INTERPRETATION|REASONING CHAIN + MENTOR/TRADE) → gpt-4o stream max_tokens=550, no include_usage → flushTradingLlmDeltas → polish + enforceVisibleDecisionContract → SSE done (+ decisionEnvelope?). Gate fail → QUALITY_GATE no LLM. Flag ON → tryCurrentMarketReadFastPath → formatMentorTradeSpoken → envelope_instant (0 decode; not the remaining 3–4s problem).

COMPLETION TOKENS: UNKNOWN
OUTPUT CHARS: UNKNOWN (successful LLM); 9397 observed only on replyReplaced=true enforce dump; spoken compact ~192 chars (deterministic)

REQUESTED STRUCTURE:
Copy envelope; seven layers; STRATEGIC/TACTICAL/EXECUTION; FACTS|INTERPRETATION|DECISION|INVALIDATION; REASONING CHAIN; MENTOR VIEW vs TRADE DECISION; WAIT FOR when wait; CONFLICT when disagree; thesis completeness; max_tokens 550

REPEATED/REDUNDANT:
YES — full chain / layers / FACTS|INTERPRETATION re-narration of SoT already in prompt; enforce unified dump can be larger still after paying decode

ALREADY IN ENVELOPE:
stance, stance-role inputs, thesis (incl. whyNow), invalidation, WAIT FOR material, conflictLog, HTF/tactical leans, reasoningChain, facts/interpretation, confidence, target — attached as decisionEnvelope on done

SMALLEST SAFE REDUCTION:
Keep DecisionEnvelope SoT + trading logic. Either (1) compact LLM mandates to MENTOR+TRADE + stance role + thesis/whyNow gist + WAIT FOR + invalidation + conflict and align enforce, OR (2) use existing instant-skip flag (formatMentorTradeSpoken). Stop requiring visible REASONING CHAIN / seven-layer / FACTS|INTERPRETATION regen.

ESTIMATED TOKEN REDUCTION: UNKNOWN
RECOMMENDATION:
Prefer enabling/measuring KAREN_INSTANT_READ_LLM_SKIP for zero decode; else compact QUALITY GATE visible output + enforce co-design; instrument completion_tokens before claiming %; do not change DecisionEnvelope SoT or trading logic.
```

---

## Stop

Audit complete. No implementation. No DecisionEnvelope / trading-logic / INPUT-dedupe changes. No commit/push/deploy.
