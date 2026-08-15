# KAREN — Clean Six-Feature Patch Plan

**Date:** 2026-08-15  
**Mode:** PLANNING ONLY — no product source edits; no git add / commit / push / deploy; no patch build until approval  
**Baseline HEAD:** `74183b24553757a22fd71d79d0f8954d7c72872f`  
**Sources of truth:** `karen-final-pre-commit-diff-review.md`, `karen-clean-six-feature-shipset.md`, `karen-pre-commit-shipset-audit.md`  
**Working tree:** dirty (hundreds of unrelated paths) — **must not** be the commit source

**Approved features only:**
1. Redis decision memory  
2. QUALITY GATE envelope dedupe  
3. CURRENT_MARKET_READ instant LLM skip  
4. LIVE session-boundary fix  
5. Historical verdict + whyNow integrity  
6. Past-tense wait routing  

---

## 1. Proposed method explanation

### Why not stage from the dirty worktree

Interactive `git add -p` on the current tree **cannot** produce a safe commit: feature wire-ups in mixed files share hunks with latency/timeout/stream/market-data/contract-prompt churn. Whole-file staging of mixed paths would over-ship. Recorder / `verdict-engine` / material files must stay out entirely.

### Recommended build method (after approval)

**Isolated clean tree from HEAD**, then surgical assembly — prefer a **git worktree** (or a plain checkout copy) under:

`.tmp/karen-six-feature-clean/`

Do **not** mutate the primary worktree product files for this carve.

#### Step A — Isolate from HEAD

```text
git worktree add .tmp/karen-six-feature-clean 74183b24553757a22fd71d79d0f8954d7c72872f
```

(Alternative: `git archive` / fresh clone at that SHA into the same directory. Same rule: start clean at HEAD.)

Output artifact (after assembly): either

- a unified diff / series under `.tmp/karen-six-feature-clean/` (e.g. `karen-six-feature.patch`), **or**
- commits only on the isolated worktree branch — **never** auto-applied to the primary WT without explicit user approval.

#### Step B — Add feature-pure new libs (whole-file copy)

Copy these **8 untracked** libs from the primary dirty WT into the clean tree **as entire files** (they are feature-pure; import-graph check already shows no recorder / material / `withManualAnalysePriority`):

| path | features |
|------|----------|
| `lib/decision-memory-backend.ts` | 1 |
| `lib/decision-envelope-history.ts` | 1 |
| `lib/decision-envelope.ts` | 1, 2, 5 |
| `lib/decision-contract-output.ts` | 2 (+3, 5) |
| `lib/decision-time-travel.ts` | 4, 5 |
| `lib/decision-history-query.ts` | 4, 5 |
| `lib/mentor-intent.ts` | 6 |
| `lib/conversational-intent.ts` | 6 |

#### Step C — Surgically rewrite mixed files (HEAD + feature lines only)

For each mixed path: **start from HEAD content in the clean tree**, then **manually insert only the YES feature hooks** listed in the final pre-commit review. **Do not** copy the dirty WT file wholesale.

| Mixed path | Surgical include (only) |
|------------|-------------------------|
| `lib/desk-pipeline.ts` | Imports `isDecisionHistoryRecordSuppressed` / `recordDecisionEnvelopeHistory`; `replaceLastPipelineResult`; `buildAnalysisContract(result, ctx, state)`; LIVE `recordDecisionEnvelopeHistory({…})` block |
| `lib/analysis-contract.ts` | Envelope imports; `decision?: DecisionEnvelope` on contract; `buildAnalysisContract(result, ctx?, state?)`; `buildDecisionEnvelope` + attach `decision`; `validateDecisionEnvelope` — **omit** liquidity/structure/FVG why rewrites, `buildRejectedAlternative` expansion, `formatAnalysisContract` prompt churn |
| `lib/analysis-quality-gate.ts` | Import `formatCanonicalEnvelopeForPrompt`; `decisionEnvelope?` / `envelopeText?`; return `envelopeText`; append DECISION ENVELOPE in `formatQualityGateForPrompt` — **omit** `live-latency-profile`, `market-data-errors`, `lastGateCache` / `resetQualityGateCache` / `bumpLiveLatency`, `marketDataFailureQualityGate`, unrelated prompt-tone rewrites |
| `lib/chat-engine.ts` | `flushDecisionMemoryWrites` after QG build; instant-read helpers (`isInstantReadLlmSkipEnabled`, `tryInstantReadFromQualityGate`, `tryCurrentMarketReadFastPath`) + call sites; minimal imports from `decision-contract-output` / `decision-envelope-history` / mentor intent needed by those paths — **omit** intelligence-cache reuse, market-data timeout / `MarketDataError`, failure-gate, live-latency marks, voice/persona, casual/mentor routing overhaul beyond wait/instant-read needs |
| `app/api/chat/stream/route.ts` | Imports + block: `isDecisionHistoryTimeQuery` → `hydrateDecisionMemoryFromStore({ lane: "LIVE" })` → `answerLiveDecisionHistoryQuery`; `tryCurrentMarketReadFastPath` call — **omit** `markLiveLatencyStage` / SSE latency payload / historical-UI / casual-stream overhaul / mentor-follow-up churn beyond required call sites |
| `lib/market-data.ts` | **Only** `cmeSessionDateKey` + `cmeSessionDateKeyFromDate` (required by `decision-time-travel.lookupLiveAtClock`) — **omit** `priorCmeSessionKey` / `barsInCmeSession` / `aggregateSessionBar` / `sessionCloseBar`, Yahoo timeout hooks, cache TTL, PD-level CME rewrites |
| `extension/casual-chat.js` | Minimal past-tense anaphora: ensure client regex accepts `(?:are\|were) you waiting for` (one-line-equivalent against HEAD) — **omit** `BARE_ANAPHORA` helper block and broader casual-chat expansion |

