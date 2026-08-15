# KAREN — LLM OUTPUT TOKEN / GENERATION AUDIT

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no code changes, no commit/push/deploy  
**Phrase:** warm `Give me the read` (`CURRENT_MARKET_READ` / `trading_stream`)  
**Cross-ref:** expands/refreshes `karen-llm-generation-latency-audit.md` with the return field names below. Also cites `karen-llm-payload-size-audit.md`, `karen-chat-warm-read-latency-breakdown.md`, `karen-live-context-reuse.md`, `karen-quality-gate-envelope-dedupe-impl.md`, `karen-sse-streaming-before.json`, `karen-first-visible-token-path.md`.

**Live tonight:** **NOT RUN**. No fabricated `completion_tokens` / %. Use prior warm HIT benches + code inspection.

**Do NOT modify:** QUALITY GATE envelope dedupe (complete: **2209 → 1580, −629** input tokens). That is an **INPUT** win only.

---

## INPUT vs OUTPUT (keep separate)

| Layer | What it is | Status | Affects |
|-------|------------|--------|---------|
| **INPUT** | System prompt + QUALITY GATE prose + `envelopeText` + market intel + history | Envelope dedupe **SHIPPED** (`formatCanonicalEnvelopeForPrompt`): QUALITY GATE block **2209 → 1580 (−629)** | Mostly **TTFT** / prefill cost (~50–150 ms est. if measured; **TTFT AFTER still UNKNOWN**) |
| **OUTPUT** | Tokens the model **generates** under `max_tokens` / gate “copy the envelope” rules | **Not reduced** by input dedupe | **Post-TTFT decode** (~3.0–4.0 s) — dominant warm HIT wall |

Input dedupe does **not** shorten the mandated visible copy. This audit is about **OUTPUT** only.

---

## Path (code-verified)

```
POST /api/chat/stream
  → buildChatSystemPrompt (DecisionEnvelope already SoT)
  → streamChatReply
       quality-gate fail → QUALITY_GATE:… (no LLM)
       else gpt-4o stream:true, max_tokens=voiceMaxTokens(…)
       ※ stream_options.include_usage + noteLlmUsage — **instrumented overnight**; live magnitudes still UNKNOWN until CME warm HIT
  → flushTradingLlmDeltas → SSE {type:"delta"} per token (intended)
  → polishReply + enforceVisibleDecisionContract(full, envelope)
  → SSE {type:"done", reply, replyReplaced?, decisionEnvelope?}
```

Authoritative decision exists **before** the LLM. The LLM is asked to **present** it.

---

## Instrumentation gap (why OUTPUT TOKENS = UNKNOWN)

| Signal | Present? |
|--------|----------|
| In-process TTFT / LLM wall (`t8`→`t9`→`t10`) | YES (warm HIT benches) |
| OpenAI `usage.completion_tokens` / `stream_options.include_usage` | **YES** overnight (`noteLlmUsage` → profile counters) — **live values still UNKNOWN** |
| Warm HIT `replyChars` for `replyReplaced=false` | **NO** (needs CME open) |
| Wire AFTER `flushTradingLlmDeltas` | **UNAVAILABLE** (SSE after-flush ABORT) |

→ **Typical output tokens = UNKNOWN** until warm HIT A/B (do not invent). See `karen-completion-tokens-instrumentation.md`.

---

## Answers (1–12)

### 1. Typical output token count (“Give me the read”)

**UNKNOWN.** No OpenAI `completion_tokens` on warm HIT.

Proxies (not token counts):

- Cap: **550** `max_tokens` (text / `voiceInput=false`).
- Historical wire final reply: **9397 chars**, `replyReplaced=true` → deterministic `formatUnifiedDecisionOutput` dump **after** enforce fail — **not** LLM completion tokens.
- Fixture unified dump ~**7104 chars** if replace fires — again not measured decode tokens.
- Whether generations typically **hit** the 550 cap: **UNKNOWN**.

### 2. Maximum output token allowance

| Path | Cap (`voiceMaxTokens`) |
|------|------------------------|
| Text chat (`voiceInput` false) | **550** |
| Voice + teaching length | **180 / 280 / 420 / 550** (`FAST` / rich / `NORMAL` / `DEEP`) |
| Casual stream | **160** (`gpt-4o-mini`) — not this path |

Model: `gpt-4o`. No temperature override in `streamChatReply`.

### 3. Typical response size (chars / structure)

**UNKNOWN for successful LLM text** (`replyReplaced=false` warm HIT).

Observed / structural:

| Source | Size | Notes |
|--------|------|-------|
| Wire sample (`karen-sse-streaming-before.json` run 3) | **9397 chars** | `replyReplaced=true` — enforce fallback, not LLM body |
| Compact spoken presenter (`formatMentorTradeSpoken`) | ~2 short sentences | Exists; **not** used for first “Give me the read” |
| Prompt style claim | “2–8 short lines” | Contradicted by gate copy rules |

