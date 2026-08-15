# Karen Cloud Phase 1 Preparation

**TREE:** `.tmp/karen-final-integration/`  
**Date:** 2026-08-15  
**Mode:** infrastructure prep only — no bulk data migration, no heavy DV replay, no commit/push/deploy  
**HOLDOUT:** remains sealed  
**EDGE_CLAIM:** N/A

Source of truth for architecture: `data/research/karen-cloud-backtest-architecture.md`.

---

## What was prepared

### 1. Portable path resolution

- New: `lib/karen-paths.ts`
- Resolves repo/data/cache/DV/checkpoint roots via env overrides + upward `package.json` (`name=desk-copilot`) walk
- Env knobs: `KAREN_REPO_ROOT`, `KAREN_DATA_ROOT`, `KAREN_CACHE_ROOT`, `KAREN_DV_CHECKPOINT_ROOT`

### 2. Machine-independent env loading

- New: `lib/karen-env.ts`
- `scripts/_load-tickstream-env.ts` rewritten — **removed hardcoded** `c:/Users/adamg/Projects/desk-copilot/.env.local`
- Discovery: `KAREN_ENV_FILE` → `<repoRoot>/.env.local` → `.env` → walk from cwd
- Never logs secret values

### 3. Hardcoded desktop assumptions removed (safe)

| Location | Change |
|----------|--------|
| `scripts/_load-tickstream-env.ts` | Absolute desktop `.env.local` removed |
| `scripts/_probe-tickstream-archive-keys.ts` | Uses `resolveRepoRoot()` |
| `scripts/filter-charts.mjs` | `SCREENSHOTS_DIR` or `~/Pictures/Screenshots` |

Left untouched (docs / historical report JSON absolute paths): `LIVE.md`, `BACKTEST.md`, `DECISIONS.md`, acquisition report artifacts (not code).

### 4. Cloudflare R2 configuration stubs (no upload)

- `config/cloud/r2.example.json` — bucket prefixes + role allow/deny structure
- `config/cloud/env.example` — env var names for secret inject
- `config/cloud/README.md` — secret-manager inject order
- `.gitignore` extended for `r2.local.json`, credentials, `.karen-cache/`

### 5. Secret-manager / env integration (stubs)

- Documented 1Password / Doppler / `KAREN_ENV_FILE` inject path
- `.env.example` annotated with TickStream + R2 **names only**
- No real secrets written

### 6–7. Day-level DV checkpoint + automatic resume

- New: `lib/decision-validation/day-checkpoint.ts` (`dv-day-checkpoint-v1`)
- Layout: `{checkpointRoot}/{jobId}/{YYYY-MM-DD}.json` + `_index.json`
- Resume skips completed days when fingerprint matches (code + dataset + baseline + configHash + split)
- Failed / in_progress / mismatch → re-run that day only
- `UNTOUCHED_HOLDOUT` I/O requires `KAREN_HOLDOUT_UNLOCK=1`
- Exported from `lib/decision-validation/index.ts`
- Unit test: `scripts/test-karen-dv-day-checkpoint.ts` (`npm run test:karen-dv-day-checkpoint`)

### Explicitly not done (by design)

- No R2 upload / no ~46GB archive move
- No interrupt of running DV / expand jobs
- No delete/move of local raw TickStream data
- No commit / push / deploy
- HOLDOUT remains sealed

---

## Verify checklist

| Check | Status |
|-------|--------|
| Portable path resolve | Implemented + unit-tested |
| Secrets not committed | `.gitignore` covers `.env*`, R2 local creds |
| Checkpoint/resume unit tests | `test:karen-dv-day-checkpoint` |
| Local workflow smoke | Path/env import only (not full DV) |

## Next phase

**Holiday track (2026-08-15):** see `data/research/karen-cloud-holiday-readiness.md` — sync planner, min-DEV pack, VM/laptop runbooks, equivalence smoke. Still blocked on Adam R2 credentials for upload.

M0 empty R2 bucket + secret manager tokens → then M1 append-only raw sync. Wire long DV runners to `runDaysWithResume` before overnight cloud jobs.
