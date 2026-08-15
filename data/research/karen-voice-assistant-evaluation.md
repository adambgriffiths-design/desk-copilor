# Karen — voice + general assistant capability evaluation

**Date:** 2026-08-14  
**Track:** Voice mentor / assistant usefulness — **not** market-call accuracy (Aug 12 NQ blind mentor eval is a separate study; this report does not score LONG/SHORT/WAIT hit rate).  
**Code under test:** extension `manifest.json` **v1.4.108**, npm package **1.4.84**.  
**Method:** Read the real voice/chat pipeline; run existing benches/tests; run a classifier/prompt failure suite against spec questions.  
**Not done:** Live microphone on TradingView. No `__dcVoiceLatencyTrace` capture this session. No live spoken conversation with changing TV data.

---

## How voice actually works (do not invent a speech-to-speech agent)

Realtime is **STT only**. Karen’s brain and mouth are the extension + backend:

1. Mic → OpenAI Realtime WebSocket (Whisper transcription, server VAD).  
2. `extension/content.js` `handleRealtimeTranscript` owns the turn.  
3. Route in `lib/desk-route-intent.ts` (mirrored in the extension): levels / casual / chart_read / snapshot / live_web / trading.  
4. Reply via chat stream (`app/api/chat/stream`) or market snapshot / chart-read pipeline.  
5. Speak via browser `speechSynthesis` (short) or `POST /api/voice/tts` (longer / emotive). Spoken text is capped with `capSpokenVoice` (2 sentences / 320 chars).

Realtime session (`app/api/voice/realtime-session/route.ts`):

- Instructions: *“You are a speech-to-text pipe only. Stay completely silent.”*  
- `tools: []`, `tool_choice: "none"`, `create_response: false`.  
- `lib/voice-instructions.ts` still lists `VOICE_REALTIME_TOOLS` (`get_desk_time`, `get_market_snapshot`, `get_chart_read`, `mark_levels`, …). **Those tools are not attached.** `content.js` `onToolCall` returns *“Karen handles this from transcript — tool disabled.”*

If a product claim implies Karen “uses Realtime tools,” that is stale. She uses transcript routing.

---

## 1. Voice quality

**Live-mic numbers were not measured in this evaluation.** Figures below are from `npm run bench:voice` (architecture audit + configured constants) plus unit tests. The last voice-pass claim (~500 ms VAD, 1–2 sentence TTS) **matches current code**.

### Configured latency (code, not a stopwatch)

| Stage | Configured / estimated |
|---|---|
| Server VAD silence | `VAD_SILENCE_MS = 400` |
| Transcript settle | `TRANSCRIPT_SETTLE_MS = 100` |
| **Post-speech fixed delay** | **500 ms** (was 1300 ms; −62%) |
| Utterance merge window | `UTTERANCE_MERGE_MS = 1100` |
| Cold Realtime connect | ~1–3 s once per session (code comment) |
| Warm turn after last audio | ≥500 ms VAD+settle, then STT final + hops |
| Bench *estimate* `first_audible` from `speech_start` | ~2250 ms **including the utterance itself** (not a live measurement) |
| FAST_FACT snapshot | ~0.5–2 s (bench estimate) |
| DEEP / screenshot chart read | ~3–8 s+ (bench estimate) |

Tests: `npm run test:voice` PASS, `npm run bench:voice` PASS, `npm run test:voice-quality` PASS.

### Short vs complex

- **Short facts** (price, last MSS, NWOG): `FAST_FACT` → snapshot JSON, no working ack, no screenshot. Designed to be fast.  
- **Complex / “why / explain / setup”**: `prefersRichTradingAnswer` → `DEEP_ANALYSIS` → GPT-4o + intelligence block, voice `max_tokens` 180–280.  
- **Spoken cap fights mentoring:** `VOICE_CHANNEL_INSTRUCTIONS` and `capSpokenVoice` force **1–2 short sentences**. Chat prompt asks for **3–4 sentences** on why/explain. The ear hears the cap, not the panel.

First-sentence TTS (`extractFirstCompleteSentence`, min 16 chars) can start audio before the stream finishes. That helps latency; it also means a coaching answer may start speaking a truncated idea.

### Interruption

Implemented, not live-tested:

