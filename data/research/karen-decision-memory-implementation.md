# KAREN — Decision Memory Implementation

**Date:** 2026-08-15  
**Mode:** IMPLEMENTATION — shared storage adapter only  
**No commit / push / deploy**

Reference design: `data/research/karen-decision-memory-storage-design.md`

---

## Provider chosen

**Upstash Redis REST** (managed Redis-compatible), via a **zero-dependency fetch client**.

| Choice | Why |
|--------|-----|
| Upstash REST | Works on Vercel serverless; no TCP pool; smallest ops surface |
| No `@upstash/redis` / `@vercel/kv` package | Project had **no** Redis/KV deps; REST JSON commands avoid a new npm dependency |
| Vercel KV env aliases | Same Upstash REST under the hood — accept `KV_REST_API_*` as alternate names |

Not chosen: Postgres/Prisma/SQLite (oversized), local JSONL (ephemeral on Vercel), process RAM alone (fails cross-isolate).

---

## Environment variables required

Set in Vercel (production). **Do not invent credentials. Do not log these values.**

| Variable | Required | Purpose |
|----------|----------|---------|
| `UPSTASH_REDIS_REST_URL` | Yes (or KV alias) | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes (or KV alias) | Upstash REST bearer token |
| `KV_REST_API_URL` | Alt | Vercel KV alias for URL |
| `KV_REST_API_TOKEN` | Alt | Vercel KV alias for token |
| `KAREN_DECISION_MEMORY_TTL_SECONDS` | Optional | Key TTL in seconds. **Default: `86400` (24h)** |

**Local without Redis:** leave URL/token unset → **RAM-only** (existing test behaviour).

**Production:** set URL+token so Analyse write and Chat read share state across isolates.

Server-side only — never expose to the Chrome extension.

---

## Key structure

| Lane | Key | Notes |
|------|-----|-------|
| LIVE | `karen:decision:LIVE` | Single list, newest at end |
| HISTORICAL | `karen:decision:HISTORICAL:{fixtureId}` | Per-fixture lists — never mixed with LIVE |
| HISTORICAL index | `karen:decision:HISTORICAL:__index` | SET of fixtureIds for clear/hydrate-all |

Values: JSON-serialized full `DecisionEnvelopeHistoryEntry` (append-only).

---

## Read / write flow

### Write (Analyse / pipeline)

1. `runDeskPipeline` / quality gate → `recordDecisionEnvelopeHistory`
2. Build full entry (envelope, thesis, conflicts, invalidation, decisionKey, …)
3. L1 dedup (existing LIVE: stateHash+stance+60s; HISTORICAL: hash+fixture+barIndex)
4. Append to L1 ring (cap 80)
5. If Redis configured: queue `LINDEX -1` dedup check → `RPUSH` + `LTRIM -80 -1` + `EXPIRE`
6. Request end awaits `flushDecisionMemoryWrites()` (wired in `chat-engine`, `verdict-engine`)

### Read (Chat history)

1. `hydrateDecisionMemoryFromStore({ lane: "LIVE" })` (wired in `/api/chat/stream` before LIVE history Q)
2. On success: replace L1 from Redis (SoT)
3. On Redis failure: clear L1 for that lane → empty ring → existing honest miss strings
4. Existing APIs: `getDecisionEnvelopeHistory` / `findDecisionAtOrBefore` / `latestDecisionEnvelope` / `answerLiveDecisionHistoryQuery`

No second retrieval engine. No PIT rebuild for “what was your decision at HH:MM?”. No LLM rewrite of WHY.

---

## L1 behaviour

| Mode | L1 role |
|------|---------|
| `ram-only` (no Redis env) | Sole store — same as before |
| `redis` | Same-isolate performance cache only |

- Hit: microsecond in-process after hydrate or local write  
- Miss (cold isolate): hydrate from Redis then lookup  
- Never treat L1 as production SoT when Redis is configured

---

## TTL

- **Default: 86400 seconds (24 hours)** — conservative session-scale retention  
- Configurable via `KAREN_DECISION_MEMORY_TTL_SECONDS`  
- Applied with `EXPIRE` on each successful append  
- After expiry → empty list → honest miss (no invention)

---

## Cap

- **80 entries per key** (`LTRIM` / L1 slice)  
- Not increased in this slice (continuous recorder still out of scope)

---

## Dedup

Preserved existing semantics:

- **LIVE:** same `stateHash` + `stance` within **60s** → keep first (return existing entry; no append)
- **HISTORICAL:** same `stateHash` + `fixtureId` + `barIndex` → keep first

Redis path also checks list tail (`LINDEX -1`) before `RPUSH` for cross-isolate near-dupes.

`decisionKey` is stored and round-tripped as frozen identity; not used to rewrite past WHY.

### Remaining race (documented)

Two isolates can both pass L1 miss + both see a different/absent Redis tail before either `RPUSH` completes → **duplicate appends** possible. List stays append-only (no overwrite of earlier WHY). Lookup still returns a valid recorded envelope. Not solved with Lua/transactions in this slice.

