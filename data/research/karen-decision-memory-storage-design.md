# KAREN — Decision Memory Storage Design

**Date:** 2026-08-15  
**Mode:** AUDIT / DESIGN ONLY — no implementation, no commit/push/deploy  
**Question:** What is the **minimum shared storage** for production `DecisionEnvelope` history so Analyse can record and chat can retrieve later across process/isolate changes?  
**Sources:** `lib/decision-envelope-history.ts`, `lib/decision-time-travel.ts`, `lib/desk-pipeline.ts`, `lib/session-store.ts`, `lib/decision-timeline.ts`, `lib/data-fs.ts`, `DEPLOY.md`, `karen-analyse-chat-runtime-share-audit.md`, `karen-live-decision-recording-path-audit.md`, `karen-continuous-state-speed-audit.md`, `karen-live-decision-history-integrity-audit.md`, `karen-continuous-live-decision-recording-audit.md`

---

## Requirements (must hold)

| # | Requirement | Why |
|---|-------------|-----|
| 1 | Analyse records a decision | `runDeskPipeline` → `recordDecisionEnvelopeHistory({ lane: "LIVE" })` |
| 2 | Chat retrieves it later | `/api/chat/stream` → `answerLiveDecisionHistoryQuery` → ring APIs |
| 3 | Process/isolate change must not erase it | Production Vercel = multi-isolate; cold start empties module RAM |
| 4 | LIVE and HISTORICAL remain isolated | Separate lanes; never mix banners or retrieval |
| 5 | Exact timestamp retrieval | `asOf` index + `findDecisionAtOrBefore` / clock lookup |
| 6 | Original WHY preserved | Full frozen `envelope` (thesis, conflictLog, invalidation, reasoningChain) — no rewrite |
| 7 | `decisionKey` preserved | Frozen at record time (code now stores it; do not re-synthesize as sole identity) |
| 8 | What-changed comparisons remain possible | Compare **two recorded snapshots** only (`compareDecisionSnapshots`) |

**Non-goals for this slice:** continuous background recorder, multi-tenant accounts, long-term research archive, trade fill ledger, sticky single Node host.

---

## Current state (baseline)

```
Analyse / chat pipeline
  → runDeskPipeline
  → recordDecisionEnvelopeHistory
  → module let liveHistory[] / historicalHistory[]  (MAX 80 each)
  → getDecisionEnvelopeHistory / findDecisionAtOrBefore / latestDecisionEnvelope
```

| Property | Today |
|----------|--------|
| Store | Process RAM only (`lib/decision-envelope-history.ts`) |
| Payload | Full `DecisionEnvelopeHistoryEntry` (~8.3 KB/entry fixture probe; envelope ~6.8 KB) |
| Cap | 80 LIVE + 80 HISTORICAL (slice) |
| Dedup | LIVE: same `stateHash`+stance within 60s → keep first; HISTORICAL: hash+fixture+barIndex |
| `decisionKey` | Accepted + written on entry (desk-pipeline passes synthesized key); reply path still falls back to synthesize if missing |
| Shared Analyse→chat | **Local sole `dev:karen`:** yes. **Production Vercel:** no guarantee |
| Disk/DB/Redis for envelopes | **None** |
| Honest miss | Empty → `NO DECISION AVAILABLE` / `live_decision_missing` (safe) |

Prior audits agree: wiring is complete; **affinity / durability** is the production gap (`karen-analyse-chat-runtime-share-audit.md`).

---

## Existing project mechanisms (option E inventory)