- VAD `interrupt_response: true` (mostly relevant if Realtime audio were speaking; primary path cancels Karen TTS).  
- `speech_started` while Karen is speaking → `triggerBargeIn` (350 ms cooldown) + cancel chart/chat stream.  
- Echo guard / `echoSuppressTailMs` 350–1800 ms after Karen finishes (longer replies pause the mic).  
- `yes` / `why` / `tell me more` are **not** STT-deduped as refinements (`isQuickAffirmation`).

Risk: merge window (1100 ms) can glue two short follow-ups; echo tail can make immediate barge-in feel deaf.

### Context retention (voice)

- Panel history: last **24** messages.  
- Trading GPT: last **16**. Casual GPT: last **12**.  
- Fact follow-ups need `[structure.mss]`-style ids or topic keywords in the last assistant bubble (`extractConversationContext`).  
- Pending-request layer holds weather clarifications and `VERDICT_EXPLAIN` for bare “Why?” after a verdict (`test:conversation-chains` 42/42 PASS).

### Verbosity / topic change / STT recovery

- Canonical STT fixes work (`char`→chart, `reed`→read, `photo`→FVG, `previews day`→previous day). LLM polish is skipped when rules already cleaned the line.  
- Casual vs analytical: **explicit** trading lexicon routes well (69/69 golden routing PASS). **Natural spoken phrasing often does not** (section 7 and 9).  
- Topic change to jokes/food: casual LLM + anti-steer-back (`stripSteerBack`). Weather follow-ups (“what about Paris?”) stay on live_web.

**Voice quality score: MIXED — usable for short desk turns; unmeasured live; spoken cap and routing misses hurt mentoring.**

---

## 2. Market mentor capabilities (beyond LONG/SHORT/WAIT)

Question: can she **teach**, not just emit a verdict?

| Skill | What the code actually does |
|---|---|
| Explain current structure | FAST_FACT / snapshot from frozen observations; or DEEP GPT with intelligence block |
| Explain *why* structure matters | `why_followup` if prior fact ids exist; else DEEP if the utterance contains `why`/`explain` **and** is classified trading |
| Important liquidity / EQH/EQL | Spoken EQH/EQL: HIGH, else unswept MEDIUM only; LOW wicks stay-flat (`test:voice-eqh-eql` PASS). Does not invent long/short from a wick |
| FVG / MSS | Teaching glossary **and** live fact lookup, separated by “what is” vs “where is” |
| BOS | **No** `ict-teaching` entry. “What is BOS?” → **casual stream** |
| Premium/discount | Live fact topic exists; “what is premium and discount?” → **DEEP trading**, not the glossary |
| Conflicting evidence | Prompt + quality gate require conditional lean vs entry; observation bias can be `conflicted` |
| Invalidation | Fact status follow-up (“has it been invalidated?”) is real. “What **would** invalidate the bullish case?” is **misread** as invalidation-status (see §3) |
| Compare bull vs bear | No dedicated scenario tool; DEEP GPT may do this if routed trading |
| Teach how to read the chart | Glossary + “show me last one on chart” after “What is MSS?” → snapshot (`conversation-chains` test 5). Not a guided lesson plan |
| Follow-ups on current analysis | Works when the last bubble contains fact ids / verdict pending; fails on many natural phrases |

**She can teach a short ICT glossary and recite frozen facts. She is not a reliable Socratic mentor on unscripted voice.**

---

## 3. Teaching / coaching questions vs market state

Classifier run against the spec’s coaching lines (same `classifyDeskRoute` / `classifyQueryMode` the product uses):

| User says | Actual route | Consistent with market state? |
|---|---|---|
| “What is an MSS / FVG?” | snapshot · teaching | **Yes** — canned definition, no live prices (`test:market-intelligence`: teaching has zero live facts) |
| “Where’s the last MSS?” | snapshot · FAST_FACT | **Yes** — observation facts |
| “Why are you waiting?” | trading · DEEP · `why_followup` | **Intended yes** — needs prior verdict/facts |
| “Has it been invalidated?” | snapshot · `invalidation_followup` | **Yes** if last fact id exists |
| “Why is that liquidity important?” | trading, but query mode **`invalidation_followup`** | **No** — regex `\bis that\b` fires inside “why **is that** …” |
| “What would invalidate the bullish case?” | snapshot · bias · `invalidation_followup` | **No** — treated as “has *that* been invalidated?”, not “name the invalidation condition” |
| “Was that actually a valid MSS?” | snapshot · FAST_FACT · invalidation | **Partial** — status of last MSS, not a validity lesson |
| “Why is this equal high more important than that one?” | trading · DEEP · EQH intent | **Possible** — GPT + EQH brief; not a structured compare |
| “Explain that like I’m learning ICT.” | trading · DEEP | **Possible**, then **spoken-truncated** to 1–2 sentences |
| “What would you watch next?” | **casual · persona** | **No** — `what would you watch` matches entertainment preference |
| “What changed since five minutes ago?” / “what changed just now?” | **casual stream** | **No** — `computeVerdictDelta` exists on the pipeline and is **not** a voice intent |
| “Show me what you’re seeing.” | **casual stream** | **No** — not a chart-read command |
| “What are you seeing?” | **casual · persona** | **No** — `what are you` matches identity (`isIdentityQuestion`) |

