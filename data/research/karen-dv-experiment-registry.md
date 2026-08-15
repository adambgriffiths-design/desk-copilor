# KAREN — Decision Validation Experiment Registry

**PHASE:** research infrastructure  
**MODE:** lightweight scaffolding  
**EDGE_CLAIM:** NONE  
**HOLDOUT:** SEALED (registry-enforced)  
**VALIDATION_TUNING:** FORBIDDEN (registry-enforced)  
**TREE:** `.tmp/karen-final-integration/`  
**WIRED TO:** [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md)

---

## Purpose

Every Decision Validation (DV) experiment must be recorded so runs are never lost, duplicated, or compared under mismatched conditions (especially different timestamp manifests).

This registry is **metadata-only scaffolding**. It does **not** run historical replay or expensive DV.

---

## Locations

| Artifact | Path |
|----------|------|
| Types + guards + store API | `lib/decision-validation/experiment-registry.ts` |
| Auto-build from run (identity lock) | `lib/decision-validation/experiment-record-from-run.ts` |
| JSON Schema | `data/karen-decision-validation/experiments/schema.json` |
| Registry store | `data/karen-decision-validation/experiments/registry.json` |
| CLI | `scripts/karen-dv-experiment-registry.ts` |
| Smoke test (registry guards) | `scripts/test-karen-dv-experiment-registry.ts` |
| Smoke test (auto-record + locks) | `scripts/test-karen-dv-experiment-record-from-run.ts` |
| This doc | `data/research/karen-dv-experiment-registry.md` |

---

## Required fields (every experiment)

| Field | Notes |
|-------|--------|
| `experiment_id` | Stable unique id |
| `date` | Calendar date of registration / run |
| `git_tree_state` | Git SHA and/or tree path label |
| `trading_brain_baseline` | e.g. `baseline-v2` |
| `candidate_version` | Candidate / family id |
| `single_change` | **Exactly one** change vs baseline (required; scaffold placeholder rejected) |
| `dataset_version` | e.g. `archive-carve-v1` |
| `split` | `DEV` \| `VALIDATION` \| `HOLDOUT` |
| `timestamp_manifest` | Path and/or content hash of asOf set — **identity-critical** |
| `evaluation_cadence` | e.g. 10 |
| `number_of_days` | X trading days covered |
| `evaluation_points` | Y |
| `actionable_episodes` | STRICT episode count when applicable |
| `pit_violations` | Must be 0 for promotion packages |
| `dq_exclusions` | Count of mechanical DQ drops |
| `stance_counts` | LONG / SHORT / WAIT / NO_TRADE |
| `metrics` | MFE, MAE, target-before-inv, proxyR, opportunities/day |
| `hypothesis` | Pre-declared claim |
| `result` | Measured summary |
| `decision` | `reject` \| `research` \| `promote` \| `pending` \| `incomplete` |
| `notes` | Free text (tune keywords on VAL are blocked) |
| `reproducibility_hash` | sha256 of identity fingerprint |

Maps to protocol outcomes: **REJECT** / **RESEARCH_MORE** / **PROMOTE_TO_VALIDATION**.

---

## Auto-record from DV runners (HOW_TO_USE)

Shared helper: `buildExperimentRecordFromRun` / `previewExperimentRegistration` / `registerExperimentFromRun` in `lib/decision-validation/experiment-record-from-run.ts`.

### Always dry-run / preview first

```bash
# Tiny fixture — no heavy replay
npm run karen:dv-preview-registry
# or
npx tsx scripts/karen-decision-validation-v0.ts --preview-registry \
  --candidate=cand-example-v1 \
  --single-change="one knob description"

# After gates pass (repro intact + PIT==0 + HOLDOUT/VAL guards):
npx tsx scripts/karen-decision-validation-v0.ts --register-experiment \
  --candidate=cand-example-v1 \
  --single-change="one knob description"
```

Carve / even-span runners accept the same flags after their normal measurement path (uses already-computed splitResults — no extra replay):

