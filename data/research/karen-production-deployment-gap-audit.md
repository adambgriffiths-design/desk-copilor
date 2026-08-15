# KAREN — Production Deployment Gap Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no product code changes, no commit / push / deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`

---

## Git snapshot (this worktree)

| Field | Value |
|-------|--------|
| `git branch --show-current` | `cursor/extension-v1.4.62-fixes` |
| `git rev-parse HEAD` | `74183b24553757a22fd71d79d0f8954d7c72872f` |
| HEAD subject | `Release v1.4.73: keep MNQ/NQ ticker live, recover Analyse Market when TV export is empty, and show readable chart level names.` |
| Upstream | `origin/cursor/extension-v1.4.62-fixes` @ same SHA |
| `git status --short` | **639** paths dirty/untracked (full listing omitted; feature paths below) |

### Feature-path `git status --short`

```
 M app/api/chat/stream/route.ts
 M lib/analysis-quality-gate.ts
 M lib/chat-engine.ts
 M lib/verdict-engine.ts
 M package.json
 M extension/casual-chat.js
?? lib/continuous-decision-recorder.ts
?? lib/conversational-intent.ts
?? lib/decision-contract-output.ts
?? lib/decision-envelope-history.ts
?? lib/decision-envelope.ts
?? lib/decision-memory-backend.ts
?? lib/decision-memory-material.ts
?? lib/decision-time-travel.ts
?? lib/mentor-intent.ts
```

`git grep` on **HEAD** for `formatCanonicalEnvelopeForPrompt`, `KAREN_INSTANT_READ_LLM_SKIP`, `lookupLiveAtClock`, `continuous-decision-recorder`, `readUpstashRestConfig`: **no matches**.

---

## Production deployment (Vercel)

| Field | Value |
|-------|--------|
| Project | `adam-b45d/desk-copilor` (alias `https://desk-copilor.vercel.app`) |
| Latest Ready Production | `https://desk-copilor-5m92ovuw0-adam-b45d.vercel.app` |
| Deployment id | `dpl_4wQcXNTdLTUE65DzF9NXvVddcqvo` |
| Created | 2026-08-15 **02:31:34 BST** (build log UTC `2026-08-15T01:31:34Z`) |
| `gitSource` / commit SHA | **null / unknown** (CLI upload; not a Git-linked deployment) |
| Build `package.json` version printed | **`1.4.64`** (neither HEAD `1.4.73` nor current WT `1.4.84`) |
| Files downloaded in build | **903** deployment files |
| Sister project | `desk-copilot` also exists; **not** the alias serving `desk-copilor.vercel.app` |

### Production env (names only)

| Name | Present on Production? |
|------|------------------------|
| `UPSTASH_REDIS_REST_URL` | **YES** (created ~25m before this audit inspect) |
| `UPSTASH_REDIS_REST_TOKEN` | **YES** |
| `KAREN_INSTANT_READ_LLM_SKIP` | **NO** (not listed) |
| Also present | `TICKSTREAM_API_KEY`, `TAVILY_API_KEY`, `OPENAI_API_KEY` |

**Inference rule for “in Production” without gitSource:** CLI deploys upload non-gitignored local files. Paths with **creation + mtime before 02:31:34** are treated as **YES (inferred)**. Paths **created after** that cutoff are **NO**. Paths only **modified after** may still have been present at deploy; marked **YES\*** with caveat.

---

## Feature gap table

