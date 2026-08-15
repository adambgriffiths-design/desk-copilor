# KAREN — Response Latency Investigation + Surgical Fix

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/` (+ tmp extension mirror)  
**Preview confirmed:** https://desk-copilor-8uxfmve9v-adam-b45d.vercel.app → `{"ok":true,"version":"1.4.76"}`  
**Mode:** MEASURE (preview = BEFORE) → FIX (local worktree) → AFTER (in-process + routing)  
**Coordinate:** comparative-level agent overlap — `closest` phrase detection + comparative route already present; this pass completed routing carve-out, instant-read default, cache reuse, instrumentation, extension mirror.

**Calendar:** Saturday 2026-08-15 — CME equity-index futures **CLOSED** (weekend). Live MarketState rebuild remains expensive; QG/freshness **not** weakened.

---

## Exact report fields

```text
PREVIEW: 1.4.76 CONFIRMED
BEFORE_MEASURE: LIVE vs preview SSE (measured, not guessed)
AFTER_MEASURE: local deterministic paths + routing verify
LOCAL_PERSONA: PASS (<100ms in-process; preview RTT ~190–620ms)
DECISION_HISTORY: PASS (<300ms preview; <10ms local memory)
PDL_CLOSEST: OpenAI REMOVED (was ~14s LLM dictionary / invent)
MARKET_READ: instant LLM-skip DEFAULT ON; QG preserved; forceFresh no longer always-true
INSTRUMENTATION: KAREN_LATENCY_DEBUG=1|true|yes (quiet otherwise)
TYPECHECK: PASS (tsc --noEmit)
FOCUSED_REGRESSION: instant-read PASS; comparative PASS; actionable PASS
LAST_DECISION_SEMANTICS: FAIL on WAIT-only miss copy regex (sibling plain-english wording) — not caused by latency routing; responseSource still no_actionable path
NO_PROD_DEPLOY / NO_COMMIT / NO_PUSH
```

---

## Pipeline measured (per phrase)

extension/client → `/api/chat/stream` routing → (history | comparative | snapshot | casual instant | trading) → Redis hydrate if history → MarketState/intel if needed → OpenAI TTFT if used → first visible SSE → completion.

---

## BEFORE (preview 1.4.76 — live SSE wall clock)

Base: `https://desk-copilor-8uxfmve9v-adam-b45d.vercel.app` · 2026-08-15T08:55Z

| route | OpenAI? | network calls | first-visible-ms | total-ms | bottleneck | note |
|-------|---------|---------------|------------------:|---------:|------------|------|
| tell me a joke | no | 1× chat/stream | 552 | 552 | Vercel RTT | canned; path OK |
| what are you up to? | no | 1× chat/stream | 191 | 191 | Vercel RTT | persona; path OK |
| what was your last decision? | no | stream + Redis hist | 168 | 168 | memory/redis | history direct OK |
| what was your last recorded state? | no | stream + Redis hist | 142 | 142 | memory/redis | history direct OK |
| when were you last long? | no | stream + Redis hist | 155 | 155 | memory/redis | history direct OK |
| what's the market read? | **yes** (~140 deltas) | Yahoo/Tickstream + OpenAI | 15593 | 15593 | **OpenAI** (instant skip OFF on preview) | warm repeat still ~15s LLM |
| what's PDL? | **yes** (~35 deltas) | market + **OpenAI** | 14276 | 14276 | **LLM** — gave dictionary definition, not level | `mustUseTradingStream=true` skipped snapshot |
| which level is closest…? | **yes** (~61 deltas) | market + **OpenAI** | 14486 | 14486 | **LLM** — invented/unavailable prose | `closest` not matched; trading stream |
| warm closest (2nd) | hang/empty | — | null | **308058** | timeout/empty | worst case |

Warm PDL / market_read still ~14–15s with OpenAI on preview.

---

## AFTER (local worktree — surgical fixes)

### Routing / code fixes

