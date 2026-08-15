# KAREN — Instant read / LLM-skip feasibility audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no implementation, no code changes, no commit/push/deploy  
**Question:** Can Chat `"Give me the read"` / `"What's the market doing?"` safely skip the mentor LLM when a fresh authoritative `DecisionEnvelope` already exists?  
**Out of scope (explicit):** quality-gate dedupe, Redis, continuous recorder, session-boundary, past-tense wait fix, prompts, SSE, trading/ICT, envelopes — **do not modify**.  

**Evidence sources (SoT):**  
`karen-llm-generation-latency-audit.md`, `karen-llm-output-generation-audit.md`, `karen-chat-warm-read-latency-breakdown.md`, `karen-continuous-state-speed-audit.md`, `karen-analyse-chat-runtime-share-audit.md`, `karen-analyse-short-circuit-reuse-audit.md`, `karen-continuous-decision-memory-audit.md`, `karen-latency-by-request-type.md`, plus code: `streamChatReply`, `formatMentorTradeSpoken`, `formatStructuredWaitFollowUp`, `formatWhyNotDirectionFollowUp`, `formatDecisionEnvelope` / `formatUnifiedDecisionOutput` / `spokenBrief` (`buildSpokenBrief` → `narrateAnalysisContractForVoice`).

**Live tonight:** NOT RUN (weekend / CME closed). No fabricated A/B. Unmeasured claims = **UNKNOWN**.

---

## Phrase routing (code — do not conflate)

| Phrase | Mentor intent | `mustUseTradingStream` | Typical path today |
|--------|---------------|------------------------|--------------------|
| `"Give me the read"` / `"Get the read"` | `CURRENT_MARKET_READ` | **true** (`isTextMarketReadPhrase`) | `/api/chat/stream` → quality gate + **gpt-4o** `streamChatReply` |
| `"What's the market doing?"` | **GENERAL_CHAT** (special case: market+doing) | **false** (`isChartStatusQuestion`) | Snapshot / intel status — **not** the trading QUALITY GATE + envelope-copy LLM path |

**Implication:** Instant LLM-skip for a full DecisionEnvelope read is a product question primarily for **`CURRENT_MARKET_READ` / trading_stream**. Status ticks already avoid the mentor trading LLM by design.

---

## Path trace — `"Give me the read"` (code-verified)

```
POST /api/chat/stream
  → tradingStream=true (Give me the read)
  → tryDeterministicMentorFollowUp  ONLY if needsStructuredWaitFollowUp
       (Why? / wait / why-not / explain-prior — NOT CURRENT_MARKET_READ)
  → else streamChatReply
       → buildChatSystemPrompt
            buildDeskMarketIntelligence (+ live_context HIT/MISS)
            evaluateAnalysisQualityGate → runDecisionPipeline → DecisionEnvelope
            formatQualityGateForPrompt (envelope already SoT in prompt)
       → if !canDeliverVerdict → QUALITY_GATE:… (no LLM)
       → else OpenAI gpt-4o stream (max_tokens=550 text)
       → flushTradingLlmDeltas → polishReply → enforceVisibleDecisionContract
       → SSE done (+ optional decisionEnvelope JSON)
```

**Authoritative decision exists before the LLM call.** Gate injects `DECISION ENVELOPE (source of truth — copy stance and chain…)`. LLM is asked to **present / re-narrate**, not compute ICT stance.

---

## Answers 1–19

### 1. What is the current Chat LLM role on warm `"Give me the read"`?

**Presentation layer only** when `canDeliverVerdict`. Stance / thesis / invalidation / chain are already computed by `runDecisionPipeline` inside `evaluateAnalysisQualityGate`. OpenAI regenerates a labeled MENTOR VIEW + TRADE DECISION (+ forced seven layers / FACTS / REASONING CHAIN copy per gate prose).

On gate fail: **no LLM** — waitReason + envelopeText returned as `QUALITY_GATE:`.

### 2. What information does the LLM add beyond the envelope?

**No new decision authority.** It adds (when successful):

- Prose phrasing / ordering of fields the gate already mandates  
- Possible minor connective language  

It does **not** add a second ICT engine. On `replyReplaced=true`, visible text is replaced by deterministic `formatUnifiedDecisionOutput` — LLM decode was still paid (`karen-llm-output-generation-audit.md`).