```bash
npx tsx scripts/karen-dv-archive-carve-even-span.ts --smoke --skip-fullspan \
  --only=DEVELOPMENT --preview-registry \
  --candidate=cand-carve-smoke --single-change="carve wiring smoke"
```

Aliases:

| Script | Purpose |
|--------|---------|
| `npm run karen:dv-preview-registry` | v0 runner + `--preview-registry` |
| `npm run karen:dv-register-experiment` | v0 runner + `--register-experiment` |
| `npm run test:karen-dv-experiment-record-from-run` | Synthetic smoke (no DV replay) |

### CLI flags (runners)

| Flag | Effect |
|------|--------|
| `--preview-registry` | Build locked record + print gate status (dry-run; no write) |
| `--dry-run` | Same as preview when register is not forced |
| `--register-experiment` | Register only if reproducibility + PIT==0 (+ existing guards) |
| `--candidate=` / `--single-change=` / `--dataset-version=` | Experiment identity inputs |
| `--hypothesis=` / `--notes=` / `--decision=` | Non-identity narrative |
| `--allow-holdout` | Required (with env unlock) for HOLDOUT split |

---

## CLI (manual ledger)

```bash
npx tsx scripts/karen-dv-experiment-registry.ts --list
npx tsx scripts/karen-dv-experiment-registry.ts --list --split=DEV
npx tsx scripts/karen-dv-experiment-registry.ts --show <experiment_id>
npx tsx scripts/karen-dv-experiment-registry.ts --sample
npx tsx scripts/karen-dv-experiment-registry.ts --hash --from entry.json
npx tsx scripts/karen-dv-experiment-registry.ts --register --from entry.json
npx tsx scripts/karen-dv-experiment-registry.ts --register --from entry.json --dry-run
```

Smoke (no DV replay):

```bash
npx tsx scripts/test-karen-dv-experiment-registry.ts
npx tsx scripts/test-karen-dv-experiment-record-from-run.ts
```

---

## How accidental misuse is blocked

### Identity lock (post-run)

Once `buildExperimentRecordFromRun` returns, these fields are **locked** and cannot be manually overridden:

`experiment_id`, `git_tree_state`, `trading_brain_baseline`, `candidate_version`, `single_change`, `dataset_version`, `split`, `timestamp_manifest`, `evaluation_cadence`, `number_of_days`, `evaluation_points`, `reproducibility_hash`

Attempts throw `IdentityLockError` / `IDENTITY_LOCKED`. Narrative fields (`notes`, `result`, `hypothesis`, `decision`, metrics) may still be patched via `applyNonIdentityOverrides`.

### Register only after gates

`registerExperimentFromRun` requires:

1. **Reproducibility** — stored hash matches recomputed fingerprint  
2. **PIT clean** — `pit_violations === 0` (rejects PIT>0 before any write)  
3. Then existing registry guards (HOLDOUT / VAL / duplicate fingerprint / single_change)

### Duplicate experiments

Registration computes a **reproducibility fingerprint** over:

`trading_brain_baseline`, `candidate_version`, `single_change`, `dataset_version`, `split`, `timestamp_manifest`, `evaluation_cadence`, `number_of_days`, `evaluation_points`, `git_tree_state`

Identical fingerprints → `DUPLICATE_FINGERPRINT`.  
Different `timestamp_manifest` values produce different hashes — do **not** treat those runs as paired/identical.

### Forgotten parameter changes

- `single_change` is mandatory and must not be the scaffold placeholder.
- Fingerprint includes cadence / Y / days / baseline / git tree — silent param drift changes the hash.

### HOLDOUT access

- Split `HOLDOUT` / `UNTOUCHED_HOLDOUT` is **SEALED** by default → `HOLDOUT_SEALED`.
- Unlock requires **both** `KAREN_DV_HOLDOUT_UNLOCK=1` **and** CLI `--allow-holdout` (Adam-only).

### Candidate tuning on VALIDATION

