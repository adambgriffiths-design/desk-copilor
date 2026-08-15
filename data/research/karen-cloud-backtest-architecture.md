# Karen Cloud Development + Backtest Infrastructure Audit

**TREE audited:** `.tmp/karen-final-integration/` (git worktree → `desk-copilot` @ `74183b2`, detached)  
**Repo mirrors noted:** `data/research/`, `data/supervisor/` at repo root  
**Mode:** AUDIT ONLY — no migration, no delete, no commit/push/deploy  
**EDGE_CLAIM:** N/A  
**HOLDOUT:** remains sealed in design  
**Generated:** 2026-08-15 (local measurements from desktop worktree)

---

## Executive summary

Karen’s canonical project code already lives on GitHub (`origin` → `adambgriffiths-design/desk-copilor`), but **~46 GB of TickStream raw NQ history + normalized DV datasets + DV reports are local-only** under the worktree. Secrets live in repo-root `.env.local` (with a **hardcoded desktop path** fallback in `_load-tickstream-env.ts`). Dual-machine use today requires manual copy.

**Recommended boring stack:** GitHub (code) + **Cloudflare R2** (immutable raw + versioned normalized + experiment artifacts) + **one cheap always-on or spot VM** (Hetzner / Fly / AWS spot) for long DV jobs + **1Password / Doppler** for secrets. Holdout reports stay in a sealed object prefix with DEV workflows denied by default. Day-level checkpoints make 3h+ replays restartable. Estimated cloud storage **~$1–3/mo** at current size; a **4–8 vCPU** box can cut wall time roughly **4–8×** vs today’s ~1 worker-effective day-parallel runs once data is local-to-VM SSD.

**Full doc path:** `data/research/karen-cloud-backtest-architecture.md`  
**Worktree pointer/copy:** `.tmp/karen-final-integration/data/research/karen-cloud-backtest-architecture.md`

---

## CURRENT_STATE

### Project / code

| Item | Location | Notes |
|------|----------|-------|
| Integration worktree | `.tmp/karen-final-integration/` | Linked git worktree of `desk-copilot`; detached HEAD @ `74183b2` |
| Main checkout | repo root | Branch `cursor/extension-v1.4.62-fixes` @ same commit |
| Git remote | `https://github.com/adambgriffiths-design/desk-copilor.git` | Code is already cloud-backed |
| App / DV libs | `lib/`, `scripts/`, `app/` | Includes `lib/decision-validation/*` (PIT cache, day-parallel, episodes) |
| `node_modules` | **absent** in worktree | Regeneratable via `npm install` |
| `.next` | ~63 MB local build cache | Regeneratable |

### Historical data (local, dominant disk)

| Dataset | Path | Measured size | Span / counts |
|---------|------|---------------|---------------|
| TickStream raw NQ archive | `data/karen-decision-validation/acquisition/raw/tickstream-nq-history-archive/by-day/YYYY-MM-DD/{ticks.ndjson,manifest.json}` | **~46.1 GB** | **~1610+** day dirs (first `2020-04-01`, last `2026-08-14`; still expanding during audit) |
| Raw root manifest | `.../tickstream-nq-history-archive/manifest.json` | small | `dataset_id=tickstream-nq-history-archive-raw`, SKU `NQ Tick + L2 Archive` |
| Normalized 1m full | `.../normalized/nq-history-archive-1m/` | **~323 MB** (`candles-1m.json` ~213 MB + `dv-fixture-bounded.json` ~110 MB) | 2,055,758 bars · 1598 trading days · `2020-07-01`→`2026-08-14` |
| DV slice / week / backfill | `.../normalized/nq-history-archive-1m-dvslice/`, `nq-recent-*` | ~75 MB combined | Regeneratable from raw/1m |
| Acquisition reports / expand logs | `.../acquisition/reports/` | ~1.3 MB · 72 files | Includes carve JSON, expand `*.log`, progress JSON |
| Expand progress (live) | `.../reports/tickstream-history-archive-progress.json` | tiny | Day-complete checkpoint style (`ymd`, `daysLanded`) — ingest is partially restartable today |
| Fixtures v0–v4 | `data/karen-decision-validation/v0`…`v4` | ~10 MB | Mostly regeneratable / small |
| Micro-fixtures | `.../acquisition/micro-fixtures/` | small | DEV confounder probes |
| Split carve | `.../normalized/nq-history-archive-1m/splits/carve-manifest-v1.json` | tiny | **archive-carve-v1** DEV/VAL/HO |

