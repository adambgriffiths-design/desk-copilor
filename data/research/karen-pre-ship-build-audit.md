# KAREN — Pre-Ship Build Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — no product code changes, no commit / push / deploy  
**Workspace:** `C:\Users\adamg\Projects\desk-copilot`

---

## Shipset source

`data/research/karen-pre-commit-shipset-audit.md` was **absent**.

**Inferred shipset** from `data/research/karen-production-deployment-gap-audit.md` — six features **minus continuous recorder**:

| # | Feature | Primary paths |
|---|---------|---------------|
| 1 | Redis decision memory | `lib/decision-memory-backend.ts`, `lib/decision-envelope-history.ts`, `lib/desk-pipeline.ts` (record), `app/api/chat/stream/route.ts` (hydrate) |
| 2 | QUALITY GATE envelope dedupe | `lib/decision-contract-output.ts` (`formatCanonicalEnvelopeForPrompt`), `lib/analysis-quality-gate.ts` |
| 3 | CURRENT_MARKET_READ instant LLM skip | `lib/chat-engine.ts` (`KAREN_INSTANT_READ_LLM_SKIP`) |
| 4 | LIVE session-boundary fix | `lib/decision-time-travel.ts` (`lookupLiveAtClock` + `cmeSessionDateKeyFromDate`) |
| 5 | Historical WHY / whyNow integrity | `lib/decision-time-travel.ts` (`formatAtTimeReply`), `lib/mentor-intent.ts`, `lib/conversational-intent.ts`, `extension/casual-chat.js` |

**Excluded (by task):** Continuous decision recorder (`lib/continuous-decision-recorder.ts`, `lib/decision-memory-material.ts`).

---

## Scorecard

| Check | Result |
|-------|--------|
| **BUILD** | **FAIL** |
| **TYPECHECK** | **FAIL** |
| **IMPORTS** | **PASS** |
| **SECRET CHECK** | **PASS** |
| **PROBE/DEBUG CHECK** | **PASS** |

---

## 1. TypeScript compilation — TYPECHECK: FAIL

Command: `npx tsc --noEmit` (no dedicated `typecheck` script in `package.json`; `tsconfig.json` has `"noEmit": true`).

| Error | Shipset? | Notes |
|-------|----------|-------|
| `.next/types/app/api/chat/runtime-share-probe/route.ts` → missing route module | No (stale) | Probe route **absent** under `app/`; stale Next generated types |
| `.next/types/app/api/live-verdict/runtime-share-probe/route.ts` → missing route module | No (stale) | Same |
| `lib/continuous-decision-recorder.ts:211` — `runtime: string` not assignable to literal `"event-driven-only — …"` | Excluded feature, **still in build graph** | Pulled by `lib/verdict-engine.ts` → `withManualAnalysePriority` |
| `lib/incremental-market-engine.ts:667` — `levelInteractions` typing | Outside shipset | Pre-existing / unrelated |

**Shipset-only modules** (memory, envelope, QG, chat-engine instant skip, time-travel, mentor/conversational) did **not** appear as direct `tsc` error sites.

---

## 2. Next.js production build — BUILD: FAIL

Command: `npm run build` (Next.js 15.5.23).

- Compile stage: **succeeded** (~20s).
- “Linting and checking validity of types”: **failed** on:

```
./lib/continuous-decision-recorder.ts:211
Type error: … runtime: string is not assignable to type
"event-driven-only — Vercel serverless cannot host continuous background timers"
```

**Implication for inferred shipset:** continuous recorder is excluded from the proposed commit set, but the **current worktree still imports it** from `lib/verdict-engine.ts`. Production build typechecks that file and fails. Shipping the 5-feature set without fixing or unwinding that import will not produce a clean build.

Local build log also noted `Environments: .env.local` (local-only; see secrets).

---

## 3. Imports — IMPORTS: PASS

All inferred shipset paths exist on disk:

- `lib/decision-memory-backend.ts`
- `lib/decision-envelope-history.ts`
- `lib/decision-envelope.ts`
- `lib/decision-contract-output.ts`
- `lib/decision-time-travel.ts`
- `lib/analysis-quality-gate.ts`
- `lib/chat-engine.ts`
- `lib/mentor-intent.ts`
- `lib/conversational-intent.ts`
- `lib/desk-pipeline.ts`
- `app/api/chat/stream/route.ts`
- `extension/casual-chat.js`

