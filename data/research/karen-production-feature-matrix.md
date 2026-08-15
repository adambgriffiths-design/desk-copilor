# KAREN — Production Feature Matrix

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — matrix report only; no product code changes, no commit / push / deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`

---

## Legend

| Column | Meaning |
|--------|---------|
| **WORKTREE** | Feature code present in current dirty worktree |
| **COMMITTED** | Present in `HEAD` (`74183b24553757a22fd71d79d0f8954d7c72872f`) |
| **PUSHED** | Present on `origin/cursor/extension-v1.4.62-fixes` (same SHA as HEAD; 0 ahead / 0 behind) |
| **DEPLOYABLE** | Present in worktree and would ship if committed (continuous recorder excluded by policy — see notes) |
| **CURRENT PRODUCTION** | Inferred presence on live Production deploy `dpl_4wQcXNTdLTUE65DzF9NXvVddcqvo` (`desk-copilor.vercel.app`, created 2026-08-15 02:31:34 BST). CLI upload; `gitSource` null — not a git-linked SHA |

Values: **YES** / **NO** / **PARTIAL** / **UNKNOWN**

---

## Git / deploy snapshot

| Field | Value |
|-------|--------|
| Branch | `cursor/extension-v1.4.62-fixes` @ `74183b2…` = `origin/…` |
| HEAD subject | Release v1.4.73 |
| Worktree `package.json` | `1.4.84` (dirty) |
| HEAD `package.json` | `1.4.73` |
| Prod Ready deploy | `dpl_4wQcXNTdLTUE65DzF9NXvVddcqvo` → `https://desk-copilor-5m92ovuw0-adam-b45d.vercel.app` |
| Prod alias | `https://desk-copilor.vercel.app` |
| Prod commit SHA | **unknown** (CLI deploy) |
| Prior gap-audit build version print | `1.4.64` |
| Shipset audit | **Not found** in repo |

### Production env (names only, verified 2026-08-15)

| Name | On Production? |
|------|----------------|
| `UPSTASH_REDIS_REST_URL` | **YES** |
| `UPSTASH_REDIS_REST_TOKEN` | **YES** |
| `KAREN_INSTANT_READ_LLM_SKIP` | **NO** |
| `KAREN_DECISION_MEMORY_TTL_SECONDS` | **NO** (optional; code default 86400) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | **NO** (aliases unused; Upstash pair present) |

---

## Feature matrix

