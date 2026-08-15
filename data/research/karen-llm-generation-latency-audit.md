# KAREN — LLM output generation latency audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no code changes, no commit/push/deploy  
**Phrase:** warm `Give me the read` (`CURRENT_MARKET_READ` / `trading_stream`)  
**Live tonight:** **NOT RUN** (CME closed). No fabricated tokens/TTFT/%. Use prior warm HIT benches + code inspection.

**Out of scope (explicit):** Analyse short-circuit / cross-route in-memory reuse (local same-process YES; Vercel isolate affinity NO). Input-envelope ~640-token dedupe is independent and may already be in flight (`formatCanonicalEnvelopeForPrompt`).

**Stale:** old ~28–40s MISS MARKET CONTEXT medians — not this path.

---

## Path trace (code-verified)

```
POST /api/chat/stream
  → intent (CURRENT_MARKET_READ / tradingStream)
  → optional mentor_structured short-circuit (follow-ups only — not first "Give me the read")
  → buildChatSystemPrompt
       market intel (warm HIT ~1–21 ms reuse + small data overlay)
       DecisionEnvelope + formatQualityGateForPrompt(envelopeText)
  → streamChatReply
       quality-gate fail → throw QUALITY_GATE:… (no LLM)
       else OpenAI gpt-4o stream:true, max_tokens=voiceMaxTokens(…)
  → flushTradingLlmDeltas → SSE {type:"delta"} per token
  → polishReply + enforceVisibleDecisionContract(full, envelope)
  → SSE {type:"done", reply}  (+ optional decisionEnvelope JSON)
  → extension: delta → updateStreamingAssistant; done → replace with validated reply
```

Authoritative decision already exists **before** the LLM call (envelope in QUALITY GATE). The LLM is asked to **present** it, not compute it.

---

## Evidence sources

| Source | Use |
|--------|-----|
| `karen-live-context-reuse.md` Bench A HIT | LLM **3712 / 4629**; TTFT **646 / 618** → post-TTFT **~3066 / ~4011** |
| `karen-chat-warm-read-latency-breakdown.md` | Warm HIT TOTAL **~3.7–4.8s**; LLM **~90–97%**; post-TTFT **~3.0–4.0s** largest slice |
| `karen-llm-payload-size-audit.md` | Input sizes; **max_tokens=550**; output usage **UNAVAILABLE** |
| `karen-sse-streaming-before.json` run 4 | `replyChars=9397`, `replyReplaced=true`, `deltaCount=1` (pre-flush wire) |
| `lib/chat-engine.ts` `voiceMaxTokens` / `streamChatReply` | Cap + OpenAI call |
| `lib/chat-prompt.ts` + `formatQualityGateForPrompt` | Forced output shape |
| `lib/decision-contract-output.ts` | Unified dump / enforce / spoken compact forms |
| `lib/sse-trading-flush.ts` + extension `content.js` | Flush + UI paint path |
| `karen-first-visible-token-path.md` | Wire AFTER flush still **UNAVAILABLE** |

---

## Answers (16)

### 1. Typical output token count for "Give me the read"

**UNKNOWN** on live warm HIT (no CME-open measurement tonight).

**Overnight note:** `stream_options.include_usage` + `noteLlmUsage` now record `completion_tokens` / `prompt_tokens` / `total_tokens` on dirty WT — ready for tomorrow's A/B (`karen-completion-tokens-instrumentation.md`). Proxies only until then:

- Cap: **550** `max_tokens` on text path.
- One historical wire final reply: **9397 chars** with **`replyReplaced=true`** → that body is the **deterministic** `formatUnifiedDecisionOutput` / envelope dump after enforce fail, **not** measured LLM completion tokens.
- Fixture unified envelope text ~**7104 chars** (~1776 tok est. chars/4) if enforce replaces — again not LLM decode tokens.

### 2. Maximum output token allowance

| Path | Cap |
|------|-----|
| Text chat (`voiceInput` false) | **550** (`voiceMaxTokens`) |
| Voice rich / teaching length | **180 / 280 / 420 / 550** by `teachingLengthFor` + `richVoice` |

