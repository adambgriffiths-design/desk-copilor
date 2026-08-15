# Karen Cloud Holiday Readiness (CLOUD TRACK ONLY)

**TREE:** `.tmp/karen-final-integration/`  
**Date:** 2026-08-15  
**Mode:** infrastructure / ops — **NOT research**  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED · VAL: DO NOT TOUCH  
**RESEARCH_JOBS:** UNTOUCHED (no claim/kill/duplicate of DEV / c4 / overcaution / shadow-dump / WAIT)

Architecture source: `data/research/karen-cloud-backtest-architecture.md`  
Phase 1 prep: `data/research/karen-cloud-phase1-prep.md`

---

## READY_FOR_HOLIDAY: **PARTIAL**

Adam can prepare the laptop workflow and run local infra smokes **today**, but **cannot** yet leave the desktop fully offline for cloud-backed DEV jobs until:

1. Cloudflare R2 credentials + bucket exist and min-DEV (~347 MB) is uploaded  
2. A remote VM is provisioned (Hetzner steps documented)  
3. Laptop has secrets + AWS CLI/rclone + SSH to VM  

Local data is **not** deleted. Full raw (~46 GB / 1663 days) remains for throttled background sync.

---

## What works now

| Capability | Status |
|------------|--------|
| Portable paths (`lib/karen-paths.ts`) | YES |
| Machine-independent env load (no hardcoded desktop `.env.local`) | YES |
| Day-checkpoint + resume (`lib/decision-validation/day-checkpoint.ts`) | YES — unit tests PASS |
| R2 config stubs + Adam checklist | YES — `config/cloud/*` |
| Checksum inventory + append-only sync **plan** | YES — `karen:cloud:r2-sync` |
| Min-DEV pack checksums (~347 MB) | YES — staged under `.karen-cache/min-dev-pack/` |
| Equivalence smoke (2-pass semantic hash + checkpoint resume) | YES — PASS |
| Hetzner VM runbook | YES — `config/cloud/vm-hetzner.md` |
| Laptop copy-paste workflow | YES — `config/cloud/laptop-workflow.md` |
| R2 credentials configured on this machine | **NO** |
| aws CLI / rclone installed | **NO** |
| Remote VM provisioned | **NO** (docs only) |
| Min-DEV uploaded to R2 | **NO** (blocked on credentials) |
| Full raw uploaded | **NO** (intentional — background later) |

### Verified this session

```
npm run karen:cloud:status          → BLOCKED_on_R2_credentials (expected)
npm run test:karen-dv-day-checkpoint → ALL PASS
npm run test:karen-cloud-equivalence-smoke → ok, semanticHash=
  d58ad6ab720033ff2acd917a14fbb2962543a3237cc0f28b21331b8e9c29321e
npm run karen:cloud:min-dev-pack    → 347.14 MB, missingRequired=0
karen:cloud:r2-sync --profile min-dev --inventory --plan
  → 20 objects, 347.18 MB, aggregateSha256=
  c666b71eabc02422624609101e72a0a625ad2013dc9e9b841dd6b699d63e5ef2
```

---

## Secrets / credentials Adam must set

**Do not invent values. Never commit.**

| Variable | Purpose |
|----------|---------|
| `KAREN_R2_ACCOUNT_ID` | Cloudflare account id |
| `KAREN_R2_BUCKET` | e.g. `karen-nq-history` |
| `KAREN_R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `KAREN_R2_ACCESS_KEY_ID` | R2 API token access key |
| `KAREN_R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `KAREN_ENV_FILE` | Path to gitignored env inject file (laptop + VM) |
| `TICKSTREAM_API_KEY` | Only if laptop/VM will expand (prefer desktop ingest) |
| `OPENAI_API_KEY` | App/chat only — not required for offline DV |
| `KAREN_VM_IP` | After Hetzner create — laptop SSH monitor |

### Adam checklist (R2)

1. Cloudflare → R2 → Create private bucket `karen-nq-history`  
2. Create R2 API token (Object Read & Write on that bucket)  
3. Store keys in 1Password / Doppler / `%USERPROFILE%\.config\karen\env`  
4. Install **AWS CLI v2** or **rclone** on desktop + laptop  
5. Optional: `config/cloud/r2.example.json` → `r2.local.json` (gitignored) with accountId/endpoint  
6. **Never** set `KAREN_HOLDOUT_UNLOCK=1` on holiday DEV laptop/VM  

Names-only template: `config/cloud/env.example`

---

## Min dataset synced vs remaining

### Min-DEV (ready to upload once R2 exists) — **~347 MB**

| Asset | Role |
|-------|------|
| `normalized/nq-history-archive-1m/candles-1m.json` | 1m bars (~232 MB) |
| `normalized/.../dv-fixture-bounded.json` | Bounded fixture (~116 MB) |
| `normalized/.../manifest.json` + `splits/carve-manifest-v1.json` | Dataset + DEV/VAL/HO carve |
| `micro-fixtures/fixtures/*.json` + reports | Equivalence smoke |
| `config/cloud/*` stubs | Prefix contract + runbooks |