#### Step D — Explicit exclusions (never copy into clean tree)

- Continuous recorder: `lib/continuous-decision-recorder.ts`, `lib/decision-memory-material.ts`, recorder tests/probes, `data/research/karen-continuous-*`
- WT `lib/verdict-engine.ts` (recorder `withManualAnalysePriority` + unrelated churn) — keep HEAD verdict-engine
- Collateral: `lib/live-latency-profile.ts`, `lib/market-data-errors.ts`
- `package.json` wholesale (and any `test:continuous-decision-memory` script)
- Feature test scripts / `.tmp-*` probes / golden CSV / research / supervisor / `.cursor` / DEPLOY / other `app/api/**` / extension surfaces beyond the optional casual-chat were-fix

Shipset dependency check: features 1–6 run **without** WT `verdict-engine.ts` / recorder. Analyse still records via `runDeskPipeline` → `recordDecisionEnvelopeHistory`.

#### Step E — Verify before any apply to primary WT

In the clean tree only:

1. `rg` ship paths for `continuous-decision-recorder|decision-memory-material|withManualAnalysePriority|live-latency-profile|market-data-errors` → expect **no** matches in the carved set (except documenting intentional absence).  
2. Typecheck / targeted tests if available (`test-decision-memory-adapter`, QG dedupe, instant-read, time-travel, wait-followup) **without** adding those scripts to `package.json` unless separately approved.  
3. Diff clean tree vs HEAD → must contain **only** the 8 adds + surgical mixed edits.  
4. Produce patch artifact under `.tmp/karen-six-feature-clean/` for review.

### Why this method (vs alternatives)

| Method | Verdict |
|--------|---------|
| `git add -p` on dirty WT | **Reject** — entangled hunks not line-safe |
| Wholesale copy mixed files from WT | **Reject** — pulls latency/timeout/stream/PD churn |
| Isolated HEAD tree + whole new libs + manual HEAD+hunk rewrite | **Recommend** — only path that guarantees recorder/unrelated absence |
| Split into 6 micro-patches later | Optional follow-up; not required for first clean ship artifact |

### Feature-6 wire-up note

`lib/mentor-intent.ts` / `lib/conversational-intent.ts` are **new at HEAD** (untracked). Past-tense `were` lives in those modules. Server activation requires **minimal** imports/call sites in the surgically edited chat/stream (and only if needed for wait classification alongside feature-3 instant-read). Do **not** ship the full WT routing refactor (`routing.ts`, `desk-route-intent.ts`, `pending-request.ts`, etc.) unless a later audit proves a one-line import is insufficient — default plan keeps those files **untouched**.

---

## 2. Files that will be changed

(Tracked at HEAD — content surgically edited in the clean tree only.)

1. `lib/desk-pipeline.ts`  
2. `lib/analysis-contract.ts`  
3. `lib/analysis-quality-gate.ts`  
4. `lib/chat-engine.ts`  
5. `app/api/chat/stream/route.ts`  
6. `lib/market-data.ts`  
7. `extension/casual-chat.js` *(optional but included for feature-6 client anaphora; server SoT remains `lib/mentor-intent.ts`)*

**No other tracked product files** are in scope for the clean patch.

---

## 3. Files that will be added

(Untracked feature-pure libs — whole-file.)

1. `lib/decision-memory-backend.ts`  
2. `lib/decision-envelope-history.ts`  
3. `lib/decision-envelope.ts`  
4. `lib/decision-contract-output.ts`  
5. `lib/decision-time-travel.ts`  
6. `lib/decision-history-query.ts`  
7. `lib/mentor-intent.ts`  
8. `lib/conversational-intent.ts`

**Build-time only (not product ship):** `.tmp/karen-six-feature-clean/**` worktree / patch artifacts.

**Not added by this patch:** recorder libs, latency/error collateral libs, test scripts, probes, research docs (except this plan already in research).

---

## 4. Files that will remain untouched

Everything else in the repo / dirty tree, including but not limited to:

### Recorder / excluded engine

- `lib/continuous-decision-recorder.ts`  
- `lib/decision-memory-material.ts`  
- `lib/verdict-engine.ts` (**HEAD version stays**; WT edits never enter the patch)  
- `scripts/test-continuous-decision-memory.ts`  
- `.tmp-continuous-recorder-adversarial-probe.ts`  
- `package.json` / `package-lock.json`  
- `data/research/karen-continuous-*`