**Teaching / casual / general** paths are out of scope for this skip (different intents / models).

### 3. Can deterministic formatters replace that presentation?

**YES for decision-parity of stance/thesis/invalidation/conflicts** — already proven on mentor follow-ups:

| Formatter | Used today for | LLM? |
|-----------|----------------|------|
| `formatMentorTradeSpoken` | Explain-prior / bias follow-up from last pipeline | No |
| `formatStructuredWaitFollowUp` | “What are you waiting for?” | No |
| `formatWhyNotDirectionFollowUp` | “Why not long/short?” | No |
| `formatUnifiedDecisionOutput` / `formatDecisionEnvelope` | Enforce fallback / panel contract | No |
| `spokenBrief` (`buildSpokenBrief` → `narrateAnalysisContractForVoice`) | Analyse / pipeline voice brief | No |

**Gap:** first `"Give me the read"` never calls these; it always streams gpt-4o when deliverable (`needsStructuredWaitFollowUp` excludes `CURRENT_MARKET_READ`).

### 4. Does a fresh authoritative envelope already exist on that request?

**YES, same request**, after quality gate, before OpenAI — when intel builds and gate runs. Also cached by `stateHash` in `lastGateCache` within process for identical intel+depth.

Cross-request / Analyse→Chat “latest LIVE envelope” without rebuild: **separate** (see item 7) — **not** required for same-request skip.

### 5. Safe short-circuit conditions (LLM skip)

All must hold:

1. Intent is fresh market read (`CURRENT_MARKET_READ` / equivalent trading_stream read) — **not** teaching / scenario / identity.  
2. Same request already produced `qualityGate.decisionEnvelope` with **`canDeliverVerdict === true`**.  
3. Visible text built **only** from that envelope (+ interpretation cases already on pipeline for why-not style, if used).  
4. Product accepts labeled deterministic MENTOR/TRADE (or `spokenBrief`) instead of LLM prose.  
5. Do **not** present an older envelope as “current” unless fingerprint would HIT (bars + price &lt; 0.25 MNQ + session) **and** same isolate — only relevant for **cross-request** reuse designs.

### 6. Unsafe / must-not-skip conditions

- `!canDeliverVerdict` / INSUFFICIENT / contract errors — keep gate WAIT path (already no LLM).  
- Fingerprint would MISS but serving last ring/`lastPipeline` as current.  
- Other serverless isolate’s RAM envelope.  
- HISTORICAL fixture envelope labeled as LIVE current.  
- Teaching / deep walkthrough asks that are not envelope presenters.  
- Claiming “fresh mentor reasoning” while emitting cached prose without honesty banner.

### 7. Production / Vercel limitation

From `karen-analyse-chat-runtime-share-audit.md`:

- Local sole `dev:karen`: Analyse ↔ Chat **share** process RAM (HIT proven).  
- **Vercel:** no isolate affinity → **cross-route in-memory reuse is NOT a production contract**.

**Critical for this audit:** same-request LLM skip after gate **does not need** cross-route memory. Design that only skips OpenAI after `evaluateAnalysisQualityGate` on **this** request is isolate-safe.

Cross-request “reuse last Analyse envelope without rebuilding intel” remains **unsafe on Vercel** as a correctness dependency.

### 8. Stale-data risks

| Risk | Same-request skip after gate | Cross-request envelope reuse |
|------|------------------------------|------------------------------|
| Serving wrong bar/print | Low — envelope from this intel | High unless fingerprint HIT |
| Forming-wick / unseen extreme | Same residual as today’s reuse contract | Same |
| Empty RAM after cold start | N/A (rebuild this request) | Honest miss / fall through |
| Yahoo 45s TTL alone | Does not equal fingerprint HIT | Unsafe if treated as decision freshness |

### 9. LIVE / HISTORICAL risks

- LIVE current read must not pull HISTORICAL fixture envelopes (`historical-ui` isolation).  
- Historical mode already has separate fixture session + banners — LLM skip there should stay on fixture pipeline only.  
- LIVE history ring / Redis hydrate is for **clock-time Q&A**, not a substitute for current-read freshness without fingerprint (continuous / recording audits).

### 10. Expected latency if LLM skipped (warm HIT)

**Measured today (warm HIT with LLM):** TOTAL **~3.7–4.8 s**; LLM **~90–97%**; post-TTFT **~3.0–4.0 s** (`karen-chat-warm-read-latency-breakdown.md`, Bench A).

