# Karen — LLM payload size & response latency audit

**Date:** 2026-08-15  
**Scope:** One warm market-read (`Give me the read`) — measure payload composition and identify unnecessary context.  
**Constraint:** Audit only. No payload reduction implemented. No commit / push / deploy.

## Measurement method

| Item | Source |
|---|---|
| Payload sections | In-process `buildChatSystemPrompt` + `formatIntelligenceForPrompt` + `formatQualityGateForPrompt` on **historical fixture** `synthetic-ny-am@50` (warm-equivalent assembly path) |
| Token estimate | `ceil(chars / 4)` — OpenAI usage not available this session |
| Live warm HIT latency | Prior measured benches in `karen-live-context-reuse.md` (not re-run tonight) |
| Live Yahoo / `:3020` | **UNAVAILABLE** (`health_unavailable`) — do not fabricate live tokens or TTFT |

Fixture gate for this bar: `canDeliverVerdict=false` (`current price unknown`), stance `flat`. That path can short-circuit with `QUALITY_GATE:` before LLM. Token sizes below still match what would be assembled for a deep market-read when the LLM path runs (warm HIT with deliverable envelope). Timing cites **prior live warm HIT** where LLM did run.

## Measured sizes (warm-equivalent market-read)

| Section | Chars | Tokens (est.) | Notes |
|---|---:|---:|---|
| **System — `CHAT_SYSTEM_PROMPT` total** | 12 323 | **~3 081** | Identity + style + ICT hard rules + ICT knowledge |
| → Karen identity | 147 | ~37 | |
| → Plain-language rule | 1 113 | ~279 | |
| → ICT stated probabilities block | 4 410 | **~1 103** | Always injected via `formatIctKnowledgeForPrompt()` |
| **Market context** (`formatIntelligenceForPrompt`) | 2 459 | **~615** | Up to 24 fact lines + EQH/EQL + interpretation ≤600 |
| **DecisionEnvelope text** (`formatUnifiedDecisionOutput`) | 7 104 | **~1 776** | Injected inside QUALITY GATE |
| → nested `formatDecisionEnvelope` alone | 4 550 | ~1 138 | Already contains FACTS / INTERPRETATION / DECISION / INVALIDATION / REASONING CHAIN |
| → unified wrapper *on top of* structured | **+2 554** | **~639** | Re-states FACTS, STANCE, THESIS, TARGET, INVALIDATION, conflict |
| **QUALITY GATE instructions** (prose only) | 1 728 | **~432** | Largely repeats CHAT_SYSTEM_PROMPT style/envelope rules |
| **QUALITY GATE full block** (instructions + envelope) | 8 833 | **~2 209** | |
| **Full system prompt** (assembled) | 26 175 | **~6 544** | |
| **Conversation history** (3 msgs: hey / reply / Give me the read) | 102 | **~26** | `messages.slice(-16)` |
| **Total input (est.)** | — | **~6 570** | system + history |
| **Fat history worst-case** (16 msgs with prior long reads) | — | **~1 532** | Upper bound if every assistant turn is a full labeled read |
| **Output cap** (`max_tokens`, text path) | — | **550** | `voiceMaxTokens` when `voiceInput` false |
| **Output tokens (actual)** | — | **UNAVAILABLE** | No live LLM call this session |

Internal envelope layer sizes (fixture): `facts` 165 chars, `interpretation` 399, `reasoningChain` JSON ~3 160 chars — chain dominates structured envelope body.

## Latency (warm HIT — prior live measurement, not tonight)

From `data/research/karen-live-context-reuse.md` Bench A HIT rows (context already warm):

| Metric | Warm HIT sample |
|---|---|
| Market context | **1–16 ms** |
| LLM wall (request → done) | **~3.7–4.6 s** (e.g. 3712 / 4629 ms) |
| Time to first token (in-process, after prompt ready) | **~618–989 ms** |
| Final generation ≈ LLM wall − TTFT | **~3.0–3.7 s** |
| Panel first-visible | Still ≈ full generation — SSE buffers to one delta (separate issue) |