### Unrelated dirty / collateral (examples)

- `lib/live-latency-profile.ts`, `lib/market-data-errors.ts`  
- Other modified/untracked `lib/**` (e.g. `analysis-depth.ts`, `chart-live-price.ts`, `routing.ts`, `desk-route-intent.ts`, `casual-chat-intent.ts`, tickstream, research replay helpers, …)  
- Other `app/api/**` (`chat/route.ts`, `verdict`, `market-snapshot`, `market-intelligence`, voice, …) beyond `app/api/chat/stream/route.ts`  
- Extension surfaces beyond the optional casual-chat were-fix (`background.js`, `content.js`, `manifest.json`, `mentor-intent.js`, voice/*, …)  
- Feature harnesses: `scripts/test-decision-memory-adapter*`, `test-quality-gate-envelope-dedupe*`, `test-karen-instant-read-llm-skip*`, `test-decision-history-time-travel*`, `test-karen-wait-followup*`, `.tmp-measure-qg-dedupe.ts`, `.tmp-session-boundary-audit-probe.ts`, `.tmp-waiting-routing-check.ts`, `.tmp-why-not-integrity-probe.*`  
- `data/routing-golden.csv`, `DEPLOY.md`, `STABILIZATION_CHECKLIST.md`  
- `data/research/**` (audits remain docs-only; not part of product patch)  
- `data/supervisor/**`, `reports/**`, `.cursor/**`, tmp / `.tmp*` probes (except the dedicated clean assembly dir after approval)

### Confirmations from prior audits (still true for this plan)

- Accidental deletions: **NO** (plan adds/edits only; no deletes)  
- Accidental renames: **NO**

---

## 5. Confirmation: recorder absent

**CONFIRMED — recorder will be absent from the clean six-feature patch.**

| Check | Plan result |
|-------|-------------|
| `lib/continuous-decision-recorder.ts` | **Excluded** — never copied into clean tree / patch |
| `lib/decision-memory-material.ts` | **Excluded** |
| Recorder tests / probes / continuous research docs | **Excluded** |
| WT `lib/verdict-engine.ts` (`withManualAnalysePriority`) | **Excluded** — HEAD file untouched |
| `package.json` `test:continuous-decision-memory` | **Excluded** (whole `package.json` untouched) |
| Import leak into 8 new libs + carved wire-ups | **Must remain zero** (verify with `rg` in Step E) |

Feature-1 persistence path in the patch: `runDeskPipeline` → `recordDecisionEnvelopeHistory` only — **no** continuous recorder tick path.

---

## 6. Confirmation: unrelated changes absent

**CONFIRMED — unrelated WT churn will be absent from the clean six-feature patch**, by construction of the method:

| Unrelated class | How excluded |
|-----------------|--------------|
| Live latency instrumentation | Not copied; strip any accidental wrappers from stream/chat/QG when rewriting from HEAD |
| Market-data timeout / `MarketDataError` / failure gates | Omit; do not add `market-data-errors.ts` |
| QG cache reuse / prompt-tone rewrites | Omit from `analysis-quality-gate.ts` carve |
| Analysis-contract why/format/FVG churn | Omit from `analysis-contract.ts` carve |
| Stream casual/historical/SSE overhaul | Omit; only hydrate + time-travel + instant-read call sites |
| Market-data session-bar / PD / Yahoo / cache TTL | Omit; only two CME session key exports |
| Casual-chat broad anaphora/UI expansion | Omit; only were-anaphora equivalent |
| Other APIs, extension packs, supervisor, research, probes, version bumps | Untouched |

**Post-build gate:** `git diff 74183b2...` (or `git diff HEAD` inside clean worktree) must list **only** the 8 added libs + 7 mixed files above. Any extra path → fail the patch and re-carve.

---

## Assembly checklist (for build phase — not started)

- [ ] Create `.tmp/karen-six-feature-clean/` from HEAD `74183b2…`  
- [ ] Copy 8 new libs whole  
- [ ] Rewrite 7 mixed files from HEAD + YES hunks only  
- [ ] Confirm recorder absent (`rg`)  
- [ ] Confirm unrelated paths absent (`git diff --name-only`)  
- [ ] Optional typecheck / feature smoke tests in clean tree  
- [ ] Write reviewable patch artifact under `.tmp/karen-six-feature-clean/`  
- [ ] **Stop** — present patch for user approval before applying to primary WT / commit

---

## Planning status

| Item | Status |
|------|--------|
| Method chosen | Isolated HEAD worktree/copy + whole new libs + surgical mixed rewrite |
| Files changed / added / untouched | Enumerated above |
| Recorder absent | **YES (by plan)** |
| Unrelated changes absent | **YES (by plan)** |
| Product source modified in this planning turn | **NO** (this research plan file only) |
| Patch built | **NO** |
| Commit / push / deploy | **NO** |

---

## AWAITING APPROVAL TO BUILD PATCH — do not build until user says proceed.
