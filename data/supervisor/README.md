# Cursor Research Supervisor

Local autonomous task queue for desk-copilot research and maintenance work.

## Quick start

```bash
npm run supervisor:pickup -- --check    # list pending inbox tasks
npm run supervisor:pickup               # claim oldest task
npm run supervisor:pickup -- --complete --id <taskId>  # mark done
npm run supervisor                     # dry-run loop (synthetic)
```

Tasks live in `data/supervisor/inbox/` (pending) and `data/supervisor/results/` (reports).

## File layout

| Path | Purpose |
|------|---------|
| `inbox/` | Pending tasks awaiting pickup (atomic claim via rename) |
| `outbox/` | Dispatch mirror of inbox payload |
| `results/` | Agent-written markdown reports (`{taskId}.md`) |
| `backlog.json` | Seed tasks when queue is empty |
| `memory.json` | Completed/failed index — avoids duplicate investigation |
| `executions.jsonl` | Append-only loop history |
| `history.jsonl` | Transcript detection events |
| `state.json` | Last logged event fingerprint (dedup) |
| `pending-pickup.json` | Live signal for Cursor rules (refreshed on dispatch) |
| `queue.json` | Optional persisted queue (crash-recovery with `.bak`) |
| `adaptive-config.json` | Adaptive parallel limits + learned `optimalParallel` |
| `throughput.jsonl` | Batch throughput + adaptive scaling metrics |

## Adaptive parallel concurrency

Supervisor scales independent task workers from CPU/RAM pressure:

- Config: `adaptive-config.json` (or `SUPERVISOR_MIN_PARALLEL`, `SUPERVISOR_MAX_PARALLEL`, `SUPERVISOR_CPU_LIMIT`, `SUPERVISOR_RAM_LIMIT`)
- Under pressure: stop launching new workers; active tasks finish; concurrency scales down
- Recovery: scale back up after stable comfortable batches
- Benchmark: `npm run supervisor:benchmark-parallel` (synthetic read-only tasks only)
- CLI: `npm run supervisor -- --adaptive` (default when `--max-parallel` omitted)

Scheduler prioritizes read-only diagnostics and disjoint dataset/replay scopes. Serialized: overlapping writes, `dependsOn`, same `verifyScript`, dual implementation tasks.

## Detection limitations

The supervisor has **no official Cursor completion webhook**. Completion is inferred best-effort:

1. **Result file (preferred, high reliability)** — agent writes `data/supervisor/results/{id}.md` after pickup; live mode polls this first (`resultFileOnly`).
2. **Transcript polling (fallback)** — reads agent transcript JSONL under `~/.cursor/projects/.../agent-transcripts/`.
3. **`turn_ended` marks completion** — last assistant message before `turn_ended` is parsed for status.
4. **Parent transcript noise** — parent transcripts may reflect unrelated concurrent sessions; subagent transcripts are preferred when available. **Live pilot sessions can false-complete from unrelated chat text.**
5. **Redacted content** — assistant text may be `[REDACTED]`; report capture from transcripts is unreliable.
6. **File dispatch does NOT auto-start Cursor** — dispatch writes inbox + `pending-pickup.json`; an active Cursor session must run `npm run supervisor:pickup` (see `.cursor/rules/supervisor-pickup.mdc`).
7. **Stale result files ignored** — reports with mtime before dispatch are not treated as completion (prevents false positives from prior runs).
8. **Baseline drift** — transcript baseline captured at dispatch; if another session modifies the same transcript, false positives are possible.
9. **WAITING vs COMPLETE** — in-progress transcripts without `turn_ended` may be classified as WAITING when `allowWaiting` is set.
10. **Inbox duplicate suffixes stall pickup** — `listPendingTasks` includes `{id}.json` even if `{id}.claimed.json` or `{id}.completed.json` already exists. `claimTaskById` then returns `already_claimed`, so `npm run supervisor:pickup` can fail while `pending-pickup.json` still shows work.
11. **No claim TTL** — `*.claimed.json` is not auto-released. A crashed/abandoned session leaves the task claimed until `--release` or `--complete`.
12. **Live CLI wait is 120s** — `npm run supervisor -- --live` polls the result file for `waitTimeoutMs: 120_000` then STOPs with `cursor_wait_timeout` and releases the claim. Durable execution is an active Cursor session running pickup → report → complete, plus `npm run supervisor:pickup -- --watch` to refresh the signal.