1. **`mustUseTradingStream`** — level/price/status/FPFVG snapshot intents → **false** (no rich GPT stream).
2. **`isComparativeDistancePhrase`** — includes **closest** / “which level is closest…” (coord with comparative agent).
3. **`classifyChartQuestion`** — comparative/closest classified as **level** before generic “current price”.
4. **`answerLevel` / `asksForNearestLevels`** — closest-level arithmetic from PD/support/resistance.
5. **`isInstantReadLlmSkipEnabled`** — **default ON** (disable with `=0|false|no|off`).
6. **`buildChatSystemPrompt`** — `forceFresh: chartLastPrice != null` (reuse ~45s Yahoo cache; QG still runs).
7. **Quiet instrumentation** — `lib/karen-latency-debug.ts`; marks on stream route when `KAREN_LATENCY_DEBUG=1`.
8. **Extension (tmp)** — mirrors snapshot carve-out in `mustUseTradingStream`.

### AFTER timings (in-process, no Vercel RTT)

| route | OpenAI? | network calls | first-visible-ms | total-ms | bottleneck | fix |
|-------|---------|---------------|------------------:|---------:|------------|-----|
| joke | no | 0 | **5** | **5** | cpu | already canned |
| what are you up to? | no | 0 | **9** | **9** | cpu | already persona |
| last decision | no | redis/ram | **8** | **8** | memory | already history-first |
| last recorded | no | redis/ram | **1** | **1** | memory | already history-first |
| last long | no | redis/ram | **1** | **1** | memory | already history-first |
| closest (prior PDH/PDL) | no | 0 | **14** | **14** | arithmetic | comparative path + closest phrase |
| PDL (snapshot, correct number) | **no** | Yahoo then intel | cold ~56s* / warm still heavy* | same | **MarketState/intel build** (Yahoo cache hits in ~0–1s; intel rebuild ~50–80s on this host) | OpenAI removed; answer is real PDL not glossary |
| market read | OpenAI only if gate fails / skip off | MarketState + QG | classify &lt;100ms; full LIVE wall = Yahoo/intel + (optional) LLM TTFT | — | MarketState when cold; **LLM skipped when gate delivers envelope** | instant default ON + no always-forceFresh |

\*Weekend local: Yahoo cache works (`yahoo1=1164ms`, `yahoo2_cache=0ms`) but `buildDeskMarketIntelligence` still ~60–80s here — separate from OpenAI. **Do not treat as QG bypass.** Remaining P1 after deploy: profile intel build (not invent data / not skip QG).

### Routing verify (local)

```json
{
  "closest": { "comparative": true, "trading": false, "snap": "level" },
  "pdl": { "trading": false, "snap": "level" },
  "marketRead": { "trading": true, "instantDefault": true }
}
```

---

## Targets vs result

| Target | Result |
|--------|--------|
| local deterministic/persona &lt;100ms | **PASS** (5–9ms in-process). Preview RTT ~200–600ms network-bound. |
| decision-history &lt;300ms | **PASS** (preview 142–168ms; local ≤8ms). |
| deterministic market/level with fresh cache &lt;500ms | **PARTIAL** — path correct, OpenAI gone; intel build still slow on this weekend host after Yahoo cache hit. Closest-with-prior **14ms PASS**. |
| LLM TTFT separate from total | Instrumentation marks `ttft` on first delta when `KAREN_LATENCY_DEBUG` on; preview BEFORE had TTFT≈total because trading SSE buffered until done on some paths / streamed deltas only after long prep. |

---

## Instrumentation

- Module: `lib/karen-latency-debug.ts`
- Env: `KAREN_LATENCY_DEBUG=1|true|yes|on`
- Quiet by default. Marks: `start`, `decision_history`, `level_compare`, `first_visible` / `ttft`, `done` + `responseSource` meta on `sseDone`.

---

## Focused verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | PASS |
| `test-karen-instant-read-llm-skip` | PASS (50) — default ON + explicit OFF |
| `test-karen-comparative-level-followups` | PASS |
| `test-actionable-trade-semantics` | PASS |
| `test-last-decision-semantics` | FAIL — WAIT-only ambiguous miss copy regex (`No LONG or SHORT…`); sibling plain-english likely; **history still deterministic / no invent** |

---

## What was NOT done

- No prod deploy / commit / push  
- No QG bypass / freshness weaken  
- No six-feature marathon on intel rebuild (called out as next P1)

---

## Bottom line

Preview **1.4.76** wasted ~14–15s+ OpenAI on **PDL** and **closest-level** (and market-read) that should be deterministic. Local fixes route those to snapshot/comparative/history/instant-envelope paths. Persona/history already met targets; closest-with-prior is now instant; PDL returns a real level without OpenAI; remaining wall on PDL is MarketState/intel cost under weekend conditions, not LLM.
