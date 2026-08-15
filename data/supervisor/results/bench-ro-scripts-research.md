# READ-ONLY audit: scripts/research-run-replay.ts

**Task ID:** bench-ro-scripts-research  
**Category:** diagnostic  
**Date:** 2026-08-14  
**Scope:** `scripts/research-run-replay.ts` only — no code changes.

## Outcome

COMPLETE — static audit of the point-in-time replay CLI. File exists, is wired as `npm run research:replay`, and is 123 lines.

## What the script does

Internal (not user-facing) CLI that:

1. Loads a replay fixture (`--fixture`, default `synthetic-ny-am`) or a research dataset (`--dataset`).
2. Seeks the `ReplayEngine` to `--timestamp` ISO, or to `--index` (default 50 if neither timestamp nor index).
3. Builds a cutoff via `ReplayDataCutoff`, calls `assertNoFutureLeak()`, extracts features, then `buildDeterministicKarenResponse`.
4. Writes `snapshot.json` plus a run manifest under the research run directory.

Entry: `package.json` → `"research:replay": "npx tsx scripts/research-run-replay.ts"`.

## CLI surface (from parseArgs)

| Flag | Behavior |
|------|----------|
| `--dataset <id>` | `loadResearchDatasetFixture` |
| `--fixture <id>` | `loadReplayFixture` (used when `--dataset` omitted) |
| `--timestamp <ISO>` | `engine.seekTo(timestamp)` |
| `--index <n>` | `initialIndex` (default 50) |

If both `--dataset` and `--fixture` are omitted, `datasetId` falls back to `synthetic-ny-am` and the **fixture** loader is used (because `args.dataset == null`).

## Observations (report only — not fixed)

1. **Deterministic Karen path.** Line 67 uses `buildDeterministicKarenResponse`, not the pipeline/`buildKarenReplayResponse` path. Prior research (`research-synthetic-vs-replay-setups`, `research-historical-data-quality`) already recorded this as a labeled divergence: replay CLI LONG/SHORT must not be treated as baseline edge evidence.
2. **Arg parsing is minimal.** No ISO validation; `--index` uses `parseInt` with no NaN/range check. Invalid index would surface from `ReplayEngine`, not the CLI.
3. **Manifest fingerprint** is `snapshot.asOf` (string), `gitHash: null`. Fine for a snapshot CLI; not a content hash of bars/features.
4. **Always writes a run directory.** There is no `--dry-run`. A live invocation creates files under the research runs root.
5. **Sister CLI:** `scripts/research-replay-record.ts` (`research:replay-record`) is the record/export counterpart; this file is snapshot-only.

## Safety

- Allowed path respected: `scripts/research-run-replay.ts` read only.
- No commit, push, deploy, or edits.
- Did not invoke the CLI (would write a new run dir). Prior live uses are documented in `research-nq-replay-ny-open.md` and `research-nq-replay-session-end.md`.

## STOP
