# Karen Role Audit — Mentoring vs Trading Decision

**Scope:** Inspection only. No strategy redesign, no trading-logic changes, no fixes applied.  
**Date:** 2026-08-14

---

## MENTOR vs DECISION SEPARATION: **PARTIAL**

The codebase has a **clear, testable decision object** (`DecisionEnvelope` + `MarketAnalysisContract`) that separates facts, interpretation, stance, thesis, and conflict resolution — but **live user-facing paths do not consistently enforce or label that separation**. Structured pipeline/chart_read outputs are strong; LLM text stream, vision screenshot fallback, mentor snapshot shortcuts, and UI legacy parsing still allow directional language without a complete trade thesis or without distinguishing mentor explanation from actionable decision.

---

## PATHS AUDITED

| Path | Entry | Decision envelope? | Post-output validation? |
|------|-------|-------------------|-------------------------|
| **Pipeline chart_read** | `lib/verdict-engine.ts` → `generatePipelineVerdict` → `runDeskPipeline` | Yes — `buildAnalysisContract` → `buildDecisionEnvelope` | Contract built deterministically; `validateDecisionEnvelope` only via quality gate / tests |
| **Vision screenshot chart_read** | `generateLiveVerdict` → `LIVE_VERDICT_SYSTEM` (`lib/playbook.ts`) | **No** — legacy panel/spoken format | None |
| **TEXT trading stream** | `app/api/chat/stream/route.ts` → `streamChatReply` (`lib/chat-engine.ts`) | Partial — envelope injected in system prompt when quality gate runs | Pre-gate blocks bad *data*; **LLM reply not checked** against envelope |
| **Mentor coaching (snapshot)** | `trySnapshotChatReply` / `answerMentorCoaching` (`lib/mentor-coaching.ts`, `lib/conversational-query.ts`) | Built internally in `speakEnvelope` but **not exposed or validated on spoken output** | None |
| **Voice narration** | `narrateAnalysisContractForVoice` (`lib/voice-analysis-narrator.ts`) | Yes when `contract.decision` present | None at runtime |
| **Live verdict API** | `app/api/live-verdict/route.ts` | Depends on pipeline vs vision branch | None on vision branch |
| **Desk verdict UI** | `extension/desk-verdict-ui.js` | Renders envelope when `deskPipeline.analysis_contract.decision` exists | `legacyFromData` regex-infers bias from free text |

**Supporting modules inspected:** `lib/decision-envelope.ts`, `lib/analysis-contract.ts`, `lib/chat-prompt.ts`, `lib/analysis-quality-gate.ts`, `lib/desk-pipeline.ts`, `lib/routing.ts` (`mustUseTradingStream`).

---

## GAPS

### 1. Vision screenshot chart_read bypasses the decision envelope entirely

**File:** `lib/verdict-engine.ts` (`generateLiveVerdict`), `lib/playbook.ts` (`LIVE_VERDICT_SYSTEM`, `PANEL_VERDICT_FORMAT`)

**Failure mode:** When structured chart JSON is unavailable and a screenshot is sent to `/api/live-verdict`, Karen uses the legacy ICT panel format (Bias / Call / Entry zone / Target 1) with **no** seven-layer read, **no** `conflictLog`, **no** thesis completeness check, and **no** stance enum (`long|short|flat|wait|monitor`).

**Example:** Prompt requires `Bias: daily + tradeable bias in one line` and `Call: potential buy | potential sell | stand aside` — directional bias and call can appear **without** named primary vs HTF horizons, without invalidation as a decision field, and without conflict resolution when horizons disagree.

---

### 2. TEXT trading stream — envelope is prompt guidance only, not enforced on output

**Files:** `lib/chat-engine.ts` (`streamChatReply`), `app/api/chat/stream/route.ts`

**Failure mode:** For `richPath` + quality gate pass, the frozen `DECISION ENVELOPE` is injected into the system prompt and `decisionEnvelope` is attached to the SSE `done` event — but the streamed GPT text is **never** run through `validateDecisionEnvelope`, `unlabeledDirectionalLeans`, or `assertNoLeanWithoutWhy`. The model can contradict the source-of-truth envelope in the visible reply.

**Example:** User sees "leaning bullish on this setup" in stream text while `decisionEnvelope.stance` is `flat` and `conflictLog.disagree` is true — UI/chat bubble shows LLM text; envelope is optional metadata.

**Note:** `unlabeledDirectionalLeans` / `assertNoLeanWithoutWhy` / `isTopDownReadable` exist in `lib/decision-envelope.ts` but are **only referenced from** `scripts/test-decision-envelope.ts`, not from any live path.

---

### 3. Mentor snapshot path skips quality gate and merges mentor + decision in one utterance

**Files:** `lib/chat-engine.ts` (`trySnapshotChatReply`), `lib/mentor-coaching.ts` (`speakEnvelope`, `answerMentorCoaching`), `lib/conversational-query.ts` (`answerFromIntelligence`)