Mock intelligence (synthetic facts, not live TV):

- Active MSS → “still active — not invalidated” + price.  
- Invalidated MSS → “prior thesis … no longer valid.”  
- Teaching “what is MSS?” stays `mode: teaching` with empty facts.  
- **Stale quality still attached a directional interpretation** (“buyers remain in control”) while confidence was `unknown`. Honesty gap on the voice line.

Live intelligence test (`npm run test:market-intelligence`) **26/26 PASS** including live NWOG/MSS/invalidation/teaching split (~47 s; market data was available for that script).

---

## 4. General assistant — only what the code supports

Status key: **SUPPORTED** = wired path exists. **PARTIALLY SUPPORTED** = LLM or a nearby intent may answer, but there is no dedicated, grounded tool. **NOT SUPPORTED** = no product path; casual GPT may still chatter.

| Capability | Status | Evidence |
|---|---|---|
| General Q&A (jokes, photosynthesis, capital of France) | **SUPPORTED** | Casual GPT-4o-mini stream + memory; golden routing |
| Persona / preferences (KFC, who are you) | **SUPPORTED** | `CASUAL_CHAT_SYSTEM_PROMPT`; identity/preference detectors skip Tavily |
| Name memory | **SUPPORTED** | `userMemoryReply` — name only, not arbitrary “what did I tell you” |
| Live weather / scores / “look it up” | **SUPPORTED** | Tavily via `live_web`; location clarification chains tested |
| Desk clock (“what time is it?”) | **PARTIALLY SUPPORTED** | Casual stream **does not inject** Eastern clock. `formatVoiceDeskContext` sits on the silent STT session. Unused `get_desk_time` tool |
| Trading education (glossary) | **PARTIALLY SUPPORTED** | MSS, FVG, NWOG, NDOG, ORG, CE, liquidity, displacement, PDH/PDL, FPFVG. **Not** BOS, premium/discount-as-definition, CHoCH-as-teaching |
| Terminology on the live chart | **SUPPORTED** | “where is …” vs “what is …” split is real |
| Session summaries / post-session review | **NOT SUPPORTED** | “Summarize today’s session” → FAST_FACT `session.active` (current session **name**), not a review |
| Research summaries / read a research report | **NOT SUPPORTED** | Reports are files/CLI; chat has no report retriever. “Read the research report” → casual |
| Historical comparisons (“vs last Tuesday”) | **NOT SUPPORTED** | No chat tool over research datasets |
| Hypothesis generation / research-task formulation | **NOT SUPPORTED** | Supervisor/research scripts are not voice tools |
| Journaling assistance | **NOT SUPPORTED** in voice/chat | `lib/trade-journal.ts` is **CLI** (`npm run journal:pre`). “Journal this trade” → trading DEEP (LLM may pretend) |
| Trade-plan review / scenario analysis | **PARTIALLY SUPPORTED** | DEEP trading prompt can discuss plan/invalidation **if routed trading**; no journal/plan object |
| Explaining previous Karen decisions | **PARTIALLY SUPPORTED** | `lastVerdict` injected into trading prompt as *“may be stale — reference only”*; running-state history is in-process, not a voice query API |
| Chart explanations | **SUPPORTED** | Screenshot chart_read for explicit commands; snapshot for scoped facts |
| Mark / show levels | **SUPPORTED** | Non-blocking draw + spoken ack; not an order |

---

## 5. Tool selection

Intended matrix (`lib/routing.ts` / `lib/analysis-depth.ts`):