| Feature | WORKTREE | COMMITTED | PUSHED | DEPLOYABLE | CURRENT PRODUCTION | Env enable / disable |
|---------|----------|-----------|--------|------------|--------------------|----------------------|
| Redis decision memory | **YES** | **NO** | **NO** | **YES** | **PARTIAL** | **Enable by env presence:** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`). Optional TTL: `KAREN_DECISION_MEMORY_TTL_SECONDS` (default 86400). Absent pair → L1/ram only (no shared SoT). |
| QUALITY GATE envelope dedupe | **YES** | **NO** | **NO** | **YES** | **YES\*** | **N/A** — always-on when code present (`formatCanonicalEnvelopeForPrompt` in QG). |
| CURRENT_MARKET_READ instant LLM skip | **YES** | **NO** | **NO** | **YES** | **PARTIAL** | **`KAREN_INSTANT_READ_LLM_SKIP`**=`1`\|`true`\|`yes` → ON; **default OFF**. Prod env: **absent** → runtime OFF even if code shipped. |
| LIVE session-boundary fix | **YES** | **NO** | **NO** | **YES** | **YES\*** | **N/A** — always-on when `lookupLiveAtClock` + `cmeSessionDateKeyFromDate` present. |
| Historical verdict + whyNow | **YES** | **NO** | **NO** | **YES** | **YES\*** | **N/A** — always-on when `formatAtTimeReply` includes recorded `thesis.whyNow`. |
| "What were you waiting for?" routing | **YES** | **NO** | **NO** | **YES** | **YES\*** | **N/A** — always-on when past-tense wait detectors present (`mentor-intent` / `conversational-intent` / extension mirror). |
| Continuous decision recorder | **YES** | **NO** | **NO** | **NO** | **NO** | **N/A for on/off flag** — event-driven tick API only (no `setInterval`). Redis writes still require Upstash/KV pair when recording. **No dedicated `KAREN_CONTINUOUS_*` env.** |

\*YES\* = inferred from CLI dirty-tree upload + file create/mtime **before** 02:31:34 BST; **not** confirmed via deployment file tree or git SHA.

---

## Per-feature notes

### 1. Redis decision memory
- **Markers:** `lib/decision-memory-backend.ts` (`readUpstashRestConfig`), `lib/decision-envelope-history.ts` (`recordDecisionEnvelopeHistory` / `hydrateDecisionMemoryFromStore`), Analyse hook in `lib/desk-pipeline.ts`, chat hydrate in `app/api/chat/stream/route.ts`.
- **Git:** all untracked or dirty vs HEAD; `git grep` on HEAD finds no markers.
- **Production:** Upstash env **configured**. Adapter + history + pipeline record files mtime **before** deploy → code likely uploaded. Stream route mtime **after** deploy (02:55) → hydrate wiring **not re-proven** → **PARTIAL**. Cross-isolate Redis round-trip still unverified in research audits.

### 2. QUALITY GATE envelope dedupe
- **Markers:** `formatCanonicalEnvelopeForPrompt` → `lib/decision-contract-output.ts` used by `lib/analysis-quality-gate.ts`.
- **Files** create/mtime before deploy cutoff → **YES\*** in Production.

### 3. CURRENT_MARKET_READ instant LLM skip
- **Markers:** `isInstantReadLlmSkipEnabled` / `tryInstantReadFromQualityGate` in `lib/chat-engine.ts`; stream gate uses flag.
- **Production:** code likely present (feature predated deploy); env **missing** → feature **runtime OFF** → **PARTIAL**.

### 4. LIVE session-boundary fix
- **Markers:** `lookupLiveAtClock` session-binds via `cmeSessionDateKeyFromDate` in `lib/decision-time-travel.ts`.
- File mtime before deploy → **YES\***.

### 5. Historical verdict + whyNow
- **Markers:** `formatAtTimeReply` emits `Why:` + `THESIS: … whyNow=` from frozen envelope (`karen-historical-verdict-plus-why.md`).
- Same file as session-boundary; mtime before deploy → **YES\***.

### 6. "What were you waiting for?" routing
- **Markers:** past-tense `were` in `lib/mentor-intent.ts`, `lib/conversational-intent.ts`, `extension/casual-chat.js` (`karen-historical-why-not-past-tense-fix.md`).
- All mtimes before deploy → **YES\***.

### 7. Continuous decision recorder
- **Markers:** `lib/continuous-decision-recorder.ts`, `lib/decision-memory-material.ts`; `withManualAnalysePriority` in `lib/verdict-engine.ts`.
- **Created ~02:40** — **after** Production deploy → **NO** in Production.
- **`runContinuousDecisionRecorderTick` not wired** into production API/event paths (tests/probes only); Analyse path only imports priority wrapper.
- **DEPLOYABLE = NO (policy):** adversarial audit **OVERALL FAIL** (stale/bad-quality tick append); impl docs say no commit/push/deploy; serverless cannot host background continuous timers.

---

## Bottom line

| Claim | Result |
|-------|--------|
| Any of the seven features on `HEAD` / origin | **NO** — all worktree-only vs `74183b2…` |
| Clear Production miss | Continuous decision recorder (**NO**) |
| Soft Production presence (CLI-inferred) | QG dedupe, session-boundary, historical whyNow, waiting routing (**YES\***) |
| Partial Production | Redis memory (env YES; hydrate wiring uncertain); instant LLM skip (code likely YES; **flag OFF**) |
| Reproducible Production SHA | **UNKNOWN** — need commit + redeploy (or documented CLI snapshot) |

**Sources:** `git status` / `git log` / `git branch -vv` / HEAD grep; `data/research/karen-production-deployment-gap-audit.md`; Vercel `ls` + `inspect` + `env ls production`; feature audits listed above. **Shipset audit:** absent.

---

## STOP

Audit complete. Only this matrix file written. No product code changes. No commit. No push. No deploy.