---

## Failure behaviour

| Situation | Behaviour |
|-----------|-----------|
| Redis env absent (local) | RAM-only; tests unchanged |
| Redis configured, hydrate fails | Clear L1 for lane → empty → `NO DECISION AVAILABLE` / recorded-miss wording |
| Redis configured, persist fails | Same-isolate L1 may still have the write; other isolates miss until Redis recovers — never invent |
| Empty store | Honest miss — no PIT, no LLM history rewrite |

---

## Files touched

| File | Role |
|------|------|
| `lib/decision-memory-backend.ts` | REST + in-memory mock backend |
| `lib/decision-envelope-history.ts` | L1 + Redis adapter; hydrate/flush |
| `lib/chat-engine.ts` | `flushDecisionMemoryWrites` after LIVE gate |
| `lib/verdict-engine.ts` | flush after pipeline |
| `app/api/chat/stream/route.ts` | hydrate LIVE before history Q |
| `scripts/test-decision-memory-adapter.ts` | Tests 1–17 (mock Redis) |
| `package.json` | `test:decision-memory-adapter` script |

**Not changed:** trading/ICT/envelope semantics, LLM prompts, continuous recorder, Analyse short-circuit, Postgres, history cap beyond 80.

---

## Test results

### Focused adapter (`npm run test:decision-memory-adapter`)

**49 assertions passed, 0 failed** (covers brief items 1–17):

1. LIVE write → LIVE read  
2. LIVE → latest  
3. LIVE → at-or-before  
4. LIVE → what-changed (`compareDecisionSnapshots`)  
5. HISTORICAL write → read  
6. LIVE/HISTORICAL isolation  
7. Fixture A/B isolation  
8. decisionKey round-trip  
9. entryStatus round-trip  
10. WHY/whyNow round-trip  
11. Full envelope round-trip  
12. LTRIM cap 80  
13. Dedup keep-first  
14. Redis unavailable → honest miss  
15. Local no-Redis → RAM  
16. Empty store → honest miss  
17. Isolate simulation (clear L1, hydrate, retrieve)

### Gate regressions

| Suite | Result |
|-------|--------|
| `test:decision-history-time-travel` | **127 passed, 0 failed** |
| `test:karen-wait-followup` | **142 passed, 0 failed** |
| `test:karen-intent-routing` | **135 passed, 0 failed** |

---

## Measured adapter latency

In-memory mock only (not production network RTT). Purpose: adapter overhead, not LLM.

| Path | Measured |
|------|----------|
| Redis write (record + flush) | ~2.0 ms |
| Redis read (hydrate path sample) | ~0.3 ms |
| L1 hit | ~0.003 ms |
| L1 miss + Redis hydrate | ~0.04 ms |

Production Upstash REST typically adds low-ms network; still dominated by chat LLM (seconds) when LLM runs. This slice is **correctness + cross-isolate memory**, not LLM latency.

---

## Final gate A–I

| Gate | Status | Evidence |
|------|--------|----------|
| **A.** Analyse writes to shared storage | **PASS** | `record` → Redis `RPUSH`; flush in chat-engine / verdict-engine |
| **B.** Chat retrieves after L1 empty | **PASS** | hydrate in chat/stream; test 17 isolate sim |
| **C.** Original DecisionEnvelope unchanged | **PASS** | Round-trip tests 8–11; JSON store of full entry |
| **D.** Original WHY unchanged | **PASS** | whyNow round-trip; append-only (no UPDATE) |
| **E.** LIVE/HISTORICAL isolated | **PASS** | Separate keys; tests 6–7 |
| **F.** Missing history = honest miss | **PASS** | Tests 14–16; hydrate failure clears L1 |
| **G.** Existing 92+ historical tests green | **PASS** | time-travel **127** passed |
| **H.** Intent/follow-up tests green | **PASS** | wait-followup **142**; intent-routing **135** |
| **I.** No trading behaviour changed | **PASS** | Adapter-only; no ICT/envelope/LLM/prompt edits |

---

## Remaining risks

1. **Dual-isolate dedup race** — possible duplicate list entries (see Dedup).  
2. **Credentials not set in prod** — until Upstash env is configured, production remains RAM-affinity broken (same as before).  
3. **TTL 24h** — “yesterday at 09:31” may miss after expiry (intentional session scale).  
4. **HISTORICAL Redis hydrate** not wired on every historical chat path (LIVE is production priority; HISTORICAL still records to Redis when configured; same-process L1 covers research UI).  
5. **Write flush must be awaited** — callers that record without `flushDecisionMemoryWrites` may lose the last write on freeze/shutdown of the isolate before the HTTP Redis call completes.

---

## Explicitly NOT done

- Continuous background recorder  
- Analyse short-circuit / LLM changes  
- Postgres  
- Cap increase beyond 80  
- Commit / push / deploy  
- Inventing Redis credentials
