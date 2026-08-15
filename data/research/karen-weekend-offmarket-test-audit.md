# KAREN — Weekend / off-market test harness audit

**Date:** 2026-08-14  
**Mode:** AUDIT ONLY — no implementation, no commit/push/deploy, no new replay engine / tick-current / 6-month backtest / speculative cache.  
**Constraint:** Do not fabricate ticks or claim LIVE. All fixture paths below are **HISTORICAL / FIXTURE**, not live market.

**Sources reused:** `karen-research-readiness-audit.md`, `karen-wait-followup.md`, `karen-live-market-state-truth-audit.md`, `karen-live-latency-audit.md`, `karen-latency-by-request-type.md`, `karen-intent-routing.md`, `karen-incremental-replay-parity.md`, `live-pipeline-profile.md`, `karen-architecture-roadmap.md`, `package.json` scripts, `lib/research/replay/*`, `data/research-fixtures/*`, `data/replay-fixtures/synthetic-ny-am.json`.

---

## Verdict

A reliable weekend analysis/decision/mentor/routing/perf harness **already exists** as a **loose constellation of fixture-backed scripts** — not as one named “off-market mode.” You can exercise envelope, market-state truth, wait follow-ups, routing, PIT replay, mentor eval, and research-stage timing **without an open market**, if every output is labeled **HISTORICAL / FIXTURE**.

What you **cannot** do while closed: treat `/api/chat/stream` market reads as live, measure live Yahoo/Tickstream TTFT, or claim current-session PDH/liquidity from wall-clock feeds.

---

## 1. What can already be tested (weekend-safe)

| Area | Capability | How (existing) | Label |
|------|------------|----------------|-------|
| **Historical snapshot** | 1m OHLC + derived 5m/15m/daily; `asOf` / session; price at cutoff | `npm run research:replay -- --dataset nq-aug12-2026-cme --timestamp …` or `--fixture synthetic-ny-am --index N` | HISTORICAL / FIXTURE |
| **Decision analysis** | Envelope: stance, thesis, invalidation, conflictLog, detected vs used (`detected` / `usedInDecision` / `role`), citedConcepts | `test:decision-envelope`, `test:decision`, `test:analysis-contract`, research replay → `runDeskPipeline` via `buildKarenReplayResponse` | FIXTURE |
| **Mentor / deterministic follow-ups** | Why?, why not long/short, waiting, invalidation; structured WAIT template | `npm run test:karen-wait-followup` (uses `REPLAY_FIXTURES["bullish-wait"]`) | FIXTURE |
| **Market-state truth** | PDH/PDL/PDC provenance, BREACHED vs CLOSED_BEYOND, PIT no-future-leak, FVG/structure/session via context builders | `npm run test:market-state-truth`; research cutoff `buildMarketContextAt` | FIXTURE / synthetic |
| **Routing (general off market)** | Casual vs trading; sticky market follow-up; capital-of-Germany / general stays off intel | `test:karen-intent-routing`, `test:routing`, `test:casual-fallback`, `test:conversation-routing` | offline unit |
| **Mentor quality on history** | Checkpoint mentor rubric on Aug12 / week cutoffs | `npm run research:mentor-eval -- --dataset nq-aug12-2026-cme` | HISTORICAL |
| **Architecture / hist experiment** | Frozen architecture-v1 checkpoint PIT (stance mix, outcomes) | `npm run research:historical-experiment -- --dataset nq-week-aug05-aug12-2026-cme --limit N` | HISTORICAL / DEBUGGING |
| **Incremental parity** | CURRENT vs OPTIMIZED replay context | `npm run test:research-incremental-replay-parity` | FIXTURE |
| **Context reuse / freshness logic** | Cache HIT/MISS, follow-up clock (not live Yahoo) | `npm run test:live-context-reuse` | FIXTURE identity path |
| **Latency instrumentation contract** | Stage marks: request → context → envelope → LLM first token → final | `npm run test:live-latency-trace` (synthetic marks; does not need market open) | measurement unit |
| **Research pipeline stage CPU** | Fixture load → context → structure → envelope (no OpenAI required) | `npx tsx scripts/profile-research-pipeline-audit.ts --dataset nq-aug12-2026-cme` | HISTORICAL perf |
| **Cold new-bar / pure 1m** | Incremental engine on Aug12 bars | `npx tsx scripts/profile-cold-newbar-pure1m.ts` | HISTORICAL perf |