**If LLM skipped after same-request gate on warm HIT:** directionally leave pre-LLM stages only — DATA **62–368 ms** + CTX **1–21 ms** + ENV **0–9 ms** + deterministic format (**ms class**) → **≪ 0.5 s** class total. Exact without-LLM CURRENT_MARKET_READ wall-clock = **UNKNOWN** (no A/B). Proxy: structured follow-up HIT **2–12 ms** when rebuild skipped (`karen-latency-by-request-type.md`) — new read still pays intel+gate even on HIT.

Do **not** cite STALE ~28–40 s MISS medians as this path.

### 11. Expected LLM call reduction

| Scope | Effect |
|-------|--------|
| Per deliverable `"Give me the read"` | **1 → 0** OpenAI trading calls (100% of that request’s mentor LLM) |
| Share of all chat traffic | **UNKNOWN** (unmeasured mix) |
| Follow-ups already skipped | Unchanged (`mentor_structured`) |
| Status “market doing” | Already off trading mentor LLM |

Background continuous mentor loops: out of scope / rejected elsewhere — **0** relevance if not built.

### 12. UX difference

| LLM path today | Deterministic skip |
|----------------|-------------------|
| Long labeled contract regeneration; may hit 550 cap; may `replyReplaced` → ~7–9k char unified dump | Compact `formatMentorTradeSpoken` (~2 sentences) or fuller `formatUnifiedDecisionOutput` / `spokenBrief` |
| Feels “spoken mentor” when validation passes | Feels more panel/contract / Analyse-voice |
| SSE deltas intended during decode | Instant `done` like follow-ups (unless synthetic stream) |

Parity of **decision** can be HIGH; parity of **voice style** is MEDIUM — product choice.

### 13. How does existing `mentor_structured` relate?

Already proves envelope→text without LLM for explain-prior / wait / why-not when `needsStructuredWaitFollowUp`. Instant-read skip would extend that pattern to **`CURRENT_MARKET_READ` after gate**, not invent a new decision path.

### 14. Is `"What's the market doing?"` the same problem?

**NO.** Code routes it as chart **status** (snapshot/intel), mentor intent GENERAL_CHAT for market+doing, `mustUseTradingStream=false`. Instant envelope LLM-skip is **not** the bottleneck there. Do not redesign status ticks as trading_stream envelope presenters without a separate product decision.

### 15. Design A — Same-request deterministic present (after gate)

After `evaluateAnalysisQualityGate` with `canDeliverVerdict` + envelope, return `formatMentorTradeSpoken` (or unified / spokenBrief) via `sseDone` / `responseSource=mentor_structured` (or new `envelope_instant`) — **skip OpenAI**.

- Isolate-safe  
- Matches follow-up precedent  
- Attacks warm HIT LLM wall  
- Does not require Redis / Analyse affinity / continuous recorder  

### 16. Design B — Cross-request reuse last envelope on fingerprint HIT

Skip intel+pipeline+LLM when `getLastPipelineResult` / LIVE ring matches reuse key.

- Local sole Node: possible  
- **Vercel: unreliable** (runtime-share audit)  
- Needs reuse key stored with last pipeline (Analyse short-circuit audit gap)  
- Higher stale risk if gates wrong  

### 17. Design C — Keep LLM, shorten mandated output

Compact MENTOR+TRADE prompt / enforce alignment (prior LLM-output audits). Still pays TTFT (~0.6–1.2 s) + shorter decode. Does **not** achieve “instant”; % save **UNKNOWN** without `completion_tokens` A/B.

### 18. Recommendation

**Prefer Design A** for feasibility and safety. Envelope is already SoT on the request; LLM is redundant for decision parity. Design B is a separate Analyse/chat affinity problem — do not use it as the prod correctness base. Design C is a fallback if product insists on LLM voice.

### 19. Single safest next implementation (audit recommendation only — not built)

**Feature-flagged same-request path:** when `CURRENT_MARKET_READ` + `canDeliverVerdict` + envelope present, emit deterministic `formatMentorTradeSpoken` (optionally attach `decisionEnvelope` on `done` as today) and skip `streamChatReply` OpenAI — measure warm HIT TOTAL vs Bench A. Fall through to LLM if flag off or gate fail. Do **not** wire cross-isolate Analyse reuse; do **not** touch quality-gate dedupe / Redis / SSE / prompts / ICT in that first cut beyond the skip branch + flag.

