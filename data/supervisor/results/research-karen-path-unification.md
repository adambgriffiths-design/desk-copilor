# Karen path unification — DecisionEnvelope as source of truth

**Date:** 2026-08-14  
**Scope:** Routing, validation, presentation, and UI consumption only.  
**Not in scope:** seven-layer architecture redesign, sweep / PDH / REH / entry semantics, `generatePipelineVerdict` math, weights, commit / push / deploy.

Source of gaps: `data/supervisor/results/research-karen-role-audit.md`.

---

## BEFORE

Live paths did not share one user-facing contract:

| Path | Envelope? | Runtime validation? | Failure |
|------|-----------|---------------------|---------|
| Pipeline chart_read | Yes (`buildDecisionEnvelope`) | Tests / quality-gate input only | Strong object; panel/spoken could still collapse layers |
| Vision screenshot chart_read | **No** — `LIVE_VERDICT_SYSTEM` independent Call/Bias | None | Screenshot could decide LONG/SHORT without stance enum or conflict log |
| TEXT trading stream | Envelope in prompt only | LLM text **not** checked | Visible reply could contradict `stance: flat` |
| Mentor / snapshot | Built internally, unlabeled | None | Mentor explanation mixed with the trade |
| Voice (no envelope) | No | None | `"I'm leaning bullish here"` |
| Desk UI legacy | Optional | Regex `/long\|buy\|bullish/i` → LONG | `"1m structure is bullish but I remain flat"` displayed as LONG |

`unlabeledDirectionalLeans` / `assertNoLeanWithoutWhy` existed in `lib/decision-envelope.ts` but were tests-only.

---

## AFTER

One presentation + runtime module: `lib/decision-contract-output.ts`.

- **MENTOR VIEW** = what the market is doing (facts, HTF context, tactical structure, concept evidence).
- **TRADE DECISION** = stance, execution, target, invalidation, confidence, conflict block.
- `formatUnifiedDecisionOutput` keeps the seven-layer `formatDecisionEnvelope` **first** (top-down readable), then labeled mentor/decision sections.
- `formatMentorTradeSpoken` is two short sentences (TRADE DECISION then MENTOR VIEW) so the voice 2-sentence cap cannot drop stance.
- `validateVisibleDecisionText` / `enforceVisibleDecisionContract` run at runtime. Invalid visible text is **replaced** with the deterministic contract — not shown.
- WAIT requires a named `WAIT FOR:` trigger (never “WAIT for entry”).
- FLAT vs WAIT vs MONITOR vs LONG/SHORT are explicit stance roles.
- Conflict block: HTF, TACTICAL, CONFLICT, TRADEABLE HORIZON, STANCE, REASON, INVALIDATION — neither horizon auto-overrides.
- Unproven sweeps/pools stay **UNPROVEN** (existing envelope provenance; not retuned).
- Directional `LONG`/`SHORT` in interpretation copy (`I would consider LONG because…`) is not treated as an unlabeled trade call. Bare `"I'd go LONG here"` still fails.

`generatePipelineVerdict` math was not changed. Screenshot evidence is observations only (`CHART_EVIDENCE_SYSTEM`).

---

## PATHS UNIFIED

| Path | Wiring |
|------|--------|
| **Vision / chart_read** | `generateLiveVerdict` runs `runDecisionPipeline`; screenshot → chart evidence only; panel/spoken via unified formatter + `enforceVisibleDecisionContract`. Does **not** go through `finalizeVerdictResult` (removed; it overwrote spoken from unlabeled bias). `/api/live-verdict` and non-predict `/api/verdict` use `generateChartAnswer`. |
| **TEXT stream** | `app/api/chat/stream/route.ts` buffers trading deltas, validates against envelope, emits one delta + `done` (`replyReplaced` / `validationErrors` if replaced). Casual stream unchanged. |
| **TEXT non-stream** | `generateChatReply` runs `enforceVisibleDecisionContract`. |
| **Prompts** | `lib/chat-prompt.ts`, `LIVE_VERDICT_SYSTEM`, `PANEL_VERDICT_FORMAT`, quality gate inject `formatUnifiedDecisionOutput`. |
| **Mentor / voice** | `speakEnvelope` → `formatMentorTradeSpoken`. `biasLine` / status / why-follow-up prefix HTF as context, not the trade. Why-bullish keeps WAIT/FLAT. Voice narrator uses envelope opener only when `contract.decision` exists. |
| **Desk UI** | `extension/desk-verdict-ui.js`: stance from `decision.stance` only. Missing structured decision → `UNAVAILABLE` / NO DECISION. Prose `"1m structure is bullish but I remain flat"` is **not** LONG. HTF field labeled **HTF CONTEXT**. |