**Failure mode:** Mentor intents routed via `trySnapshotChatReply` return before the trading stream or quality gate. `speakEnvelope` concatenates structure explanation (HTF context, current structure, chain) **with** trading decision fields (stance, execution, invalidation) into a single `spoken` string with **no section labels** distinguishing mentor vs decision.

**Example:** `answerCurrentRead` → one paragraph: "Overall stance: WAIT — 1-minute bullish vs daily bearish … Execution: wait for retrace into 25100 … Invalidation: …" — mentoring and decision are indistinguishable to the user.

---

### 4. Directional bias without horizon — mentor and snapshot helpers

**Files:** `lib/mentor-coaching.ts` (`biasLine`, `answerChange`), `lib/conversational-query.ts` (`answerStatus`)

**Failure mode:** Unlabeled bullish/bearish emitted outside the envelope's horizon-prefixed format.

**Examples:**
- `biasLine`: `"Tradeable bias is bullish"` — no timeframe prefix (violates `chat-prompt.ts` rule and `unlabeledDirectionalLeans` intent).
- `answerChange`: `"Current lean is LONG"` when verdict moves — direction without horizon, entry, target, or invalidation.
- `answerStatus`: `"Tradeable bias: bullish."` plus optional `interpretation.reasoning` — status snapshot reads as directional bias without a trade thesis.

---

### 5. Voice narrator fallback — unlabeled bullish/bearish when envelope absent

**File:** `lib/voice-analysis-narrator.ts` (`biasOpener`, `narrateAnalysisContractForVoice`)

**Failure mode:** If `contract.decision` is missing, WAIT/LONG/SHORT branches call `biasOpener(c)` which returns `"I'm leaning bullish here."` / `"I'm bearish here."` with **no horizon label** and no conflict resolution sentence.

**Example:** Any code path that builds a `MarketAnalysisContract` without `decision` (or legacy panel-only contract) can speak bare directional lean on voice.

---

### 6. Scenario analysis gives competing directions without resolution

**File:** `lib/mentor-coaching.ts` (`answerScenario`)

**Failure mode:** Deliberately presents bull case and bear case plus conflict text but **never states stance, trigger, or which scenario is operative** — appropriate for pure mentoring, but if the user asked for a read/decision, they receive unresolved conflicting signals.

**Example:** `"Bull case: … Bear case: … The conflict: bullish bias vs bearish structure"` — no `stance`, no `wait for X`, no invalidation for either side.

---

### 7. WAIT without named trigger — vision path and some contract edge cases

**Files:** `lib/playbook.ts` (`LIVE_VERDICT_SYSTEM`), `lib/voice-analysis-narrator.ts` (`missingConfirmationClause`)

**Failure mode:**
- Vision prompt allows `Call: stand aside` / `Entry zone: WAIT` without requiring **what** is being waited for (contrast `analysis-contract.ts` `buildWaitReason` and envelope `executionLine`).
- Voice `missingConfirmationClause` can say `"I'm waiting for the retrace into the entry zone"` when `c.entry.includes("wait")` even if entry is the vague string `"wait for entry zone — not ready"` — trigger not concrete.

**Example:** Screenshot read: "Call: stand aside, Entry zone: WAIT" with no FVG/level/retrace named in spoken block.

---

### 8. Trade thesis without explicit horizon in contract top-level fields

**File:** `lib/analysis-contract.ts`

**Failure mode:** Contract exposes `htf_bias` (single word: bullish/bearish/neutral) and `verdict` (LONG/SHORT/WAIT) **alongside** `decision` envelope. UI and voice can surface `htf_bias` alone as if it were the decision.

**Example:** `desk-verdict-ui.js` `setField("dc-v-bias", contract.htf_bias)` shows "bullish" in the hero area while stance is `flat` and `decision.read.tradeDirection` is `NONE` — reads as directional bias without trade thesis.

---

### 9. Desk verdict UI legacy path infers LONG/SHORT from free-text bullish/bearish

**File:** `extension/desk-verdict-ui.js` (`legacyFromData`)

**Failure mode:** When `analysis_contract` is absent, verdict is inferred by regex on `spokenBrief`: `/long|buy|bullish/i` → LONG. Conflates **mentoring language** ("structure is bullish") with **trading decision**.

**Example:** Spoken "structure turned bullish but I'm staying flat" could classify as LONG in legacy path.

---

### 10. Mixed mentoring + decision in the same contract object layers

**Files:** `lib/decision-envelope.ts` (`layers.interpretation`, `layers.decision`), `lib/analysis-contract.ts` (`why` block + `final_reasoning` + `decision`)

**Failure mode:** Single `MarketAnalysisContract` bundles observation facts (`why`), narrative interpretation (`final_reasoning`), and full decision envelope. Consumers (UI evidence panel, voice) interleave all three without a user-visible "this is context only" vs "this is the call" boundary.

