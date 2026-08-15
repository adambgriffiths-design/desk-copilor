# Berlin extension failure — investigation (in progress)

**Mode:** Investigate only · Debug session `9c9bf7`  
**Date:** 2026-08-15

## Hypotheses

| ID | Hypothesis |
|----|------------|
| **A** | Extension hits **production** `desk-copilor.vercel.app` (1.4.64) or sticky localhost — not the preview. Prod rejects informal `whats` with HTTP 500 `Not a casual question`; joke still instant-passes. |
| **B** | Extension hits preview correctly but takes a non-stream path (`needsSearch` / live CHAT) that fails for capital questions. |
| **C** | Stream succeeds on preview but extension SSE/accept path empties the reply → `localCasualReply` → failure template. |
| **D** | Timeout / hung base causes Berlin (LLM stream) to fail while joke (single `done`) still completes. |
| **E** | Client short-circuit (`canUseInstantLocal` / local general) publishes failure without calling the API. |

## Runtime evidence already collected (no extension)

### Preview `https://desk-copilor-s28pi6t4b-adam-b45d.vercel.app` (protection disabled)

| Prompt | Result |
|--------|--------|
| health | `{"ok":true,"version":"1.4.73"}` |
| `tell me a joke` + `casualOnly` + messages | **200** single `done` (ladder joke) |
| `whats the capital of berlin` | **200** SSE deltas + Berlin answer |

### Production `https://desk-copilor.vercel.app`

| Prompt | Result |
|--------|--------|
| health | `{"ok":true,"version":"1.4.64"}` |
| `tell me a joke` | **200** instant done |
| `whats the capital of berlin` | **500** (matches extension failure pattern) |

### Joke vs Berlin (server)

| | Joke | Berlin |
|--|------|--------|
| OpenAI | 0 (instant canned) | 1× gpt-4o-mini stream |
| SSE shape | one `done` | many `delta` then `done` |
| Preview | PASS | PASS |
| Prod 1.4.64 | PASS | FAIL gate |

### Extension code notes (primary loaded tree)

- Auto API resolution: localhost → **production** — never the preview unless Options `apiBaseUrl` is set to the preview host.
- Failure bubble: `CASUAL_LLM_FAILURE_REPLY` via `localCasualReply` when stream errors / empty.
- `canUseInstantLocal` is greetings/farewells only — not Berlin (rejects **E** as primary unless greeting misroute).
- Server `needsWebSearch("capital of")` returns **false** (general knowledge via casual LLM). Extension mirror also does not force web search for capital.

## Instrumentation added (awaiting repro)

Primary Chrome extension (likely loaded path):

- `extension/api-config.js` — resolved base + version
- `extension/background.js` — stream base, HTTP fail status/error, success
- `extension/content.js` — `replyCasual` needsSearch / instantLocal

Reload the unpacked extension after these edits.

## Status

**ROOT CAUSE:** not claimed until extension logs confirm which base/path the Chrome request used.  
Strongest leading candidate: **Hypothesis A** (wrong base → prod 1.4.64).