Model: `gpt-4o`. No temperature override in `streamChatReply`.

### 3. Unnecessary verbosity?

**YES (prompt-forced), confidence high.**

`CHAT_SYSTEM_PROMPT` says “Dense and direct: **2–8 short lines**,” but QUALITY GATE requires the model to **copy the DECISION ENVELOPE**, emit **seven layers first**, then STRATEGIC/TACTICAL/EXECUTION, then FACTS | INTERPRETATION | DECISION | INVALIDATION and **REASONING CHAIN**, plus mandatory MENTOR VIEW vs TRADE DECISION. That is a full contract re-statement, not a short mentor line.

`formatReasoningChain` alone is multi-line concept×evidence rows — dominant length in the structured envelope body (payload audit: reasoning JSON ~3160 chars on fixture).

### 4. Does the response repeat the DecisionEnvelope?

**YES — by design.** Gate text: “Copy the DECISION ENVELOPE below… source of truth — copy stance and chain; do not contradict.” Envelope is already fully injected in the system prompt before the call.

### 5. Field-level duplication (stance / verdict / thesis / evidence / interpretation / confidence / invalidation / mentor / quality-gate)

| Field | In prompt envelope | Forced in LLM visible copy | Also in enforce fallback (`formatUnifiedDecisionOutput`) |
|-------|--------------------|----------------------------|----------------------------------------------------------|
| Stance / overall stance | yes | yes | yes (again under MENTOR + TRADE) |
| Verdict / trade direction / opportunity | yes | yes | yes |
| Thesis | yes | yes | yes |
| Evidence / reasoning chain / concept evidence | yes (chain) | yes (copy chain) | CONCEPT EVIDENCE block re-lists chain |
| Interpretation / facts | yes | yes | FACTS + HTF/TACTICAL restated |
| Confidence | yes | yes | yes |
| Invalidation | yes | yes | yes (+ conflict block again) |
| Mentor explanation | instructions | MENTOR VIEW section | MENTOR VIEW header + facts |
| Quality-gate rules | prose ~432 tok est. | mirrored in CHAT_SYSTEM_PROMPT style rules | n/a |

**Duplication found: YES** — same-turn input SoT + mandated output regeneration (+ optional full unified replace on validation fail).

### 6. What content drives post-TTFT generation length?

**LLM decode of the mandated labeled trading read** (MENTOR VIEW + TRADE DECISION + seven-layer / FACTS / INTERPRETATION / DECISION / INVALIDATION / REASONING CHAIN copy), until the OpenAI stream ends.

Measured warm HIT (in-process, not Chrome):

| Sample | LLM wall | TTFT | Post-TTFT |
|--------|----------|------|-----------|
| Bench A run 4 | 4629 | 618 | **~4011 ms** |
| Bench A run 5 | 3712 | 646 | **~3066 ms** |
| Aggregate cite | ~3.7–4.6 s | ~0.6–1.2 s | **~3.0–4.0 s** |

Pre-LLM on warm HIT (data+context+envelope) is ≪ 0.5 s and is **not** this slice.

If `replyReplaced=true`, the **final** giant text is assembled **after** the stream (deterministic), but the **post-TTFT wall still paid** the LLM generation that failed validation.

### 7. Does the system wait for the full generated response before “complete”?

**YES for request completion / `done` / TOTAL.**

- `flushTradingLlmDeltas` drains the full iterator before return.
- `polishReply` + `enforceVisibleDecisionContract` run on the **complete** string.
- `final_response` / `t10_llm_complete` mark after drain.
- Warm HIT TOTAL ≈ LLM wall (~3.7–4.8 s).

Deltas may enqueue earlier; **completion** still waits for end-of-stream + enforce.

### 8. Does SSE already deliver useful content before generation finishes?

