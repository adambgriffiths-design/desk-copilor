# KAREN — Compact current-read output + generation instrumentation audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no commit/push/deploy  
**Phrase:** warm `Give me the read` (`CURRENT_MARKET_READ` / `trading_stream`)  
**Sources:** `karen-llm-output-generation-audit.md`, `karen-instant-read-llm-skip-audit.md`, `karen-chat-warm-read-latency-breakdown.md`, `karen-llm-payload-size-audit.md`, `karen-sse-streaming-before.json`, code: `streamChatReply`, `formatMentorTradeSpoken`, `flushTradingLlmDeltas`, `formatQualityGateForPrompt`, `enforceVisibleDecisionContract`

**Live tonight:** NOT RUN (weekend). No fabricated `completion_tokens` / %.

**Instrumentation decision:** **NO code change.** There is **no** existing OpenAI `stream_options.include_usage` / `usage` capture hook on `streamChatReply` or `flushTradingLlmDeltas`. Adding one would be a new path (not an obvious safe tap). Prefer AUDIT ONLY.

---

## Layer legend (do not conflate)

| Layer | Meaning |
|-------|---------|
| **INPUT** | Prompt tokens (system + QUALITY GATE + envelope + intel + history). Envelope dedupe already shipped (−629 input tok). Affects TTFT / prefill mostly. |
| **OUTPUT** | Tokens the model **generates** under `max_tokens` / gate “copy the envelope” rules. Dominates post-TTFT decode. |
| **LLM SKIP** | Same-request deterministic present after gate (`formatMentorTradeSpoken` etc.) — **0** OpenAI calls. Separate from compact-LLM OUTPUT cut. |
| **SSE** | Wire delivery of deltas / `done`. Orthogonal to how many tokens the model generates. |

---

## Answers 1–22

### 1. Current output path (code-verified)

```
POST /api/chat/stream
  → tradingStream=true ("Give me the read")
  → tryDeterministicMentorFollowUp  ONLY if needsStructuredWaitFollowUp
       (Why? / wait / why-not / explain-prior — NOT CURRENT_MARKET_READ)
  → streamChatReply
       buildChatSystemPrompt → evaluateAnalysisQualityGate → DecisionEnvelope SoT
       formatQualityGateForPrompt (injects envelope; “copy stance and chain”)
       if !canDeliverVerdict → QUALITY_GATE:… (no LLM)  [LLM SKIP by gate fail]
       else gpt-4o stream:true, max_tokens=550 (text), NO stream_options.include_usage
  → flushTradingLlmDeltas → SSE {type:"delta"} per non-empty content delta
  → polishReply + enforceVisibleDecisionContract(full, envelope)
  → SSE {type:"done", reply, replyReplaced?, decisionEnvelope?}
```

**Authoritative decision exists before the LLM.** LLM is presentation / re-narration.

### 2. What the LLM actually generates

When `canDeliverVerdict`: regenerates labeled **MENTOR VIEW** + **TRADE DECISION** plus gate-forced **seven layers**, STRATEGIC/TACTICAL/EXECUTION, FACTS | INTERPRETATION | DECISION | INVALIDATION, and **REASONING CHAIN** (copy envelope). No second ICT engine.

On `replyReplaced=true`: final visible text becomes deterministic `formatUnifiedDecisionOutput` **after** stream — LLM decode was still paid.

### 3. Completion tokens

**UNKNOWN.** No OpenAI `usage.completion_tokens` on stream or non-stream trading chat (`streamChatReply` / `generateChatReply`). Cap = **550** (`voiceMaxTokens`, text). Whether typical warm HIT hits the cap: **UNKNOWN**.

### 4. TTFT

**~0.6–1.2 s** after prompt on warm HIT (Bench A **618 / 646 ms**; aggregate cite). In-process `llm_first_token` / t9 — **not** Chrome paint. INPUT size affects this slice; OUTPUT length does **not** (once first token arrives).

### 5. Post-TTFT generation

**~3.0–4.0 s** on warm HIT (measured):

| Sample | LLM wall | TTFT | Post-TTFT |
|--------|----------|------|-----------|
| Bench A run 4 | 4629 | 618 | **~4011 ms** |
| Bench A run 5 | 3712 | 646 | **~3066 ms** |

