# KAREN — Trade-history / mentor hallucination audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no code changes  
**Trigger:** Live extension mentor claimed prior signals (~9:45, potential long), mixed win/loss narrative, then denied taking positions when asked about wins/losses.

---

## Executive verdict

There is **no production trade ledger**. Wins, losses, fills, and “I took a position” are **not** backed by stored execution records. Narrative about “first signal after 9:30 ~9:45” and “setups that worked” is almost certainly **LLM inference** (class **F**), primed by ICT playbook/session templates and DecisionEnvelope / market prose — **not** a Decision History lookup and **not** an outcome store.

Decision History stores **DecisionEnvelope** snapshots (stance/thesis/conflicts). It is **not** a trade ledger and must not be treated as one.

---

## Trace: where mentor can get each fact type

| Fact type | Production source? | What exists | Class if spoken |
|-----------|-------------------|-------------|-----------------|
| Previous **signals** / “first signal at T” | **No ledger** | Chat history + optional DecisionEnvelope history (stance at asOf) | **B** only if exact envelope at T; else **F** |
| Previous **decisions** | **Yes (limited)** | `lastVerdict`, chat history, `getLastPipelineResult`, DecisionEnvelope history rings (LIVE/HISTORICAL) | **B** when citing stored envelope |
| **Entries** (hypothetical zone) | Scaffold only | `getExecutionScaffold` / envelope execution lines — **not fills** | **B**/scaffold ≠ **C** |
| **Exits** / stops taken | **No** | Prompt forbids stop recommendations; no fill store | **F** if claimed |
| **Wins** / **losses** | **No (live)** | Research-only `outcomes.jsonl` / backtest WIN·LOSS — **not wired to chat** | **F** / **G** if claimed as personal P&L |
| **Setups** | Observation + envelope | StructureFacts, FVG, MSS, thesis text | **A**/**B** if citing facts; **F** if “that setup won” |
| **Timestamps** (clock claims) | Bars / asOf / history | Envelope `asOf`, bar times; playbook templates “9:30–9:45” | **A**/**B** if from bar/envelope; **F** if invented 9:45 “signal” |
| **Trade outcomes** | Research offline only | Architecture experiment outcomes after T — not mentor | **D** only in research; **G** in live chat |

### Authoritative paths vs LLM path

| Path | Uses | Can invent win/loss? |
|------|------|----------------------|
| Deterministic mentor (`tryDeterministicMentorFollowUp`, `formatMentorTradeSpoken`, wait/why-not) | Current/last **DecisionEnvelope** | **No** — no win/loss language |
| Decision time-travel | Envelope history / dual PIT envelopes | **No** trade outcomes — decision compare only |
| `tryIntelligenceReply` / `answerMentorCoaching` | Current intel + envelope | **No** P&L |
| Trading LLM stream (`CHAT_SYSTEM_PROMPT` + market block + optional `lastVerdict`) | Envelope/facts + **OpenAI generation** | **Yes** — unconstrained narrative |
| Casual LLM (`CASUAL_CHAT_SYSTEM_PROMPT`) | Memory + chat | **Yes** — no ledger |

Questions like **“How many did you win or lose?”** have **no dedicated handler**. They fall through to trading or casual LLM. Expected correct answer (“no recorded trades”) is **not enforced**.

---

## Classification of the concerning claims

### “The first signal after 9:30 came around 9:45…”

| | |
|--|--|
| **Likely class** | **F** (model-generated), possibly contaminated by playbook template language |
| **Backed by record?** | **No** unless a DecisionEnvelope history entry exists with `asOf` ≈ 09:45 *and* the reply cites that entry |
| **Priming sources** | `lib/playbook.ts` hard rule 2: “~9:30–9:45” manipulation / “after 9:45 if sweep + FPFVG”; ICT knowledge “first 30 minutes after 9:30”; session templates — **not** a stored signal clock |
| **Not from** | Trade ledger (none); Decision History only if explicitly queried for that clock |

### “It indicated a potential long position…”

| | |
|--|--|
| **Likely class** | **F**, or **B** if paraphrasing a prior LONG envelope / “potential buy” brief |
| **Ambiguity** | Prompt language uses **“potential buy/sell”** for *reads*, not broker fills — LLM often upgrades this to “position” |

