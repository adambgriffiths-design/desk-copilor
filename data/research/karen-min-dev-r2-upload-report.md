# Karen min-DEV → R2 upload report

**status:** `PASS`

| Field | Value |
| --- | --- |
| status | `PASS` |
| bytes planned vs uploaded | `347151082` planned / `347151082` uploaded (347.15 MB) |
| object count | `14` planned / `14` uploaded / `14` listed under min-dev prefixes |
| checksum verify | `PASS` — 12/12 small objects via HeadObject ChecksumSHA256; 2/2 large objects via download+SHA256 (`candles-1m.json`, `dv-fixture-bounded.json`); sizes 14/14 |
| bucket/prefix | `karen-nq-history` / `normalized/nq-history-archive-1m/v-local/` + `experiments/dev/micro-fixtures/` + `meta/cloud-config/` |
| laptop pull command | see below |

## What completed (2026-08-16)

- Loaded R2 env from `%USERPROFILE%\.config\karen\env` and `.env.local` into the shell (secrets not printed).
- `npm run karen:cloud:status` → `r2.configured: true`, bucket `karen-nq-history`, placeholders cleared.
- Rebuilt `karen:cloud:min-dev-pack` → `totalMB: 347.14`, `missingRequired: 0`.
- Rebuilt inventory/plan (`--profile min-dev` only): `fileCount: 14`, `totalMB: 347.15`, includes large `candles-1m.json` (~221.6 MB) and `dv-fixture-bounded.json` (~110.2 MB).
- Uploaded all 14 plan objects with `aws s3 cp` (no `--delete`).
- Checksum-verified as above; append-only sync state written to `.karen-cache/cloud-sync/min-dev/state.jsonl`.

## Remote layout (min-dev only)

- `normalized/nq-history-archive-1m/v-local/` — 4 objects (candles, dv-fixture, manifest, splits/carve-manifest)
- `experiments/dev/micro-fixtures/` — 2 objects
- `meta/cloud-config/` — 8 objects

## Explicit non-actions

- No commit / push / deploy
- No HOLDOUT / VAL / raw (~46GB) upload
- No `--delete` on any sync/cp
- No secrets printed

## Laptop pull command

After loading the same R2 env on the laptop (names only: `KAREN_R2_*` → `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`):

```powershell
$env:AWS_ACCESS_KEY_ID=$env:KAREN_R2_ACCESS_KEY_ID
$env:AWS_SECRET_ACCESS_KEY=$env:KAREN_R2_SECRET_ACCESS_KEY
aws s3 sync "s3://$env:KAREN_R2_BUCKET/normalized/" `
  "data/karen-decision-validation/acquisition/normalized/" `
  --endpoint-url $env:KAREN_R2_ENDPOINT
# NEVER use --delete

aws s3 sync "s3://$env:KAREN_R2_BUCKET/experiments/dev/micro-fixtures/" `
  "data/karen-decision-validation/micro-fixtures/" `
  --endpoint-url $env:KAREN_R2_ENDPOINT
# NEVER use --delete

aws s3 sync "s3://$env:KAREN_R2_BUCKET/meta/cloud-config/" `
  "config/cloud/" `
  --endpoint-url $env:KAREN_R2_ENDPOINT
# NEVER use --delete
```

Inventory/plan helper (does not pull data by itself):

```text
npx tsx scripts/karen-cloud-r2-sync.ts --profile min-dev --inventory --plan
```
