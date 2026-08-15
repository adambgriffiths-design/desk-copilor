# KAREN — Front-End Residual Bug Audit

**Date:** 2026-08-15  
**Phase:** hardening  
**Mode:** AUDIT ONLY (no fixes implemented)  
**Constraint:** `CONVERSATIONAL_FREEZE_BUGFIX_ONLY`  
**Primary tree:** `.tmp/karen-final-integration/extension/` (manifest `1.4.137`)  
**Parity check:** repo root `extension/` (same manifest version; divergent modules noted below)  
**Priors:** `karen-conversational-freeze-smoke.md`, `karen-short-turn-challenge-composer.md`, `karen-api-base-pin-diagnosis.md`, `karen-reconnect-connection-stability-audit.md`, `karen-online-status-truth-fix.md`, `karen-intent-family-robustness-sweep.md`, `karen-contextual-why-explanation-p1.md`, `karen-berlin-extension-failure-investigation.md`, `karen-pre-launch-behaviour-audit.md`

---

## Executive summary

| Class | Count | Action |
|-------|------:|--------|
| **P0** | **1** | Recommend fix before relying on AUTO/local desk ONLINE truth |
| **P1** | **5** | Recommend fix order below |
| **P2 / POLISH (ignore)** | **11** | Do not work under freeze |

Composer Enter / one-word typed send / explicit preview pin / challenge follow-up / explainError infra sanitisation look **closed in the primary tree** (code + prior focused harness notes). Remaining front-end risk is mostly **connection stickiness**, **tree parity**, **stream orphan bubbles**, and **version/diagnostic skew** — not a broken SEND button.

---

## Cleared in this pass (do not re-open without new Chrome evidence)

| Area | Evidence |
|------|----------|
| One-word typed composer | `enqueueUserMessage` typed path skips STT `shouldDropUserTranscript`; SEND/Enter pass `{ typed: true, source: "composer" }` (`karen-short-turn-challenge-composer.md` PASS) |
| Enter / Shift+Enter | Enter → click SEND; Shift+Enter unchanged |
| Whitespace no-op | trim empty → return before clear |
| Explicit preview vs localhost | `api-config.js` explicit-first; `resolveRequestBase` prefers pin; Options Use Active Preview (`karen-api-base-pin-diagnosis.md` 10/10) |
| Reconnect timer storm / dual Realtime | Guards in `connection-state` / voice reinject (prior reconnect audit) |
| Raw stack/HTTP as Karen chat (common path) | `explainError` + `isInternalLeakText` (pre-launch / contextual-why) |

---

## Parity notes (worktree vs root)

| File | Status | Implication |
|------|--------|-------------|
| `content.js`, `api-config.js`, `options.js`, `manifest.json` | **Identical** | Composer + pin shared |
| `casual-chat.js` | **Worktree ahead** | Root missing LEVEL_PROXIMITY expansions (`distance to`, `around … price`, gated bare `which`, `market`/`it` referents) from intent-family sweep |
| `connection-state.js` | **Root ahead** (~608 vs ~364 LOC) | Root has `isDeskOnline`, `healthDegraded`, SW-wake / receiving-end retry, invalidated reload latch |
| `background.js` | **Root ahead + noise** | Root: `trackSuccess: false` on warm/session, `reinjectDeskScripts`; also leftover debug `fetch` to `127.0.0.1:7739` (Berlin session) |
| `conversation-state.js`, `mentor-intent.js` | **Root only** | Not referenced by either `manifest.json` — dead orphans |

**Operational risk:** Freeze smoke says load `.tmp/karen-final-integration/extension/`. That path has better casual proximity, weaker connection-truth helpers than root. Loading root reverses that. Treat as a first-class residual.

---

## P0 — recommend fix

### P0-1 · Worktree desk ONLINE / request-path truth lag (AUTO + warm)

**REPRO**  
1. Load **worktree** unpacked extension.  
2. AUTO mode (or blank Options) against a local Next that answers `/api/health` then hangs, **or** leave panel open so `/api/warm` succeeds while market routes stall.  
3. Observe RECONNECT `.dc-online` / CONNECTED-style copy vs chat/levels hanging up to ~90s.

**EXPECTED**  
Desk ONLINE only when the request path is usable; warm/session must not keep a false “fresh” hop; hung local must fail closed / fail over (not look connected while chat burns the 90s budget).

**ACTUAL**  
- Worktree `connection-state.js` has **no** `isDeskOnline` / `healthDegraded` (present in root).  
- Worktree `background.js` always `recordRequestSuccess` on `apiFetchTracked` (including warm); root gates with `trackSuccess: false` for warm/session.  
- Panel still toggles `.dc-online` on `connState === "CONNECTED"` only (`content.js`).  
- Chat stream uses `resolveRequestBase` → **`cachedBase` short-circuit with no re-probe** when not explicit (`background.js`); content payloads **do not pass `apiBase`**, so SW cache wins.  
Priors: `karen-reconnect-connection-stability-audit.md`, `karen-online-status-truth-fix.md`.