Checksums: `.karen-cache/min-dev-pack/checksums.jsonl`  
Plan: `.karen-cache/cloud-sync/min-dev/plan.json`

### Remaining upload (background, resumable)

| Asset | Size | Profile |
|-------|------|---------|
| Raw TickStream `by-day/` | **~46 GB · 1663 day dirs** | `--profile raw-append` |
| Other normalized slices / acquisition reports | small–medium | optional later |
| `experiments/sealed/holdout/` | — | **DO NOT** sync to DEV laptop |

Local raw must **remain**; sync is append-only; **no `--delete`**.

---

## Laptop workflow steps (copy-pasteable)

Full detail: `config/cloud/laptop-workflow.md`

```powershell
# 1) Same git SHA as desktop experiments
cd <repo>
git fetch
git checkout <GIT_SHA>
npm ci

# 2) Secrets (gitignored)
$env:KAREN_ENV_FILE="$env:USERPROFILE\.config\karen\env"

# 3) Status (prints missing R2 vars — never secret values)
npm run karen:cloud:status

# 4) After R2 + desktop min-dev upload — pull (NEVER --delete)
$env:AWS_ACCESS_KEY_ID=$env:KAREN_R2_ACCESS_KEY_ID
$env:AWS_SECRET_ACCESS_KEY=$env:KAREN_R2_SECRET_ACCESS_KEY
aws s3 sync "s3://$env:KAREN_R2_BUCKET/normalized/" `
  "data/karen-decision-validation/acquisition/normalized/" `
  --endpoint-url $env:KAREN_R2_ENDPOINT

# 5) Smoke
npm run test:karen-cloud-equivalence-smoke
npm run test:karen-dv-day-checkpoint

# 6) Monitor / resume VM job
ssh karen@$env:KAREN_VM_IP "tmux ls; ls ~/karen-checkpoints"
ssh karen@$env:KAREN_VM_IP -t "tmux attach -t karen-dv"
```

Until R2 exists: copy `.karen-cache/min-dev-pack/MANIFEST.json` checksums + normalized files via trusted local network/USB (still no delete of desktop originals).

---

## Durable checkpoint / resume

- Format: `dv-day-checkpoint-v1` under `KAREN_DV_CHECKPOINT_ROOT` or `data/.../acquisition/checkpoints/jobs/{jobId}/`
- Resume skips completed days when fingerprint matches (code + dataset + baseline + configHash + split)
- Wire long DEV runners to `runDaysWithResume` before overnight reliance
- HOLDOUT checkpoint I/O blocked without `KAREN_HOLDOUT_UNLOCK=1`

---

## Remote VM

Exact steps: `config/cloud/vm-hetzner.md` (Ubuntu 24.04, Node 22, tmux, R2 pull, no holdout unlock).  
Alternatives: Fly Machine / AWS spot — same layout, checkpoints required for preempt.

---

## Resource isolation vs DEV research

- Cloud scripts throttle hashing (`--throttle-ms`, yield every 8 MB)
- Prefer `min-dev` (~347 MB) over raw; rclone examples use `--bwlimit 4M..8M`
- No competing Y=1500 DV from this track
- Supervisor research inbox not claimed for cloud work
- This track did **not** interrupt running node/DEV processes

---

## Scripts / stubs added (TREE)

```
lib/cloud/r2-config.ts
lib/cloud/checksum-sync.ts
scripts/karen-cloud-status.ts
scripts/karen-cloud-r2-sync.ts
scripts/karen-cloud-min-dev-pack.ts
scripts/karen-cloud-equivalence-smoke.ts
config/cloud/vm-hetzner.md
config/cloud/laptop-workflow.md
config/cloud/rclone.conf.example
config/cloud/min-dev-dataset.manifest.json
config/cloud/equivalence-smoke-golden.json
(+ updated r2.example.json, env.example, README.md, package.json scripts)
```

npm scripts: `karen:cloud:status` · `karen:cloud:min-dev-pack` · `karen:cloud:r2-sync` · `test:karen-cloud-equivalence-smoke`

**No git commit** (per instructions).

---

## Path to READY_FOR_HOLIDAY=YES

1. Adam creates R2 bucket + tokens; installs aws/rclone  
2. Desktop: upload min-dev plan (20 objects / ~347 MB)  
3. Provision Hetzner VM; pull min-dev; tmux DEV job with day-checkpoints  
4. Laptop: secrets + pull + smoke + SSH attach  
5. Start throttled `raw-append` background sync; report remaining day count until complete  

Then set **READY_FOR_HOLIDAY=YES** in a follow-up cloud report.

---

## NEXT_CLOUD_ACTION

Adam: create R2 bucket + API token and set `KAREN_R2_*`; then desktop `npm run karen:cloud:r2-sync -- --profile min-dev --inventory --plan` and execute the printed upload (no `--delete`).
