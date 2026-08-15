# KAREN — Automated End-to-End Behavioural Self-Test Harness

**Date:** 2026-08-15  
**Tree:** `.tmp/karen-final-integration/`  
**Mode:** Harness + seed corpus + report format — **no production promotion / commit / push**  
**Coordinate (do not clobber):** contextual why `95e2e9ef`, level proximity/weekend `8fd5927e`, casual P1 / latency already landed

---

## What this is

A **behavioural** evaluation harness: *Does Karen behave according to her specification when spoken to through the same API path the Chrome extension uses?*

It POSTs **extension-shaped** payloads to **`/api/chat/stream`** and evaluates the **user-visible SSE/JSON reply** (plus `route`, `responseSource`, latency).

It is **not**:

| System | Purpose |
|--------|---------|
| **This harness** | Spec / UX / honesty / routing / leak / latency behaviour |
| **Decision Validation / historical backtest** (future, separate) | Did past trading decisions make money / match labeled setups? |
| Unit classifiers (`test-karen-*-*.ts`) | Fast local function asserts — complementary, not a substitute |

Calling internal functions and declaring success is explicitly **out of scope** for pass criteria here (helpers may still *seed* corpus or explain hops).

---

## How to run

From `.tmp/karen-final-integration`:

```bash
# Prefer local :3020 when healthy
npm run test:karen-e2e-behavioural:fast

# Full seed (includes live market + multi-turn — slower, may call OpenAI)
npm run test:karen-e2e-behavioural

# Filters
npx tsx scripts/karen-e2e-behavioural-harness.ts --category=CONVERSATION
npx tsx scripts/karen-e2e-behavioural-harness.ts --tag=joke --limit=10
npx tsx scripts/karen-e2e-behavioural-harness.ts --id=mkt-nearest
npx tsx scripts/karen-e2e-behavioural-harness.ts --no-live
npx tsx scripts/karen-e2e-behavioural-harness.ts --base=https://YOUR_PREVIEW.vercel.app
```

**Base URL resolution**

1. `--base=URL`
2. `KAREN_E2E_BASE` or `PIN_PREVIEW` env
3. `.env.local` keys `KAREN_E2E_BASE` / `PIN_PREVIEW`
4. Probe `http://127.0.0.1:3020` then `:3000`
5. If none healthy → abort with instructions (no fake PASS)

If local is down: set `PIN_PREVIEW` to a Vercel preview that includes this tree’s API, then `--preview-only` or just rely on env.

Reports land in:

- `data/karen-e2e/reports/karen-e2e-behavioural-latest.json` (machine)
- `data/karen-e2e/reports/karen-e2e-behavioural-latest.md` (human)

---

## Scoreboard fields

| Key | Meaning |
|-----|---------|
| `TOTAL_CASES` | Cases executed + skipped |
| `PASS` / `FAIL` | Hard outcomes (SKIP separate) |
| `CONVERSATION` | Casual Q/statements/jokes/preferences |
| `CONTEXT_RETENTION` | Pronouns, why?, topic change, multi-turn |
| `MARKET_TRUTH` | Price/levels/session language honesty |
| `TRADING_REASONING` | Read / why / why-not / waiting |
| `DECISION_MEMORY` | Last recorded / actionable / trade today |
| `ANTI_HALLUCINATION` | No invented sweeps/envelopes/prices |
| `CONSISTENCY` | Adversarial pressure + phrasing matrix |
| `RESPONSE_VARIABILITY` | Repeated casual not byte-identical |
| `ERROR_LEAKS` | No gate/env/stack/JSON leaks |
| `LATENCY` | Route-specific first-visible / total budgets |

Category **score** = `PASS / (PASS+FAIL)` as percent (SKIPs excluded from %).

---

## Failure anatomy (every FAIL)

Each failure records:

1. **Conversation** (seed + turns)
2. **Expected contract** (regex/includes/latency/source)
3. **Actual** reply preview + HTTP
4. **Route** (desk route debug from SSE `done`)
5. **responseSource**
6. **First broken hop** (heuristic: HTTP → chart bounce → leak → latency → OpenAI → contract)

**Policy:** diagnose and report. Do **not** auto-rewrite production logic merely because a case fails.

---

## Coverage (seed corpus)

Built-in seed in `scripts/karen-e2e/corpus.ts` plus expandable JSON under `data/karen-e2e/corpus/*.json`.

| Area | Seed approach |
|------|----------------|
| Conversation | Joke / up-to / pasta / statements / pronouns / topic interrupt |
| Market knowledge | PDH/PDL phrasings, price with chart hints, nearest/how-far arithmetic, session open |
| Trading reasoning | Market read paraphrases, why?, why not long |
| Decision memory | Last decision / recorded / side / trade today + paraphrases |
| Adversarial | Pressure WAIT→LONG, false bearish claim, incorrect user PDH |
| Multi-turn | 10-turn chain (read→why→against→waiting→level→distance→invalidate→pressure→why not→changed?) |
| Leaks | Garbage input + global leak detector on every case |
| Latency | Joke / history / level_compare budgets |
| Hallucination | Exact sweep price; invented DecisionKey/timestamp |
| Market-state fixtures | Weekend case (calendar-gated); inject-only scenarios marked **SKIP** with reason |