---

## What remains UNKNOWN

- Exact wall-clock of Design A on warm HIT (no A/B)  
- User acceptance of spoken vs LLM prose  
- `%` of chat turns that are deliverable CURRENT_MARKET_READ  
- Wire/Chrome first-visible after SSE flush (orthogonal; still UNAVAILABLE)  
- OpenAI `completion_tokens` on successful LLM reads  

---

## Explicit non-claims

- Continuous recorder does **not** solve warm LLM by itself (`karen-continuous-state-speed-audit.md`).  
- Analyse short-circuit ≠ chat LLM skip.  
- Input envelope token dedupe ≠ output/LLM skip.  
- No invented speedup percentages.

---

## Return block (exact fields)

```
CURRENT CHAT LLM ROLE: Presentation-only on deliverable CURRENT_MARKET_READ — regenerates labeled MENTOR/TRADE (+ gate-forced envelope/chain copy) after DecisionEnvelope already exists; no LLM on QUALITY_GATE fail. Status “What’s the market doing?” is not this path (snapshot/intel).
WHAT INFORMATION LLM ADDS: Phrasing only — no new stance/ICT authority; may still fail enforce and be replaced by formatUnifiedDecisionOutput after paying decode.
CAN DETERMINISTIC FORMATTERS REPLACE IT: YES for decision parity — formatMentorTradeSpoken / formatStructuredWaitFollowUp / formatWhyNotDirectionFollowUp / formatUnifiedDecisionOutput / spokenBrief already used on follow-ups & Analyse; first “Give me the read” does not use them today.
SAFE SHORT-CIRCUIT CONDITIONS: Same-request canDeliverVerdict + DecisionEnvelope; CURRENT_MARKET_READ (or equivalent); present only from that envelope; product accepts deterministic labels; cross-request reuse only if fingerprint HIT + same isolate (not required for Design A).
PRODUCTION/Vercel LIMITATION: No isolate affinity — cross-route RAM (Analyse→Chat last envelope) is NOT a prod contract. Same-request skip after gate IS isolate-safe.
STALE-DATA RISKS: Low for same-request gate envelope; HIGH if serving lastPipeline/LIVE ring without fingerprint HIT; residual forming-wick risk same as current reuse contract.
LIVE/HISTORICAL RISKS: Must not mix HISTORICAL fixture into LIVE current read; history ring/Redis is for recorded time Q&A, not freshness without fingerprint.
EXPECTED LATENCY IF LLM SKIPPED: Warm HIT directionally ≪0.5s (pre-LLM DATA+CTX+ENV + format); drop ~3.7–4.8s LLM wall. Exact Design A TOTAL UNKNOWN (no A/B). Follow-up HIT proxy 2–12ms when rebuild skipped.
EXPECTED LLM CALL REDUCTION: 1→0 per deliverable “Give me the read”; traffic-share % UNKNOWN. Follow-ups already 0. Status ticks already off trading mentor LLM.
UX DIFFERENCE: Less freeform mentor prose; more compact labeled contract / Analyse-voice; decision fields can match; style parity MEDIUM.
DESIGN A: Same-request deterministic present after gate — skip OpenAI (recommended shape).
DESIGN B: Cross-request fingerprint HIT envelope reuse without rebuild — local OK, Vercel unreliable.
DESIGN C: Keep LLM, compact mandated visible output — still TTFT-bound; % UNKNOWN.
RECOMMENDATION: Design A. Envelope is already SoT; LLM skip is feasible and safer than Design B for prod.
CONFIDENCE: HIGH on bottleneck + same-request feasibility (code + warm HIT benches); LOW on exact post-skip ms / user acceptance / traffic %.
SINGLE SAFEST NEXT IMPLEMENTATION: Feature-flag same-request CURRENT_MARKET_READ → formatMentorTradeSpoken (or spokenBrief) when canDeliverVerdict — skip gpt-4o; measure vs warm HIT ~3.7–4.8s; no cross-isolate Analyse reuse; no changes to quality-gate dedupe / Redis / continuous recorder / SSE / ICT / envelopes beyond the skip branch.
```

---

## Stop

Audit complete. No implementation. No code changes. No commit/push/deploy.
