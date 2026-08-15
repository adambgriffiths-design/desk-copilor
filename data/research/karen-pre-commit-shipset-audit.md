# KAREN — Pre-Commit Shipset Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no product edits, no git add / commit / push / deploy  
**Branch:** `cursor/extension-v1.4.62-fixes`  
**HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**HEAD subject:** Release v1.4.73 (MNQ/NQ ticker / Analyse Market / chart level names)  
**Worktree:** all six features are **uncommitted** vs HEAD (`git grep` on HEAD has no `formatCanonicalEnvelopeForPrompt`, `KAREN_INSTANT_READ_LLM_SKIP`, `lookupLiveAtClock`, `readUpstashRestConfig`)

**Scope (include):**
1. Redis decision memory  
2. QUALITY GATE envelope dedupe  
3. CURRENT_MARKET_READ instant LLM skip  
4. LIVE session-boundary fix  
5. Historical verdict + whyNow integrity  
6. Past-tense “What were you waiting for?” routing fix  

**Scope (exclude):** continuous decision recorder entirely; temp probes; audit-only scripts; generated research reports; screenshots; `.tmp`; unrelated experiments; credentials; `.env`

---

## Method

- `git status --porcelain` / `git diff --name-only` against HEAD  
- Marker greps: `UPSTASH` / `decision-memory` / `formatCanonicalEnvelopeForPrompt` / `KAREN_INSTANT_READ_LLM_SKIP` / `tryCurrentMarketReadFastPath` / `cmeSessionDateKey` / `lookupLiveAtClock` / `formatAtTimeReply` / `whyNow` / `isWaitExplanation` / `were waiting`  
- Import graph for runtime wiring (Analyse record → Redis; Chat hydrate; QG canonical; stream fast-path; LIVE clock bind; wait routing)  
- Continuous recorder markers: `continuous-decision-recorder.ts`, `decision-memory-material.ts`, `test-continuous-decision-memory.ts`, `test:continuous-decision-memory` in `package.json`

**Dirty tree size:** 640 paths (`M` + `??`)

---

## SHIPSET FILES

Production runtime (and hard transitive deps) for features 1–6. Continuous recorder **not** listed here.

| path | why | feature | modified/new | safe to ship |
|------|-----|---------|--------------|--------------|
| `lib/decision-memory-backend.ts` | Upstash REST adapter (`readUpstashRestConfig`, `createUpstashDecisionMemoryBackend`, `UPSTASH_*` / `KV_REST_*`) | 1 Redis decision memory | new | **YES** |
| `lib/decision-envelope-history.ts` | SoT ring + `recordDecisionEnvelopeHistory` / `hydrateDecisionMemoryFromStore` / `flushDecisionMemoryWrites` | 1 Redis decision memory | new | **YES** |
| `lib/decision-envelope.ts` | `DecisionEnvelope` + thesis `whyNow` model shared by memory / QG / historical replies | 1, 2, 5 (shared) | new | **YES** |
| `lib/decision-contract-output.ts` | `formatCanonicalEnvelopeForPrompt` (QG dedupe); spoken/mentor formatters used by instant-read + at-time replies | 2 (+ used by 3, 5) | new | **YES** |
| `lib/decision-time-travel.ts` | `lookupLiveAtClock` + `cmeSessionDateKeyFromDate` session bind; `formatAtTimeReply` emits recorded `whyNow` | 4 LIVE session-boundary; 5 historical verdict+why | new | **YES** |
| `lib/decision-history-query.ts` | `isDecisionHistoryTimeQuery` → LIVE/HISTORICAL time-travel entry | 4, 5 | new | **YES** |
| `lib/mentor-intent.ts` | `isWaitExplanation` / prior-read accept past-tense `were` | 6 past-tense wait routing | new | **YES** |
| `lib/conversational-intent.ts` | `MARKET_ANAPHORA` includes `(?:are\|were) you waiting for` | 6 past-tense wait routing | new | **YES** |
| `lib/market-data.ts` | Exports `cmeSessionDateKey` / `cmeSessionDateKeyFromDate` used by `lookupLiveAtClock` (not on HEAD) | 4 LIVE session-boundary | modified | **NO** — mixed with unrelated market-data / session-bar work; do not ship whole file without carve |
| `lib/analysis-contract.ts` | Builds `contract.decision` (`DecisionEnvelope`) consumed by QG + Analyse history record | 1, 2 | modified | **NO** — large mixed WT vs HEAD |
| `lib/analysis-quality-gate.ts` | `envelopeText ← formatCanonicalEnvelopeForPrompt(...)` | 2 QG envelope dedupe | modified | **NO** — also pulls live-latency cache + `marketDataFailureQualityGate` |
| `lib/desk-pipeline.ts` | Analyse path calls `recordDecisionEnvelopeHistory` for LIVE | 1 Redis decision memory | modified | **NO** — mixed WT churn beyond record hook |
| `lib/chat-engine.ts` | `KAREN_INSTANT_READ_LLM_SKIP`, `tryInstantReadFromQualityGate`, `tryCurrentMarketReadFastPath`; also `flushDecisionMemoryWrites` | 3 instant LLM skip; 1 flush | modified | **NO** — large mixed (~779-line diff) |
| `app/api/chat/stream/route.ts` | `hydrateDecisionMemoryFromStore({ lane: "LIVE" })`; `tryCurrentMarketReadFastPath`; `answerLiveDecisionHistoryQuery` | 1, 3, 4, 5 | modified | **NO** — large mixed (~531-line diff) |
| `extension/casual-chat.js` | Client anaphora regex includes `(?:are\|were) you waiting for` | 6 past-tense wait routing | modified | **NO** — large casual-chat expansion beyond were-fix |

