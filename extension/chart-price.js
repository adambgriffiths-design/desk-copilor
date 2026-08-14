/**
 * Read MNQ last print from TradingView — header last first; never bid/ask from quote strip.
 */
(function () {
  const LIVE_PRICE_MAX_AGE_MS = 60_000;
  const PRICE_HINT_MAX_AGE_MS = 60_000;
  const BRIDGE_CACHE_MS = 300;
  const SYNC_BRIDGE_MAX_MS = 2000;
  const PRICE_WATCH_POLL_MS = 500;

  function roundMnq(n) {
    return Math.round(n * 4) / 4;
  }

  /** Reject contract month/year digits (e.g. 2026 from MNQU2026) masquerading as price. */
  function isContractYearNoise(n) {
    if (!Number.isFinite(n)) return true;
    if (n >= 2020 && n <= 2035 && Math.abs(n - Math.round(n)) < 0.001) return true;
    if (n >= 20200 && n < 20400) return true;
    return false;
  }

  function isTrustedAnchor(n) {
    if (!Number.isFinite(n) || n < 20000 || n > 45000) return false;
    return !isContractYearNoise(n);
  }

  function loadLevelCacheMeta() {
    try {
      const raw = localStorage.getItem("dc-levels-cache");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return { ts: Number(parsed?.ts) || 0, payload: parsed?.payload || null };
    } catch {
      return null;
    }
  }

  function getAnchor() {
    try {
      const meta = loadLevelCacheMeta();
      const cached = meta?.payload || window.DeskCopilotDraw?.loadCache?.();
      const cacheAge = meta ? Date.now() - meta.ts : Number.POSITIVE_INFINITY;
      const freshCache = cacheAge <= PRICE_HINT_MAX_AGE_MS;
      if (freshCache && cached) {
        const last = Number(cached?.lastPrice1m);
        if (isTrustedAnchor(last)) return last;
        const levels = cached.levels || [];
        const prices = levels.map((l) => Number(l.price)).filter(isTrustedAnchor);
        if (prices.length) {
          prices.sort((a, b) => a - b);
          return prices[Math.floor(prices.length / 2)];
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function priceAnchor() {
    const a = getAnchor();
    return isTrustedAnchor(a) ? a : null;
  }

  function isMnqPrice(n, anchor) {
    if (!Number.isFinite(n) || isContractYearNoise(n)) return false;
    if (isTrustedAnchor(anchor)) {
      return n >= anchor * 0.88 && n <= anchor * 1.12;
    }
    return n >= 20000 && n <= 45000;
  }

  /** Strip CME root + month + year (e.g. MNQU2026) before digit scan. */
  function stripFuturesSymbolPrefix(text) {
    return String(text).replace(/^[A-Z]{2,3}[FGHJKMNQUVXZ]\d{2,4}/i, "");
  }

  /** Parse MNQ tick from TV text — prefer comma thousands (30,185.00); reject symbol/year noise. */
  function parseMnqPrice(text, anchor) {
    if (!text) return null;
    const raw = String(text);
    const trustedAnchor = isTrustedAnchor(anchor) ? anchor : null;
    const candidates = [];

    for (const m of raw.matchAll(/\b(\d{1,2},\d{3}(?:\.\d{1,2})?)\b/g)) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (Number.isFinite(n)) candidates.push({ n, score: 12 });
    }

    const cleaned = raw.replace(/[\u00a0\s\u202f]/g, "").replace(/[,，']/g, "");
    const digitSource = stripFuturesSymbolPrefix(cleaned);
    for (const m of digitSource.matchAll(/(\d{5,6}(?:\.\d{1,2})?)/g)) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) candidates.push({ n, score: 8 });
    }
    for (const m of digitSource.matchAll(/(\d{4,5}(?:\.\d{1,2})?)/g)) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n)) candidates.push({ n, score: 4 });
    }

    let best = null;
    let bestScore = -Infinity;
    for (const { n, score } of candidates) {
      if (isContractYearNoise(n)) continue;
      if (!isMnqPrice(n, trustedAnchor)) continue;
      let s = score;
      if (trustedAnchor != null) {
        s += Math.max(0, 6 - (Math.abs(n - trustedAnchor) / trustedAnchor) * 40);
      }
      if (n >= 25000) s += 2;
      if (s > bestScore) {
        bestScore = s;
        best = n;
      }
    }
    return best != null ? roundMnq(best) : null;
  }

  function makeQuote(value, source, timestamp = Date.now()) {
    const ts = Number.isFinite(timestamp) ? timestamp : Date.now();
    const ageMs = Math.max(0, Date.now() - ts);
    return { value: roundMnq(value), source, timestamp: ts, ageMs };
  }

  function collectDomRoots() {
    const roots = [document];
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        if (iframe.contentDocument) roots.push(iframe.contentDocument);
      } catch {
        /* cross-origin */
      }
    }
    const withShadow = [];
    for (const root of roots) {
      withShadow.push(root);
      for (const el of root.querySelectorAll?.("*") || []) {
        if (el.shadowRoot) withShadow.push(el.shadowRoot);
      }
    }
    return withShadow;
  }

  function findChartPaneForPrice() {
    let bestCanvas = null;
    let bestArea = 0;
    for (const canvas of document.querySelectorAll("canvas")) {
      const r = canvas.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 280 && r.height > 160 && r.top < window.innerHeight * 0.92) {
        bestArea = area;
        bestCanvas = canvas;
      }
    }
    if (!bestCanvas) return null;
    let node = bestCanvas.parentElement;
    for (let i = 0; i < 6 && node; i++) {
      const r = node.getBoundingClientRect();
      if (r.width > 300 && r.height > 200) return { rect: r };
      node = node.parentElement;
    }
    const r = bestCanvas.getBoundingClientRect();
    return r.width > 100 ? { rect: r } : null;
  }

  /** Right-axis last-price label (green tick on chart scale) when header Last is hidden. */
  function readFromPriceScale(anchor) {
    const paneInfo = findChartPaneForPrice();
    if (!paneInfo) return null;
    const paneRect = paneInfo.rect;
    const minX = paneRect.right - Math.max(220, paneRect.width * 0.35);
    const midY = paneRect.top + paneRect.height / 2;
    const trustedAnchor = isTrustedAnchor(anchor) ? anchor : null;

    const roots = collectDomRoots();

    const hits = [];
    for (const root of roots) {
      const prioritySelectors = [
        '[class*="price-axis-last"]',
        '[class*="lastValue"]',
        '[class*="last-value"]',
        '[data-name="pane-price-axis"] [class*="value"]',
      ];
      for (const sel of prioritySelectors) {
        for (const el of root.querySelectorAll?.(sel) || []) {
          const n = parseMnqPrice(el.textContent, trustedAnchor);
          if (n == null) continue;
          const r = el.getBoundingClientRect();
          hits.push({ n, score: 24, y: r.top + r.height / 2 });
        }
      }

      for (const el of root.querySelectorAll?.("span, div, td, label") || []) {
        const text = (el.textContent || "").trim();
        if (!text || text.length > 18) continue;
        if (!/\d{1,2},\d{3}|\d{5}/.test(text)) continue;
        const n = parseMnqPrice(text, trustedAnchor);
        if (n == null) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.left < minX) continue;
        if (r.bottom < paneRect.top - 24 || r.top > paneRect.bottom + 24) continue;
        let score = 6;
        const cls = String(el.className || "");
        if (/last|current|highlight|active/i.test(cls)) score += 10;
        try {
          const bg = root.defaultView?.getComputedStyle(el).backgroundColor || "";
          if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") score += 5;
        } catch {
          /* ignore */
        }
        hits.push({ n, score, y: r.top + r.height / 2 });
      }
    }

    if (!hits.length) return null;
    hits.sort(
      (a, b) => b.score - a.score || Math.abs(a.y - midY) - Math.abs(b.y - midY)
    );
    return hits[0].n;
  }

  function readFromHeaderLast(anchor) {
    const selectors = [
      '[data-field="last"]',
      '[data-field="last_price"]',
      '[data-field="lp"]',
      ".js-symbol-last",
      '[class*="lastContainer"] [class*="value"]',
      '[class*="symbolLast"]',
      '[class*="last-J"]',
      '[class*="lastBlock"] [class*="value"]',
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
        const m = text.match(/\bC\s*(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{4,6}(?:\.\d{1,2})?)/i);
        if (m) {
          const n = parseMnqPrice(m[1], anchor);
          if (n) return n;
        }
        const m2 = text.match(/\bClose\s*(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{4,6}(?:\.\d{1,2})?)/i);
        if (m2) {
          const n = parseMnqPrice(m2[1], anchor);
          if (n) return n;
        }
      }
    }
    return null;
  }

  /** Quote strip — only explicit last fields; never first bid/ask number in toolbar text. */
  function readFromQuoteStrip(anchor) {
    const strip =
      document.querySelector('[class*="quote-ticker"]') ||
      document.querySelector('[class*="header-quote"]') ||
      document.querySelector('[data-name="header-toolbar-symbol-search"]')?.closest("div")?.parentElement;
    if (!strip) return null;

    for (const sel of ['[data-field="last"]', '[data-field="last_price"]', '[data-field="lp"]', ".js-symbol-last"]) {
      for (const el of strip.querySelectorAll(sel)) {
        const n = parseMnqPrice(el.textContent, anchor);
        if (n != null) return n;
      }
    }

    const text = (strip.textContent || "").replace(/\s+/g, " ");
    const labeled = text.match(
      /\b(?:Last|L)\s*[:\s]*(\d{2},\d{3}(?:\.\d{1,2})?|\d{4,5}(?:\.\d{1,2})?)/i
    );
    if (labeled) {
      const n = parseMnqPrice(labeled[1], anchor);
      if (n != null) return n;
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
  let bridgeCache = { price: null, ts: 0, source: null };
  let lastQuote = null;

  function readBridgeCacheSync(anchor) {
    const now = Date.now();
    const trustedAnchor = isTrustedAnchor(anchor) ? anchor : null;
    if (bridgeCache.price != null && now - bridgeCache.ts < SYNC_BRIDGE_MAX_MS) {
      if (isMnqPrice(bridgeCache.price, trustedAnchor)) return bridgeCache.price;
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
      const trustedAnchor = isTrustedAnchor(anchor) ? anchor : null;
      const ok =
        Number.isFinite(price) &&
        (isMnqPrice(price, trustedAnchor) || (trustedAnchor != null && isMnqPrice(price, null)));
      if (ok) {
        const rounded = roundMnq(price);
        const src = res?.source === "tv_api" ? "tv_api" : "tv_bar_close";
        bridgeCache = { price: rounded, ts: Date.now(), source: src };
        return rounded;
      }
      return null;
    })();

    return bridgeInflight;
  }

  function isLiveQuoteSource(source) {
    return source === "tradingview_live" || source === "tradingview_quote";
  }

  function readDomPriceSync(anchor) {
    const header = readFromHeaderLast(anchor);
    if (header != null) return { value: header, source: "tradingview_live" };

    const strip = readFromQuoteStrip(anchor);
    if (strip != null) return { value: strip, source: "tradingview_quote" };

    const axis = readFromPriceScale(anchor);
    if (axis != null) return { value: axis, source: "tradingview_live" };

    return null;
  }

  /** Sync quote read — header/quote/axis last; cached bar close when DOM empty. */
  function readQuoteSync() {
    const anchor = priceAnchor();
    const now = Date.now();

    let hit = readDomPriceSync(anchor);
    if (!hit && anchor != null) hit = readDomPriceSync(null);
    if (hit) return makeQuote(hit.value, hit.source, now);

    const cachedBridge = readBridgeCacheSync(anchor) ?? readBridgeCacheSync(null);
    if (cachedBridge != null) {
      return makeQuote(cachedBridge, bridgeCache.source || "tv_bar_close", bridgeCache.ts);
    }

    return null;
  }

  /** Full quote read — falls back to TV bridge bar close, not stale draw-cache anchor. */
  async function readQuote() {
    const sync = readQuoteSync();
    if (sync) {
      lastQuote = sync;
      return sync;
    }

    const anchor = priceAnchor();
    let bridge = await readFromBridge(anchor);
    if (bridge == null && anchor != null) bridge = await readFromBridge(null);
    if (bridge != null) {
      const q = makeQuote(bridge, "tv_bar_close", bridgeCache.ts || Date.now());
      lastQuote = q;
      return q;
    }

    let legend = readFromLegendClose(anchor);
    if (legend == null && anchor != null) legend = readFromLegendClose(null);
    if (legend != null) {
      const q = makeQuote(legend, "tv_bar_close");
      lastQuote = q;
      return q;
    }

    return null;
  }

  async function readChartLastPrice() {
    const q = await readQuote();
    return q?.value ?? null;
  }

  function readChartLastPriceSync() {
    return readQuoteSync()?.value ?? null;
  }

  async function chartPricePayload() {
    const q = readQuoteSync() || (await readQuote());
    if (!q) return {};
    return {
      chartLastPrice: q.value,
      chartLastPriceSource: q.source,
      chartLastPriceTs: q.timestamp,
    };
  }

  let priceChangeCb = null;
  let lastWatchedPrice = null;
  let priceObserver = null;
  let observedPriceEl = null;
  let pricePollTimer = null;

  function emitPriceIfChanged() {
    const q = readQuoteSync();
    if (!q) return;
    if (lastWatchedPrice != null && Math.abs(q.value - lastWatchedPrice) < 0.25) return;
    lastWatchedPrice = q.value;
    lastQuote = q;
    if (!isLiveQuoteSource(q.source)) {
      bridgeCache = { price: q.value, ts: q.timestamp, source: q.source };
    }
    priceChangeCb?.(q.value);
  }

  function attachPriceObserver() {
    const el =
      document.querySelector('[data-field="last"]') ||
      document.querySelector('[data-field="last_price"]') ||
      document.querySelector('[data-field="lp"]') ||
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
    LIVE_PRICE_MAX_AGE_MS,
    PRICE_HINT_MAX_AGE_MS,
    read: readChartLastPrice,
    readSync: readChartLastPriceSync,
    readQuote,
    readQuoteSync,
    payload: chartPricePayload,
    startWatcher: startPriceWatcher,
    stopWatcher: stopPriceWatcher,
    invalidate: () => {
      bridgeCache = { price: null, ts: 0, source: null };
      lastQuote = null;
      lastWatchedPrice = null;
    },
  };
})();