Static import edges among Redis/decision-memory cores resolve (no missing `@/` or relative targets observed). Evidence markers present: `hydrateDecisionMemoryFromStore`, `recordDecisionEnvelopeHistory`, `formatCanonicalEnvelopeForPrompt`, `lookupLiveAtClock`, past-tense wait patterns in mentor/extension.

**Hygiene note (not an IMPORTS fail):** `verdict-engine` → `continuous-decision-recorder` couples an **excluded** feature into the production Analyse path.

---

## 4. Circular dependency (Redis / decision memory)

**No cycle** among:

```
decision-memory-backend  (leaf; no local decision imports)
        ↑
decision-envelope-history ← desk-pipeline
        ↑
decision-envelope ← decision-contract-output
        ↑
decision-time-travel → desk-pipeline (one-way; pipeline does not import time-travel)
```

`decision-memory-backend` does not import history/pipeline/time-travel. History does not import pipeline. **PASS** for circular-dependency check.

---

## 5. Env vars (documented in code path)

| Var | Role | Missing at runtime |
|-----|------|--------------------|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`) | Redis SoT via `readUpstashRestConfig` | Falls back to **ram-only** (`getDecisionMemoryBackend()` → `null`) |
| `KAREN_DECISION_MEMORY_TTL_SECONDS` | Optional TTL override | Defaults to 86400 |
| `KAREN_INSTANT_READ_LLM_SKIP` | Instant CURRENT_MARKET_READ skip | Defaults **OFF** |
| `OPENAI_API_KEY` | LLM chat/verdict paths | Throws on LLM entrypoints if unset; documented in `.env.example`. Instant-skip path does not require it when flag+gate allow |

**No hard-coded required Redis without local fallback.** Missing Redis/instant-skip env is OK for local. Not a ship blocker by the stated rule.

`.env.example` documents `OPENAI_API_KEY` (+ optional search keys) but **does not** list Upstash / `KAREN_INSTANT_READ_LLM_SKIP` (code-path docs only) — advisory, not a FAIL.

---

## 6. Test-only code in production routes

- `setDecisionMemoryBackendForTests` is defined in `lib/decision-memory-backend.ts` and used from `scripts/test-*.ts` / `.tmp-*` probes only — **not** imported by `app/api/**`.
- Shipset production routes / engines do not import `scripts/`, `*.test`, or `.tmp-*` modules.

**PASS.**

---

## 7. Probe / debug routes — PROBE/DEBUG CHECK: PASS

- `app/api/chat/runtime-share-probe` — **ABSENT**
- `app/api/live-verdict/runtime-share-probe` — **ABSENT**
- No `*probe*` routes under `app/`

Stale `.next/types/.../runtime-share-probe` entries affect local `tsc` only; they are not app routes and are covered by `.gitignore` → `.next`.

Root `.tmp-*-probe.ts` files are workspace probes, not Next routes (out of shipset route surface).

---

## 8. Secrets / .env ship risk — SECRET CHECK: PASS

| Check | Evidence |
|-------|----------|
| Ignore rules | `.gitignore` has `.env`, `.env.local`, `.env*` |
| Git index | `git ls-files` for `.env` / `.env.local` / `.env.production` / `.env.*` → only **`.env.example`** tracked |
| `.env.example` | Placeholder empty values (`OPENAI_API_KEY=`, etc.) — no live secrets in the template |
| Local `.env.local` | Used by Next build locally; **gitignored** — would not ship via git; CLI deploys that respect ignore should exclude it |

---

## BLOCKERS

1. **`npm run build` fails** on `lib/continuous-decision-recorder.ts:211` (`runtime` widened to `string` vs required string-literal type).  
2. **Shipset/exclusion mismatch:** continuous recorder is out of the proposed shipset, but `lib/verdict-engine.ts` still imports `withManualAnalysePriority` from it — so the broken/excluded file remains on the production typecheck path. Fix the type error **or** remove that wiring before a 5-feature ship.  
3. **`npx tsc --noEmit` fails** additionally on unrelated `lib/incremental-market-engine.ts:667` and stale `.next/types` probe stubs (clean `.next` or ignore generated types before relying on tsc as a gate).

**Non-blockers (noted):** Redis/instant-skip env optional with safe defaults; no probe routes in shipset; secrets gitignored; no Redis↔memory import cycle; shipset imports resolve.

---

## STOP

Audit complete. No product code changes. No commit. No push. No deploy.