### Splits (frozen measurement package)

From `carve-manifest-v1.json` / holdout scaffold:

| Split | Window | Trading days (X) | Sealed |
|-------|--------|------------------|--------|
| DEVELOPMENT | 2023-10-02 → 2025-05-31 | 429 | No |
| VALIDATION | 2025-06-01 → 2025-12-31 | 152 | No |
| UNTOUCHED_HOLDOUT | 2026-01-01 → 2026-08-14 | 158 | **Yes** |

### Research / supervisor / baselines

| Item | Worktree | Repo root |
|------|----------|-----------|
| Research markdown | `data/research/` ~3.8 MB | `data/research/` ~51 MB (broader history) |
| Supervisor DV day reports | `data/supervisor/` ~0.55 MB (`day-karen-edge-validation-*.md`, `nq-history-archive-scale-summary.json`) | `data/supervisor/` ~12 MB (inbox/results/control) |
| Perf notes | `data/research/karen-dv-backtest-performance.md` | may lag worktree |
| Baselines | `karen-trading-brain-baseline-v1`…`v4` docs + npm scripts | mirrored in root research |

### Runtime / secrets (local-only today)

| Item | Location | Risk |
|------|----------|------|
| `TICKSTREAM_API_KEY` / `TICKSTREAM_*` | Repo-root `.env.local` (worktree has **no** `.env.local`) | Machine-bound; scripts walk cwd + **hardcoded** `c:/Users/adamg/Projects/desk-copilot/.env.local` |
| `OPENAI_API_KEY` etc. | Same `.env.local` / `.env.example` documents names only | Required for chat; DV replay itself is mostly offline once bars exist |
| Vercel | `.vercel/` in worktree | Deploy metadata; not historical data |

### Compute / perf baseline (existing, not re-profiled for hours)

From `karen-dv-backtest-performance.md` (2026-08-15):

- Sample: 2 DEV days · cadence 5m · 530 evals · **15.59 evals/sec** wall · **~0.059 trading-days/sec**
- Full-year est. (252d, same cadence/lookback): **~71.4 min**
- Bottleneck: **data_loading** (JSON re-parse) ≫ feature_construction ≫ decision gate
- Day-parallel scaffold: workers=2 ≈ **0.99×** (not yet winning — I/O bound)
- PIT cache: `pit-cache-v1` landed; full context reuse not production-wired
- Within-day: chronological asOf (PIT); across days: parallelizable

### What already works for dual-machine *code*

`git fetch` / checkout / worktree on laptop ↔ desktop. **Data and secrets do not.**

---

## LOCAL_ONLY_DEPENDENCIES

| Dependency | Why local-only today | Breaks laptop if missing? |
|------------|----------------------|---------------------------|
| TickStream raw `by-day/` (~46 GB) | Never uploaded; under `.tmp` worktree data | Yes — cannot re-ingest cheaply without API + time |
| Normalized `nq-history-archive-1m` | Built locally from raw | Yes for fast DV (rebuildable if raw present) |
| Carve / even-span DV JSON reports | Written under acquisition/reports | Partial — methodology regeneratable; exact run artifacts not |
| Supervisor FINAL/progress for edge-validation day | Worktree `data/supervisor/` | Soft — narrative continuity |
| `.env.local` + hardcoded desktop path in `_load-tickstream-env.ts` | Desktop absolute path | Yes for ingest/expand |
| Expand progress + quarter logs | Local reports | Soft — resume state |
| PIT / in-memory caches | Process-local | No — regeneratable |
| `.next` / `node_modules` | Local install/build | No |
| Repo-root `data/research` + `data/supervisor` | Separate from worktree copies; not all synced into worktree | Soft confusion risk (two mirrors) |