| # | Feature | Worktree impl | Committed (in `74183b2…`) | In current Production deploy | Exact commit / hash |
|---|---------|---------------|---------------------------|------------------------------|---------------------|
| 1 | **Redis decision memory** (`lib/decision-memory-backend.ts`, `lib/decision-envelope-history.ts`, Analyse `recordDecisionEnvelopeHistory` via `lib/desk-pipeline.ts`, Chat `hydrateDecisionMemoryFromStore` in `app/api/chat/stream/route.ts`) | **YES** | **NO** | **YES\*** (adapter + history + pipeline record mtimes before deploy; `UPSTASH_*` now set on Production. Stream hydrate is WT-only vs HEAD; stream file mtime **after** deploy → wiring not re-proven from file list.) | Prod commit: **unknown**. HEAD: `74183b24553757a22fd71d79d0f8954d7c72872f`. Deploy: `dpl_4wQcXNTdLTUE65DzF9NXvVddcqvo` |
| 2 | **QUALITY GATE envelope dedupe** (`formatCanonicalEnvelopeForPrompt` in `lib/decision-contract-output.ts` → `lib/analysis-quality-gate.ts`) | **YES** | **NO** | **YES\*** (both files mtime before 02:31) | Prod commit: **unknown**. Not in HEAD. Deploy: `dpl_4wQc…` |
| 3 | **CURRENT_MARKET_READ instant LLM skip** (`KAREN_INSTANT_READ_LLM_SKIP` in `lib/chat-engine.ts`) | **YES** | **NO** | **YES\*** code inferred; **runtime OFF** (env var absent; flag defaults OFF) | Prod commit: **unknown**. Not in HEAD. Deploy: `dpl_4wQc…` |
| 4 | **LIVE session-boundary fix** (`lookupLiveAtClock` + `cmeSessionDateKeyFromDate` in `lib/decision-time-travel.ts`) | **YES** | **NO** | **YES\*** (file mtime before 02:31) | Prod commit: **unknown**. Not in HEAD. Deploy: `dpl_4wQc…` |
| 5 | **Continuous decision recorder** (`lib/continuous-decision-recorder.ts`, `lib/decision-memory-material.ts`, `withManualAnalysePriority` in `lib/verdict-engine.ts`) | **YES** | **NO** | **NO** (recorder + material **created ~02:40**, after deploy; verdict-engine wiring mtime after deploy) | N/A for prod. Not in HEAD. |
| 6 | **Historical WHY / whyNow integrity** (`formatAtTimeReply` uses recorded `thesis.whyNow` in `lib/decision-time-travel.ts`; past-tense wait routing in `lib/mentor-intent.ts` / `lib/conversational-intent.ts` / `extension/casual-chat.js`) | **YES** | **NO** | **YES\*** (time-travel + mentor/conversational + extension mtimes before 02:31) | Prod commit: **unknown**. Not in HEAD. Deploy: `dpl_4wQc…` |

\*YES\* = inferred from CLI worktree upload timing + markers; **not** confirmed via deployment file tree or git SHA (inspect `gitSource: null`).

---

## Evidence markers (worktree)

| Marker | Location |
|--------|----------|
| Upstash REST adapter | `lib/decision-memory-backend.ts` → `readUpstashRestConfig`, `createUpstashDecisionMemoryBackend` |
| Envelope history + Redis persist | `lib/decision-envelope-history.ts` → `recordDecisionEnvelopeHistory` |
| Analyse record hook | `lib/desk-pipeline.ts` |
| Chat hydrate | `app/api/chat/stream/route.ts` → `hydrateDecisionMemoryFromStore({ lane: "LIVE" })` |
| QG canonical once | `formatCanonicalEnvelopeForPrompt` → `lib/analysis-quality-gate.ts` `envelopeText` |
| Instant skip flag | `lib/chat-engine.ts` → `isInstantReadLlmSkipEnabled` / `tryInstantReadFromQualityGate` |
| Session bind | `lib/decision-time-travel.ts` → `lookupLiveAtClock` |
| Continuous recorder | `lib/continuous-decision-recorder.ts` + `lib/decision-memory-material.ts` |
| whyNow in at-time reply | `formatAtTimeReply` → `whyNow=${thesisWhy}` |
| Past-tense wait | `lib/mentor-intent.ts` `what … were … waiting for` |

---

## Bottom line

| Verdict | Detail |
|---------|--------|
| **Git gap** | All six features are **worktree-only** relative to `74183b2…` — **none committed**. |
| **Prod gap (clear)** | **Continuous decision recorder is NOT in the current Production deploy** (created after `dpl_4wQc…`). |
| **Prod gap (soft)** | Remaining five are **likely present** via CLI dirty-tree deploy, but **no production git commit** can be cited; package version on that build was **1.4.64**. |
| **Runtime gap** | Instant LLM skip code may be deployed but **disabled** without `KAREN_INSTANT_READ_LLM_SKIP`. Redis env is **configured** on Production. |
| **Commit to ship** | Features are not on `origin/cursor/extension-v1.4.62-fixes` @ HEAD; a commit + redeploy (or documented CLI snapshot) is required for a reproducible Production SHA. |

---

## STOP

Audit complete. No product code changes. No commit. No push. No deploy.