**FIRST_BROKEN_HOP**  
Worktree connection manager / `resolveRequestBase(cachedBase)` — truth + routing stickiness after health once succeeded.

**LIKELY_OWNER**  
`extension/connection-state.js` + `extension/background.js` (+ shared `api-config.js` AUTO TTL behaviour)

**SMALLEST_FIX**  
Mirror root’s online-truth + `trackSuccess: false` for warm/session into the worktree (or declare root the load path and mirror worktree `casual-chat.js` the other way). On health hard-fail / stream timeout against local: clear `cachedBase` / do not short-circuit chat on stale cache. Do **not** invent a second health system.

---

## P1 — recommend fix (ordered)

### 1) P1-1 · AUTO sticky localhost / hung Next (chat 90s)

**REPRO**  
AUTO mode; local `:3020` (or remembered lastGood) health-ok once then event-loop hung; send any chat turn without manual RECONNECT.

**EXPECTED**  
Fail over to next local / Vercel or fail closed quickly with RECONNECT copy.

**ACTUAL**  
`HEALTH_TTL_MS=120s` + `trustCachedLocal` + `resolveRequestBase` returns `cachedBase` without live probe; content `ensureBackend` can skip ping for 45s when `backendUp`; `pingFailStreak < 3` still returns true. Explicit pin path is largely fixed; **AUTO residual remains**.

**FIRST_BROKEN_HOP**  
`resolveRequestBase` → `cachedBase` before `resolveApiBase` / probe.

**LIKELY_OWNER**  
`extension/background.js` `resolveRequestBase`; `extension/api-config.js` AUTO TTL

**SMALLEST_FIX**  
Chat/TTS: never use `cachedBase` without a live probe when last health age &gt; short TTL or last stream failed; clear cache on stream timeout / hard fail. Prefer existing RECONNECT clear path.

---

### 2) P1-2 · Tree divergence: proximity vs connection (wrong load path)

**REPRO**  
Load root `extension/` and ask proximity paraphrases (`distance to`, `around current price`, bare `which` after levels) **or** load worktree and rely on SW-wake / warm-truth fixes documented for 1.4.131+.

**EXPECTED**  
One canonical unpacked folder has both freeze conversational fixes and connection-truth fixes.

**ACTUAL**  
Worktree wins casual proximity; root wins connection resilience; manifests both claim `1.4.137`.

**FIRST_BROKEN_HOP**  
Ship/load path selection (not a single runtime hop).

**LIKELY_OWNER**  
Integration hygiene — sync `casual-chat.js` ↔ `connection-state.js` / `background.js`

**SMALLEST_FIX**  
One-way merge to a single load tree; bump manifest once; delete unused root-only orphans or wire them deliberately.

---

### 3) P1-3 · Stream cancel / barge-in orphan partial bubbles

**REPRO**  
Start a streaming reply; barge-in (Realtime) or trigger cancel/watchdog mid-delta; send another turn.

**EXPECTED**  
Partial bubble removed or finalized as cancelled; history matches DOM; one clean thread.

**ACTUAL**  
`resetStreamingAssistant()` only nulls `streamAssistantBubble`; DOM + `chatHistory` keep the partial. Barge-in (`content.js` ~6502) cancels stream after nulling pointer. Error paths may then `publishAssistantReply(friendly)` → second bubble (or dedupe skip).

**FIRST_BROKEN_HOP**  
`resetStreamingAssistant` / cancel path — no DOM/history rollback.

**LIKELY_OWNER**  
`extension/content.js` streaming helpers

**SMALLEST_FIX**  
On cancel/error: if `streamAssistantBubble` exists, remove node + pop matching trailing assistant history entry (or mark cancelled), then null pointer — before publishing friendly error.

---

### 4) P1-4 · Preview pin / rotating deployment URL class

**REPRO**  
`PIN_PREVIEW_API_BASE = true` with stale `PREVIEW_BASE` in `api-config.js` after a new Vercel preview; or follow older smoke notes with a different host (`kgv2ibmdp` vs current `lvmufjv3k`).

**EXPECTED**  
Connected host matches the shipset under test; Options “Use active preview” writes the live URL.

**ACTUAL**  
Code currently pins `https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app`. Research notes still mention older hosts. Berlin investigation class: wrong host → prod/old preview behaviour (500s / missing features) while UI looks “connected”.

**FIRST_BROKEN_HOP**  
`PREVIEW_BASE` / pin seed vs actual deploy under test.

**LIKELY_OWNER**  
`extension/api-config.js` (+ Options button); smoke docs

**SMALLEST_FIX**  
When testing a new preview: update `PREVIEW_BASE`, reload extension, Use active preview / RECONNECT. Set `PIN_PREVIEW_API_BASE = false` when leaving preview testing (already noted in prior pin docs).