| Layer | Verdict |
|-------|---------|
| Code today | **YES intended** — `flushTradingLlmDeltas` enqueues each non-empty token as `{type:"delta"}` before the next chunk |
| Wire BEFORE flush (1 sample) | **NO** — `deltaCount=1`, first delta = full **9397** char final |
| Wire AFTER flush (warm HIT) | **UNAVAILABLE** (SSE after-flush HTTP never finished) |

### 9. Can the UI use first useful streamed content without waiting for final?

**Code: YES.** `content.js` accumulates deltas and `updateStreamingAssistant(full)` sync on each delta; `done.reply` replaces with validated/final text (may differ if `replyReplaced`).

**Proven on wire/Chrome:** UNAVAILABLE after flush; paint never timed. If flush works, first visible ≈ TTFT (~0.6–1.2 s after prompt), not ≈ TOTAL.

### 10. Do response-format constraints force unnecessary output?

**YES.** Conflicting constraints:

- Style: 2–8 dense lines / no filler.
- Gate + style labels: full envelope copy, seven layers, chain, MENTOR/TRADE split, META line on calls, entry/target scaffold precision when directional.

`enforceVisibleDecisionContract` requires MENTOR VIEW vs TRADE DECISION (or equivalent top-down labels). Failure replaces with **full** `formatUnifiedDecisionOutput` (often larger than a short mentor reply).

### 11. Minimum safe user-facing structure (preserve decision parity)

Keep **DecisionEnvelope unchanged** as SoT. Minimum **visible** structure that still carries the required trader cues:

1. **MENTOR VIEW** — HTF + tactical lean (named horizons), brief WHY (from thesis.whyNow / conflict sentence).
2. **TRADE DECISION** — **stance** / role, **thesis** (what / fromWhere / toward), **invalidation**, **confidence**.
3. **WHY NOT LONG** / **WHY NOT SHORT** when conflict or wait/flat (from interpretation cases / conflictLog — already used by structured follow-ups).
4. **Important conflicts** — CONFLICT yes/no + one REASON line when `disagree`.

**Do not require** regenerating full REASONING CHAIN rows, duplicate FACTS/INTERPRETATION blocks, or a second copy of all seven layer lines if those already live in server-side envelope / optional `decisionEnvelope` SSE field.

Compact precedents already in tree: `formatMentorTradeSpoken`, `formatStructuredWaitFollowUp`, `formatWhyNotDirectionFollowUp` (deterministic, no LLM).

### 12. Can shortening USER-FACING text cut generation time without changing DecisionEnvelope?

**YES (design-safe).** Envelope is computed and injected before OpenAI; LLM is a presentation layer. Shorter mandated visible form does not require changing stance/ICT/envelope semantics. Deterministic mentor follow-ups already prove envelope→text without LLM (~ms–low hundreds ms).

### 13. Can structured data and spoken explanation be separated more efficiently?

**Partially already / YES opportunity.**

- Structured SoT: `DecisionEnvelope` (+ SSE `decisionEnvelope` on `done`).
- Spoken/compact: `formatMentorTradeSpoken`, mentor_structured follow-ups.
- Gap: first **“Give me the read”** still LLM-rewrites the full labeled contract instead of streaming a compact view over the existing envelope.

Separation would shrink decode without touching envelope math. **Not** Analyse cross-route reuse.

### 14. Does QUALITY GATE cause output duplication?

**YES.**

- **Output:** “Copy the DECISION ENVELOPE” + seven layers + chain → regenerates prompt SoT as visible tokens.
- **Input prose:** gate bullets restyle rules already in `CHAT_SYSTEM_PROMPT` (smaller than envelope copy; noted in payload audit).
- **Fail path:** `QUALITY_GATE:` returns waitReason + `envelopeText` with **no** LLM (output length = dump, latency ≠ decode).
- **Post-LLM:** enforce may replace with full unified dump (`replyReplaced=true`, 9397 chars sample).

Note: gate `envelopeText` now uses `formatCanonicalEnvelopeForPrompt` (structured once + STANCE ROLE / WAIT FOR) — **input** nesting reduced vs old `formatUnifiedDecisionOutput`; that does **not** remove the **output** “copy the envelope” mandate.