Warm HIT TOTAL **~3.7–4.8 s**; LLM **~90–97%**. This is the **OUTPUT decode** wall.

### 6. Current output redundancy

**YES — prompt-forced OUTPUT duplication.** Envelope already in INPUT; gate says copy it into visible completion. Same-turn field duplication:

| Field | INPUT envelope | Forced LLM visible | Enforce dump if replace |
|-------|----------------|--------------------|-------------------------|
| Stance / verdict | yes | yes | yes |
| Thesis | yes | yes | yes |
| Reasoning chain | yes (~3160 char JSON fixture) | yes (copy chain) | CONCEPT EVIDENCE again |
| Facts / interpretation | yes | yes | yes |
| Confidence / invalidation | yes | yes | yes |
| Mentor vs trade labels | instructions | MENTOR/TRADE | MENTOR/TRADE again |

Style conflict: `CHAT_SYSTEM_PROMPT` “2–8 short lines” vs QUALITY GATE full envelope/chain copy.

### 7. Required output (decision parity)

Keep **DecisionEnvelope** unchanged as SoT. Minimum **user-facing** text for a current read:

1. **MENTOR VIEW** — HTF + tactical lean (named horizons), brief WHY  
2. **TRADE DECISION** — stance/role, thesis gist (what / fromWhere / toward), invalidation, confidence  
3. **WHY NOT LONG / WHY NOT SHORT** when conflict or wait/flat (or conflict one-liner)  
4. **Conflicts** — CONFLICT yes/no + one REASON when `disagree`

Do **not** require regenerating full REASONING CHAIN rows, duplicate FACTS/INTERPRETATION blocks, or all seven layer lines if those live in envelope / optional SSE `decisionEnvelope`.

### 8. Useful output

- Stance + stance role (WAIT FOR when wait)  
- HTF vs current-structure lean with named horizons  
- Conflict yes/no + short reason  
- Thesis gist + invalidation + confidence  
- Optional: one-line execution / target when directional  

### 9. Redundant output

- Full **REASONING CHAIN** re-emit in visible text (chain already in INPUT envelope / can ride `decisionEnvelope` on `done`)  
- Re-copy of seven layers + FACTS | INTERPRETATION | DECISION | INVALIDATION when already structured SoT  
- `formatUnifiedDecisionOutput` ~7–9k char dump after enforce fail (9397-char wire sample) — worse than a short valid mentor reply  

### 10. Deterministic formatter capability

**YES for decision parity** — already proven:

| Formatter | Today | LLM? |
|-----------|-------|------|
| `formatMentorTradeSpoken` | Explain-prior / bias follow-up | No — ~2 sentences (~192 chars sample FLAT) |
| `formatStructuredWaitFollowUp` | “What are you waiting for?” | No |
| `formatWhyNotDirectionFollowUp` | Why not long/short | No |
| `formatUnifiedDecisionOutput` | Enforce fallback / panel | No — large |
| `spokenBrief` / Analyse voice | Pipeline voice | No |

**Gap:** first `"Give me the read"` never calls these; always gpt-4o when deliverable.

### 11. Option A — Current LLM

Keep gpt-4o + current QUALITY GATE “copy envelope/chain” mandates.  
**Speed:** warm HIT stays **~3.7–4.8 s** LLM-bound.  
**Parity:** HIGH if enforce passes; LOW UX if `replyReplaced` dumps 7–9k chars.  
**Touches:** none (status quo).

### 12. Option B — Compact LLM

Same model/path; change **OUTPUT** mandates only (compact MENTOR+TRADE; stop chain regen) + align `enforceVisibleDecisionContract` so short text passes.  
**Speed:** still pays TTFT (~0.6–1.2 s) + shorter decode; **% UNKNOWN** without `completion_tokens` A/B. Attacks post-TTFT ~3–4 s directionally.  
**Risk:** MEDIUM if enforce still replaces short text with unified dump.  
**Does not** achieve “instant.”

### 13. Option C — Deterministic (LLM SKIP)