**Example:** `formatAnalysisContract` outputs VERDICT/ENTRY/TARGET then FACTS/WHY then full envelope — mentoring facts and decision fields appear in one blob; not a separation failure in data model, but **utterance-level mixing** when formatted or spoken end-to-end.

---

### 11. Quality gate does not cover all live paths

**File:** `lib/analysis-quality-gate.ts`, `lib/chat-engine.ts`

**Failure mode:** Gate runs only when `richTrading || requiresDeepAnalysisPipeline`. **FAST_FACT** mentor turns, casual snapshot replies, vision chart_read, and non-rich trading questions **never** get gate + envelope injection.

**Example:** Short mentor voice ack path (`Voice FAST_FACT: 1–2 sentences from market state only`) — can cite bias/MSS without envelope or thesis rules.

---

### 12. `answerChange` — conflicting prior vs current without envelope conflict sentence

**File:** `lib/mentor-coaching.ts` (`answerChange`)

**Failure mode:** Compares prior assistant text to current verdict with `"I'm still not calling a direction"` or `"lean moved to LONG"` without requiring `conflictResolution.sentence` or `conflictLog` when HTF/tactical disagree.

**Example:** `"Since last check, the call moved wait → trade"` + `"Current lean is LONG"` — no invalidation, target, or horizon disagreement handling.

---

## ENFORCEMENT

| Path | Complete thesis required? | Unlabeled bullish/bearish blocked? | Seven layers + conflictLog enforced? |
|------|---------------------------|-------------------------------------|--------------------------------------|
| **Pipeline chart_read** (`generatePipelineVerdict`) | Stance downgrades incomplete LONG/SHORT to wait/monitor in `buildDecisionEnvelope` | Enforced in envelope **object**; spoken brief via narrator | Yes in contract; validated in tests / quality gate input |
| **Vision chart_read** (`generateLiveVerdict`) | **No** | **No** | **No** |
| **TEXT stream** (GPT, gate pass) | Prompt-only; incomplete thesis rule in `CHAT_SYSTEM_PROMPT` | Prompt-only | Envelope copied into prompt; output **not** validated |
| **TEXT stream** (gate fail) | N/A — canned WAIT + envelope text | Blocked via thrown `QUALITY_GATE:` reply | Envelope text included in blocked reply |
| **Mentor snapshot** | **No** | **No** — `biasLine`, scenario, change handlers | Built in `speakEnvelope` but not validated on output |
| **Voice** (pipeline contract) | Narrator follows `env.stance` | Uses envelope when present | Yes when `c.decision` set |
| **Voice** (no decision on contract) | **No** | **No** — `biasOpener` | **No** |
| **Desk UI** (pipeline data) | Shows thesis.complete in evidence | Shows separate `htf_bias` field | Renders envelope when present |
| **Desk UI** (legacy) | **No** | Infers from keywords | **No** |

**Summary:** Only the **deterministic pipeline** reliably produces a validated envelope. **Runtime enforcement on spoken/chat text is absent** except blocking stream start when data/contract validation fails pre-LLM.

---

## WAIT EXPLAINED?

| Path | Stay-flat vs wait-for-trigger distinguished? | Names what is being waited for? |
|------|-----------------------------------------------|----------------------------------|
| Pipeline + `analysis-contract` | Yes — `isWaitForTrigger`, `wait_reason`, `buildWaitReason` | Yes when trigger setup exists; stay-flat lists bias/structure/session conflicts |
| Decision envelope | Yes — `stance: wait` vs `flat`, `executionLine` | Yes for FVG/retrace setups |
| Vision chart_read | Partial — Entry ACTIVE/WAIT | Often vague; no `WHY WAIT` section |
| Mentor `answerWait` | Uses `speakEnvelope` | Yes when envelope built |
| TEXT stream | Prompt rules | Depends on LLM; not verified |
| Voice fallback (no decision) | Uses `wait_reason` / `final_reasoning` | Partial |

**Gap:** Vision path and unlabeled WAIT in voice fallback can say "waiting" without naming the trigger.

---

## CONFLICT RESOLUTION PRESENT?

| Path | HTF vs tactical conflict logged? | Resolved to stance in user output? |
|------|-----------------------------------|-------------------------------------|
| `buildDecisionEnvelope` / `buildConflictResolution` | Yes — `conflictLog`, `conflictResolution.sentence`, LTF-against-HTF flag | Yes in envelope; downgrades to flat/wait when oppose |
| Pipeline voice (`narrateAnalysisContractForVoice` with decision) | Yes — spoken includes conflict bit | Yes |
| Vision chart_read | **No** structured conflict log | Ad hoc in LLM prose |
| Mentor `answerScenario` | Mentions conflict | **Not resolved** |
| TEXT stream | In prompt envelope | **Not verified** in reply |
| `answerChange` | **No** | **No** |

---

## DO NOT FIX

This report documents gaps only. No code, prompts, or trading logic were changed. Remediation (post-stream validation, vision path envelope adoption, mentor/decision labeling, runtime `unlabeledDirectionalLeans` checks) is out of scope for this audit.
