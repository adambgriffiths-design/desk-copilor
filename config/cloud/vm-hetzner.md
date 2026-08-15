# Hetzner VM — Karen DV worker (exact steps)

**Preferred compute** per `karen-cloud-backtest-architecture.md`: Hetzner CX33/CX43 (non-GPU).  
**Mode:** infrastructure only. HOLDOUT sealed. Do not run VAL/holdout unlock on this box by default.

## 1. Create server (Cloud Console)

1. [Hetzner Cloud](https://console.hetzner.cloud/) → New project `karen-dv` (or reuse).
2. Add server:
   - **Location:** Falkenstein / Nuremberg (EU) unless you need US.
   - **Image:** Ubuntu 24.04.
   - **Type:** CX33 (8 vCPU / 16 GB) for overnight DEV; CX43 if day-parallel workers ≥8.
   - **Disk:** ≥80 GB SSD (normalized ~0.4 GB + room for raw subset + Node).
   - **SSH key:** paste laptop + desktop public keys.
3. Note public IPv4: `VM_IP`.

## 2. First SSH bootstrap

```bash
ssh root@$VM_IP
apt-get update && apt-get install -y git curl ca-certificates build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
# Optional AWS CLI for R2:
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
apt-get install -y unzip && unzip -q /tmp/awscliv2.zip -d /tmp && /tmp/aws/install
```

## 3. App user + repo

```bash
adduser --disabled-password --gecos "" karen
usermod -aG sudo karen
su - karen
mkdir -p ~/src && cd ~/src
git clone https://github.com/adambgriffiths-design/desk-copilor.git desk-copilot
cd desk-copilot
git fetch --all
# Pin to the same SHA used for experiments on desktop
git checkout <GIT_SHA>
npm ci
```

## 4. Secrets (inject — never commit)

On the VM create `~/.config/karen/env` (mode 600) **or** use `op run` / Doppler:

```bash
export KAREN_ENV_FILE=$HOME/.config/karen/env
# Required for R2 pull:
# KAREN_R2_ACCOUNT_ID=...
# KAREN_R2_BUCKET=karen-nq-history
# KAREN_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
# KAREN_R2_ACCESS_KEY_ID=...
# KAREN_R2_SECRET_ACCESS_KEY=...
# Optional TickStream if VM will expand (prefer desktop ingest):
# TICKSTREAM_API_KEY=...
```

```bash
mkdir -p ~/.config/karen && chmod 700 ~/.config/karen
# paste env file, then:
chmod 600 ~/.config/karen/env
```

## 5. Pull min-DEV dataset from R2

```bash
cd ~/src/desk-copilot
export KAREN_ENV_FILE=$HOME/.config/karen/env
export AWS_ACCESS_KEY_ID=$KAREN_R2_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$KAREN_R2_SECRET_ACCESS_KEY
# After desktop has uploaded min-dev profile:
aws s3 sync "s3://$KAREN_R2_BUCKET/normalized/" \
  data/karen-decision-validation/acquisition/normalized/ \
  --endpoint-url "$KAREN_R2_ENDPOINT" \
  --no-progress
# NEVER pass --delete
```

## 6. Durable day jobs (tmux)

```bash
sudo apt-get install -y tmux
tmux new -s karen-dv
export KAREN_ENV_FILE=$HOME/.config/karen/env
export KAREN_DV_CHECKPOINT_ROOT=$HOME/karen-checkpoints
mkdir -p "$KAREN_DV_CHECKPOINT_ROOT"
# Wire your DEV day runner to lib/decision-validation/day-checkpoint.ts
# (runDaysWithResume). Example smoke:
npm run test:karen-dv-day-checkpoint
npm run test:karen-cloud-equivalence-smoke
# Detach: Ctrl-b d
```

Resume after disconnect: `tmux attach -t karen-dv`.

## 7. Firewall / cost

- Allow SSH only from your IPs if possible.
- Power off when idle: Hetzner Console → Power off (storage retained).
- Estimated ~€13/mo CX33 always-on; less if powered only for jobs.

## 8. Alternatives (same layout)

| Provider | Notes |
|----------|--------|
| Fly.io Machine | Scale-to-zero; good for occasional jobs; still need volume for dataset cache |
| AWS EC2 spot | Use only with day checkpoints (preempt OK) |

## Safety

- Default split: `DEVELOPMENT` only.
- Do not set `KAREN_HOLDOUT_UNLOCK=1` on the shared DEV VM.
- Do not delete desktop local raw archive after sync.