| Mechanism | What it stores | Shared across isolates? | Usable as DecisionEnvelope history? |
|-----------|----------------|-------------------------|-------------------------------------|
| `data/session-log.jsonl` (`lib/session-store.ts`) | Verdict **text** + marketContext + ratings | **No** on Vercel — `tryDataWrite` skips read-only FS; DEPLOY.md marks ephemeral | **No** — no envelope / thesis / decisionKey / time-travel API |
| `data/feedback.jsonl` | Hand grades | Same ephemeral FS class | **No** |
| Supervisor `*.jsonl` / queue | Ops memory | Local disk / research tooling | **No** — wrong domain |
| Research replay JSON / decisions.jsonl | Fixture/run artifacts | Local research | HISTORICAL research only; not LIVE prod chat |
| `lib/decision-timeline.ts` (desk-tracker) | Phase/verdict timeline (max 80) | **No** — also module RAM | **No** — not DecisionEnvelope; parallel process-local twin of the same bug |
| `getLastPipelineResult()` | Last in-process pipeline | **No** | Current brief only; not history |
| Trade journal files | Manual journal entries | Local | **No** |

**Verdict on E:** Closest file pattern is append-only JSONL (`session-log` / `feedback`), but hosted FS is read-only/ephemeral and schema lacks the envelope. Desk-tracker timeline is the same RAM affinity failure class. **Do not bolt DecisionEnvelope history onto session-log.**

**Infra note:** `package.json` has **no** Redis / Upstash / KV / Postgres / Prisma / SQLite client today.

---

## Comparison table

Scores: **Good / OK / Poor** relative to production DecisionEnvelope history. Priority order: correctness → latency → memory → cost → simplicity → retention.

| Option | Correctness (cross-isolate + immutable WHY + lanes) | Latency (record + history Q) | Memory (serverless RSS) | Cost | Simplicity | Retention | Fit |
|--------|------------------------------------------------------|------------------------------|-------------------------|------|------------|-----------|-----|
| **A. Current process RAM** | **Poor** — lost on cold start / other isolate; local-only OK | **Good** — µs–ms in-process | **Good** — ~0.6 MB / 80 entries | **Good** — $0 | **Good** — already shipped | **Poor** — dies with process; max 80 | Local/tests only |
| **B. Redis** (Upstash / Vercel KV) | **Good** — shared; lane keys isolate LIVE vs HISTORICAL | **Good** — typically low-ms network | **Good** — payload off-heap | **OK** — small free tier usually enough for ~MB | **OK** — new dep + env; thin adapter over existing API | **OK** — TTL + LTRIM | **Best minimum for prod** |
| **C. Durable database** (Postgres/SQLite remote) | **Good** — strong durability + query | **OK** — usually slower than Redis for ring scan; fine for chat | **Good** | **Poor–OK** — schema, migrations, connection pooling on serverless | **Poor** — heaviest for 80-entry session ring | **Good** — long retention easy | Overkill now |
| **D. Append-only event/log** (stream / JSONL durable) | **Good** — natural immutability; best mental model for “never rewrite WHY” | **OK–Good** — Redis Streams / remote log: low-ms; local JSONL: **Poor** on Vercel | **Good** if remote | **OK** if Redis-backed; **Poor** if local FS | **OK** — same as B if Redis list/stream; worse if new log product | **Good** with trim/TTL policy | **Ideal semantics**; implement **via B** |
| **E. Existing mechanisms** (session-log / desk-tracker / feedback) | **Poor** — wrong schema and/or same RAM/FS limits | Mixed | Mixed | **Good** | **Poor** — force-fit + dual consumers | Mixed | Reject as primary store |

### Requirement checklist

| Requirement | A RAM | B Redis | C DB | D Append log | E Existing |
|-------------|-------|---------|------|--------------|------------|
| Analyse records | Yes (same isolate) | Yes | Yes | Yes | Partial / wrong shape |
| Chat retrieves later | Same isolate only | Yes | Yes | Yes | No (session-log) / same isolate (timeline) |
| Survives isolate change | **No** | Yes | Yes | Yes (if remote) | **No** (Vercel FS / RAM) |
| LIVE ≠ HISTORICAL | Yes (two arrays) | Yes (two keys) | Yes (lane column) | Yes (two streams) | Risky if overloaded |
| Exact `asOf` retrieval | Yes in-process | Yes (scan/index) | Yes | Yes | No for envelopes |
| Original WHY frozen | Yes while alive | Yes if append-only write | Yes if insert-only | **Best** | No |
| `decisionKey` preserved | Yes in RAM | Yes if field stored | Yes | Yes | No |
| What-changed | Yes if both entries present | Yes | Yes | Yes | No |