### Live pickup workflow

1. Supervisor dispatches → `inbox/{id}.json` + `pending-pickup.json`
2. Cursor agent runs `npm run supervisor:pickup` (atomic claim → `{id}.claimed.json`)
3. Agent executes task, writes `results/{id}.md`
4. Agent runs `npm run supervisor:pickup -- --complete --id {id}`
5. Supervisor detects result file and marks queue task complete

**Do not rely on transcript-only completion during live pilot** — always write the result file.

## Safety (auto-STOP)

Tasks outside allowed categories/paths are blocked. Auto-STOP triggers include:

- `human_input_required` — agent asks for user confirmation
- `credentials_or_secrets` — `.env`, API keys, passwords in task/report
- `deployment_proposed` / `git_push_proposed`
- `destructive_deletion` — mass delete commands
- `production_trading_logic` — Karen, decision-layer, verdict-engine changes
- `tickstream_yahoo_authority` — TickStream/Yahoo source changes
- `strategy_substantial_change` — FVG/PD/MSS/BOS rewrites
- `repeated_test_failures` / `repeated_build_failures` — 2+ consecutive failures
- `unsafe_task_scope` — task outside auto-allowed bounds

See `lib/supervisor/safety.ts` for full rules.

## Auto-allowed task categories

`audit`, `diagnostic`, `test-fix`, `build-fix`, `refactor`, `research-infra`, `docs`, `experiment`

Allowed path prefixes: `lib/supervisor/`, `lib/research/`, `scripts/supervisor*`, `scripts/research*`, `data/supervisor/`, `docs/`, `reports/`

## history.jsonl format

Each line records:
- timestamp, status (`COMPLETE` / `ERROR` / `WAITING` / `UNKNOWN`)
- task and report text (from agent transcripts when available)
- git branch and status summary
- detection source and limitations

`state.json` tracks the last logged event fingerprint to avoid duplicates.

**Safety default:** read-only git inspection; no autonomous commit/push/deploy.

## Operator runbook (enqueue + live autonomous)

1. **Enqueue pending work (safe):** `npm run supervisor:control -- priority --prompt "…" --reason "…" [--title "…"] [--category audit]` — creates a `queue.json` pending row (selection authority). Or add a pending task via `queue.create` / careful edit of `queue.json`.
2. **`backlog.json`:** Seeds the queue on empty startup only. It is **not** selection authority once `queue.json` has history (live pilot uses queue as authoritative).
3. **Orphan inbox JSON:** `pending-pickup.json` mirrors `inbox/*.json` only. Orphans without a matching queue `pending`/`running` task confuse Cursor pickup while autonomous exits `low_confidence_next_task`. Archive orphans under `inbox-archive/` — do not unblock blocked queue tasks unless quality gate / README says safe.
4. **Live autonomous:** `npm run supervisor -- --live --autonomous --max-iterations N`. Default live `N=5` (dry-run default 3). Raise `N` to drain a seeded queue. **No long-running daemon** for the live loop; `--watch` is a **one-shot** transcript detect. Each live task waits up to `waitTimeoutMs` 120s for `results/{id}.md` then STOPs with `cursor_wait_timeout` (queue task may stay `running` for resume). Use `--max-parallel 1` under 8GB RAM pressure.
5. **Stop / pause:** `npm run supervisor:control -- stop` or `-- pause` (then `-- resume`).


### Result evaluator gotcha
Live evaluation may mark a report unsuccessful if the markdown contains the substring matching failed. Prefer PASS / incomplete wording in successful reports.

