# KAREN — Analyse ↔ Chat Runtime Share Audit

**Date:** 2026-08-15  
**Mode:** AUDIT ONLY — temporary HTTP probes deleted after test; no short-circuit / Redis / DB / new cache / continuous recorder; no commit/push/deploy  
**Question:** Do Analyse (`/api/live-verdict`) and Chat (`/api/chat/stream`) share the same Node process / in-memory singletons on local `dev:karen`, and can that be relied on in deployment?

---

LOCAL SAME PROCESS: YES
LOCAL PID: 21812
CHAT PID: 21812
ANALYSE PID: 21812
LOCAL CROSS-ROUTE MEMORY: YES

DEPLOYMENT MODEL: Vercel serverless Next.js (`DEPLOY.md`, `vercel.json` framework-only, extension `PRODUCTION_BASE=https://desk-copilor.vercel.app`)
DEPLOYMENT ISOLATE SHARING: NO
CROSS-ROUTE MEMORY: NO

CHAT → ANALYSE RESULT: HIT (warm) — LIVE ring + `getLastPipelineResult` + `liveIntelCache` all visible; same `process.pid=21812`
ANALYSE → CHAT RESULT: HIT (warm) — LIVE ring + `getLastPipelineResult` + `liveIntelCache` all visible; same `process.pid=21812`

RESTART BEHAVIOUR: In-memory only. Full OS restart of `dev:karen` was not performed (sole healthy listener preserved). Observed equivalent wipe: first compile of a new probe route mid-test cleared LIVE to `liveLen=0` while PID stayed `21812` (HMR / module re-eval). Code: `let liveHistory` / `let lastPipeline` / `let liveIntelCache` — no disk/Redis.

MAIN FINDING: On a single healthy `npm run dev:karen` (`next dev -p 3020`), Analyse and Chat HTTP handlers share one Node process and the same module singletons (empirically proven both directions). That does **not** make in-memory Analyse→Chat reuse a product contract: Vercel has no isolate affinity, dual local Next ports break sticky extension base, and HMR/restart empties RAM. An in-memory Analyse short-circuit cannot be relied upon across routes.

---

## Controlled cross-route test (HTTP, existing in-memory only)

**Setup**
- `:3020` health `200` `{"ok":true,"version":"1.4.84"}` — did **not** start a second server.
- Listener PID **21812** = `node …/next/dist/server/lib/start-server.js` under `npm run dev:karen` / `next dev -p 3020`.
- No listeners on `:3000`/`:3001`/`:3010` at test time.
- Temporary audit routes (deleted after):
  - `POST/GET /api/chat/runtime-share-probe`
  - `POST/GET /api/live-verdict/runtime-share-probe`
- Probes used **existing** APIs only: `recordDecisionEnvelopeHistory` / history read, `replaceLastPipelineResult` / `getLastPipelineResult`, `rememberLiveDeskIntelligenceCache` / `peekLiveDeskIntelligenceCache`. Unique `decisionKey` / thesis markers. No new global store.

**Cold first pass (compile artifact — not a durable split)**  
CHAT write `AUDIT-C2A-…` → `liveLen=1` pid 21812; ANALYSE read immediately after first load of analyse probe → `found=false` `liveLen=0` (same pid). Then ANALYSE→CHAT hit. Same-route re-read of CHAT marker missed — ring reset under same PID → classic Next HMR/module re-eval, not two OS processes.

**Warm re-run (authoritative)**

| Direction | Marker | Write pid | Read pid | LIVE found | lastPipeline | liveIntelCache |
|-----------|--------|-----------|----------|------------|--------------|----------------|
| CHAT→ANALYSE | `AUDIT-C2A2-20260815014510-5da104c7` | 21812 | 21812 | YES | YES | YES |
| ANALYSE→CHAT | `AUDIT-A2C2-20260815014511-53e710ad` | 21812 | 21812 | YES | YES | YES |

