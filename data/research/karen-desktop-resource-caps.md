# Karen desktop resource caps

**Date:** 2026-08-16  
**Machine:** ~8GB RAM desktop (desk-copilot host)  
**Scope:** Editor / agent / cache hygiene only — no trading-code changes.

## Current machine pressure

- RAM: ~96% used (~0.3GB free of ~8GB). Desktop feels pegged; Cursor + TS server + agents compete for the same small free headroom.
- Disk: OK (~165GB free). Pressure is CPU/RAM concurrency, not storage capacity — but duplicate stamp/cache copies can still thrash I/O and inflate watcher load.

## Caps applied (safe / reversible)

### Cursor user settings

Path: `%APPDATA%\Cursor\User\settings.json`  
(`C:\Users\adamg\AppData\Roaming\Cursor\User\settings.json`)

| Cap | Value | Why |
| --- | --- | --- |
| `typescript.tsserver.maxTsServerMemory` | `1536` | Cap TS language service (prefer 1536 on 8GB host vs 2048) |
| `files.watcherExclude` | heavy dirs listed below | Cut file-watcher CPU/RAM on huge trees |
| `search.exclude` | same heavy dirs | Keep workspace search off stamp/cache/build trees |
| `files.exclude` | `**/.karen-cache` | Hide cache from explorer (optional; not already present) |

Heavy paths excluded from watchers + search:

- `**/data/karen-decision-validation/**`
- `**/.karen-cache/**`
- `**/.tmp/**`
- `**/node_modules/**`
- `**/.next/**`
- `**/data/ict-transcripts/**`
- `**/data/research/runs/**`

Preserved existing user keys: `window.commandCenter`, `files.autoSave`, `cursor.inlineDiff.enablePerformanceProtection`, `window.autoDetectColorScheme`.  
No high concurrency settings were present to lower.

### Workspace settings (repo)

Path: `.vscode/settings.json` (desk-copilot only)

Mirrors watcher/search excludes + TS memory cap so team/workspace opens get the same caps without relying only on user settings. No secrets.

## Research / agent concurrency rule (this box)

1. **Max 1–2 parallel heavy agents/jobs** on this machine. Extra Cursor agents, long probes, and validation restamps stack RAM until the OS swaps or freezes.
2. **Do not run a full Y=1500 restamp** while Cursor is already near max memory/CPU. Prefer smaller slices or off-peak windows.
3. **Prefer enrich scripts** over full rebuild/restamp when the goal is incremental field fill or targeted repair.
4. Close idle agent chats and reload Cursor after settings changes so watcher + tsserver pick up caps.

## Disk / cache hygiene

- Do **not** fill disk with duplicate stamp copies “just in case.” Point tools at the canonical stamp tree; delete or avoid parallel full copies under `.tmp` / research scratch.
- Use **`.karen-cache` carefully**: it is watcher-excluded and explorer-hidden, but still consumes disk and can grow. Prefer reuse over cloning large blobs.
- Keep heavy artifacts under the excluded paths above so the editor does not re-index them on every change.

## NEXT (operator)

1. Reload Cursor window (or restart Cursor) so watcher excludes + TS memory cap apply.
2. Close extra agent chats / background jobs until ≤1–2 heavy workers remain.
3. Avoid launching full validation restamps until free RAM is comfortable again.
4. Revert: remove the added keys from user `settings.json` and delete/edit `.vscode/settings.json` if needed.

## Revert notes

- User settings: restore previous four-key JSON (or remove only the new keys).
- Workspace: delete `.vscode/settings.json` or empty the exclude/memory keys.
- Doc: this file may stay as operational guidance.