### “Some setups turned out well while others didn't…”

| | |
|--|--|
| **Class** | **G** / **F** — **unsupported** as trade outcomes |
| **Backed?** | **No** live outcome records. Observing price later ≠ recorded win/loss |

### “I didn't take any positions myself…”

| | |
|--|--|
| **Class** | **F** (correct *stance* by accident) — still not ledger-backed |
| **Truth** | System never records Karen executions → accurate *in absence of ledger*, but prior sentences already implied trading narrative |

### “How many did you win or lose?” (expected)

| | |
|--|--|
| **Expected** | Explicit: no trade/outcome ledger → cannot determine wins/losses |
| **Actual** | Unconstrained LLM; may invent counts or waffle |

---

## Decision History ≠ trade ledger

`lib/decision-envelope-history.ts` stores:

- timestamp / asOf, decisionKey fields, stance, thesis, evidence layers, conflicts, invalidation, light market-state snapshot  

It does **not** store:

- order id, fill price, size, exit, MFE/MAE, WIN/LOSS  

Research `outcomes.jsonl` (architecture historical experiment) is **offline labeling after T** — not attached to `/api/chat/stream` mentor.

---

## Why it was allowed

1. **No trade-outcome contract** in `CHAT_SYSTEM_PROMPT` / casual prompt forbidding win/loss claims without a ledger.  
2. **“Potential buy/sell”** and **9:30–9:45** playbook text invite narrative “first signal at 9:45.”  
3. **No deterministic gate** for performance / “did you take” / “win or lose” questions.  
4. LLM path still runs for rich trading Qs even when envelope exists — prose can drift past envelope.  
5. Contradiction (“setups worked” vs “I didn’t take positions”) is classic ungrounded generation under follow-up pressure.

---

## Risk

| Surface | Risk |
|---------|------|
| **LIVE** | High — trader can treat mentor fiction as track record; regulatory/trust damage |
| **HISTORICAL** | High — Decision History clocks can be confused with “signals that paid”; still no fills |
| **Automation** | Separate — research outcomes exist offline; must never leak into mentor as personal P&L without an explicit execution ledger |

---

## Safe fix (do not implement in this task — design only)

1. **Deterministic refusal path** for win/loss / “did you take” / “how many trades” when no execution ledger: fixed spoken line, no LLM.  
2. Prompt hard rule: never claim personal fills, win/loss, or “signal at HH:MM” unless citing a **named stored record** (envelope id/asOf or future execution id).  
3. Keep Decision History language: “decision at T” ≠ “trade taken at T.”  
4. Optional later: real trade ledger — only then allow **D** outcomes.

---

## Conceptual regression tests (for a later implementation)

| Case | Expected |
|------|----------|
| No trade record | “Cannot determine wins/losses — no recorded executions.” |
| Decision record, no execution | May cite decision stance/time; **must not** claim win/loss |
| Execution without outcome | May cite fill; **must not** invent P&L |
| Recorded winning trade | May report win from ledger only |
| Recorded losing trade | May report loss from ledger only |
| Historical decision without trade | HISTORICAL decision label only; no outcome |

---

## Deliverable block

```
SOURCE OF 9:45 CLAIM: LLM inference (F), primed by playbook/ICT 9:30–9:45 templates — not a trade/signal ledger entry (unless an envelope at that asOf was explicitly cited; live concern did not evidence that)
SOURCE OF WIN/LOSS CLAIM: LLM inference (F/G) — no production outcome ledger on the mentor path
TRADE LEDGER EXISTS?: NO (production). Research outcomes.jsonl exists offline only — not chat-wired
RECORDED EXECUTIONS?: NO
FIRST UNSUPPORTED CLAIM: “Some setups turned out well while others didn't” (and/or inventing a 9:45 “signal” without envelope citation)
WHY IT WAS ALLOWED: Unconstrained trading/casual LLM; no ledger gate; “potential buy” + session templates blur into trade narrative
LIVE RISK: HIGH — false track record / personal trading implication
HISTORICAL RISK: HIGH — Decision History can be misread as a trade diary
SAFE FIX: Deterministic no-ledger refusal + prompt ban on win/loss/personal fills without stored execution ids; never treat Decision History as P&L
```

Stop. No code changes. No commit/push/deploy.