### 15. Is the ~640-token INPUT envelope dedupe independent of output generation?

**YES.** Input prefills affect TTFT/prompt cost; post-TTFT wall is **decode of completion tokens**. Deduping nested FACTS/STANCE/THESIS in the prompt does not by itself shorten the model’s required visible copy. Task note: input dedupe may proceed separately; do not conflate with this audit.

### 16. Is reducing output token count likely to produce measurable latency improvement?

**Directionally yes; quantified % = UNKNOWN.**

Reason: warm HIT is decode-bound after TTFT (~3.0–4.0 s of ~3.7–4.8 s TOTAL; LLM ~90–97%). Fewer completion tokens usually shorten decode, but:

- No measured `completion_tokens` on warm HIT.
- No A/B with a shorter format.
- TTFT / first-visible (if flush works) mainly unaffected by output length.
- If many reads end in `replyReplaced`, LLM still paid full generation before replace — need format+validate co-design so short replies pass enforce.

Do **not** invent a percentage.

---

## Stack picture (warm HIT generation focus)

```
[~0] request
[≪0.5s] data + context HIT + prompt/envelope
[0.6–1.2s] LLM TTFT
[~3.0–4.0s] LLM post-TTFT decode  ← LARGEST (this audit)
[SSE first visible] code≈TTFT enqueue; wire AFTER flush UNAVAILABLE
[done] full drain + polish + enforce (± replace with unified dump)
[Chrome paint] UNAVAILABLE
```

---

## What is UNKNOWN

- Actual OpenAI **completion_tokens** / chars for successful (`replyReplaced=false`) warm HIT reads
- Whether typical generations **hit** the 550 cap
- Wire/Chrome first-visible **after** `flushTradingLlmDeltas`
- Latency **%** from any specific output cut
- Tonight live remeasure (CME closed)

---

## Explicit non-recommendations (this task)

- Analyse → Chat in-memory short-circuit for prod latency
- Changing DecisionEnvelope / ICT / stance rules / model / temperature
- Invented speedup percentages
- Treating 28–40s MISS as current warm path

---

## SINGLE BEST NEXT OPTIMIZATION

**Stop requiring the LLM to regenerate the full DecisionEnvelope / REASONING CHAIN as visible text.** Mandate a compact MENTOR VIEW + TRADE DECISION (stance, thesis/WHY, invalidation, confidence, conflicts / why-not sides) that **cites** the already-built envelope, aligned with `enforceVisibleDecisionContract` so short replies do not get replaced by a ~7–9k char unified dump. Optionally prefer deterministic compact presenters already used for mentor follow-ups for the initial read when `canDeliverVerdict` — still **not** Analyse cross-route reuse.

Expected: attacks the **post-TTFT ~3–4 s** slice; impact **% UNKNOWN** until measured with usage + A/B.

---

## Return block

```
OUTPUT TOKENS: UNKNOWN
MAX OUTPUT TOKENS: 550 (text); voice 180–550
TYPICAL OUTPUT TOKENS: UNKNOWN
POST-TTFT GENERATION: ~3.0–4.0s (warm HIT benches)
MAIN SOURCE OF OUTPUT: Prompt-forced DecisionEnvelope / chain re-narration (MENTOR+TRADE+layers)
DUPLICATION FOUND: YES
SAFE OUTPUT REDUCTION: YES (user-facing only; keep envelope SoT)
DECISION-PARITY RISK: MEDIUM if labels/conflict/invalidation dropped; LOW if MENTOR+TRADE+stance+thesis+invalidation+conflicts kept
SSE/FIRST-VISIBLE IMPLICATION: Flush can surface content at TTFT; TOTAL still waits full decode+enforce; shorter output mainly helps post-TTFT/TOTAL (wire AFTER flush UNAVAILABLE)
EXPECTED LATENCY IMPACT: UNKNOWN
SINGLE BEST NEXT OPTIMIZATION: Compact visible format (stop full envelope/chain regen); keep DecisionEnvelope unchanged
```

---

## Stop

Audit complete. No implementation. No code changes. No commit/push/deploy.