Per [`karen-dev-to-validation-protocol.md`](./karen-dev-to-validation-protocol.md):

1. VAL registration requires a prior DEV entry with `decision=promote` for the same `candidate_version` (or `promote_from_experiment_id`).
2. At most **one** VALIDATION entry per `candidate_version`.
3. Notes/result containing tune / retune / threshold-edit / calibrat* → `VALIDATION_TUNING_FORBIDDEN`.

---

## Sample empty registry entry

```json
{
  "experiment_id": "exp-scaffold-0000",
  "date": "1970-01-01",
  "git_tree_state": "TREE:.tmp/karen-final-integration/ git:unknown",
  "trading_brain_baseline": "baseline-v2",
  "candidate_version": "none",
  "single_change": "(scaffold — replace with exactly one change)",
  "dataset_version": "archive-carve-v1",
  "split": "DEV",
  "timestamp_manifest": "unset",
  "evaluation_cadence": null,
  "number_of_days": null,
  "evaluation_points": null,
  "actionable_episodes": null,
  "pit_violations": null,
  "dq_exclusions": null,
  "stance_counts": { "LONG": null, "SHORT": null, "WAIT": null, "NO_TRADE": null },
  "metrics": {
    "mfeMedian": null,
    "maeMedian": null,
    "targetBeforeInvalidationRate": null,
    "proxyRMean": null,
    "opportunitiesPerDay": null
  },
  "hypothesis": "",
  "result": "",
  "decision": "incomplete",
  "notes": "",
  "reproducibility_hash": "<sha256 of identity fields>",
  "promote_from_experiment_id": null
}
```

Generate via: `npx tsx scripts/karen-dv-experiment-registry.ts --sample`

---

## Protocol wire note

Promotion gates, REJECT / RESEARCH_MORE / PROMOTE_TO_VALIDATION semantics, and VAL one-shot rules live in **`karen-dev-to-validation-protocol.md`**. This registry is the machine-checkable ledger that prevents HOLDOUT peek and VAL tuning loops when experiments are registered.

### Walk-forward OOS (temporal design)

Primary methodology: [`karen-walk-forward-oos-protocol.md`](./karen-walk-forward-oos-protocol.md) · config `data/karen-decision-validation/configs/walk-forward-anchored-v1.json` · loader `lib/decision-validation/walk-forward-anchored.ts`.

| Rule | Registry implication |
|------|----------------------|
| Inner WF OOS folds | Register as measurement runs with fold id in `timestamp_manifest` / notes; **do not** retune candidates from OOS metrics |
| Carve VAL | Still requires prior DEV `decision=promote`; one VAL entry per candidate |
| Holdout | Still sealed — WF never authorizes HOLDOUT split |
| Random k-fold | Forbidden — do not register shuffle-CV experiments as Karen DV evidence |

**EDGE_CLAIM:** NONE  
**HOLDOUT_STATUS:** SEALED  
**VALIDATION_TUNING:** FORBIDDEN  
**OOS_RETUNING:** FORBIDDEN  

---

## Ledger note (2026-08-15) — c1 binary WAIT gate

| experiment_id | split | decision | Note |
|---------------|-------|----------|------|
| `exp-c1-wait-entry-actionable-dev-protocol-2026-08-15` | DEV | `research` (historical smoke) | **Superseded** by Y=1500 reject |
| `exp-c1-wait-entry-actionable-dev-y1500-2026-08-15` | DEV | **`reject`** | Gate 10 + VAL proxyR fail; hash `991f7d82…`; **no promote**; VAL not registered (would require promote) |
| Production ALS | — | `none` | Unchanged |

Next programme direction: `c4_shadow_quality_gated_wait` — **diagnostic complete** (`karen-c4-shadow-quality-gated-wait.md`): `CLEAR_PIT_SAFE_DISCRIMINATOR=NO` → **C4_DEFINED NO** → not registered / not scored. `DECISION=RESEARCH_MORE`. Do not invent a weak unlock rule.