---

## REMAINING BYPASS PATHS

These were left on purpose (research, semantics freeze, or out of this task’s files):

1. **`/api/verdict` `predictMode`** — still `SYSTEM_PROMPT` + `PREDICT_MODE_PROMPT` (backtest / research crop). Not live desk SoT.
2. **`generatePipelineVerdict` display** — still returns `decision.panelBrief` / `spokenBrief` from the pipeline (math frozen). UI SoT is `deskPipeline.analysis_contract.decision.stance` when present.
3. **FAST_FACT / snapshot SSE** — `generateSnapshotAnswer` and some `lib/market-snapshot.ts` scaffold lines are not run through `enforceVisibleDecisionContract`. Main snapshot copy labels HTF as MENTOR VIEW / not the trade.
4. **Voice narrator without `contract.decision`** — labeled WAIT/LONG/SHORT fallback from `c.verdict`; not the full envelope.
5. **Offline desk** — `extension/connection-state.js` `LIVE_DATA_UNAVAILABLE_VERDICT` still uses legacy `VERDICT: WAIT` panel text.
6. **Research / ablation / backtest-runner** — not wired to the live contract. `npm run build` currently fails on unrelated `lib/research/architecture/ablation.ts` (`tradeableBias = "unknown"`). Not patched here.
7. **`test-voice-analysis-quality`** — `classifyAnalysisDepth("Where's the last MSS?")` is not `FAST_FACT` (general/routing, likely `isStandaloneGeneralTurn`). Not patched; PROJECT CONTROL forbade general-question / replay work.

---

## REGRESSION TESTS

Golden conflict: HTF bearish, 1m bullish, liquidity conflicting, stance flat/wait/monitor. UI must not show LONG.

```
npx tsx scripts/test-decision-envelope.ts          ok
npx tsx scripts/test-analysis-contract.ts          ok
npx tsx scripts/test-karen-path-unification.ts     ok
npx tsx scripts/test-desk-mock-analysis.ts         ok
npx tsx scripts/test-decision-pipeline.ts          ok   (semantics unchanged)
npx tsx scripts/test-voice-analysis-quality.ts     FAIL: last MSS is FAST_FACT
                                                 (routing; not envelope SoT)
```

Unification golden checks include:

- MENTOR VIEW vs TRADE DECISION on panel, spoken, and voice
- conflict block + tradeable horizon labeled
- invalid `"I'd look for a long here"` replaced, not shown
- UI `contractFromData` on bullish-flat prose → not LONG
- structured `stance: flat` → not LONG

---

## BUILD

```
npm run build
```

- Compiled successfully.
- Typecheck: **failed** on `lib/research/architecture/ablation.ts:98` (`"unknown"` vs bias union). Out of unification scope.
- Unification-related type error in `streamChatReply` (`for await` on untyped OpenAI union) was fixed by typing the stream as `Stream<ChatCompletionChunk>` so trading-stream buffering typechecks. Casual stream typed the same way.

No commit, push, or deploy.

---

## EXTENSION

`extension/desk-verdict-ui.js` no longer infers LONG/SHORT from free-text bullish/bearish. Reload the unpacked extension (close the TradingView tab, reopen) so the UI script is picked up.

Parallel work has been bumping versions (`manifest.json` vs `content.js` `DC_VERSION` may disagree). This task did not add another bump on top of that race.

---

## FILES (unification)

- `lib/decision-contract-output.ts` (new)
- `lib/decision-envelope.ts` (LONG/SHORT lean skip only — not stance/sweep formulas)
- `lib/verdict-engine.ts`, `lib/verdict-format.ts`, `lib/playbook.ts`
- `lib/chat-engine.ts`, `lib/chat-prompt.ts`, `lib/analysis-quality-gate.ts`, `lib/analysis-contract.ts`
- `lib/mentor-coaching.ts`, `lib/voice-analysis-narrator.ts`, `lib/conversational-query.ts`
- `lib/market-snapshot.ts`, `lib/voice-spoken-brief.ts`
- `app/api/chat/stream/route.ts`, `app/api/verdict/route.ts`
- `extension/desk-verdict-ui.js`, `extension/content.js` (HTF CONTEXT label)
- `scripts/test-karen-path-unification.ts`