---

### 5) P1-5 · Extension/server version identity skew

**REPRO**  
Compare panel footer / `DC_VERSION`, `manifest.json`, `/api/health` `version`, `package.json`.

**EXPECTED**  
Operator can tell whether extension and backend shipset match.

**ACTUAL**  

| Signal | Worktree | Root |
|--------|----------|------|
| `manifest.json` | 1.4.137 | 1.4.137 |
| `content.js` `DC_VERSION` / bridge revs | **1.4.73** | **1.4.73** |
| `package.json` | 1.4.79 | 1.4.84 |

Footer shows `v1.4.73` while Chrome reports extension `1.4.137`. Easy to mis-diagnose “version mismatch” or miss a real one.

**FIRST_BROKEN_HOP**  
Version constants not bumped with manifest.

**LIKELY_OWNER**  
`extension/content.js` (`DC_VERSION`), bridge `BRIDGE_REV`, optionally Options debug VERSION line

**SMALLEST_FIX**  
Single source: set `DC_VERSION` = manifest version (or “manifest + backend health” display). No trading-logic change.

---

## P2 / POLISH — ignore list (11)

Do **not** implement under conversational freeze.

1. **Scroll always jumps to bottom** on bubble/typing (`chat.scrollTop = chat.scrollHeight`) — no “only if near bottom”.  
2. **Chat history not persisted** across TV hard refresh (`chatHistory` in-memory; panel size/collapse only in storage).  
3. **SEND never disabled while busy** — queue + “Queued…” by design; not a stuck-disabled bug.  
4. **`friendlyConnectError` default returns raw `msg`** — status line may show browser fetch text (chat path usually sanitized).  
5. **FVG / tracker copy mentioning “redeploy” / backend version floors** — mild infra wording.  
6. **Root Berlin debug ingest** to `127.0.0.1:7739` in `background.js` — leftover agent log.  
7. **Root-only unused `conversation-state.js` / `mentor-intent.js`**.  
8. **Smoke doc URL typo class** — freeze smoke step still cites an older preview host vs current `PREVIEW_BASE`.  
9. **Mobile / small viewport** — panel `min-width` ~340px; TV sidebar product, no mobile breakpoints needed for freeze.  
10. **Duplicate health polling layers** (SW + content heartbeat + warm) — coalesced, not a storm; noise only.  
11. **Manual RECONNECT never exhausts to FAILED** (retry reset) — annoyance / edge case from reconnect audit.

---

## Scope checklist (requested symptoms)

| Symptom | Verdict |
|---------|---------|
| Composer / send failures | Cleared for typed path |
| One-word message failures | Cleared (typed); STT one-word still intentionally dropped |
| Keyboard / Enter | Cleared |
| Disabled send state | No stuck-disabled found (queue instead) |
| Stale preview / base URL | **P1-4** residual (pin/rotate) |
| Reconnect loops | Storms cleared; **stickiness** remains (**P0-1 / P1-1**) |
| Streaming rendering | Deltas OK; **orphan on cancel** (**P1-3**) |
| Duplicated / missing messages | Mostly guarded; cancel/error edge (**P1-3**) |
| Broken scroll | **P2** jump-to-bottom |
| Extension/server version mismatch | Detection broken by skew (**P1-5**); real host skew is **P1-4** |
| State persistence | **P2** in-memory history |
| Incorrect loading state | Watchdog exists; optimism via ensureBackend (**P1-1**) |
| Infra-exposing errors | Mostly cleared; P2 leftovers |
| Mobile / small viewport | **POLISH** ignore |

---

## Recommended fix order (P0/P1 only)

1. **P0-1** — Unify connection-truth (worktree ← root online/warm fixes) **or** standardize load path + same merge.  
2. **P1-1** — Kill AUTO `cachedBase` chat short-circuit on fail/hang.  
3. **P1-2** — Sync `casual-chat.js` ↔ connection/background so one tree is canonical.  
4. **P1-3** — Stream cancel/orphan bubble cleanup.  
5. **P1-4** — Keep `PREVIEW_BASE` honest for the deploy under test; pin off when done.  
6. **P1-5** — Align `DC_VERSION` with manifest (diagnostics only).

---

## Counts

| Metric | Value |
|--------|------:|
| **P0** | **1** |
| **P1** | **5** |
| **P2/POLISH ignore list** | **11** |

**No commit / push / deploy. No implementation this pass.**

---

## Implementation note (2026-08-15)

P0/P1 applied under `CONVERSATIONAL_FREEZE_BUGFIX_ONLY`. See `data/research/karen-frontend-p0p1-fixes.md` for FIXED / DEFERRED / residual risks. Canonical load path remains `.tmp/karen-final-integration/extension/` with critical modules synced to root `extension/`.