**Not local-only:** Git history, package lock, baseline *definitions* in repo docs/scripts (once committed on a shared branch).

---

## STORAGE_INVENTORY

### Measured (2026-08-15, desktop worktree)

| Category | Path (under `.tmp/karen-final-integration/`) | Size | Classification |
|----------|-----------------------------------------------|------|----------------|
| Worktree total | `.` | **~46.7 GB** | mix |
| Raw TickStream archive | `data/karen-decision-validation/acquisition/raw/tickstream-nq-history-archive/` | **~46.1 GB** | **CLOUD_OBJECT_STORAGE** (immutable) |
| Normalized 1m (+ slices) | `data/.../acquisition/normalized/` | **~398 MB** | **CLOUD_OBJECT_STORAGE** (versioned) + **REGENERATABLE** from raw |
| Acquisition reports | `data/.../acquisition/reports/` | **~1.3 MB** | CLOUD_OBJECT_STORAGE (experiment artifacts); holdout subset **sealed** |
| DV fixture trees v0–v4 | `data/karen-decision-validation/v{0..4}/` | **~10 MB** | CLOUD_OBJECT_STORAGE or REGENERATABLE |
| Eval timestamp / split placeholders | `evaluation-timestamps-v0.json`, `split-placeholders-v0.json` | **~29 KB** | GIT (small) or object storage |
| Carve manifest | `.../splits/carve-manifest-v1.json` | **<<1 MB** | **GIT** (config) + object copy |
| Research (worktree) | `data/research/` | **~3.8 MB** | GIT for architecture/perf docs; bulky run dumps → object storage |
| Supervisor (worktree) | `data/supervisor/` | **~0.55 MB** | object storage or GIT if non-secret |
| Lib + scripts | `lib/`, `scripts/` | **~2.8 MB** | **GIT** |
| `.next` | `.next/` | **~63 MB** | **CLOUD_COMPUTE_LOCAL_DISK/CACHE** / REGENERATABLE |
| `node_modules` | (missing) | 0 | REGENERATABLE |
| Secrets | repo-root `.env.local` | n/a | **SECRET_MANAGER** — never Git/datasets/reports |
| Repo-root research/supervisor | `data/research/` ~51 MB, `data/supervisor/` ~12 MB | mirrors | Same rules; do not treat as second raw archive |

### Classification legend (required)

| Class | Meaning |
|-------|---------|
| **GIT** | Source, small manifests, architecture docs, carve rules |
| **CLOUD_OBJECT_STORAGE** | Canonical bytes shared by machines (R2/S3) |
| **CLOUD_COMPUTE_LOCAL_DISK/CACHE** | Ephemeral SSD on VM / laptop working set |
| **SECRET_MANAGER** | API keys only |
| **REGENERATABLE** | Rebuild from raw + code version; optional to store |

### Per-category classification map

| Asset | Class |
|-------|-------|
| Application / DV source (`lib/`, `scripts/`, `app/`) | GIT |
| `carve-manifest-v1.json`, baseline IDs, package.json scripts | GIT |
| Raw `ticks.ndjson` by day | CLOUD_OBJECT_STORAGE (**immutable**) |
| Normalized `candles-1m.json` / fixtures | CLOUD_OBJECT_STORAGE versioned + REGENERATABLE |
| DV run JSON / supervisor FINAL | CLOUD_OBJECT_STORAGE (`experiments/…`); holdout under `sealed/` |
| PIT caches, `.next`, `node_modules` | CLOUD_COMPUTE_LOCAL_DISK/CACHE / REGENERATABLE |
| `TICKSTREAM_API_KEY`, `OPENAI_API_KEY` | SECRET_MANAGER |
| Expand quarter logs | CLOUD_OBJECT_STORAGE (ops) or discard after verify |

