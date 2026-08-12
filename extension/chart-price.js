/**
 * Read MNQ last print from TradingView — bridge API first, then header/legend DOM.
 */
(function () {
  const BRIDGE_CACHE_MS = 300;
  const SYNC_BRIDGE_MAX_MS = 2000;
  const PRICE_WATCH_POLL_MS = 500;

  function roundMnq(n) {
    return Math.round(n * 4) / 4;
  }

  function getAnchor() {
    try {
      const cached = window.DeskCopilotDraw?.loadCache?.();
      const last = Number(cached?.priceHint?.last ?? cached?.lastPrice1m);
      if (Number.isFinite(last) && last >= 20000 && last <= 45000) return last;
      const levels = cached?.levels || [];
      const prices = levels.map((l) => Number(l.price)).filter(Number.isFinite);
      if (prices.length) {
        prices.sort((a, b) => a - b);
        return prices[Math.floor(prices.length / 2)];
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function isMnqPrice(n, anchor) {
    if (!Number.isFinite(n)) return false;
    if (Number.isFinite(anchor) && anchor > 0) {
      return n >= anchor * 0.88 && n <= anchor * 1.12;
    }
    return n >= 20000 && n <= 45000;
  }

  function parseMnqPrice(text, anchor) {
    if (!text) return null;
    const cleaned = String(text).replace(/[\u00a0\s]/g, "").replace(/,/g, "");
    const m = cleaned.match(/(\d{4,5}(?:\.\d{1,2})?)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (!isMnqPrice(n, anchor)) return null;
    return roundMnq(n);
  }

  function readFromHeaderLast(anchor) {
    const selectors = [
      '[data-field="last"]',
      '[data-field="last_price"]',
      ".js-symbol-last",
      '[class*="lastContainer"] [class*="value"]',
      '[class*="symbolLast"]',
      '[class*="last-J"]',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const n = parseMnqPrice(el.textContent, anchor);
        if (n) return n;
      }
    }
    return null;
  }

  function readFromLegendClose(anchor) {
    const roots = [document];
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        if (iframe.contentDocument) roots.push(iframe.contentDocument);
      } catch {
        /* cross-origin */
      }
    }

    for (const root of roots) {
      const items =
        root.querySelectorAll?.(
          '[data-name="legend-source-item"], [class*="legendSourceWrapper"], [class*="legend-source-item"]'
        ) || [];
      for (const el of items) {
        const text = (el.textContent || "").replace(/\s+/g, " ");
        const m = text.match(/\bC\s*(\d{4,5}(?:\.\d{1,2})?)/i);
        if (m) {
          const n = parseMnqPrice(m[1], anchor);
          if (n) return n;
        }
        const m2 = text.match(/\bClose\s*(\d{4,5}(?:\.\d{1,2})?)/i);
        if (m2) {
          const n = parseMnqPrice(m2[1], anchor);
          if (n) return n;
        }
      }
    }
    return null;
  }

  function readFromQuoteStrip(anchor) {
    const strip =
      document.querySelector('[class*="quote-ticker"]') ||
      document.querySelector('[data-name="header-toolbar-symbol-search"]')?.closest("div")?.parentElement;
    if (!strip) return null;
    const text = strip.textContent || "";
    const matches = [...text.matchAll(/(\d{2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)/g)];
    for (const m of matches) {
      const n = parseMnqPrice(m[1], anchor);
      if (n) return n;
    }
    return null;
  }

  function requestBridgePrice(timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        window.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve(value);
      };
      const handler = (event) => {
        if (event.source !== window || event.data?.type !== "DC_LAST_PRICE") return;
        finish(event.data);
      };
      window.addEventListener("message", handler);
      window.postMessage({ type: "DC_GET_LAST_PRICE" }, "*");
      const timer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  let bridgeInflight = null;
  let bridgeCache = { price: null, ts: 0 };

  function readBridgeCacheSync(anchor) {
    const now = Date.now();
    if (bridgeCache.price != null && now - bridgeCache.ts < SYNC_BRIDGE_MAX_MS) {
      if (isMnqPrice(bridgeCache.price, anchor)) return bridgeCache.price;
    }
    return null;
  }

  async function readFromBridge(anchor) {
    const now = Date.now();
    if (bridgeCache.price != null && now - bridgeCache.ts < BRIDGE_CACHE_MS) {
      return bridgeCache.price;
    }
    if (bridgeInflight) return bridgeInflight;

    bridgeInflight = (async () => {
      const res = await requestBridgePrice(200);
      bridgeInflight = null;
      const price = Number(res?.price);
      if (Number.isFinite(price) && isMnqPrice(price, anchor)) {
        const rounded = roundMnq(price);
        bridgeCache = { price: rounded, ts: Date.now() };
        return rounded;
      }
      return null;
    })();

    return bridgeInflight;
  }

  /** Live last print — header/quote before bar close; legend close is last resort only. */
  async function readChartLastPrice() {
    const anchor = getAnchor();

    const header = readFromHeaderLast(anchor);
    if (header != null) return header;

    const strip = readFromQuoteStrip(anchor);
    if (strip != null) return strip;

    const bridge = await readFromBridge(anchor);
    if (bridge != null) return bridge;

    const legend = readFromLegendClose(anchor);
    if (legend != null) return legend;

    if (Number.isFinite(anchor) && isMnqPrice(anchor, anchor)) {
      return roundMnq(anchor);
    }

    return null;
  }

  /** Instant DOM read — header/quote only; skip legend (stale selected-bar close). */
  function readChartLastPriceSync() {
    const anchor = getAnchor();
    return (
      readFromHeaderLast(anchor) ||
      readFromQuoteStrip(anchor) ||
      readBridgeCacheSync(anchor) ||
      null
    );
  }

  async function chartPricePayload() {
    const sync = readChartLastPriceSync();
    if (sync != null) return { chartLastPrice: sync };
    const p = await readChartLastPrice();
    return p != null ? { chartLastPrice: p } : {};
  }

  let priceChangeCb = null;
  let lastWatchedPrice = null;
  let priceObserver = null;
  let observedPriceEl = null;
  let pricePollTimer = null;

  function emitPriceIfChanged() {
    const px = readChartLastPriceSync();
    if (px == null) return;
    if (lastWatchedPrice != null && Math.abs(px - lastWatchedPrice) < 0.25) return;
    lastWatchedPrice = px;
    bridgeCache = { price: px, ts: Date.now() };
    priceChangeCb?.(px);
  }

  function attachPriceObserver() {
    const el =
      document.querySelector('[data-field="last"]') ||
      document.querySelector('[data-field="last_price"]') ||
      document.querySelector(".js-symbol-last");
    if (el === observedPriceEl) return;
    priceObserver?.disconnect();
    observedPriceEl = el;
    if (!el) return;
    priceObserver = new MutationObserver(() => emitPriceIfChanged());
    priceObserver.observe(el, { childList: true, subtree: true, characterData: true });
  }

  function startPriceWatcher(cb) {
    priceChangeCb = cb;
    attachPriceObserver();
    if (!pricePollTimer) {
      pricePollTimer = setInterval(() => {
        attachPriceObserver();
        emitPriceIfChanged();
      }, PRICE_WATCH_POLL_MS);
    }
    emitPriceIfChanged();
  }

  function stopPriceWatcher() {
    priceObserver?.disconnect();
    priceObserver = null;
    observedPriceEl = null;
    if (pricePollTimer) {
      clearInterval(pricePollTimer);
      pricePollTimer = null;
    }
    priceChangeCb = null;
    lastWatchedPrice = null;
  }

  window.DeskCopilotChartPrice = {
    read: readChartLastPrice,
    readSync: readChartLastPriceSync,
    payload: chartPricePayload,
    startWatcher: startPriceWatcher,
    stopWatcher: stopPriceWatcher,
    invalidate: () => {
      bridgeCache = { price: null, ts: 0 };
      lastWatchedPrice = null;
    },
  };
})();
