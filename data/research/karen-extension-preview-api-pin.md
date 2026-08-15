# Extension preview API pin + market-read follow-up

**Date:** 2026-08-15  
**Preview:** `https://desk-copilor-connpuliu-adam-b45d.vercel.app`  
**Deployment:** `dpl_D5ERNHK6kAJTnAEphd1tKVeh11CK`  
**Health:** `1.4.74` (`ok: true`)

## How the new URL was set

Chrome `chrome.storage.sync` cannot be written from a plain CLI against Adam’s profile without browser automation. Pinning is done **inside the unpacked extension**:

1. `extension/api-config.js` — `PREVIEW_BASE` + `PIN_PREVIEW_API_BASE = true` → `pinPreviewApiBase()` writes `apiBaseUrl` and clears `apiBaseLastGood`.
2. `extension/background.js` — calls `ensureApiBase()` on install, startup, and SW wake.
3. `extension/options.js` / `options.html` — **Use active preview** button for a one-click manual pin.
4. Manifest bumped `1.4.132` → `1.4.133` so reload triggers `onInstalled`.

**Adam action required once:** chrome://extensions → Reload unpacked `extension/` → hard-refresh TradingView → RECONNECT.

## Market-read status (1.4.74 preview)

| Check | Result |
|--------|--------|
| `whats the market read` | **200** SSE spoken WAIT — no `needsChartRead`, no `QUALITY_GATE` HTTP 500 |
| `when was your last decision?` + casualOnly | **200** SSE `live_decision_last_recorded` |
| Prior `…qbbq0ru6q…` / `1.4.73` | Stale — still 500 QUALITY_GATE on market-read |

## Not done

- No production promote
- No commit / push
- Set `PIN_PREVIEW_API_BASE = false` when leaving preview testing