Tonight: no new OpenAI TTFT / usage sample (`:3020` unhealthy).

## Unnecessary / duplicated context

### 1. Duplicated DecisionEnvelope (highest confidence waste)

`formatQualityGateForPrompt` injects `envelopeText` from `formatUnifiedDecisionOutput`, which **starts with a full `formatDecisionEnvelope(...)`** and then repeats:

- FACTS / HTF / TACTICAL  
- STANCE / EXECUTION / TARGET / INVALIDATION / THESIS  
- conflict presentation  

~**2 554 chars / ~640 tokens** are pure nested re-statement of fields already in the structured envelope. No new market truth.

### 2. Duplicated market prices (market block ↔ envelope)

Shared price-like tokens between market block and envelope (fixture sample): `24850.00`, `25100.00`, `24900.00`, ….  
Fact **ids** (`[structure.mss]` etc.) appear in the market block but **not** as ids in the envelope (envelope FACTS are short prose, 165 chars). Market block still carries richer cite-by-id detail the envelope does not fully replace.

### 3. Redundant instructional prose

QUALITY GATE mandatory bullet list (~432 tok) restates rules already in `CHAT_SYSTEM_PROMPT` (MENTOR VIEW vs TRADE DECISION, WAIT FOR, stance conflict, envelope source of truth). Safe to slim later; smaller than envelope nesting.

### 4. Unused / low-use fields on a warm envelope-backed read

| Block | Assessment |
|---|---|
| Full ICT probabilities (~1 103 tok) | Always on; decision already computed in envelope — high unused risk for *this* turn, but medium risk to remove (phrasing / session rules) |
| `lastVerdict` slice (≤1 200 chars) | Only if client sends it; can duplicate prior assistant read already in history |
| Learned rules / memory | Small when empty; not measured as dominant |
| Conversation history (−16) | Short on a fresh warm read (~26 tok); can grow to ~1.5k tok if prior assistant turns dump full envelopes — **unnecessarily long** only after multi-turn labeled reads |

### 5. Duplicated historical decisions

Not a separate Decision History ledger dump in this path. Duplication is **same-turn**: structured envelope + unified wrapper (+ optional `lastVerdict` + prior assistant history). No evidence of injecting the ring-buffer history into the LLM system prompt for a plain `Give me the read`.

## Path note

If `canDeliverVerdict` is false and the turn is rich-trading, `streamChatReply` throws `QUALITY_GATE:…` and **skips the LLM** — payload size then does not drive latency. Warm HIT that felt ~4 s LLM was the deliverable-envelope path.

---

## Single safest payload reduction opportunity

**Stop double-emitting the DecisionEnvelope in the QUALITY GATE prompt:** inject one canonical envelope form (e.g. `formatDecisionEnvelope` plus any *unique* fields such as CONCEPT EVIDENCE once), instead of `formatUnifiedDecisionOutput` nesting a full structured envelope and then repeating STANCE / FACTS / THESIS / TARGET / INVALIDATION.

| | |
|---|---|
| **Why safest** | Removes only proven same-string duplication; keeps every decision field once; does not touch ICT rules, market fact ids, history window, or stance semantics |
| **Estimated save** | **~640 input tokens** (~10% of ~6.6k warm-read input; ~36% of the ~1.8k envelope blob) |
| **Estimated latency impact** | Modest: **~50–150 ms** faster TTFT if prefills scale with input; **≪200 ms** on total LLM wall (~3.7–4.6 s remains decode-bound). Not a substitute for SSE flush-on-token |
| **Do not do yet** | Per task — audit only |

### Explicitly not recommended as the *first* cut

- Dropping the frozen market observations block (~615 tok) while the gate still says “every price/level must come from the intelligence block” — higher contradiction / hallucination risk.  
- Dropping ICT knowledge (~1 103 tok) — larger save, but changes rule availability, not pure duplication.  
- Shrinking `slice(-16)` — not the warm-read bottleneck until history is fat.

No code changed for reduction. Temp measurement helpers: `scripts/tmp-llm-payload-audit.ts`, `scripts/tmp-llm-payload-sample.ts` (audit only).