Same-request after gate: `canDeliverVerdict` + envelope → `formatMentorTradeSpoken` (or spokenBrief) → `sseDone` / `mentor_structured`-like; **skip OpenAI**.  
**Speed:** directionally ≪0.5 s on warm HIT (pre-LLM DATA+CTX+ENV + format); drop ~3.7–4.8 s LLM wall. Exact TOTAL **UNKNOWN** (no A/B).  
**Isolate-safe** (same request). Cross-route Analyse→Chat RAM reuse is **not** required and is **not** a Vercel contract.  
**UX:** decision parity HIGH; voice-style MEDIUM.

### 14. Option D — Hybrid

Feature-flag: prefer deterministic compact for `CURRENT_MARKET_READ` when deliverable; fall through to compact-LLM (B) if product wants prose / flag off / edge cases.  
**Speed:** Design C when flag on; else B.  
**Risk:** flag/config surface only if scoped tightly; still no ICT/envelope semantics change.

### 15. Expected speed impact

| Option | Post-TTFT | TOTAL warm HIT | Quantified % |
|--------|-----------|----------------|--------------|
| A status quo | ~3–4 s | ~3.7–4.8 s | n/a |
| B compact LLM | shorter decode (directionally) | still ≥ TTFT | **UNKNOWN** |
| C deterministic skip | ~0 (no decode) | ≪0.5 s class | exact **UNKNOWN** |
| D hybrid | C or B | C or B | **UNKNOWN** |

INPUT −629 tok does **not** substitute for OUTPUT cut / LLM skip. SSE flush helps first-visible **latency to paint**, not generation token count.

### 16. What is measured

- Warm HIT TOTAL / LLM wall / TTFT / post-TTFT (Bench A, request-type audits)  
- INPUT QUALITY GATE envelope chars/tokens after dedupe (2209 → 1580, −629)  
- Historical wire: `replyChars=9397`, `replyReplaced=true`, `deltaCount=1` (pre-flush; not warm HIT successful LLM body)  
- Deterministic follow-up sizes (e.g. why-not 776, why 319, waiting 1035 chars)  
- Code path: no `stream_options.include_usage`

### 17. What is unknown

- OpenAI **completion_tokens** / successful (`replyReplaced=false`) warm HIT reply chars  
- Whether generations typically hit **550** cap  
- Wire/Chrome first-visible **after** `flushTradingLlmDeltas` on warm HIT  
- Latency **%** from any specific OUTPUT cut (Option B)  
- Exact Design C wall-clock on warm HIT  
- User acceptance of spoken vs LLM prose  
- Tonight live remeasure  

### 18. Correctness risks

| Change | Risk |
|--------|------|
| Compact LLM without enforce alignment | MEDIUM — short text fails validate → 7–9k dump; still paid full decode |
| Deterministic skip wrong envelope | LOW same-request after gate; HIGH if cross-request / other isolate without fingerprint |
| Drop MENTOR/TRADE labels | MEDIUM — enforce requires separation |
| Drop conflicts / why-not on disagree | MEDIUM — stance may look inconsistent with HTF lean |
| Mixing HISTORICAL fixture into LIVE read | HIGH — must not |
| Touching ICT / envelope / Redis / SSE flush / gate dedupe for this | Out of scope; avoid |

### 19. Field classification (proposed visible fields)

| Field | Class |
|-------|--------|
| MENTOR VIEW label + HTF lean (named horizon) | **REQUIRED** |
| Current/tactical structure lean (named horizon) | **REQUIRED** |
| TRADE DECISION label + stance / stance role | **REQUIRED** |
| WAIT FOR (when stance=wait) | **REQUIRED** |
| Invalidation (short) | **REQUIRED** |
| Conflict yes/no + one reason when disagree | **REQUIRED** |
| Thesis gist (what / toward / fromWhere) | **USEFUL** |
| Confidence | **USEFUL** |
| Why-not long/short when flat/wait | **USEFUL** |
| Execution / target one-liner when directional | **USEFUL** |
| Full REASONING CHAIN rows in chat text | **REDUNDANT** (SoT in envelope / SSE JSON) |
| Full FACTS \| INTERPRETATION \| DECISION blocks in chat | **REDUNDANT** |
| Seven-layer dump duplicated after MENTOR/TRADE | **REDUNDANT** |
| CONCEPT EVIDENCE re-list when chain already on envelope | **REDUNDANT** |
| Dense 2–8 line voice / connective prose | **OPTIONAL STYLE** |
| Exact label wording (MENTOR VIEW vs spoken order) | **OPTIONAL STYLE** |