### Extrapolation — NQ history storage (from measured raw)

**Method:** measured raw ≈ **46.09 GB / ~1615 day dirs ≈ 29.2 MB/raw-day**. Normalized full archive ≈ **323 MB / 1598 days ≈ 0.20 MB/day**.

Assume **~252 trading days/year** at similar tick density:

| Horizon | Trading days (approx) | Raw (est.) | Normalized 1m (est.) | Raw + norm + ~2× dataset versions / fixtures buffer |
|---------|----------------------:|-----------:|---------------------:|-----------------------------------------------------:|
| **1 year** | 252 | **~7.2 GB** | **~51 MB** | **~8–10 GB** |
| **3 years** | 756 | **~21.6 GB** | **~153 MB** | **~24–28 GB** |
| **5 years** | 1260 | **~36.0 GB** | **~255 MB** | **~40–48 GB** |
| **Current on disk** | ~1615 raw days (~6.3 calendar years) | **~46.1 GB** | **~0.4 GB** | **~47 GB** (+ build caches) |

**Note:** Density varies (sample days ~3–40 MB). Recent high-vol days skew larger; budget **+20–30%** headroom for 2025–2026 vs 2020 averages. L2 depth (if later archived) is **not** in these numbers — OHLC DV does not require it today.

---

## PROPOSED_ARCHITECTURE

### Design goals

1. Desktop ↔ laptop same **canonical code + historical store** without USB/copy.
2. Raw TickStream **immutable**; normalized datasets **versioned** and rebuildable.
3. Long DV jobs run on **remote compute** (laptop can sleep).
4. Jobs **restartable** at day granularity (3h replay ≠ restart from zero).
5. Safe **parallel across days**; **PIT chronology within day**.
6. Holdout sealed after “migration” (design) — DEV tools cannot casually read holdout outcome reports.
7. Boring, low-cost — not enterprise data platform.

### Boring stack (preferred)

```
┌─────────────┐     git push/pull      ┌──────────────────────────────┐
│ Desktop IDE │◄──────────────────────►│ GitHub (desk-copilor)        │
│ Laptop IDE  │                        │ code + small manifests       │
└──────┬──────┘                        └──────────────────────────────┘
       │ awscli/rclone sync                     ▲
       │ (DEV prefixes only by default)         │ checkout
       ▼                                        │
┌──────────────────────────────┐       ┌────────┴─────────┐
│ Cloudflare R2 (S3 API)       │◄─────►│ DV worker VM     │
│ buckets/prefixes:            │ sync  │ Hetzner CX /     │
│  raw/  (immutable)           │       │ Fly Machine /    │
│  normalized/vYYYYMMDD/       │       │ AWS spot         │
│  experiments/dev|val/        │       │ local SSD cache  │
│  experiments/sealed/holdout/ │       └──────────────────┘
│  checkpoints/                │
└──────────────────────────────┘
       ▲
       │ inject at runtime only
┌──────┴──────┐
│ 1Password   │  TICKSTREAM_*  OPENAI_*
│ or Doppler  │  never in R2 objects / git / reports
└─────────────┘
```

**Why R2:** S3-compatible, **zero egress** to internet (important for laptop pull + VM pull), cheap storage. Alternatives: AWS S3 + CloudFront carefully, or GCS; avoid multi-cloud.

**Why one VM not K8s:** DV is Node/tsx batch; day-parallel Promise pool already in-tree (`lib/decision-validation/day-parallel.ts`).

### Canonical layout on object storage