### 4. Post-TTFT generation time

**~3.0–4.0 s** on warm HIT (measured benches, not invented):

| Sample | LLM wall | TTFT | Post-TTFT |
|--------|----------|------|-----------|
| Bench A run 4 | 4629 | 618 | **~4011 ms** |
| Bench A run 5 | 3712 | 646 | **~3066 ms** |
| Aggregate cite | ~3.7–4.6 s | ~0.6–1.2 s | **~3.0–4.0 s** |

Warm HIT TOTAL **~3.7–4.8 s**; LLM **~90–97%**. Pre-LLM on HIT ≪ 0.5 s — not this slice.

If `replyReplaced=true`, final giant text is assembled **after** the stream, but **post-TTFT still paid** the failed LLM generation.

### 5. Repetition found?

**YES — by design (OUTPUT).**

Gate (`formatQualityGateForPrompt`): “Copy the DECISION ENVELOPE below… source of truth — copy stance and chain.” Envelope already injected in the system prompt. Model regenerates SoT as visible tokens.

### 6. Unnecessary output?

**YES (prompt-forced), confidence high.**

`CHAT_SYSTEM_PROMPT`: “Dense and direct: **2–8 short lines**,” but QUALITY GATE requires:

1. Copy DECISION ENVELOPE  
2. Seven layers first (HTF → … → OVERALL STANCE)  
3. STRATEGIC / TACTICAL / EXECUTION  
4. FACTS | INTERPRETATION | DECISION | INVALIDATION  
5. **REASONING CHAIN**  
6. Mandatory MENTOR VIEW vs TRADE DECISION  

`formatReasoningChain` dominates structured envelope body (payload audit: reasoning JSON ~3160 chars on fixture). Regenerating that in the completion is the main decode driver.

**Field-level duplication (same turn):**

| Field | In prompt envelope | Forced in LLM visible copy | Enforce fallback unified dump |
|-------|--------------------|----------------------------|-------------------------------|
| Stance / verdict | yes | yes | yes |
| Thesis | yes | yes | yes |
| Evidence / chain | yes | yes (copy chain) | CONCEPT EVIDENCE again |
| Facts / interpretation | yes | yes | yes |
| Confidence / invalidation | yes | yes | yes |
| Mentor explanation | instructions | MENTOR VIEW | MENTOR VIEW again |

### 7. Does the system wait for the full generation before “complete”?

**YES for request completion / `done` / TOTAL.**

- `flushTradingLlmDeltas` drains the full iterator.  
- `polishReply` + `enforceVisibleDecisionContract` run on the **complete** string.  
- `t10_llm_complete` / `final_response` after drain.  
- Warm HIT TOTAL ≈ LLM wall.

### 8. Does SSE deliver useful content before generation finishes?

| Layer | Verdict |
|-------|---------|
| Code today | **YES intended** — per-token `{type:"delta"}` via `flushTradingLlmDeltas` |
| Wire BEFORE flush | **NO** — `deltaCount=1`, first delta = full **9397** chars |
| Wire AFTER flush (warm HIT) | **UNAVAILABLE** |

### 9. Can the UI use first streamed content without waiting for final?

**Code: YES.** Extension accumulates deltas; `done.reply` replaces with validated text (may differ if `replyReplaced`).

**Proven on wire/Chrome after flush:** UNAVAILABLE. If flush works: first visible ≈ TTFT (~0.6–1.2 s after prompt), not ≈ TOTAL. Shorter output mainly helps **post-TTFT / TOTAL**, not first paint (once flush is proven).

### 10. Do format constraints force unnecessary output?

**YES.** Conflicting constraints: dense 2–8 lines vs full envelope/chain copy + MENTOR/TRADE labels.

`enforceVisibleDecisionContract` requires MENTOR VIEW vs TRADE DECISION (or equivalent). Failure → full `formatUnifiedDecisionOutput` (**often larger** than a short mentor reply; 9397-char sample).

### 11. Minimum safe user-facing structure (decision parity)

Keep **DecisionEnvelope unchanged** as SoT. Minimum **visible** text:

1. **MENTOR VIEW** — HTF + tactical lean (named horizons), brief WHY  
2. **TRADE DECISION** — stance/role, thesis (what / fromWhere / toward), invalidation, confidence  
3. **WHY NOT LONG / WHY NOT SHORT** when conflict or wait/flat  
4. **Conflicts** — CONFLICT yes/no + one REASON when `disagree`

**Do not require** regenerating full REASONING CHAIN rows, duplicate FACTS/INTERPRETATION, or all seven layer lines if those live in envelope / optional SSE `decisionEnvelope`.

Precedents (deterministic, no LLM): `formatMentorTradeSpoken`, `formatStructuredWaitFollowUp`, `formatWhyNotDirectionFollowUp`.

### 12. Can shortening USER-FACING text cut generation time without changing DecisionEnvelope?

