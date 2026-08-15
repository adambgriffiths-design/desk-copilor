# KAREN — Front-end P0/P1 fixes (conversational freeze)

**Date:** 2026-08-15  
**Mode:** `CONVERSATIONAL_FREEZE_BUGFIX_ONLY`  
**Canonical load tree:** `.tmp/karen-final-integration/extension/` (parity synced to root `extension/`)  
**Source audit:** `data/research/karen-frontend-residual-bug-audit.md`

---

## FIXED

### P0-1 — Worktree desk ONLINE / warm-truth lag
- **REPRO confirmed:** worktree lacked `isDeskOnline` / `healthDegraded`; warm/session always `recordRequestSuccess`.
- **Change:** Copied root `connection-state.js` → worktree; promoted root `background.js` (incl. `trackSuccess: false` on `/api/warm` + `/api/session`, `reinjectDeskScripts`) into worktree.
- **Files:** `extension/connection-state.js`, `extension/background.js` (+ worktree twins)

### P1-1 — AUTO `cachedBase` chat short-circuit on hung local
- **REPRO confirmed:** `resolveRequestBase` returned sticky `cachedBase` with no live probe.
- **Change:** AUTO path always goes through `resolveApiBase()` (local probe / HEALTH_TTL). On chat-stream HTTP fail or timeout/abort, `clearStickyBaseAfterStreamFailure` → `clearApiCache()`.
- **Files:** `extension/background.js`

### P1-2 — Worktree ↔ root parity
- **Change:** One-way merge to a single shipset:
  - connection-state + background: root → worktree (then P1-1 applied)
  - casual-chat (LEVEL_PROXIMITY expansions): worktree → root
  - content / tv-bridge / api-config / manifest: kept identical both trees after P1-3/P1-5
- **Verify:** hashes match for the listed modules.

### P1-3 — Stream cancel / barge-in orphan partial bubbles
- **REPRO confirmed:** `resetStreamingAssistant()` only nulled the pointer.
- **Change:** Remove DOM node + pop trailing assistant `chatHistory` entry; also invoke from `cancelActiveChatStream`.
- **Files:** `extension/content.js`

### P1-4 — `PREVIEW_BASE` alignment
- **Status:** Code already pins `https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app` with `PIN_PREVIEW_API_BASE = true`.
- **Change:** Updated `scripts/pin-extension-preview-api.md` to match current `PREVIEW_BASE` + rotate/reload checklist. No code change required this pass.
- **Operator:** When testing a new preview, update `PREVIEW_BASE`, reload extension, Use active preview / RECONNECT; set `PIN_PREVIEW_API_BASE = false` when leaving preview testing.

### P1-5 — `DC_VERSION` / bridge vs manifest
- **Change:** `DC_VERSION` and `BRIDGE_REV` → `1.4.137` (matches `manifest.json`). Options already reads `meta.version`.
- **Files:** `extension/content.js`, `extension/tv-bridge.js`

---

## DEFERRED (P2 / POLISH — ignore under freeze)

All 11 items from the audit ignore list remain deferred, including: scroll jump-to-bottom, in-memory chat history, SEND-never-disabled, Berlin debug ingest `127.0.0.1:7739`, unused root-only `conversation-state.js` / `mentor-intent.js`, duplicate health layers, manual RECONNECT never reaches FAILED.

---

## Verification

| Check | Result |
|-------|--------|
| `npx tsx scripts/test-connection-state.ts` | ok |
| `npx tsx scripts/test-connection-reliability.ts` | ok |
| `test-casual-fallback.ts` / `test-what-are-you-up-to-casual.ts` | blocked by pre-existing missing `@/lib/level-comparative-followup` (unrelated to this patch) |
| Tree hash parity (connection-state, background, casual-chat, content, tv-bridge, api-config, manifest) | identical root ↔ worktree |

No commit / push / prod deploy.

---

## Residual risks

1. **Panel `.dc-online` still keys off `connState === "CONNECTED"`** — now fed by healthier SW truth, but UI does not yet call `isDeskOnline` directly.
2. **content `ensureBackend` 45s / `pingFailStreak < 3` optimism** — not rewritten; mitigated by SW cache clear + resolve probe on chat.
3. **`PREVIEW_BASE` still a manual rotate** — wrong pin still looks “connected” to the wrong shipset until updated.
4. **package.json /api/health version** can still differ from extension `1.4.137` — footer/extension identity aligned; backend shipset is separate.
5. **Berlin debug ingest** remains in `background.js` (P2).

- **P0 residual — `.dc-online`:** FIXED — `updateAgentStatus` drives `.dc-online` / LIVE copy from `isDeskOnline` (snapshot-mapped), not `connState === "CONNECTED"`.