---

## Recommended minimum production-safe design

### RECOMMENDATION

**B configured as D: shared append-only Redis lists (Upstash Redis or Vercel KV) keyed by lane, with optional process-RAM L1 cache.**

Do **not** introduce Postgres yet. Do **not** extend `session-log.jsonl`. Keep the existing in-memory API surface (`record` / `get` / `findAtOrBefore` / `latest`) as the adapter boundary so `decision-time-travel.ts` stays mostly unchanged.

### Shape (spec only)

```
Keys (examples):
  karen:decision:LIVE          → list of DecisionEnvelopeHistoryEntry JSON (newest at end)
  karen:decision:HISTORICAL    → same, scoped further by fixtureId when present
                                 e.g. karen:decision:HISTORICAL:{fixtureId}

Write (Analyse / pipeline):
  serialize full entry (envelope + thesis + conflicts + invalidation +
                        asOf + recordedAt + decisionKey + stateHash + marketState + …)
  RPUSH lane-key
  LTRIM lane-key -N -1     // N ≈ 80–200 (session window)
  optional TTL on key      // e.g. 24–48h LIVE; HISTORICAL fixture TTL or explicit clear

Read (chat history):
  LRANGE lane-key 0 -1  (or cached L1)
  same findDecisionAtOrBefore / what-changed logic as today

Immutability:
  never UPDATE / overwrite prior list elements
  dedup may skip append (return existing) — same as today — but never mutate past WHY
```

### Why this is the smallest production-safe solution

1. **Correctness first:** Fixes the only blocking production failure mode — Analyse write and chat read on different isolates — without inventing a second decision engine.  
2. **Append-only semantics:** Preserves original WHY / `decisionKey` / what-changed inputs; matches integrity model (no rewrite of earlier envelopes).  
3. **Lane isolation:** Separate keys (and HISTORICAL fixture suffixes) — stronger than hoping one table’s filters never leak.  
4. **Latency:** Low-ms Redis vs chat LLM (seconds) or cold Yahoo; history Q stays off the critical LLM path.  
5. **Memory:** ~8 KB × 80 ≈ **0.6 MB** per lane — trivial for Redis; keeps serverless function RSS small if L1 is capped or optional.  
6. **Cost:** No Redis client in repo today, but free/cheap Upstash tier covers this volume; avoids DB ops tax.  
7. **Simplicity:** One thin persistence adapter behind existing functions; no migrations, no ORM, no sticky hosting redesign.  
8. **Retention:** Cap + TTL = session-scale product memory (aligned with current max 80); honest miss after expiry.

### Optional L1 RAM

Keep today’s rings as **same-isolate cache** after Redis read/write:

- Hit path: microsecond when Analyse→chat land on same warm isolate.  
- Miss path: load from Redis (or empty → honest miss).  
- Never treat L1 as source of truth in production.

Local `dev:karen` can continue RAM-only when Redis env is unset (tests unchanged) — production requires Redis env.

---

## Why not the others

| Option | Why not (for production minimum) |
|--------|----------------------------------|
| **A. Process RAM alone** | Fails requirement 3 on Vercel. Prior audits: production same-runtime is not a product contract. Fine for unit tests and disciplined local sole-process experiments only. |
| **C. Durable database** | Correct but oversized: session ring + at-or-before scan does not need SQL, migrations, or pool warmup. Revisit only if multi-tenant queries, analytics, or multi-week audit trails become product requirements. |
| **D as local JSONL / new file log** | Same class as session-log: `data-fs` / read-only Vercel FS → writes skipped or instance-local. Append-only **semantics** are right; **local disk** is not a shared store. |
| **E. session-log / feedback / desk-tracker timeline** | Wrong payload (no full envelope / WHY), or same RAM affinity bug, or ephemeral FS. Extending session-log would create a dual schema and still fail hosted durability. |

---

## Write / read contract (must preserve)

Recorded entry fields that storage must round-trip unchanged:

- `id`, `asOf`, `recordedAt`, `lane` / `dataMode`
- `stance`, `verdict`, `confidence`, `stateHash`
- full `envelope` (thesis, conflictLog, invalidation, layers, reasoningChain)
- `decisionKey`, `entryStatus`
- `marketState` (price, stateHash, snapshotId, HTF/structure/…)
- HISTORICAL: `fixtureId`, `barIndex`, `asOfEst`

Retrieval rules unchanged:

- Empty / Redis down → deterministic miss strings — **never invent**
- What-changed compares two **stored** snapshots only
- LIVE vs HISTORICAL banners and rings never mix
- Soft LLM “don’t track opinions…” remains safe fallback for non-matching phrasing (do not “fix” by inventing history)

---

## Priority scoring of recommendation

| Priority | How Redis append-lists score |
|----------|------------------------------|
| Correctness | Shared + immutable append + lane keys |
| Latency | Low-ms; dominated by existing chat LLM when applicable |
| Memory | Tiny payload; off function heap |
| Cost | Small; avoid DB |
| Simplicity | Adapter + env; reuse APIs |
| Retention | LTRIM + TTL = intentional session window |

---

## Open questions

1. **Provider:** Upstash Redis vs Vercel KV vs other managed Redis — pick for least ops friction with current Vercel host (not decided here).  
2. **Cap N:** Keep 80 vs raise to ~200 if continuous recorder lands later (more minutes of material changes).  
3. **LIVE TTL:** End-of-session clear vs rolling 24–48h — product preference for “yesterday at 09:31” (integrity audit already flags LIVE clock day-bleed).  
4. **HISTORICAL in Redis?** Research/fixture PIT may stay process-local; production chat history is LIVE-first. Mixing both in Redis is fine if keys stay isolated.  
5. **Dedup policy:** Today’s 60s same-hash+stance keep-first can drop thesis drift — storage design should not lock that in; decide separately.  
6. **Multi-user / multi-desk:** Single trader today — key prefix by user/session if that changes.  
7. **Failure mode on Redis outage:** Fail-open to RAM-only (local miss risk) vs fail-closed honest miss always — prefer **honest miss** for correctness.  
8. **Write amplification:** Continuous recorder (not built) must still gate appends on material change or Redis fill + cost grow.  
9. **Encryption / PII:** Envelopes are market decisions — confirm no secrets; still treat Redis as production data.  
10. **Index vs scan:** At 80–200 entries, LRANGE + in-memory `asOf` scan is enough; secondary index only if caps grow large.  
11. **Production hit-rate measurement:** Runtime-share audit probe §C still unrun — use after store lands to validate Analyse→chat visibility.  
12. **decisionKey uniqueness:** Current LIVE key uses `LIVE@?|stance|verdict|asOf` — confirm stable enough as frozen identity under store (integrity case 6).

---

## Explicitly NOT YET

- Implementing Redis adapter or env wiring  
- Continuous background recorder  
- Postgres / Prisma / new research archive  
- Rewriting session-log into envelope store  
- Sticky long-lived Node / leaving Vercel solely for affinity  
- Mentor wording changes for soft-refusals  
- Fixing LIVE session-boundary clock leak / soft skew (integrity gaps — orthogonal to store choice)  
- Commit / push / deploy

---

## RISKS (if/when implemented)

| Risk | Mitigation |
|------|------------|
| Redis down → empty history | Honest `NO DECISION AVAILABLE`; never fabricate from LLM |
| Dual-write race (two isolates append same decision) | Keep existing dedup key (`stateHash`+stance+window) or idempotent `decisionKey` check before RPUSH |
| Unbounded continuous appends | Material-change gate + LTRIM + TTL |
| HISTORICAL bleed into LIVE | Hard separate keys; never union in retrieval |
| L1 RAM stale vs Redis | Treat Redis as truth; L1 invalidate on write or short TTL |
| Ops/cost creep | Cap N; monitor key size; no full DB yet |
| False confidence pre-store | Do not ship production “mentor remembers Analyse” story on RAM alone |

---

## Stop

Design audit complete. No implementation, commit, push, or deploy.
