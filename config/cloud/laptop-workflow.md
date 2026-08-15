# Laptop workflow — monitor / launch / resume Karen DEV (holiday)

Copy-paste checklist for Adam. Assumes desktop has staged min-DEV pack + (when ready) R2 upload.

## A. One-time laptop setup

```powershell
# Clone or pull same repo SHA as desktop experiments
cd $HOME\Projects   # or your preferred root
git clone https://github.com/adambgriffiths-design/desk-copilor.git desk-copilot
cd desk-copilot
git fetch
git checkout <GIT_SHA>
npm ci

# Secrets: copy from 1Password into gitignored file — NEVER commit
# Required names: see config/cloud/env.example
notepad $env:USERPROFILE\.config\karen\env
# Then in each shell:
$env:KAREN_ENV_FILE="$env:USERPROFILE\.config\karen\env"
```

Optional path overrides (portable — no desktop absolute paths):

```powershell
$env:KAREN_REPO_ROOT=(Get-Location).Path
$env:KAREN_CACHE_ROOT="$env:USERPROFILE\.karen-cache"
$env:KAREN_DV_CHECKPOINT_ROOT="$env:USERPROFILE\.karen-cache\dv-checkpoints"
```

## B. Status (safe; no secret values printed)

```powershell
cd <repo>
$env:KAREN_ENV_FILE="$env:USERPROFILE\.config\karen\env"
npm run karen:cloud:status
```

## C. Pull min-DEV dataset (after R2 credentials + desktop upload)

```powershell
# Install AWS CLI once: https://aws.amazon.com/cli/
$env:AWS_ACCESS_KEY_ID=$env:KAREN_R2_ACCESS_KEY_ID
$env:AWS_SECRET_ACCESS_KEY=$env:KAREN_R2_SECRET_ACCESS_KEY
aws s3 sync "s3://$env:KAREN_R2_BUCKET/normalized/" `
  "data/karen-decision-validation/acquisition/normalized/" `
  --endpoint-url $env:KAREN_R2_ENDPOINT
# NEVER use --delete

aws s3 sync "s3://$env:KAREN_R2_BUCKET/experiments/dev/micro-fixtures/" `
  "data/karen-decision-validation/micro-fixtures/" `
  --endpoint-url $env:KAREN_R2_ENDPOINT
```

If R2 is not ready yet but you have a USB/network copy of `.karen-cache/min-dev-pack` from desktop:

```powershell
# Small files are under files/; large normalized JSON — copy from desktop paths listed in MANIFEST.json
npm run karen:cloud:min-dev-pack   # on desktop first to refresh checksums
```

## D. Equivalence smoke (must pass before trusting laptop)

```powershell
npm run test:karen-cloud-equivalence-smoke
npm run test:karen-dv-day-checkpoint
```

## E. Monitor remote VM job

```powershell
ssh karen@$env:KAREN_VM_IP
tmux attach -t karen-dv
# or read checkpoints:
ls ~/karen-checkpoints/<jobId>/
```

From laptop without SSH UI:

```powershell
ssh karen@$env:KAREN_VM_IP "ls -la ~/karen-checkpoints; tmux ls"
```

## F. Launch / resume DEV day job on VM

```powershell
ssh karen@$env:KAREN_VM_IP
tmux attach -t karen-dv   # or: tmux new -s karen-dv
export KAREN_ENV_FILE=$HOME/.config/karen/env
export KAREN_DV_CHECKPOINT_ROOT=$HOME/karen-checkpoints
# Re-run the same command — day-checkpoint skips completed days
# (runner must use runDaysWithResume from lib/decision-validation/day-checkpoint.ts)
```

## G. What NOT to do on holiday laptop

- Do not open `experiments/sealed/holdout/`
- Do not set `KAREN_HOLDOUT_UNLOCK=1`
- Do not run competing full-archive Y=1500 DV on laptop while VM works
- Do not delete desktop raw archive
- Do not `aws s3 sync --delete`

## H. Desktop still owns

- TickStream expand / raw append upload (`--profile raw-append`) as background resumable sync
- Research supervisor DEV jobs already in flight (do not kill)