| Kind | Tool | Live web? |
|---|---|---|
| “get the read” / “what do you see” | Screenshot chart read | never |
| Price / MSS / FVG / NWOG / EQH lookup | Market snapshot + intelligence | never |
| Weather, news, “look it up” | Tavily | when `shouldUseLiveWebSearch` |
| Persona / memory / general chat | Casual LLM | never |
| Why / setup / “should I” | GPT-4o + intelligence (+ quality gate) | never |

**What it gets right**

- FAST_FACT does **not** fall through to a 3–8 s chart read on snapshot failure (`publishFastFactFailure`).  
- Teaching “what is MSS?” is GENERAL, not a live level guess.  
- Live NWOG is not teaching.  
- Deep “would you take this setup?” is blocked from shallow snapshot (`test:voice-quality`).  
- Last verdict labeled stale in the trading prompt. TV last print rejected after 60 s (`LIVE_PRICE_MAX_AGE_MS`).

**What it gets wrong**

- **“What’s Bitcoin doing right now?” → MNQ snapshot** (`doing right now` matches chart-status). Expensive/wrong tool: desk futures JSON for a crypto question.  
- Natural mentor phrases → casual (section 3/7).  
- `VOICE_REALTIME_TOOLS` unused — no Realtime function-calling.  
- No path to research reports or tickstream history from chat.  
- “Place a long for me” → DEEP trading (analysis, not execution). “Did you place that order?” / “Place the order at market” / “Buy now.” → **casual**. She will not have executed anything; casual GPT is not bound by the trading “never say buy now” line as tightly.

---

## 6. Safety / action boundaries

**No broker, no order API, no NinjaTrader submit.** Repo search found no place-order / execute-trade path. Journal CLI does not place trades.

| Boundary | Status |
|---|---|
| ANALYSIS vs EDUCATION | Split exists (teaching vs facts vs DEEP). Spoken coaching often never reaches it |
| SUGGESTION vs ACTION | Trading prompt: not a signal service; never “buy now” / “market order”; **no stop recommendations**; trader clicks |
| Silent execution | **Cannot** silently place orders — there is no execution system |
| Claim an order was placed | **Not hard-gated.** “Did you place that order?” is casual. Model could lie. Nothing confirms fills because nothing fills |
| Stale / missing data | Quality gate → WAIT; observation `stale`/`missing` → unknown confidence; price path can speak “live data unavailable.” **Fact lookup can still speak a directional interpretation on stale quality** |
| Uncertainty | Prompted (lean vs entry). Voice cap may drop the uncertainty sentence |

`streamChatReply` **throws** `QUALITY_GATE:WAIT — …` when DEEP cannot verdict. Casual catch in `content.js` can speak that WAIT line. The main trading stream path turns many errors into `explainError` — **not verified as always speaking the gate text**.

**Do not weaken these gates.** The gaps are routing (action-language falling into casual) and stale-fact interpretation, not missing a secret execution switch.

---

## 7. Live market conversation test

**No live TradingView session in this agent.** Simulation uses the same classifiers as production.

Spec script:

1. **“What are you seeing?”** → **casual · persona** (`what are you` = identity). `wantsChartRead` is true internally, but **casual is checked first** in `classifyDeskRoute` / `handleUserMessage`. She will not deliver current analysis.  
   - Contrast: **“What do you see?”** / **“get the read”** → `chart_read` (screenshot + pipeline). Phrase-fragile.  
2. **“Why?”** after a real verdict → trading · `why_followup` / `VERDICT_EXPLAIN` (tested). After turn 1’s persona miss, “Why?” explains the wrong object.  
3. **“But that high looks equal to the previous one.”** with no EQH keywords → **casual**. With a prior trading assistant bubble in history, this run classified **trading** (pending merge) — context-dependent, not EQH-aware by default.  
4. **“What would make you change your mind?”** → **casual**. Invalidation conditions are not a first-class intent.  
5. **“Okay, what changed just now?”** → **casual**. Pipeline `delta.mentor_brief` (“Since last check: …”) is **not queried**.

**Coherent live coaching across that five-turn script: FAIL on current routing.**  
**Coherent Q&A if the trader uses desk jargon (“get the read”, “where’s the last MSS”, “has it been invalidated?”): PARTIAL PASS.**