```
s3://karen-nq-history/                    # R2 bucket
  raw/tickstream-nq-history-archive/
    manifest.json
    by-day/YYYY-MM-DD/ticks.ndjson        # IMMUTABLE once checksummed
    by-day/YYYY-MM-DD/manifest.json
  normalized/
    nq-history-archive-1m/
      v2026-08-15/                        # dataset version = build date + code SHA
        candles-1m.json
        dv-fixture-bounded.json
        manifest.json                     # includes raw Merkle / day checksums + builder git SHA
        splits/carve-manifest-v1.json
  experiments/
    dev/                                  # DEV workflows default read
    val/                                  # VAL gate reports
    sealed/holdout/                       # IAM: deny to karen-dev role
  checkpoints/
    jobs/{jobId}/dayYmd.json              # restart tokens
  meta/
    dataset-index.json
```

### Experiment output contract (required fields)

Every DV/experiment artifact JSON/MD must record:

| Field | Example |
|-------|---------|
| `codeVersion` / `gitSha` | `74183b2` |
| `baselineVersion` | `baseline-v2` |
| `datasetVersion` | `nq-history-archive-1m@v2026-08-15` |
| `timestampManifest` | path or hash of asOf list |
| `config` | cadence, limit, split, workers, lookback |
| `pitStatus` | `PASS` / fail count |
| `reproducibilityHash` | hash(sorted day results) or content hash of primary metrics |
| `EDGE_CLAIM` | usually `NONE` |
| `split` | `DEVELOPMENT` \| `VALIDATION` \| `UNTOUCHED_HOLDOUT` |

### Compute model

- **Interactive DEV:** laptop/desktop pulls **normalized DEV window only** (~carve DEV bars ≪ full raw).
- **Long backtest:** submit job on VM (`tmux`/`systemd`) with `datasetVersion` pinned; write checkpoints per completed `dayYmd`; final report → `experiments/{split}/`.
- **Parallelism:** `runDaysInParallel` with workers ≈ vCPU count; **never** parallelize asOfs within a day.

### Repo hygiene

- Keep `.tmp/karen-final-integration/data/karen-decision-validation/acquisition/raw/**` **out of Git** (already worktree-local / gitignored patterns for secrets).
- Commit: architecture doc, carve manifest, small indexes — not candles/ticks.
- Replace hardcoded desktop path in `_load-tickstream-env.ts` with env/`$HOME` discovery only (implementation phase — **not done in this audit**).

---

## DATA_MIGRATION_PLAN

**Status: PLAN ONLY — do not execute in this audit.**

### Principles

1. **Never delete local** until dual checksum verify on second machine + cloud.
2. Raw upload is **append-only**; object keys include `by-day/YYYY-MM-DD/`; overwrite forbidden without explicit break-glass.
3. Normalized rebuild preferred over trusting a single JSON copy — but upload current normalized as `v2026-08-15` for speed.

### Phases

| Phase | Action | Risk control |
|-------|--------|--------------|
| **M0** | Create R2 bucket + keys in secret manager; no data move | Zero data risk |
| **M1** | Upload raw `by-day` with `aws s3 sync`/`rclone` · per-day checksum file | Local untouched; resume sync |
| **M2** | Verify: random sample N days · byte size + sha256 match | Fail → re-upload day only |
| **M3** | Upload normalized as versioned prefix; write dataset manifest with git SHA | Local untouched |
| **M4** | Upload `experiments/dev|val` reports; place holdout reports under `sealed/holdout/` only | No DEV default ACL |
| **M5** | Point laptop at R2; pull **normalized DEV subset** only; smoke DV 1–2 days | Compare fingerprint to desktop |
| **M6** | Only after ≥7 days confidence: mark cloud canonical; keep local as **cold backup** (still don’t delete) | |

### Checksum scheme

- Per day: `sha256(ticks.ndjson)` stored in day `manifest.json` + optional `meta/raw-checksums.jsonl`.
- Dataset version: hash of sorted day checksums + aggregation code version.

### What not to migrate

