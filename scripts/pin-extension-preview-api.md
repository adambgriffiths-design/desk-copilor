# Pin extension API base to active Vercel preview

**Target (no trailing slash):** `https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app`  
**Source of truth:** `PREVIEW_BASE` in `extension/api-config.js` (keep in sync with the deploy under test).

Chrome `chrome.storage.sync` cannot be written from a normal CLI script. This repo pins the preview from the unpacked extension itself.

## Automatic (preferred)

1. Load / reload the unpacked extension from `.tmp/karen-final-integration/extension/` (or root `extension/` after parity sync) — chrome://extensions → Reload.
2. On service worker wake, `ensureApiBase()` / `pinPreviewApiBase()` in `extension/api-config.js`:
   - sets `chrome.storage.sync.apiBaseUrl` → `PREVIEW_BASE`
   - removes `chrome.storage.local.apiBaseLastGood` (clears sticky localhost)
3. Hard-refresh TradingView (Ctrl+Shift+R) or reopen the desk panel, then click **RECONNECT**.

`PIN_PREVIEW_API_BASE` in `api-config.js` controls this. Set to `false` when you want auto (localhost → production) again.

## When rotating preview deploys

1. Update `PREVIEW_BASE` in `extension/api-config.js` (and the twin under `.tmp/karen-final-integration/extension/` if loading that tree).
2. Reload the unpacked extension.
3. Options → **Use active preview**, or click **RECONNECT**.
4. Confirm the panel/Options host matches the new preview — not an older `desk-copilor-*-adam-b45d.vercel.app` slug.

## Manual (Options UI)

1. Right-click the extension → **Options**.
2. Click **Use active preview** (or paste the URL into API base URL and Save).
3. Confirm status shows Connected to the host in `PREVIEW_BASE`.

## Verify

```powershell
curl.exe -sS "https://desk-copilor-lvmufjv3k-adam-b45d.vercel.app/api/health"
```

Expect a recent `"version"` matching the shipset under test. Then in the desk panel: `whats the market read` — should not show `CHART_READ_REQUEST_ROUTING`. Weekend/missing OHLC should surface a spoken WAIT (HTTP 200 SSE), not a dead error bubble.