Context window is enough for short threads (12–16 turns to the model). Loss mode is **misroute**, not “forgot the last bubble.”

---

## 8. Capability matrix

| Capability | Status | Latency (honest) | Quality | Limitations | Next improvement |
|---|---|---|---|---|---|
| Voice (STT + TTS) | SUPPORTED | Configured 500 ms VAD+settle; live TTFB **not measured** | MIXED | No live-mic proof; 1–2 sentence cap; dual TTS (browser vs API) | Capture `__dcVoiceLatencyTrace` on desk; don’t treat bench estimates as measured |
| Market analysis | SUPPORTED (separate accuracy study) | FAST 0.5–2 s est.; DEEP 3–8 s+ est. | Out of scope here | Voice cap strips evidence | Keep FAST vs DEEP split |
| Market education | PARTIAL | Glossary instant; DEEP slower | Glossary good; applied coaching weak | BOS/premium definition holes; spoken truncate | Teaching intents + longer speak budget for explain |
| Chart interpretation | SUPPORTED | Screenshot slow | Depends on pipeline | Natural “what are you seeing” misses | Treat seeing/show-me as chart_read |
| Liquidity explanation | PARTIAL | FAST if EQH words | HIGH/MEDIUM only; stay-flat honest | “is that liquidity important” → invalidation regex | Why-liquidity ≠ invalidate-status |
| Historical research | NOT SUPPORTED | n/a | n/a | No chat retriever | Don’t pretend in casual |
| Session review | NOT SUPPORTED | n/a | n/a | Session name ≠ review | Wire running-state / tracker if product wants it |
| Trading journal | NOT SUPPORTED (voice) | n/a | CLI only | “journal this trade” → DEEP LLM | Explicit unsupported reply |
| Scenario analysis | PARTIAL | DEEP if routed | Prompt-only | “what would you watch next” → persona | Dedicated “watch next / invalidation” intent |
| General Q&A | SUPPORTED | Casual stream | Persona is strong | Clock not injected; Bitcoin “right now” → MNQ | Inject desk time; don’t snapshot non-MNQ “doing right now” |
| Tool usage | PARTIAL | — | Explicit intents good | Natural phrases + unused Realtime tools | Delete or wire dead tools; fix casual-first vs chart_read |
| Live-data awareness | PARTIAL | — | 60 s TV price; quality gate | Stale facts still interpreted | Suppress interpretation when quality unknown |
| Context retention | PARTIAL | — | Fact ids + pending why | 24/16/12 caps; phrase misroute | Mentor-turn classifier |
| Action/safety | SUPPORTED (no execution) | — | Strong on “can’t trade” | Casual can claim actions; “buy now” not trading-routed | Action-claim detector; keep gates |

---

## 9. Failure testing (honest)

Ran: `test:voice`, `bench:voice`, `test:voice-quality`, `test:voice-eqh-eql`, `test:routing` (69), `test:conversation-routing` (11), `test:conversation-chains` (42), `test:market-intelligence` (26), plus spec-phrase classifier probes.

| Probe | Result |
|---|---|
| Ambiguous “huh?” / “that one” | Casual. No clarification tied to last market fact unless pending-request already set |
| Rapid topic change to a joke | Casual — **works as designed** |
| “no wait I meant the other high” | Casual — **does not** retarget EQH |
| Contradictory user vs chart | No dedicated contradiction handler |
| Stale market data | Gate/WAIT on DEEP; FAST_FACT may still narrate direction at `unknown` confidence |
| Unavailable live price | Explicit unavailable copy on price path |
| Unclear structure | Teaching + WAIT prompts exist; voice may not reach them |
| Repeated questions | STT dedupe can drop near-duplicate finals (refinements); extensions of the same sentence are kept |
| Interrupt during long answers | Code path exists; **not live-tested** |
| Unsupported: research report, last Tuesday, journal | Casual or DEEP **without tools** — risk of confident fiction |
| “Did you place that order?” / “Place the order at market” | Casual — **no execution**, but **no hard denial** |
| “Are you sure?” | Casual — not a confidence restatement of the last verdict |
| “What’s Bitcoin doing right now?” | **MNQ snapshot** — wrong instrument |
| “What are you seeing?” | **Persona/identity**, not a chart read |
| Garbled STT “whereas previews stay low” | Canonical rule already rewrites to previous day low; LLM interpret skipped |