### Shipset transitive deps (required only if shipping WT `analysis-quality-gate.ts` wholesale)

| path | why | feature | modified/new | safe to ship |
|------|-----|---------|--------------|--------------|
| `lib/live-latency-profile.ts` | Imported by WT QG for cache hit metrics | not a scoped feature (collateral) | new | **NO** — latency instrumentation, not features 1–6 |
| `lib/market-data-errors.ts` | Imported by WT QG `marketDataFailureQualityGate` | not a scoped feature (collateral) | new | **NO** — timeout/wait reply helper, not features 1–6 |

### Shipset notes (not listed as ship files)

| path | note |
|------|------|
| `package.json` | Adds `test:decision-memory-adapter`, `test:quality-gate-envelope-dedupe`, `test:karen-instant-read-llm-skip`, `test:decision-history-time-travel`, `test:karen-wait-followup` **and** `test:continuous-decision-memory` plus many unrelated scripts + version `1.4.73`→`1.4.84`. **Do not ship wholesale.** If scripting is included, **omit** `test:continuous-decision-memory` (recorder-only). |
| `data/routing-golden.csv` | Golden updates for `current_market_read` / bias labels — **not** the past-tense wait marker; test fixture, not prod runtime. |
| `extension/mentor-intent.js` | Client mentor classifier **lacks** past-tense `were` in `isWaitExplanation` (still present-tense only). **Not** the feature-6 fix; server `lib/mentor-intent.ts` is authoritative for API routing. |

**Safe-to-ship summary:** only the **new, feature-pure** libs above are **YES**. Every **modified** wire-up file is **NO** as a whole-file commit candidate without carving feature hunks (or accepting large unrelated WT surface).

---

## EXCLUDED FILES

### Continuous recorder (explicitly out of shipset)

| path | why | feature | modified/new | safe to ship |
|------|-----|---------|--------------|--------------|
| `lib/continuous-decision-recorder.ts` | Continuous live recorder | continuous recorder | new | **NO** — excluded by task |
| `lib/decision-memory-material.ts` | Material-change gate for continuous appends | continuous recorder | new | **NO** — excluded by task |
| `scripts/test-continuous-decision-memory.ts` | Recorder test harness | continuous recorder | new | **NO** — excluded by task |
| `lib/verdict-engine.ts` | Imports `withManualAnalysePriority` from continuous recorder (+ `flushDecisionMemoryWrites`) | continuous recorder (mixed with 1) | modified | **NO** — shipping pulls recorder; exclude entirely |
| `package.json` → script `test:continuous-decision-memory` | Solely for recorder | continuous recorder | modified (script line) | **NO** — exclude this script only |

### Feature-related tests / probes (not production runtime)

| path | why |
|------|-----|
| `scripts/test-decision-memory-adapter.ts` | Audit/test for Redis adapter |
| `scripts/test-quality-gate-envelope-dedupe.ts` | Audit/test for QG dedupe |
| `scripts/test-karen-instant-read-llm-skip.ts` | Audit/test for instant LLM skip |
| `scripts/test-decision-history-time-travel.ts` | Audit/test for session-boundary + whyNow |
| `scripts/test-karen-wait-followup.ts` | Audit/test for past-tense wait |
| `.tmp-measure-qg-dedupe.ts` | Temp QG probe |
| `.tmp-session-boundary-audit-probe.ts` | Temp session-boundary probe |
| `.tmp-waiting-routing-check.ts` | Temp wait-routing probe |
| `.tmp-why-not-integrity-probe.ts` / `.tmp-why-not-integrity-probe.json` | Temp why/integrity probes |
| `.tmp-continuous-recorder-adversarial-probe.ts` | Temp continuous-recorder probe |