- `.next/`, `node_modules/`, process PIT caches  
- `.env.local` (secrets → secret manager only)  
- Duplicate repo-root research blobs that are already in Git history  

---

## REMOTE_COMPUTE_PLAN

### Job shape

```text
karen-dv-job:
  image/runtime: node 22 + repo checkout @ gitSha
  inputs:  datasetVersion, split, cadence, limit, baselineVersion, workers
  disk:    pull normalized (or raw→build) to /var/cache/karen/...
  exec:    npx tsx scripts/karen-dv-archive-carve-even-span.ts ...
  checkpoint: after each dayYmd → checkpoints/jobs/{jobId}/{dayYmd}.json
  resume:  skip days with checkpoint + matching reproducibility partial hash
  output:  experiments/{split}/{jobId}.json (+ .md summary)
```

### Restartability (gap → design)

**Today:** TickStream **expand** has day-level progress JSON; **DV multi-hour runs** do not durable-checkpoint mid-job (carve scripts write final/latest JSON).

**Required before relying on cloud overnight:**

1. Persist completed `dayYmd` results under `checkpoints/jobs/{jobId}/`.
2. On start, load checkpoints; skip completed days; continue remaining.
3. Final assemble = deterministic sort by `dayYmd` (already required by `day-parallel.ts`).

This makes a **3h replay** survive laptop off / VM preempt: at worst lose the in-flight day (~minutes), not the whole job.

### VM choices (pick one)

| Option | Spec (indicative) | Best for |
|--------|-------------------|----------|
| **Hetzner CX33/CX43** | 8–16 vCPU · 16–32 GB RAM · local SSD | Best $/CPU; always-on overnight |
| **Fly.io Machine** | scale-to-zero | Occasional jobs |
| **AWS EC2 spot** (c6i.xlarge/2xlarge) | Cheap bursts | Batch with checkpoint (preempt OK) |

Prefer **non-GPU**; workload is JSON + CPU features.

### Parallel safety

- **Allowed:** independent trading days (DEV days only for tuning).  
- **Forbidden:** concurrent asOfs within a day; reading holdout sealed reports from DEV job role.  
- **Output:** sort by `dayYmd`; fingerprint must match serial for sampled days (already proven true for worker-0 in perf note).

---

## LAPTOP_WORKFLOW

1. `git pull` / worktree sync to same `gitSha` as desktop experiments.  
2. Secrets: `op inject` / Doppler CLI → local `.env.local` (no desktop path dependency).  
3. `rclone sync` **normalized DEV** (+ optional small raw sample) to `~/karen-cache/...` — not full 46 GB unless needed.  
4. Run short DV / micro-fixtures locally.  
5. For long jobs: `ssh` or CI-like `karen-dv submit` to VM; laptop may close.  
6. Pull results from `experiments/dev/` only by default.  
7. **Do not** mount/sync `experiments/sealed/holdout/` onto the laptop DEV alias.

---

## DESKTOP_WORKFLOW

1. Continues as primary **ingest machine** while expand still fills gaps (progress JSON shows active day landing).  
2. After M1: `rclone sync` local raw → R2 append-only (cron after each successful day).  
3. Rebuild normalized → publish new `normalized/.../vYYYY-MM-DD/`.  
4. Heavy DV either local (SSD) or same remote job API as laptop.  
5. Supervisor day reports: write to worktree **and** upload to `experiments/dev/` so laptop sees them.  
6. Keep local raw as backup until M6 confidence gate.

---

## BACKUP/RECOVERY

| Layer | Policy |
|-------|--------|
| Code | GitHub (already) |
| Raw ticks | R2 primary after verify + **local cold copy retained** ≥30 days post-cutover |
| Normalized | Rebuild from raw **or** restore versioned prefix |
| Experiments | R2 versioning / soft-delete 30 days |
| Secrets | 1Password recovery; rotate TickStream key if laptop lost |
| Disaster test | Quarterly: new empty dir → pull normalized DEV → run 1-day DV → fingerprint match |