### 20. INPUT vs OUTPUT vs LLM SKIP vs SSE (summary)

| Lever | Status | Effect |
|-------|--------|--------|
| **INPUT** envelope dedupe | SHIPPED — do not re-touch | Modest TTFT; not post-TTFT |
| **OUTPUT** compact mandate | Not done | Attacks post-TTFT decode |
| **LLM SKIP** deterministic present | Feasible; not built for CURRENT_MARKET_READ | Removes TTFT+decode |
| **SSE** flush | Coded; after-flush wire UNAVAILABLE | First paint timing, not token count |

### 21. Recommendation

Prefer **Option C (deterministic same-request LLM skip)** for speed + safety when product accepts spoken/contract voice — envelope is already SoT; LLM adds phrasing only.  
If product insists on LLM prose: **Option B** next, with enforce co-design — still measure `completion_tokens` before claiming %.  
Do **not** use cross-isolate Analyse→Chat reuse as correctness base. Do **not** invent speedup %. Do **not** modify QUALITY GATE input dedupe / Redis / ICT / envelope semantics / SSE flush for this slice.

### 22. Single safest next implementation (recommendation only — not built)

**Feature-flagged same-request path:** `CURRENT_MARKET_READ` + `canDeliverVerdict` + envelope → emit `formatMentorTradeSpoken` (attach `decisionEnvelope` on `done` as today) and **skip** `streamChatReply` OpenAI; measure warm HIT TOTAL vs Bench A ~3.7–4.8 s. Fall through to LLM if flag off or gate fail.  
**Do not** wire cross-isolate Analyse reuse; **do not** change quality-gate dedupe / Redis / continuous recorder / SSE flush / prompts / ICT / envelopes beyond the skip branch + flag.  
**Optional later (separate PR):** add `stream_options.include_usage` + log `completion_tokens` on trading stream for Option B A/B — **not** done in this audit (no existing hook).

---

## Exact return fields