Both markers remained visible from both routes afterward (`liveLen=3`, both `found=true`, pipe/intel match on latest).

---

## Checklist (13)

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Local `dev:karen` | YES | Sole Next on 3020; parent tree `npm run dev:karen` → `next dev -p 3020` → start-server **21812** |
| 2 | Next runtime | `nodejs` both | `app/api/live-verdict/route.ts` + `app/api/chat/stream/route.ts` export `runtime = "nodejs"` (stream also `dynamic = "force-dynamic"`) |
| 3 | PID | 21812 | Probe responses + `Get-NetTCPConnection` OwningProcess |
| 4 | Same Node runtime | YES (local sole) | Identical `process.pid` on chat + analyse probes |
| 5 | Serverless isolation | YES in prod model | Vercel Node serverless; no session affinity / shared RAM contract in `DEPLOY.md` / `vercel.json` |
| 6 | Workers | Request path single process | HTTP hits start-server **21812**; npm/next wrapper PIDs exist but do not serve separate rings |
| 7 | Process memory shared | YES local sole | Warm bidirectional HIT on three singletons |
| 8 | `getLastPipelineResult` cross-route | YES local | Warm: `lastPipelineMatch=true` both directions |
| 9 | LIVE ring cross-route | YES local | Warm: `found=true` / matching `decisionKey` both directions |
| 10 | `liveIntelCache` cross-route | YES local | Warm: `liveIntelMatch=true` both directions |
| 11 | Restart | Empties RAM | Module `let` only; HMR wipe observed; full bounce not run |
| 12 | Different isolate | Breaks sharing | Prod multi-instance / cold start; local second Next on other port + sticky wrong base |
| 13 | Deployment isolate sharing | NO | Hosted Vercel; filesystem notes already ephemeral (`session-log.jsonl`); LIVE ring same class |

---

## Extension path (not inferred from “localhost:3020” alone)

```
Chrome extension
  extension/api-config.js → cachedBase / rememberBase / LOCAL_CANDIDATES (3020 first)
  Analyse: background/content → apiFetchTracked("/api/live-verdict")
       → generateChartAnswer → … → runDeskPipeline
       → recordDecisionEnvelopeHistory({ dataMode: "LIVE" })
  Chat:   background → fetch(`${base}/api/chat/stream`)
       → isDecisionHistoryTimeQuery → answerLiveDecisionHistoryQuery
       → getDecisionEnvelopeHistory("LIVE") / latestDecisionEnvelope
```

Same sticky `cachedBase` is required. Dual healthy locals (3020 vs 3000/3010) can latch Analyse and Chat onto **different** processes even though both are “localhost” — that is a separate failure mode from Vercel isolate hop.

---

## Code anchors (wiring complete; affinity is the gap)

- LIVE ring: `lib/decision-envelope-history.ts` — `let liveHistory` (max 80), not `globalThis`, not durable.
- Analyse write: `lib/desk-pipeline.ts` → `recordDecisionEnvelopeHistory` after LIVE contract.
- Chat read: `app/api/chat/stream/route.ts` → `answerLiveDecisionHistoryQuery`.
- Same-class process-local: `lastPipeline` (`desk-pipeline.ts`), `liveIntelCache` (`market-intelligence.ts`).

---

## Implication

| Environment | Cross-route in-memory | Reliable for Analyse short-circuit / mentor LIVE history? |
|-------------|----------------------|--------------------------------------------------------------|
| Sole local `dev:karen` :3020 | Empirically YES | OK for local experiments only |
| Local multi-Next / wrong sticky port | NO | Fragile |
| Vercel production | NO affinity | **No** — do not ship correctness on shared RAM |

**An in-memory Analyse short-circuit cannot be relied upon across routes.**

No performance claims (none measured). No live-market claims (CME closed; probes used synthetic markers only).

---

## Stop

Audit complete. Temporary probe routes removed. No product implementation, commit, push, or deploy.