### Generated research / docs for these features (audit-only; do not ship as product)

Examples (non-exhaustive; all under `data/research/` are out of production shipset):  
`karen-decision-memory-implementation.md`, `karen-quality-gate-envelope-dedupe-impl.md`, `karen-instant-read-llm-skip-implementation.md`, `karen-live-decision-history-session-boundary-fix.md`, `karen-historical-verdict-plus-why.md`, `karen-historical-why-not-past-tense-fix.md`, `karen-continuous-decision-memory-*.md`, `karen-production-deployment-gap-audit.md`, this file.

### Other standard excludes

| bucket | examples |
|--------|----------|
| `.tmp*` / `tmp/` / `tmp-*` | market-snapshot bodies, vercel inspect JSON, connection probes |
| `data/supervisor/**` | queue/results/throughput (ops, not prod Karen ship) |
| `reports/**` | generated health / acceptance reports |
| `.cursor/**` | hooks/rules (editor, not prod) |
| credentials / `.env` | **none present** in dirty tree for this audit |

---

## Feature → file map (quick)

| # | Feature | Primary markers | Shipset cores |
|---|---------|-----------------|---------------|
| 1 | Redis decision memory | `UPSTASH_*`, `readUpstashRestConfig`, `hydrateDecisionMemoryFromStore`, `recordDecisionEnvelopeHistory` | `decision-memory-backend.ts`, `decision-envelope-history.ts`, wire: `desk-pipeline.ts`, `chat/stream/route.ts`, `chat-engine.ts` (flush) |
| 2 | QG envelope dedupe | `formatCanonicalEnvelopeForPrompt` | `decision-contract-output.ts`, `analysis-quality-gate.ts` |
| 3 | Instant LLM skip | `KAREN_INSTANT_READ_LLM_SKIP`, `tryCurrentMarketReadFastPath` | `chat-engine.ts`, `chat/stream/route.ts` |
| 4 | LIVE session-boundary | `lookupLiveAtClock`, `cmeSessionDateKeyFromDate` | `decision-time-travel.ts`, `market-data.ts` (export), `decision-history-query.ts` |
| 5 | Historical verdict + whyNow | `formatAtTimeReply` → `whyNow=` | `decision-time-travel.ts` |
| 6 | Past-tense wait routing | `isWaitExplanation` + `were`, casual-chat anaphora | `mentor-intent.ts`, `conversational-intent.ts`, `extension/casual-chat.js` |

---

## Counts / flags

```
SHIPSET FILES:
  Core YES-safe new libs: 8
  Core wire-up / mixed (NO wholesale): 7
  Transitive collateral (NO): 2
  (Continuous recorder: 0 — excluded)

EXCLUDED FILES:
  Continuous recorder + material + recorder test + verdict-engine pull-in: YES (listed)
  Temp probes / research / supervisor / reports / .tmp: YES (listed by bucket)
  package.json continuous script: YES (omit)

UNRELATED DIRTY FILES: 225
  (640 total dirty − 16 shipset-matched paths − 399 exclude-bucket matches;
   remainder = other product/extension/lib/script experiments not in features 1–6)

CONTINUOUS RECORDER EXCLUDED: YES

SECRETS EXCLUDED: YES
  (no `.env` / credentials / secret files in dirty tree; Redis URL/token are env names only in code — values not in repo)
```

---

## Commit readiness (audit conclusion)

| Question | Answer |
|----------|--------|
| Are features 1–6 on HEAD? | **NO** — worktree-only |
| Can a single whole-tree commit ship only 1–6? | **NO** — dirty tree mixes recorder, latency, extension v1.4.8x, research, supervisor |
| Minimum safe commit shape | **Carve** YES-safe new libs + **hunk-level** extracts from mixed wire-up files; **omit** continuous recorder + `verdict-engine.ts` recorder import; **omit** `test:continuous-decision-memory` |
| Runtime env (out of git shipset) | Production needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for Redis SoT; `KAREN_INSTANT_READ_LLM_SKIP` opt-in (default OFF) |

---

## STOP

Audit complete. No product code changes. No git add / commit / push / deploy.