**Recovery priority:** (1) secrets rotate if needed (2) raw from R2 (3) rebuild normalized (4) re-run experiments from manifests.

---

## HOLDOUT_PROTECTION

### Rules (unchanged intent)

- Holdout asOfs **never** enter candidate tuning / selection until Adam unlock.  
- VAL is gate-only — no PnL weight tuning.  
- Measurement disclosure of holdout X/Y/Z may exist historically; **cloud must not make holdout outcomes the default DEV browse path.**

### Cloud controls

| Control | Implementation |
|---------|----------------|
| Path isolation | `experiments/sealed/holdout/**` separate from `experiments/dev/**` |
| IAM | Role `karen-dev`:**Deny** `s3:GetObject` on `sealed/holdout/*`; role `karen-holdout-unlock` only via Adam |
| Job defaults | CLI `--split=DEVELOPMENT` default; `--split=UNTOUCHED_HOLDOUT` requires `KAREN_HOLDOUT_UNLOCK=1` + audit log object |
| Cache hygiene | Laptop sync profiles exclude `sealed/` |
| Report lint | CI/script fails if DEV experiment JSON embeds holdout expectancy fields used for ranking |
| Carve manifest | Keep `sealed: true` in GIT; cloud jobs must load same `archive-carve-v1` |

Historical holdout measurement JSONs already on disk should upload **only** into `sealed/holdout/` during M4 — not into `dev/`.

---

## SECURITY

| Rule | Detail |
|------|--------|
| Secrets never in Git | `.env*` gitignored; fix hardcoded absolute path at implementation time |
| Secrets never in datasets/reports | Redact; e2e harness already flags `TICKSTREAM_` / `OPENAI_API_KEY` leaks |
| Secrets never in R2 | Only data + non-secret manifests |
| Secret manager | 1Password Connect / Doppler / Infisical — inject to VM at start |
| Bucket access | Separate access keys: desktop ingest (write raw), laptop (read normalized+dev), VM (read data + write experiments/checkpoints) |
| TickStream ToS | Treat raw archive as licensed data — private bucket, no public ACL |
| Audit | Every holdout read writes `meta/holdout-access.jsonl` |

---

## ESTIMATED_COST

Indicative USD/EUR, optimize for low cost (2026 ballpark):

| Item | Current ~47 GB | 5y ~40–50 GB | Notes |
|------|----------------|--------------|-------|
| Cloudflare R2 storage | **~$0.70–1.00 /mo** | **~$0.70–1.20 /mo** | ~$0.015/GB-mo; **$0 egress** |
| R2 Class A/B ops | **<$1 /mo** | **<$2 /mo** | sync + job pulls |
| Hetzner CX33 (8 vCPU) | **~€13 /mo** if always-on | same | Or ~few €/mo if powered only for jobs |
| AWS spot c6i.xlarge | **~$0.05–0.15 /hr** | — | Use with checkpoints |
| Secrets (1Password already / Doppler free tier) | **$0–10 /mo** | — | |
| GitHub | existing | — | |

**Steady-state target:** **~$5–20/mo** (R2 + intermittent VM) vs buying a second local copy of 50 GB and babysitting laptop overnight.

TickStream **subscription** cost is orthogonal (already paid for Archive SKU) — cloud does not replace the vendor.

---

## EXPECTED_SPEEDUP

### Local baseline (documented)

| Metric | Value |
|--------|------:|
| Evals/sec (2-day sample, parallel wall) | 15.59 |
| Trading-days/sec | 0.059 |
| 252 trading days @ 5m cadence (est.) | **~71 min** |
| Day-parallel workers=2 speedup | **~1.0×** (I/O bound) |

### Cloud / engineering expectations (order-of-magnitude)

