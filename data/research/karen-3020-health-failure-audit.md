# KAREN — AUDIT :3020 HEALTH FAILURE

**Date:** 2026-08-15 ~01:05 local  
**Mode:** AUDIT ONLY. No code changes. No commit/push/deploy. No servers started. Health semantics unchanged.

---

:3000 STATUS:
HTTP **500** (`Internal Server Error`). Not healthy. Listener: `node` PID **10416** (`next dev`, default port). Parent chain: `cmd /c next dev` (10092) → `next` bin (24000) → `start-server.js` (10416). Terminal `823869.txt` (“Start sole Next.js on :3000”) shows early 200s then later **500**; aborted in UI but process tree still listening. Same class of `.next` corruption as :3020.

:3020 STATUS:
HTTP **500** (`Internal Server Error`). Plain text body (not the route’s `{ ok, version }` JSON). Listener: `node` PID **3516** (`next dev -p 3020`). Parent chain: PowerShell `npm run dev:karen` (22092) → npm (15332) → `cmd /c next dev -p 3020` (400) → `next` bin (5968) → `start-server.js` (3516). Terminal `320714.txt`: Ready → `/api/health` **200** twice → then repeated `ENOENT` on `.next/routes-manifest.json` and `Cannot find module './chunks/vendor-chunks/next.js'` → all subsequent `/api/health` **500**.

EXPECTED PORT:
**3020** via `npm run dev:karen` (`package.json`: `"dev:karen": "next dev -p 3020"`). Extension `api-config.js` probes **3020 first**, then 3000/3001/3010, then Vercel. Canonical local Karen backend is :3020 (see `data/research/agent-coordination-board.md`).

PROCESS OWNERS:
| Port | Role | PIDs | Command |
|------|------|------|---------|
| **3020** | Expected Karen backend | 22092→15332→400→5968→**3516** | `npm run dev:karen` / `next dev -p 3020` |
| **3000** | Duplicate default Next | 10092→24000→**10416** | `next dev` (no `-p`) |
| — | Chrome NetworkService (client sockets) | 20572 | not a server |

HEALTH FAILURE ROOT CAUSE:
**Not** `app/api/health/route.ts` (trivial `{ ok: true, version }` + CORS). Runtime Next.js failure from a **corrupted/incomplete shared `.next` cache**: missing `C:\Users\adamg\Projects\desk-copilot\.next\routes-manifest.json` and missing `.next/server/chunks/vendor-chunks/next.js` (confirmed absent on disk). Classification: **dev-cache / dual-server race**, not health-route logic, not Yahoo/market-data. Prior terminals also show agents deleting `.next` while servers ran (`758751.txt`) and bouncing wrong-port `:3000` next to `:3020`, which races the same `.next` directory.

DUPLICATE SERVER RISK:
**HIGH.** Two `next dev` instances share one project `.next`. Extension reconnect/auto-probe tries 3020 then 3000 — both currently 500, so reconnect can flip ports without recovering. Agents historically start `npm run dev` (:3000) instead of `dev:karen` (:3020).

SINGLE SAFEST FIX:
Stop **both** Next listeners (:3000 and :3020), delete `.next`, start **only** `npm run dev:karen`, confirm `http://127.0.0.1:3020/api/health` → **200** `{ok:true,...}`. Do not start a second `next dev` on :3000. Point/reload extension at `http://127.0.0.1:3020` (or blank auto). No health-route code changes.

---

## Evidence notes (audit trail)

- Health GET body on both ports: `Internal Server Error`
- Headers include Next `vary: rsc, next-router-state-tree,...` → Next answering, not a foreign process
- `Test-Path .next/routes-manifest.json` → **False** at audit time
- `app/api/health/route.ts` unchanged conceptually: returns JSON 200 when Next can serve App Router routes
