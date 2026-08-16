# LAPTOP_CURSOR_SETUP — reproduce Cursor env (no secrets)

**DATE:** 2026-08-16  
**SOURCE MACHINE:** desktop audit (Cursor 3.16.x, Windows, PowerShell 5.1)  
**DO NOT COMMIT secrets.** This file itself is safe to commit later if desired; it contains no keys.

Branch to use: `cursor/extension-v1.4.62-fixes` (or newer SHA after `1cd7421` cloud sync).

---

## Classification

### A. Safe to sync through Git
| Item | Status on desktop | Action |
|------|-------------------|--------|
| `tsconfig.json` | Tracked | Already in repo |
| `package.json` / lockfile | Tracked | `npm ci` on laptop |
| `config/cloud/*` examples + runbooks | Tracked (as of `1cd7421`) | Pull |
| `data/research/karen-cloud-*.md` | Tracked | Pull |
| `.cursor/rules/*.mdc` | **Present locally, NOT tracked** | Recommend commit (rules only) |
| `.cursor/hooks.json` + `hooks/supervisor-pickup.mjs` | **Local, NOT tracked** | Recommend commit |
| `.cursor/permissions.json` | **Local, NOT tracked** | Recommend commit (no secrets) |
| `.env.example` / `config/cloud/env.example` | Tracked / present | Pull — names only |

### B. Install manually on laptop
| Tool | Desktop | Laptop install |
|------|---------|----------------|
| Cursor | 3.16.17 | Install from cursor.com |
| Node.js | **v24.19.0** | Install Node 24 LTS (match major) |
| npm | **11.17.0** | Comes with Node |
| Git | Present | Install Git for Windows |
| PowerShell | 5.1 | Built-in Windows |
| Vercel CLI | via `npx` (not global) | `npx vercel` after login |
| AWS CLI / rclone | **Not installed** on desktop | Optional — only for R2 sync |
| `gh` | **Not installed** | Optional |
| Extensions (see IDs below) | User-level | Install in Cursor |

**Extension IDs currently installed under `~/.cursor/extensions`:**
- `anysphere.cursorpyright`
- `anysphere.remote-ssh`
- `ms-python.python`
- `ms-python.debugpy`

Core desk-copilot work is **TypeScript / Next.js** — Python extensions are optional unless you use Python scripts. Recommended minimum for this repo:
- Built-in TS/JS support (Cursor default)
- Optional: `anysphere.remote-ssh` if you SSH to a cloud VM from the laptop

No project `.vscode/extensions.json` recommendations file exists yet.

### C. Secrets / private — DO NOT copy into Git
| Item | Notes |
|------|--------|
| `.env.local` (repo root) | Present on desktop — **never commit** |
| Any `TICKSTREAM_*`, `OPENAI_*`, `KAREN_R2_*` | Via 1Password / Doppler / gitignored env file |
| Preferred laptop path | `%USERPROFILE%\.config\karen\env` + `$env:KAREN_ENV_FILE=...` (see `config/cloud/laptop-workflow.md`) |
| Vercel auth | `npx vercel login` on laptop |
| Cloudflare R2 tokens | Separate; required for cloud sync only |
| Cursor account login | Same Cursor account |

### D. Desktop-specific — do NOT move
| Item | Why |
|------|-----|
| Absolute paths under `C:\Users\adamg\...` | Machine-specific |
| `.vercel/project.json` | Local link cache (re-run `npx vercel link`) |
| `.next/`, `node_modules/`, `.karen-cache/` | Rebuild locally |
| `.cursor/debug-*.log` | Noise |
| User `settings.json` values unique to desktop UI | Optional personal prefs only |
| Raw TickStream / HOLDOUT / large normalized archives | Separate data sync (R2), not Cursor setup |
| Untracked `.tmp/` worktrees & probe scripts | Not part of laptop Cursor env |

---

## Formatter / linter
- **Lint:** `npm run lint` → `next lint` (no separate ESLint config file in root)
- **Formatter:** No Prettier / EditorConfig in repo; Cursor user settings have **no** `editor.defaultFormatter` / `formatOnSave` set
- **Typecheck:** `npx tsc --noEmit` (devDependency: `typescript`, `tsx`)

## Terminal / shell
- Default shell observed: **Windows PowerShell 5.1**
- No custom `terminal.integrated.profiles.windows` in user settings
- Laptop: use PowerShell or Windows Terminal; repo scripts assume `npm` / `npx tsx`

## Project Cursor rules / hooks (local today)
- `supervisor-pickup.mdc` — alwaysApply; auto-claim supervisor inbox
- `vercel-deploy.mdc` — auto-prod deploy guidance for API/lib changes
- `hooks.json` → `sessionStart` runs `node .cursor/hooks/supervisor-pickup.mjs`
- `permissions.json` — Auto-review allow/block instructions for agents

**MCP:** No `mcp.json` found at user or project level. Any MCP servers are Cursor-app managed — re-enable in Cursor Settings on the laptop if you use them (e.g. browser / Datadog). Do not paste tokens into git.

## User settings keys present (values omitted)
- `cursor.inlineDiff.enablePerformanceProtection`
- `files.autoSave`
- `window.autoDetectColorScheme`
- `window.commandCenter`

---

## Exact laptop steps

1. Install **Cursor**, **Git**, **Node 24.x**.
2. Clone / pull:
   ```powershell
   git clone https://github.com/adambgriffiths-design/desk-copilor.git
   cd desk-copilor
   git checkout cursor/extension-v1.4.62-fixes
   git pull
   git rev-parse HEAD
   npm ci
   ```
3. Copy secrets offline into `%USERPROFILE%\.config\karen\env` (from 1Password). **Never** commit.
4. Optional extensions: install IDs above if desired.
5. If you want desktop parity for agent behavior, copy (or later commit) `.cursor/rules`, `.cursor/hooks*`, `.cursor/permissions.json` — or `git pull` once those are committed from desktop.
6. Cursor Settings → Agents → Approvals: set **Auto-review** if using supervisor autonomy (matches `permissions.json` intent).
7. Verify:
   ```powershell
   $env:KAREN_ENV_FILE="$env:USERPROFILE\.config\karen\env"
   npm run karen:cloud:status
   npm run lint
   npx tsc --noEmit
   ```
8. Optional: `npx vercel login` then `npx vercel link` (do not commit `.vercel/`).

---

## Finish block

```
CURSOR_SYNC_STATUS: AUDITED — cloud tooling in git as of 1cd7421; .cursor rules/hooks still local-untracked
EXTENSIONS_TO_INSTALL: anysphere.cursorpyright (optional), anysphere.remote-ssh (optional for VM), ms-python.python + ms-python.debugpy (optional)
SETTINGS_TO_SYNC: minimal — autoSave / colorScheme optional; no formatter mandated by repo
PROJECT_RULES_STATUS: PRESENT_ON_DESKTOP_UNTRACKED — recommend git-add .cursor/rules + hooks + permissions (no secrets)
SECRETS_REQUIRED_SEPARATELY: .env.local / KAREN_ENV_FILE contents, Vercel login, R2 tokens if using cloud sync
DESKTOP_ONLY_ITEMS: .vercel link, absolute paths, caches, debug logs, raw data, untracked .tmp worktrees
EXACT_LAPTOP_STEPS: see section above
SAFE_TO_PROCEED: YES — after Node 24 + git pull + secrets via 1Password; do not git-copy .env
```