| Change | Expected wall-time effect | Confidence |
|--------|---------------------------|------------|
| Normalized bars on **local NVMe** (VM) vs cold HDD/network | **1.5–3×** vs worst local I/O | Medium |
| Fix data_loading (cache parsed bars / Arrow/Parquet) | **2–4×** (largest bottleneck in profile) | High (matches perf doc) |
| Day-parallel workers = 8 on 8 vCPU after I/O fix | **~5–8×** on multi-day jobs | Medium (needs PIT isolation proof) |
| Combined (cache + 8 workers + NVMe) | **~8–15×** vs current ~71 min/year → **~5–10 min/year** class | Low–medium until measured |
| Raw network pull every job (anti-pattern) | **slowdown** — always cache dataset version on VM disk | High |

**Do not block architecture on full-day profiling** — re-run the existing perf harness on the VM as gate after M5.

---

## RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Accidental local delete during “cleanup” | Critical | Migration plan forbids delete; checksum gate |
| Holdout leakage into DEV sync | High | Sealed prefix + IAM deny + CLI unlock flag |
| Dual mirrors (repo root vs worktree research/supervisor) drift | Medium | Single write path: worktree → R2 → optional promote to Git docs |
| Hardcoded `.env.local` desktop path breaks laptop | High | Remove absolute path; secret manager |
| R2 sync of 46 GB first upload time/failure | Medium | Per-day resume; overnight desktop upload |
| Spot VM preemption mid-day | Medium | Day checkpoints |
| Normalized JSON monolith (213 MB) parse cost | Medium | Future: chunk by day Parquet (REGENERATABLE) |
| TickStream key in shell history / logs | High | Existing no-secret-log discipline; rotate if leaked |
| Treating cloud normalized as truth without raw verify | Medium | Version manifests + rebuild test |
| Cost creep (always-on large VM) | Low | Scale-to-zero / stop VM when idle |
| Git remote typo `desk-copilor` | Low | Already works; rename is cosmetic later |

---

## RECOMMENDED_IMPLEMENTATION_ORDER

1. **Docs + policy only (this audit)** — done; no data move.  
2. **Secret path fix** — remove hardcoded desktop path; document 1Password/Doppler inject for laptop + VM.  
3. **R2 bucket + IAM roles** (`karen-ingest`, `karen-dev`, `karen-holdout-unlock`) — empty.  
4. **Day-checkpoint DV runner** — implement/resume before long cloud jobs (local-first).  
5. **Upload raw by-day** (append-only, checksum) — keep local.  
6. **Upload/publish normalized `v…` + carve manifest**.  
7. **Sealed holdout report placement** + deny policies.  
8. **Laptop smoke:** pull DEV normalized → 1–2 day DV fingerprint match.  
9. **VM job path:** overnight DEV even-span with workers=4..8; compare to desktop report hash.  
10. **Perf pass on VM** — re-run `karen-dv-backtest-performance` suite; only then tune Parquet/cache.  
11. **Optional:** convert candles to per-day Parquet under new dataset version (raw remains source of truth).  
12. **Cutover mental model:** cloud = canonical; local = backup (still no delete until Adam confirms).

---

## Appendix A — Key paths cheat sheet

```
.tmp/karen-final-integration/
  data/karen-decision-validation/acquisition/raw/tickstream-nq-history-archive/
  data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/
  data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/splits/carve-manifest-v1.json
  data/karen-decision-validation/acquisition/reports/
  data/research/karen-dv-backtest-performance.md
  data/supervisor/day-karen-edge-validation-final.md
  lib/decision-validation/day-parallel.ts
  lib/decision-validation/pit-cache.ts
  scripts/_load-tickstream-env.ts          # machine-coupling smell
  scripts/karen-dv-archive-carve-even-span.ts

Repo root mirrors:
  data/research/          (~51 MB)
  data/supervisor/        (~12 MB)
  .env.local              (SECRET — desktop)
  data/research/karen-cloud-backtest-architecture.md  ← this file
```

## Appendix B — EDGE_CLAIM

N/A (infrastructure audit only).