---

## 2. What cannot be tested while market closed

| Gap | Why |
|-----|-----|
| **LIVE market read E2E** | Trading stream pulls Yahoo bars + Tickstream quote/price; weekend = stale/empty/timeout, not “current” |
| **Live panel TTFT / SSE** | `profile-latency-by-request-type`, `profile-live-karen-latency`, live latency audits need open feeds + healthy Next |
| **Forming-bar tick truth vs chart** | Live wick / reuse-HIT gaps (Yahoo high not merged) need live prints — documented in market-state truth audit, not reproducible from closed weekend alone |
| **Prod TV + extension** | Screenshot chart-read, mic/Realtime voice, extension messaging |
| **Claim LIVE PDH/PDL/liquidity “now”** | Any wall-clock `/api/levels` or chat forceMarket without fixture cutoff is not weekend-valid |
| **Multi-month / edge** | Only ~1 day + 1 week NQ on disk (`meetsMonthTarget: false`) — infrastructure evidence only |
| **New TickStream historical download** | Needs API key + network; not required if on-disk fixtures used |
| **LLM casual answers** | Routing can be tested offline; actual Berlin/general reply needs OpenAI (optional weekend) |

---

## 3. Existing fixtures available

| Fixture / alias | Location | Size | Timeframes | Notes |
|-----------------|----------|------|------------|-------|
| **`synthetic-ny-am`** | `data/replay-fixtures/synthetic-ny-am.json` (+ research copy path) | **120** × 1m; m5=24, m15=8, daily=6 | Explicit m1/m5/m15/daily | Fastest smoke; synthetic prices ~25k |
| **`nq-aug12-2026-cme`** | `data/research-fixtures/nq-aug12-2026-cme/` ↔ dataset `2562961408b256ac94f1` | **1381** × 1m TickStream | 1m stored; **5m/15m/D aggregated** via `researchDatasetToReplayMarketData` | Canonical session day; CME Globex |
| **`nq-week-aug05-aug12-2026-cme`** | `data/research-fixtures/nq-week-aug05-aug12-2026-cme/` ↔ `229d1bea359bcc6777ff` | **6880** × 1m | same HTF derivation | Week; `SESSION_BOUNDARY_GAP` WARNING OK |
| **`REPLAY_FIXTURES`** | `lib/replay-fixtures.ts` (e.g. `bullish-wait`) | Prebuilt `MarketContext` + `MarketState` | N/A (state snapshots) | Wait/follow-up + desk pipeline unit tests |
| **Market-state synthetic** | Inline in `scripts/test-market-state-truth.ts` | Small Globex PDH/PDC scenario | m1 + daily | False-taken / PDC settlement cases |
| **FVG / PD array** | `data/fvg-golden/fixtures.json`, `data/pd-array-audit/fixtures.json` | Golden detector cases | — | Detector regression, not full mentor E2E |
| **Prior run artifacts** | `data/research/runs/replay-*`, `hist-exp-*`, `mentor-eval-runs/` | Snapshots / manifests | — | Reuse results; do not re-label as live |

**Snapshot fields at cutoff (research path):** `asOf`, barIndex, symbol, `currentPrice` (last 1m close ≤ T), session via CME Globex definition, structure/PD arrays from `buildMarketContextAt`. Chart adapter source: **`research_bars`** (not live TV).

---

## 4. Fastest safe way to run an analysis test

**Fastest end-to-end HISTORICAL analysis (no live feeds, no LLM required):**

```bash
npm run research:replay -- --fixture synthetic-ny-am --index 50
```

Writes `data/research/runs/replay-<id>/snapshot.json` + manifest with deterministic Karen/pipeline at that bar. Treat as **FIXTURE**.

**Fastest real-NQ analysis (still offline once fixtures on disk):**

```bash
npm run research:replay -- --dataset nq-aug12-2026-cme --timestamp 2026-08-12T14:30:00.000Z
```

**Fastest decision + follow-up + routing smoke pack (no network):**

```bash
npm run test:decision-envelope
npm run test:karen-wait-followup
npm run test:market-state-truth
npm run test:karen-intent-routing
```

**Do not** use “Give me the read” against live `/api/chat/stream` on the weekend and call it a valid market analysis test.