---

## Extension-shaped payload

Matches Chrome `runStreamingChat` / trading path fields:

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "symbol": "MNQ1!",
  "casualOnly": true,
  "forceMarket": false,
  "voiceInput": false,
  "voiceSttClean": true,
  "chartLastPrice": 25112.5,
  "chartLastPriceSource": "tradingview_live",
  "chartLastPriceTs": 1710000000000,
  "lastVerdict": "WAIT — ..."
}
```

Harness infers `casualOnly` / `forceMarket` when omitted (trading keywords → market path).

---

## Leak auto-fail (user-visible)

Any of: `OPENAI_API_KEY`, `CASUAL_GATE_MISS`, `Not a casual question`, env/stack dumps, bare `undefined`/`null`, route-label-only replies, classifier key dumps, raw JSON blob replies, Internal Server Error / missing API key, dead-end `Ha — say more`.

---

## Latency budgets (seed)

| Path | firstVisible | total | OpenAI |
|------|-------------:|------:|--------|
| Joke / persona casual | ≤2–2.5s | ≤4–5s | 0 |
| Decision history | ≤4s | ≤8–10s | 0 |
| Level compare arithmetic | ≤2.5–4s | ≤5–8s | 0 |
| Live market read | (loose) | ≤60s | allowed |

Local RTT should be well under budgets; preview RTT may need `--base` + relaxed cases later.

---

## Known gaps

1. **Market-state inject** (holiday, disconnected feed, partial MarketState, fresh-chart+stale-external) is **not** exposed on `/api/chat/stream` in this tree → corpus entries are honest **SKIP** until a test-only fixture field exists (without promoting production hacks).
2. **Historical fixture UI** path is covered elsewhere (`karen-weekend-e2e-historical-ui.ts`); stream route may not wire `historicalFixture` the same way — not duplicated here as a fake PASS.
3. **In-flight work** (contextual why, proximity/weekend) may change replies; harness contracts stay behavioural, not tied to one patch SHA.
4. **Empty decision history** is allowed to answer “no record” — that is PASS for honesty, not FAIL for missing trades.
5. **Chrome UI** (panel render, mic) is out of scope — HTTP/SSE contract only.

---

## Expanding the corpus

1. Copy `data/karen-e2e/corpus/99-expand-examples.json`.
2. Add a new `NN-topic.json` with a `cases: CaseDef[]` array (same shape as seed).
3. Same `id` as seed **overrides** the built-in case.
4. Prefer honest FAIL over stubbing contracts that always match.

Types: `scripts/karen-e2e/types.ts`.

---

## Layout

```
.tmp/karen-final-integration/
  scripts/karen-e2e-behavioural-harness.ts   # CLI entry
  scripts/karen-e2e/
    types.ts client.ts evaluate.ts report.ts resolve-base.ts corpus.ts
  data/karen-e2e/corpus/*.json               # expandable cases
  data/karen-e2e/reports/*                   # run outputs
  data/research/karen-e2e-behavioural-harness.md  # this doc
```

Primary mirror (design only): `data/research/karen-e2e-behavioural-harness.md`.

---

## Difference from Decision Validation (future)

| | Behavioural harness (this) | Decision Validation (future) |
|--|---------------------------|------------------------------|
| Question | Did she *behave* / speak truthfully / route correctly? | Did the *trade decision* quality match labels / PnL? |
| Path | Extension `/api/chat/stream` | Replay / envelopes / research datasets |
| Pass means | Spec UX + honesty | Edge / expectancy / agreement with Adam labels |
| Fixtures | Conversation + chart hints + calendar | PIT bars / labeled setups |

Do not merge the two scoreboards.

---

## First local run (2026-08-15, `--fast`, `:3020`)

| Metric | Value |
|--------|------:|
| TOTAL_CASES | 52 |
| PASS | 40 |
| FAIL | 8 |
| SKIP | 4 (market-state inject gaps) |

**Honest FAILs observed (not auto-fixed):** several casual/garbage phrases (`you busy?`, `blorp`, `hey karen`, adversarial gaslight, invent-sweep) returned **HTTP 500** with user-visible “Something went wrong on the desk side — hit RECONNECT…”. Harness correctly marks FAIL with first broken hop `HTTP status 500`. Diagnose separately; do not rewrite production from this harness alone.

Deterministic paths (jokes, pasta, history, level_compare, latency budgets) largely **PASS**.