```
CURRENT OUTPUT PATH:
POST /api/chat/stream → trading_stream → (no mentor_structured for CURRENT_MARKET_READ) → streamChatReply (gate + gpt-4o stream max_tokens=550, no include_usage) → flushTradingLlmDeltas SSE deltas → polish + enforceVisibleDecisionContract → SSE done (+ decisionEnvelope?). Gate fail → QUALITY_GATE no LLM.

WHAT THE LLM ACTUALLY GENERATES:
Presentation-only re-narration of DecisionEnvelope: MENTOR VIEW + TRADE DECISION + gate-forced seven layers / FACTS / INTERPRETATION / REASONING CHAIN copy. No new ICT stance. On replyReplaced=true, final text is formatUnifiedDecisionOutput after paying decode.

COMPLETION TOKENS:
UNKNOWN (no stream_options.include_usage / usage capture). Cap 550 text; voice 180–550. Hit-rate on cap UNKNOWN.

TTFT:
~0.6–1.2s warm HIT after prompt (Bench A 618/646ms). In-process; not Chrome. INPUT-sensitive; OUTPUT length does not set TTFT.

POST-TTFT GENERATION:
~3.0–4.0s warm HIT (e.g. 4011 / 3066ms). Dominant OUTPUT decode slice; ~90–97% of TOTAL with full LLM wall ~3.7–4.6s.

CURRENT OUTPUT REDUNDANCY:
YES — INPUT already has SoT envelope; OUTPUT forced to re-copy envelope/chain. Style “2–8 lines” contradicted by QUALITY GATE copy rules. Enforce fail can replace with ~9397-char unified dump.

REQUIRED OUTPUT:
MENTOR VIEW (HTF + tactical named leans + brief WHY); TRADE DECISION (stance/role, thesis gist, invalidation, confidence); CONFLICT / why-not when disagree or wait/flat. DecisionEnvelope SoT unchanged.

USEFUL OUTPUT:
Thesis what/toward/fromWhere; confidence; execution/target one-liner when directional; why-not sides on flat/wait.

REDUNDANT OUTPUT:
Full REASONING CHAIN / FACTS|INTERPRETATION|DECISION blocks / seven-layer re-dump in chat text; CONCEPT EVIDENCE re-list; enforce unified dump when a short labeled reply would suffice.

DETERMINISTIC FORMATTER CAPABILITY:
YES — formatMentorTradeSpoken (~192 char FLAT sample), wait/why-not follow-ups, formatUnifiedDecisionOutput, spokenBrief already prove envelope→text without LLM. First “Give me the read” does not use them today.

OPTION A — CURRENT LLM:
Status quo gpt-4o + full copy mandates. Warm HIT ~3.7–4.8s. No change.

OPTION B — COMPACT LLM:
Keep LLM; mandate compact MENTOR+TRADE; align enforce. Still TTFT-bound; post-TTFT save directionally; % UNKNOWN until completion_tokens A/B.

OPTION C — DETERMINISTIC:
Same-request after gate → formatMentorTradeSpoken (or spokenBrief); skip OpenAI. Isolate-safe. Directionally ≪0.5s warm HIT; exact UNKNOWN. Style parity MEDIUM.

OPTION D — HYBRID:
Flag: C when on; else B. Measure both. No Analyse cross-isolate dependency.

EXPECTED SPEED IMPACT:
C removes ~3.7–4.8s LLM wall (largest). B attacks ~3–4s post-TTFT only (quantified % UNKNOWN). INPUT −629 tok ≠ OUTPUT win. SSE flush ≠ fewer completion tokens.

WHAT IS MEASURED:
Warm HIT TOTAL/LLM/TTFT/post-TTFT; INPUT gate −629 tok; wire replyReplaced=true 9397 chars (pre-flush); follow-up deterministic char sizes; code absence of usage logging.

WHAT IS UNKNOWN:
completion_tokens; successful LLM replyChars; 550-cap hit rate; post-flush wire/Chrome first-visible; Option B %; Option C exact ms; user prose acceptance; live tonight.

CORRECTNESS RISKS:
Compact without enforce co-design → replace dump (MEDIUM). Cross-request/other-isolate skip (HIGH). Drop MENTOR/TRADE or conflicts (MEDIUM). HISTORICAL into LIVE (HIGH). Same-request skip after canDeliverVerdict (LOW).

RECOMMENDATION:
Prefer Option C (feature-flagged same-request deterministic present) for speed+safety; Option B if product requires LLM voice — with enforce alignment + later usage instrumentation. Do not touch INPUT gate dedupe / Redis / ICT / SSE flush / Analyse affinity for this.

SINGLE SAFEST NEXT IMPLEMENTATION:
Feature-flag CURRENT_MARKET_READ + canDeliverVerdict → formatMentorTradeSpoken + decisionEnvelope on done; skip gpt-4o; measure vs warm HIT ~3.7–4.8s; no cross-isolate reuse; no gate-dedupe/Redis/SSE/prompt/ICT/envelope changes beyond skip branch. Token usage logging deferred (no existing hook — not implemented this pass).
```

---

## Instrumentation note (why no code)

| Candidate hook | Present? | Safe minimal tap? |
|----------------|----------|-------------------|
| `stream_options.include_usage` on `streamChatReply` | **NO** | Would be new OpenAI option + final usage chunk handling |
| `flushTradingLlmDeltas` usage field | **NO** — only `delta.content` | Empty deltas already skipped; usage not read |
| Live latency notes for completion_tokens | **NO** | Would need new note wiring |
| Non-stream `generateChatReply` `response.usage` | **NO** — unused | Not the warm SSE path |

→ **AUDIT ONLY.** Optional token logging remains the next instrumentation step when explicitly scoped.

---

## Explicit non-claims / non-actions

- No QUALITY GATE envelope **INPUT** dedupe changes  
- No model / temperature / envelope / trading / ICT / Redis / recorder / SSE flush / prompt / quality-gate prose changes  
- No invented completion_tokens or speedup %  
- No commit / push / deploy  
- STALE MISS ~28–40 s medians are not this warm HIT path  

---

## Stop

Audit complete. No implementation. No token instrumentation (no obvious existing usage hook). No commit/push/deploy.