Existing tests did **not** fail. Failures above are **product/routing gaps**, not red CI.

---

## 10. Final verdict

**VOICE QUALITY:** MIXED (architecture tuned; live mic not measured; 1–2 sentence TTS is real)  
**MARKET MENTOR QUALITY:** PARTIAL (strong jargon Q&A; weak natural coaching)  
**TEACHING QUALITY:** PARTIAL (glossary yes; Socratic / “would invalidate” / “what changed” no)  
**GENERAL ASSISTANT CAPABILITY:** PARTIAL (casual + weather + name memory yes; journal/research/session-review/clock no)  
**LIVE CONTEXT HANDLING:** WEAK for the spec’s spoken script; OK for desk-command English  
**TOOL SELECTION:** GOOD on explicit intents; POOR on natural/ambiguous phrasing  
**SAFETY:** STRONG on actual execution (none); GAPS on action-claims and stale-fact talk  
**OVERALL USEFULNESS as a voice trading mentor/assistant:** **LIMITED but real** — a hands-free desk copilot, not yet an intelligent live mentor.

### Is Karen currently a good market mentor?

**Not in unscripted voice.** She is a **good structured ICT Q&A layer** (definitions, last MSS/FVG/NWOG, EQH stay-flat, WAIT/why after a verdict) sitting on top of the analysis engine. She is **not** a good mentor if the trader talks like a human in the spec’s five-turn script. This is **not** a judgement of Aug 12 call accuracy.

### Is Karen currently a good voice assistant?

**Yes for short, well-phrased desk commands and casual chat. No for natural mentor dialogue.** Hands-free STT→route→TTS works; interruption and latency are engineered. Usefulness collapses when phrasing misses the regex matrix.

### What can Karen do well today?

- Hands-free STT with ICT canonical repairs; barge-in and echo control in code.  
- Fast facts: price, last MSS, NWOG, FVG, HIGH EQH/EQL (or stay flat).  
- Explicit chart reads (“what do you see”, “get the read”) and mark-levels with spoken acks.  
- ICT glossary for a defined concept list, without inventing live levels.  
- Casual personality, name memory, live weather with clarification.  
- Conditional trading prompt + quality gate when DEEP actually runs.

### What can Karen NOT do?

- Place or confirm orders (no execution system).  
- Journal, summarize a session, read research reports, or compare to last Tuesday as **product features**.  
- Reliably answer “what are you seeing / show me / what changed / what would you watch / what would invalidate.”  
- Teach BOS (or premium/discount as glossary) via `ict-teaching`.  
- Speak a full coaching explanation (hard 1–2 sentence cap).  
- Use Realtime tools (`get_desk_time` etc. are dead code).  
- Ground “what time is it?” on the injected Eastern clock in casual mode.  
- This evaluation did **not** measure live-mic latency or live TV conversation quality.

### Three highest-value improvements

1. **Mentor-turn routing for spoken English.** Casual-first + `what are you` identity + `what would you watch` persona currently steal the spec’s live script. Chart-read / DEEP / intelligence must win for seeing / show-me / watch-next / change-your-mind / what-changed. Keep FAST_FACT for true lookups.  
2. **Grounded coaching intents.** Wire `computeVerdictDelta` to “what changed”; distinguish **invalidation conditions** from **has-that-been-invalidated** (`\bis that\b` is too greedy); compare EQH importance from existing HIGH/MEDIUM why-text — without inventing liquidity.  
3. **Separate voice brevity from teaching.** Keep 1–2 sentences for FAST_FACT and acks. For explain/why/teaching, do not `capSpokenVoice` the lesson into a fragment; first-sentence TTS can still start early. Secondary: inject desk time into casual; refuse action-claims; don’t interpret facts when `data_quality` is stale/missing.

---

## Tests run (this session)

| Command | Result |
|---|---|
| `npm run test:voice` | PASS |
| `npm run bench:voice` | PASS (assertions; estimates not live traces) |
| `npm run test:voice-quality` | PASS |
| `npm run test:voice-eqh-eql` | PASS |
| `npm run test:routing` | PASS 69/69 |
| `npm run test:conversation-routing` | PASS 11/11 |
| `npm run test:conversation-chains` | PASS 42/42 |
| `npm run test:market-intelligence` | PASS 26/26 (live build succeeded) |

No production trading behaviour was changed. No commit, push, or deploy.
