/**
 * Read MNQ last print from TradingView — header last first; never bid/ask from quote strip.
 */
(function () {
  const LIVE_PRICE_MAX_AGE_MS = 60_000;
  const PRICE_HINT_MAX_AGE_MS = 60_000;
  const BRIDGE_CACHE_MS = 300;
  const SYNC_BRIDGE_MAX_MS = 2000;
  const PRICE_WATCH_POLL_MS = 50;
  // #region agent log
  let dbgPriceLast = 0;
  try {
    chrome.runtime.sendMessage({
      type: "DEBUG_LOG",
      payload: {
        sessionId: "600bac",
        runId: "ticker-3",
        hypothesisId: "J",
        location: "chart-price.js:boot",
        message: "chart-price loaded",
        data: { href: String(location.href || "").slice(0, 80) },
        timestamp: Date.now(),
      },
    });
  } catch {
    /* ignore */
  }
  function dbgPrice(hypothesisId, location, message, data) {
    const now = Date.now();
    if (now - dbgPriceLast < 250) return;
    dbgPriceLast = now;
    try {
      chrome.runtime.sendMessage({
        type: "DEBUG_LOG",
        payload: {
          sessionId: "600bac",
          runId: "ticker-3",
          hypothesisId,
          location,
          message,
          data: data || {},
          timestamp: now,
        },
      });
    } catch {
      /* ignore */
    }
  }
  // #endregion

  const UPDATE_MODE_KEY = "dc-price-update-mode";
  function readStoredUpdateMode() {
    try {
      const v = localStorage.getItem(UPDATE_MODE_KEY);
      if (v === "minute" || v === "tick") return v;
    } catch {
      /* ignore */
    }
    return "tick";
  }
  let updateMode = readStoredUpdateMode();
  let lastMinuteBucket = -1;

  function classifyNasdaqRoot(text) {
    const s = String(text || "").toUpperCase();
    if (!s) return null;
    if (/(?:^|[^A-Z])MNQ(?:1!|[FGHJKMNQUVXZ]\d{1,4}|[^A-Z]|$)/.test(s)) return "MNQ";
    if (/(?:^|[^A-Z])NQ(?:1!|[FGHJKMNQUVXZ]\d{1,4}|[^A-Z]|$)/.test(s)) return "NQ";
    return null;
  }

  function packChartSymbol(root, raw) {
    const r = root === "NQ" ? "NQ" : "MNQ";
    return {
      root: r,
      tvSymbol: r === "NQ" ? "NQ1!" : "MNQ1!",
      quoteSymbol: r,
      raw: String(raw || r),
    };
  }

  /** URL / header / legend — MNQ when ambiguous; NQ only when the chart is clearly NQ. */
  function detectChartSymbol() {
    const ranked = [];
    try {
      const q = new URL(location.href).searchParams.get("symbol");
      if (q) ranked.push({ text: decodeURIComponent(q), weight: 100 });
    } catch {
      /* ignore */
    }
    const header =
      document.querySelector("[data-symbol-short]") || document.querySelector(".js-symbol-edit");
    if (header) {
      ranked.push({
        text: header.getAttribute("data-symbol-short") || header.textContent,
        weight: 80,
      });
    }
    const legend = document.querySelector('[data-name="legend-source-title"]');
    if (legend) ranked.push({ text: legend.textContent, weight: 70 });
    ranked.push({ text: document.title, weight: 20 });
    ranked.sort((a, b) => b.weight - a.weight);
    for (const { text } of ranked) {
      const root = classifyNasdaqRoot(text);
      if (root) return packChartSymbol(root, text);
    }
    return packChartSymbol("MNQ", "default");
  }

  function nearbySymbolBlob(el) {
    let node = el;
    let blob = "";
    for (let i = 0; i < 6 && node; i++) {
      blob += " " + (node.getAttribute?.("data-symbol-short") || "");
      blob += " " + (node.getAttribute?.("data-symbol-full") || "");
      node = node.parentElement;
    }
    return blob.toUpperCase();
  }

  function symbolMatchScore(el, preferredRoot) {
    const blob = nearbySymbolBlob(el);
    const root = classifyNasdaqRoot(blob);
    if (root === preferredRoot) return 24;
    if (root && root !== preferredRoot) return -40;
    return 0;
  }

  function minuteBucket(ts) {
    return Math.floor((Number(ts) || Date.now()) / 60000);
  }

  function setUpdateMode(mode) {
    const next = mode === "minute" ? "minute" : "tick";
    updateMode = next;
    try {
      localStorage.setItem(UPDATE_MODE_KEY, next);
    } catch {
      /* ignore */
    }
    lastMinuteBucket = -1;
    lastWatchedPrice = null;
    lastQuote = null;
    // #region agent log
    dbgPrice("N", "chart-price.js:setUpdateMode", "mode", {
      mode: next,
      symbol: detectChartSymbol().root,
    });
    // #endregion
    emitPriceIfChanged();
    restartPricePoll();
    return next;
  }

  function getUpdateMode() {
    return updateMode === "minute" ? "minute" : "tick";
  }

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

  /** Strip continuous (NQ1!) and CME month (MNQU2026) prefixes before digit scan. */
  function stripFuturesSymbolPrefix(text) {
    return String(text)
      .replace(/^(MNQ|NQ|MES|ES|M2K|RTY|MYM|YM)[1!]+\s*/i, "")
      .replace(/^[A-Z]{2,3}[FGHJKMNQUVXZ]\d{2,4}/i, "");
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
      '[class*="js-symbol-last"]',
      '[class*="tv-symbol-price-quote"]',
      '[class*="lastContainer"] [class*="value"]',
      '[class*="symbolLast"]',
      '[class*="last-J"]',
      '[class*="lastBlock"] [class*="value"]',
      '[data-name="legend-source-item"] [class*="valueItem"]',
      '[class*="legend-source-item"] [class*="valueItem"]',
      '[data-name="legend-source-title"]',
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
        const m = text.match(/\bC[:\s]*(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{4,6}(?:\.\d{1,2})?)/i);
        if (m) {
          const n = parseMnqPrice(m[1], anchor);
          if (n) return n;
        }
        const m2 = text.match(/\bClose[:\s]*(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{4,6}(?:\.\d{1,2})?)/i);
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
      const res = await requestBridgePrice(2800);
      bridgeInflight = null;
      const price = Number(res?.price);
      const trustedAnchor = isTrustedAnchor(anchor) ? anchor : null;
      const ok =
        Number.isFinite(price) &&
        (isMnqPrice(price, trustedAnchor) || (trustedAnchor != null && isMnqPrice(price, null)));
      if (ok) {
        const rounded = roundMnq(price);
        const src = "tradingview_live";
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

  /** Chart page often has no js-symbol-last — scan header / right axis only. */
  function scanVisibleLast(anchor) {
    const t0 = performance.now();
    const trustedAnchor = isTrustedAnchor(anchor) ? anchor : null;
    const headerBottom = Math.max(140, window.innerHeight * 0.16);
    const axisLeft = window.innerWidth - 140;
    const hits = [];
    const roots = collectDomRoots();
    for (const root of roots) {
      const nodes = root.querySelectorAll?.("span, div, td, label") || [];
      for (const el of nodes) {
        const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || text.length > 16) continue;
        if (!/\d{1,2},\d{3}(?:\.\d{1,2})?/.test(text) && !/\d{5}\.\d{1,2}/.test(text)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.height > 48) continue;
        const inHeader = r.top >= 0 && r.bottom <= headerBottom;
        const onAxis = r.left >= axisLeft;
        if (!inHeader && !onAxis) continue;
        let n = parseMnqPrice(text, trustedAnchor);
        if (n == null && trustedAnchor != null) n = parseMnqPrice(text, null);
        if (n == null) continue;
        const known = lastWatchedPrice ?? lastQuote?.value ?? trustedAnchor;
        if (known != null && Math.abs(n - known) > 80) continue;
        let score = inHeader ? 10 : 8;
        if (text.includes(",")) score += 4;
        if (n >= 25000) score += 2;
        score += symbolMatchScore(el, detectChartSymbol().root);
        if (score < 0) continue;
        hits.push({ n, score, el });
      }
    }
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    const det = detectChartSymbol();
    // #region agent log
    dbgPrice("G", "chart-price.js:scanVisibleLast", "scan", {
      ms,
      hits: hits.length,
      best: hits[0]?.n ?? null,
      symbol: det.root,
      path: "scan",
    });
    // #endregion
    if (!hits.length) return null;
    hits.sort((a, b) => b.score - a.score);
    if (hits[0].el) observedPriceEl = hits[0].el;
    return hits[0].n;
  }

  function readDomPriceSync(anchor) {
    const header = readFromHeaderLast(anchor);
    if (header != null) return { value: header, source: "tradingview_live" };

    const strip = readFromQuoteStrip(anchor);
    if (strip != null) return { value: strip, source: "tradingview_quote" };

    const axis = readFromPriceScale(anchor);
    if (axis != null) return { value: axis, source: "tradingview_live" };

    const legend = readFromLegendClose(anchor);
    if (legend != null) return { value: legend, source: "tv_bar_close" };

    const scanned = scanVisibleLast(anchor);
    if (scanned != null) return { value: scanned, source: "tradingview_live" };

    return null;
  }

  let observedPriceEl = null;

  const LIVE_PRICE_SELECTORS = [
    '[data-field="last"]',
    '[data-field="last_price"]',
    '[data-field="lp"]',
    ".js-symbol-last",
    '[class*="js-symbol-last"]',
    '[class*="price-axis-last"]',
    '[class*="lastValueBar"]',
  ];

  function findLivePriceEl() {
    const preferred = detectChartSymbol().root;
    if (observedPriceEl && observedPriceEl.isConnected) {
      const text = (observedPriceEl.innerText || observedPriceEl.textContent || "").replace(/\s+/g, " ").trim();
      const n = parseMnqPrice(text, priceAnchor()) ?? parseMnqPrice(text, null);
      if (n != null && symbolMatchScore(observedPriceEl, preferred) >= 0) return observedPriceEl;
    }
    let best = null;
    let bestScore = -1;
    for (const sel of LIVE_PRICE_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const n = parseMnqPrice(text, priceAnchor()) ?? parseMnqPrice(text, null);
        if (n == null) continue;
        const r = el.getBoundingClientRect();
        let score = 4 + symbolMatchScore(el, preferred);
        if (r.top >= 0 && r.bottom <= 140) score += 6;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    if (best && bestScore >= 0) return best;
    return observedPriceEl && observedPriceEl.isConnected ? observedPriceEl : null;
  }

  function readPinnedPrice() {
    const el = findLivePriceEl();
    if (!el) return null;
    observedPriceEl = el;
    const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return parseMnqPrice(text, priceAnchor()) ?? parseMnqPrice(text, null);
  }

  let lastExpensiveReadAt = 0;

  /** Sync quote read — pinned Last first; never freeze on an 8s cache. */
  function readQuoteSync() {
    const now = Date.now();
    if (getUpdateMode() === "minute" && lastQuote && lastQuote.source === "tv_1m_close") {
      return { ...lastQuote, ageMs: now - lastQuote.timestamp };
    }

    const anchor = priceAnchor();

    if (lastQuote && now - lastQuote.timestamp < 80) {
      return { ...lastQuote, ageMs: now - lastQuote.timestamp };
    }

    const pinned = readPinnedPrice();
    if (pinned != null) {
      const q = makeQuote(pinned, "tradingview_live", now);
      lastQuote = q;
      // #region agent log
      dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
        path: "pin",
        value: q.value,
        source: q.source,
        ageMs: 0,
        symbol: detectChartSymbol().root,
        mode: getUpdateMode(),
      });
      // #endregion
      return q;
    }

    let hit = readFromHeaderLast(anchor) ?? readFromQuoteStrip(anchor);
    if (!hit && anchor != null) {
      hit = readFromHeaderLast(null) ?? readFromQuoteStrip(null);
    }
    if (hit != null) {
      const q = makeQuote(hit, "tradingview_live", now);
      lastQuote = q;
      // #region agent log
      dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
        path: "dom",
        value: q.value,
        source: q.source,
        ageMs: 0,
        symbol: detectChartSymbol().root,
        mode: getUpdateMode(),
      });
      // #endregion
      return q;
    }

    if (lastQuote && now - lastQuote.timestamp < 250) {
      const stale = { ...lastQuote, ageMs: now - lastQuote.timestamp };
      // #region agent log
      dbgPrice("H", "chart-price.js:readQuoteSync", "quote", { path: "stale250", value: stale.value, source: stale.source, ageMs: stale.ageMs });
      // #endregion
      return stale;
    }

    if (now - lastExpensiveReadAt >= 2000) {
      lastExpensiveReadAt = now;
      let slow = readDomPriceSync(anchor);
      if (!slow && anchor != null) slow = readDomPriceSync(null);
      if (slow) {
        const q = makeQuote(slow.value, slow.source, now);
        lastQuote = q;
        // #region agent log
        dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
        path: "scan",
        value: q.value,
        source: q.source,
        ageMs: 0,
        symbol: detectChartSymbol().root,
        mode: getUpdateMode(),
      });
        // #endregion
        return q;
      }
    }

    const cachedBridge = readBridgeCacheSync(anchor) ?? readBridgeCacheSync(null);
    if (cachedBridge != null && lastQuote && now - lastQuote.timestamp < 250) {
      return lastQuote;
    }

    // #region agent log
    dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
      path: "null",
      symbol: detectChartSymbol().root,
      mode: getUpdateMode(),
    });
    // #endregion
    return lastQuote && now - lastQuote.timestamp < 2000
      ? { ...lastQuote, ageMs: now - lastQuote.timestamp }
      : null;
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
      const q = makeQuote(bridge, "tradingview_live", bridgeCache.ts || Date.now());
      if (lastQuote && isLiveQuoteSource(lastQuote.source) && Date.now() - lastQuote.timestamp < 2000) {
        return lastQuote;
      }
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
  let pricePollTimer = null;
  let tickCount = 0;

  function applyTick(value, source, timestamp) {
    if (!Number.isFinite(value)) return;
    const det = detectChartSymbol();
    let src = source || "tradingview_live";
    if (getUpdateMode() === "minute") {
      const bucket = minuteBucket(timestamp);
      if (lastMinuteBucket === bucket && lastWatchedPrice != null) return;
      lastMinuteBucket = bucket;
      src = "tv_1m_close";
    }
    const q = makeQuote(value, src, timestamp || Date.now());
    if (lastWatchedPrice != null && Math.abs(q.value - lastWatchedPrice) < 0.25) return;
    lastWatchedPrice = q.value;
    lastQuote = q;
    tickCount += 1;
    if (!isLiveQuoteSource(q.source)) {
      bridgeCache = { price: q.value, ts: q.timestamp, source: q.source };
    }
    // #region agent log
    dbgPrice("F", "chart-price.js:applyTick", "tick-emit", {
      value: q.value,
      source: q.source,
      ageMs: q.ageMs,
      observed: Boolean(observedPriceEl),
      tickCount,
      symbol: det.root,
      path: getUpdateMode() === "minute" ? "minute" : "tick",
      mode: getUpdateMode(),
    });
    // #endregion
    priceChangeCb?.(q.value, q);
  }

  function emitPriceIfChanged() {
    if (getUpdateMode() === "minute") {
      const bucket = minuteBucket(Date.now());
      if (bucket === lastMinuteBucket && lastWatchedPrice != null) return;
      const legend = readFromLegendClose(priceAnchor());
      const pinned = readPinnedPrice();
      const value = legend ?? pinned;
      if (value != null) {
        applyTick(value, "tv_1m_close", Date.now());
        return;
      }
      const q = readQuoteSync();
      if (!q) {
        dbgPrice("F", "chart-price.js:emitPriceIfChanged", "no-quote", {
          observed: Boolean(observedPriceEl),
          symbol: detectChartSymbol().root,
          mode: "minute",
        });
        return;
      }
      applyTick(q.value, "tv_1m_close", Date.now());
      return;
    }
    const pinned = readPinnedPrice();
    if (pinned != null) {
      applyTick(pinned, "tradingview_live", Date.now());
      return;
    }
    const q = readQuoteSync();
    if (!q) {
      // #region agent log
      dbgPrice("F", "chart-price.js:emitPriceIfChanged", "no-quote", {
        observed: Boolean(observedPriceEl),
        symbol: detectChartSymbol().root,
        mode: "tick",
      });
      // #endregion
      return;
    }
    applyTick(q.value, q.source, q.timestamp);
  }

  function attachPriceObserver() {
    const el = findLivePriceEl();
    if (el === observedPriceEl) return;
    priceObserver?.disconnect();
    observedPriceEl = el;
    // #region agent log
    dbgPrice("J", "chart-price.js:attachPriceObserver", "observer-el", {
      found: Boolean(el),
      cls: el ? String(el.className || "").slice(0, 80) : null,
    });
    // #endregion
    if (!el) return;
    priceObserver = new MutationObserver(() => emitPriceIfChanged());
    priceObserver.observe(el, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "DC_PRICE_TICK") return;
    if (getUpdateMode() === "minute") return;
    const src = event.data.source || "tradingview_live";
    if (src === "tv_bar_close" || src === "tv_1m_close") {
      if (lastQuote && isLiveQuoteSource(lastQuote.source) && Date.now() - lastQuote.timestamp < 2000) {
        return;
      }
    }
    const n = Number(event.data.price);
    if (!Number.isFinite(n)) return;
    applyTick(n, src, event.data.ts);
  });

  function restartPricePoll() {
    if (pricePollTimer) {
      clearInterval(pricePollTimer);
      pricePollTimer = null;
    }
    const ms = getUpdateMode() === "minute" ? 1000 : PRICE_WATCH_POLL_MS;
    pricePollTimer = setInterval(() => {
      attachPriceObserver();
      emitPriceIfChanged();
    }, ms);
  }

  function startPriceWatcher(cb) {
    priceChangeCb = cb;
    attachPriceObserver();
    restartPricePoll();
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
    setUpdateMode,
    getUpdateMode,
    detectChartSymbol,
    invalidate: () => {
      bridgeCache = { price: null, ts: 0, source: null };
      lastQuote = null;
      lastWatchedPrice = null;
      lastMinuteBucket = -1;
    },
  };
})();