**YES (design-safe).** Envelope is computed and injected before OpenAI; LLM is presentation. Shorter mandated visible form does not change stance/ICT/envelope semantics. Deterministic mentor follow-ups already prove envelope→text without LLM.

**Caveat:** format + `enforceVisibleDecisionContract` must accept the short form, or short LLM text still pays full decode then gets replaced by a ~7–9k char dump.

---

## Safe reduction (OUTPUT) vs already-done INPUT

| | INPUT (done — do not touch this audit) | OUTPUT (this audit) |
|--|----------------------------------------|---------------------|
| Change | Canonical envelope in QUALITY GATE prompt | Stop forcing full envelope/chain **regen** in visible reply |
| Measured save | **−629** tokens (2209→1580) | Completion tokens cut: **UNKNOWN** until usage + A/B |
| Latency target | TTFT (modest; unmeasured) | Post-TTFT **~3–4 s** (dominant) |
| Parity risk | PASS (dedupe impl tests) | LOW if MENTOR+TRADE+stance+thesis+invalidation+conflicts kept; MEDIUM if labels/conflicts dropped |

---

## Expected latency impact

**Directionally yes for TOTAL / post-TTFT; quantified % = UNKNOWN.**

- Warm HIT is decode-bound after TTFT (~3.0–4.0 s of ~3.7–4.8 s).  
- Fewer completion tokens usually shorten decode.  
- No measured `completion_tokens`, no A/B, no invented %.  
- TTFT / first-visible (if flush works) mainly unaffected by output length.  
- Input −629 tok does **not** substitute for output shortening.

---

## Confidence

| Claim | Confidence |
|-------|------------|
| Post-TTFT ~3.0–4.0 s is largest warm HIT slice | **HIGH** (bench numbers) |
| Gate forces envelope/chain re-narration | **HIGH** (code) |
| Typical completion_tokens | **N/A → UNKNOWN** |
| Latency % from a specific output cut | **UNKNOWN** |
| Wire first-visible after flush | **UNKNOWN** |

Overall audit confidence on **bottleneck identity**: **HIGH**. On **quantified output-token savings**: **LOW** (uninstrumented).

---

## What is UNKNOWN

- Actual OpenAI **completion_tokens** / chars for successful (`replyReplaced=false`) warm HIT reads  
- Whether typical generations hit the **550** cap  
- Wire/Chrome first-visible **after** `flushTradingLlmDeltas`  
- Latency **%** from any specific output cut  
- Live remeasure this session  

---

## Explicit non-recommendations

- Modifying QUALITY GATE envelope dedupe (complete)  
- Analyse → Chat in-memory short-circuit for prod latency  
- Changing DecisionEnvelope / ICT / stance / model / temperature  
- Invented speedup percentages  
- Treating old ~28–40 s MISS MARKET CONTEXT medians as this warm path  
- Prompt / SSE / envelope / trading logic changes in this task  

---

## SINGLE BEST NEXT ACTION

**Stop requiring the LLM to regenerate the full DecisionEnvelope / REASONING CHAIN as visible text.** Mandate a compact MENTOR VIEW + TRADE DECISION (stance, thesis/WHY, invalidation, confidence, conflicts / why-not) that **cites** the already-built envelope, and align `enforceVisibleDecisionContract` so short replies are not replaced by a ~7–9k char unified dump. Optionally use deterministic compact presenters (already used for mentor follow-ups) for the initial read when `canDeliverVerdict`. Still **not** Analyse cross-route reuse; still **not** further INPUT envelope edits.

Instrument `completion_tokens` (or stream usage) on the next warm HIT A/B so impact is measurable.

---

## Return block

```
TYPICAL OUTPUT TOKENS: UNKNOWN
MAX OUTPUT TOKENS: 550 (text); voice 180–550
TYPICAL RESPONSE SIZE: UNKNOWN (successful LLM); 9397 chars observed only on replyReplaced=true enforce dump
POST-TTFT GENERATION: ~3.0–4.0s (warm HIT benches)
REPETITION FOUND: YES (prompt-forced DecisionEnvelope / chain re-narration)
UNNECESSARY OUTPUT: YES (full seven-layer + FACTS/INTERPRETATION/CHAIN copy vs 2–8 line style)
SAFE REDUCTION: YES (user-facing only; keep DecisionEnvelope SoT; co-design enforce)
EXPECTED LATENCY IMPACT: UNKNOWN (%); directionally attacks post-TTFT ~3–4s (≪ INPUT −629 tok TTFT effect)
CONFIDENCE: HIGH on bottleneck; LOW on token counts / % (uninstrumented)
SINGLE BEST NEXT ACTION: Compact visible format (stop full envelope/chain regen) + align enforce; instrument completion_tokens
```

---

## Stop

Audit complete. No implementation. No QUALITY GATE envelope dedupe changes. No prompt/SSE/envelope/trading changes. No commit/push/deploy.
