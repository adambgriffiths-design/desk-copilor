# Karen Vercel preview — extension readiness

**Checked:** 2026-08-15 ~07:30 UTC  
**Branch intent:** `karen-final-integration` preview  
**Production promote:** **NO** (not done)

## Crisp status

| Field | Value |
|-------|--------|
| **PREVIEW DEPLOYMENT** | **PASS** (Ready) / **FAIL for anonymous Chrome extension** (Deployment Protection) |
| **PREVIEW URL** | `https://desk-copilor-s28pi6t4b-adam-b45d.vercel.app` |
| **DEPLOYMENT ID** | `dpl_4GX8z9ek9KJ23nXo1sUZh3ajKmC7` |
| **HEALTH** | `{"ok":true,"version":"1.4.73"}` (via `vercel curl` protection bypass) |
| **VERSION** | `1.4.73` |
| **Environment** | `preview` (`target: preview`) — **not** production alias |
| **Production contrast** | `https://desk-copilor.vercel.app/api/health` → `200` `version":"1.4.64"` (unprotected) |

**Extension setting:** use this base URL:

`https://desk-copilor-s28pi6t4b-adam-b45d.vercel.app`

…but see **Deployment Protection** below — the extension will not reach APIs until protection is satisfied or disabled for Preview.

---

## What Vercel UI “Ready / Latest” means here

`vercel inspect` / `vercel ls`:

- Status: **● Ready**
- Environment: **Preview**
- URL matches the known deployment above
- Newest Preview in the project list at check time (~12–14 min old)

Deploy is live. Unauthenticated HTTP is **not** open.

---

## Deployment Protection (blocker for extension)

### Unauthenticated probe (no bypass)

| Call | Result |
|------|--------|
| `GET /api/health` (no follow) | **302** → `https://vercel.com/sso-api?url=…` |
| Follow redirects | Lands on **Vercel login / SSO** HTML (Adam may see this as **401 Deployment Protection**) |
| `GET /api/quote?symbol=MNQ` | Same **302** SSO gate |

### Automation bypass secret

| Source | Present? |
|--------|----------|
| Process `VERCEL_AUTOMATION_BYPASS_SECRET` | **No** |
| `.env.local` | **No** (only `VERCEL_OIDC_TOKEN` key name observed; value not printed) |
| Project `vercel env ls` | **No** bypass secret among listed vars |

Bypass used for this verify: **`npx vercel curl`** (CLI beta; uses logged-in Vercel auth / automatic protection bypass). **Secrets not printed.**

### Implication for Chrome extension

Extension `background` `fetch()` to the preview host does **not** share a Vercel SSO session the way a logged-in browser tab might, and there is **no** local automation bypass secret wired into the extension.

So today:

1. **Backend on this preview:** healthy when protection is bypassed (`vercel curl`).
2. **Extension pointing at this preview without protection change:** will hit SSO/401 and look **OFFLINE** / fail health.
3. **Do not change Deployment Protection without Adam.** Options Adam can choose later (preview-only, not prod):
   - Temporarily disable **Deployment Protection** for **Preview** only, **or**
   - Create a **Protection Bypass for Automation** secret and keep it for CLI/scripts (extension still would need a header path — not implemented today), **or**
   - Point the extension at **production** (`https://desk-copilor.vercel.app`) until preview is intentionally opened.

---

## API checks (with `vercel curl` bypass)

### 1. `GET /api/health`

```json
{"ok":true,"version":"1.4.73"}
```

**PASS**

### 2. `GET /api/quote?symbol=MNQ`

```json
{
  "lastPrice": 30141.75,
  "source": "yahoo_bar_close",
  "symbol": "MNQ",
  "marketState": "MARKET_CLOSED",
  "expectFresh": false,
  "marketReason": "Market closed for weekend",
  "nextOpenEt": "2026-08-16 Sun 18:00 ET"
}
```

**PASS** — `marketState` / `expectFresh` present; weekend closed as expected.

### 3. Quick GENERAL_CHAT stream (`POST /api/chat/stream`, `casualOnly: true`)

| Prompt | Result |
|--------|--------|
| `tell me a joke` | **PASS** — SSE `done`, `route":"casual · stream"`, joke reply returned |
| `whats the capital of Berlin` | **PASS** (stream up) — SSE deltas + `done`, `route":"casual · stream"`; model answered as Germany/Berlin general chat (quirky prompt, still off-market) |

---

## Not production alias

| Check | Result |
|-------|--------|
| Deploy `target` | `preview` |
| Preview host | `desk-copilor-s28pi6t4b-adam-b45d.vercel.app` (deployment-scoped) |
| Apex prod | `desk-copilor.vercel.app` still serves **1.4.64** |
| Promote | **Not performed** |

---

## Adam action checklist (extension)

1. Set Options / API base to:  
   `https://desk-copilor-s28pi6t4b-adam-b45d.vercel.app`
2. Expect **SSO / Deployment Protection** failure until Preview protection is opened or you stay on prod.
3. Prefer **not** changing protection without an explicit Adam decision.
4. After Preview is reachable from the extension: reload extension → hard-refresh TradingView → recheck health / joke / Berlin / MNQ quote.

---

## Verdict

- **Deploy Ready:** YES  
- **APIs (auth-bypassed):** YES — health `1.4.73`, quote OK, casual stream OK  
- **Extension-ready as-is:** **NO** — Deployment Protection blocks anonymous/extension traffic  
- **Production:** untouched  