---

## 5. Performance measurement available

| Tool | Measures | Weekend-safe? |
|------|----------|---------------|
| `test:live-latency-trace` | Stage mark contract (fixture load→…→final schema) | **Yes** (unit; synthetic timings) |
| `profile-research-pipeline-audit.ts` | Fixture load, context, structure, observation, envelope / desk pipeline CPU on NQ/synthetic | **Yes** |
| `profile-cold-newbar-*.ts` / `profile-cold-newbar-pure1m.ts` | Incremental new-bar sync on Aug12 | **Yes** |
| `live-pipeline-profile.md` (prior) | buildMarketContextAt / tick overlay baselines | Reuse numbers; re-run with profile scripts if needed |
| `test:research-incremental-replay-parity` | CURRENT vs OPTIMIZED ms/checkpoint | **Yes** |
| `lib/live-latency-trace` stages | `market_data_*`, `market_context_*`, `decision_envelope_complete`, `llm_request_started`, `llm_first_token`, `sse_first_visible_token`, `final_response` | Wired for **live** stream; offline research path does not emit the same live report |
| `profile-latency-by-request-type.ts` / live latency audits | Full request classes incl. LLM TTFT | **No** for market classes (needs Yahoo/Tickstream + OpenAI) |
| General/casual prior medians | ~895ms knowledge / ~12ms canned | Routing offline; LLM needs API |

**Covered offline:** fixture load, context build, envelope/decision CPU, incremental new-bar.  
**Not covered offline as LIVE:** market_data fetch, live first visible SSE token, panel render.

---

## 6. Missing capability (recommendations only — do not implement in this audit)

Genuinely missing vs a **single weekend off-market product mode** (list as recommendations):

1. **No unified “weekend / off-market” entrypoint** — no one `npm run test:karen-weekend` that labels HISTORICAL and runs the smoke pack above.
2. **No fixture injection into `/api/chat/stream`** — chat market path still assumes live feeds; cannot E2E mentor chips + SSE on fixtures without new wiring (explicitly out of scope until requested).
3. **No mandatory HISTORICAL / FIXTURE banner** on research replay / mentor-eval console or snapshot payloads (source is `research_bars` / dataset id, but easy to misread as live).
4. **Live latency stage report not mirrored on research replay** — cannot get first-token/final for fixture analysis without LLM path; deterministic replay skips LLM.
5. **“What changed” timeline harness** — intent/routing tested; full delta vs advancing fixture cutoffs not a first-class offline suite.
6. **Calendar depth** — only Aug 5–12 2026 NQ; no 6-month OOS (known; do not build here).

None of the above require inventing ticks or altering PIT/ICT/DecisionEnvelope to document. Implementation only if the user later asks after choosing which gap matters.

---

## Return summary (exact)

### What can already be tested
Historical PIT snapshot (1m + derived HTF), DecisionEnvelope (stance/thesis/conflictLog/detected-vs-used/invalidation), mentor WAIT/why-not follow-ups, market-state PDH/PDL/PDC/FVG/structure/session truth, routing (general off market pipeline), mentor-eval / hist-experiment / incremental parity, research CPU profiling.

### What cannot be tested while market closed
Live Yahoo/Tickstream reads, live TTFT/SSE panel latency, forming-bar live wick vs engine, TV/voice prod paths, multi-month edge, anything labeled LIVE from wall clock.

### Existing fixtures available
`synthetic-ny-am` (120), `nq-aug12-2026-cme` (1381), `nq-week-aug05-aug12-2026-cme` (6880), `REPLAY_FIXTURES`, market-state inline synthetic, FVG/PD golden JSON, prior `data/research/runs/*`.

### Fastest safe way to run an analysis test
`npm run research:replay -- --fixture synthetic-ny-am --index 50` (or Aug12 timestamp for real NQ), plus `test:decision-envelope` + `test:karen-wait-followup` + `test:market-state-truth` + `test:karen-intent-routing`.

### Performance measurement available
Research pipeline / cold-newbar / incremental-parity CPU; `test:live-latency-trace` stage contract. Live market_data→LLM first-token only when market + APIs are up.

### Any missing capability
Unified weekend harness script, fixture→chat stream mode, hard HISTORICAL labeling on outputs, research-path latency parity with live stages, “what changed” fixture walk — **recommendations only**.
