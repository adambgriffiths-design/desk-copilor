/**
 * Read MNQ last print from TradingView — header last first; never bid/ask from quote strip.
 */
(function () {
  const PRICE_REV = "1.4.118";
  if (window.__dcChartPriceRev === PRICE_REV) return;
  try {
    window.DeskCopilotChartPrice?.stopWatcher?.();
  } catch {
    /* ignore */
  }
  window.__dcChartPriceRev = PRICE_REV;
  const LIVE_PRICE_MAX_AGE_MS = 60_000;
  const PRICE_HINT_MAX_AGE_MS = 60_000;
  const BRIDGE_CACHE_MS = 300;
  const SYNC_BRIDGE_MAX_MS = 2000;
  const PRICE_WATCH_POLL_MS = 50;
  const TICK_LIVE_MAX_AGE_MS = 2000;
  const TICK_STALE_MAX_AGE_MS = 60_000;
  // #region agent log
  let dbgPriceLast = 0;
  try {
    chrome.runtime.sendMessage({
      type: "DEBUG_LOG",
      payload: {
        sessionId: "600bac",
        runId: "post-fix",
        hypothesisId: "J",
        location: "chart-price.js:boot",
        message: "chart-price loaded",
        data: { href: String(location.href || "").slice(0, 80), version: PRICE_REV },
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
          runId: "post-fix",
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
  function dbgJump(hypothesisId, location, message, data) {
    try {
      chrome.runtime.sendMessage({
        type: "DEBUG_LOG",
        payload: {
          sessionId: "600bac",
          runId: "post-fix",
          hypothesisId,
          location,
          message,
          data: data || {},
          timestamp: Date.now(),
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

  function usableMnqPx(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 20000 || n > 45000) return null;
    return roundMnq(n);
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

  /** Any node inside the chart legend — O/H/L/C valueValue cells, not live Last. */
  function isFrozenLegendEl(el) {
    if (!el) return true;
    const cls = String(el.className || "");
    if (/unimportant/i.test(cls)) return true;
    let n = el;
    for (let i = 0; i < 12 && n; i++) {
      const blob = `${n.className || ""} ${n.getAttribute?.("data-name") || ""}`;
      if (/legend-source|legendSource|legend-item|legend-group/i.test(blob)) return true;
      n = n.parentElement;
    }
    return false;
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

  function parseAxisLastBadge(text) {
    const raw = String(text || "")
      .replace(/[\u2236\uFF1A\uA789]/g, ":")
      .replace(/[\u00a0\s\u202f]+/g, " ")
      .trim();
    const lastBox = [
      ...raw.matchAll(/(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)(?=\s*0[0-4]:\d{2}\b)/g),
    ];
    if (!lastBox.length) return null;
    const n = parseFloat(lastBox[lastBox.length - 1][1].replace(/,/g, ""));
    return n >= 20000 && n <= 45000 ? roundMnq(n) : null;
  }

  function parseCompactAxisPrice(text) {
    const boxed = parseAxisLastBadge(text);
    if (boxed != null) return boxed;
    const raw = String(text || "")
      .replace(/[\u2236\uFF1A\uA789]/g, ":")
      .replace(/[\u00a0\s\u202f]+/g, " ")
      .trim();
    if (!raw || raw.length > 24) return null;
    const m = raw.match(/(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ""));
    return n >= 20000 && n <= 45000 ? roundMnq(n) : null;
  }

  function parseAxisPriceText(text) {
    return parseAxisLastBadge(text) ?? parseCompactAxisPrice(text);
  }

  function isLastValueWidget(el) {
    const blob = `${el?.className || ""} ${el?.getAttribute?.("data-name") || ""}`;
    return /price-axis-last|lastValue|last-value|lastValueBar/i.test(blob);
  }

  function insideDeskPanel(el) {
    try {
      return !!(el && el.closest && el.closest("#dc-panel"));
    } catch {
      return false;
    }
  }

  function axisSearchRootsForPrice(paneRect, canvas) {
    const roots = [];
    const seen = new Set();
    const add = (el) => {
      if (!el || seen.has(el) || el.id === "dc-panel") return;
      seen.add(el);
      roots.push(el);
    };
    let node = canvas?.parentElement;
    if (node) add(node);
    for (let i = 0; i < 5 && node; i++) {
      for (const child of node.children || []) {
        if (child.id === "dc-panel" || insideDeskPanel(child)) continue;
        const r = child.getBoundingClientRect();
        if (r.height < 24 || r.width < 8) continue;
        if (r.right < paneRect.right - 280) continue;
        if (r.left > paneRect.right + 180) continue;
        add(child);
        if (child.shadowRoot) add(child.shadowRoot);
      }
      node = node.parentElement;
    }
    return roots;
  }

  /** Pin the colored last-value badge on the right axis — not scale tick labels. */
  function findAxisLastEl() {
    const paneInfo = findChartPaneForPrice();
    const paneRect = paneInfo?.rect;
    if (!paneRect) {
      dbgPrice("P", "chart-price.js:findAxisLastEl", "axis-miss", { reason: "no-pane" });
      return null;
    }
    let bestCanvas = null;
    let bestArea = 0;
    for (const canvas of document.querySelectorAll("canvas")) {
      const r = canvas.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea && r.width > 280 && r.height > 160) {
        bestArea = area;
        bestCanvas = canvas;
      }
    }
    const searchRoots = axisSearchRootsForPrice(paneRect, bestCanvas);
    const minLeft = paneRect.right - 360;
    const maxLeft = paneRect.right + 180;
    const top = paneRect.top - 16;
    const bot = paneRect.bottom + 16;
    const timers = [];
    const compact = [];
    const lastValueEls = [];
    const opaqueEls = [];
    const priceSnippets = [];
    const visit = (el) => {
      if (!el || insideDeskPanel(el) || isFrozenLegendEl(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const nearAxisRight = r.right >= paneRect.right - 80 && r.left <= paneRect.right + 180;
      const inAxisCol = r.left >= minLeft && r.left <= maxLeft;
      if (!nearAxisRight && !inAxisCol) return;
      if (r.bottom < top || r.top > bot) return;
      const leaf = String(el.textContent || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\u2236\uFF1A\uA789]/g, ":")
        .trim();
      if (/^\d{2}:\d{2}$/.test(leaf)) {
        const mm = Number(leaf.slice(0, 2));
        if (mm >= 0 && mm <= 4 && r.width <= 220 && r.height <= 48) timers.push(el);
      }
      const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length >= 8 && text.length <= 80 && /0[0-4]:\d{2}/.test(text)) compact.push(el);
      if (isLastValueWidget(el)) lastValueEls.push(el);
      try {
        const cs = getComputedStyle(el);
        const bg = String(cs.backgroundColor || "");
        const img = cs.backgroundImage && cs.backgroundImage !== "none";
        const m = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
        const a = m && (m[4] == null ? 1 : Number(m[4]));
        const modern = /oklch|oklab|color\(|hsla?\(|hwb\(|lab\(|lch\(|#[0-9a-f]{3,8}/i.test(bg);
        const filled = img || (m && a >= 0.25) || (modern && bg !== "transparent");
        if (filled && r.width >= 20 && r.width <= 160 && r.height >= 12 && r.height <= 56) {
          opaqueEls.push(el);
        }
      } catch {
        /* ignore */
      }
      if (priceSnippets.length < 6 && text.length <= 40 && /\d{4,}/.test(text)) priceSnippets.push(text);
    };
    const walkRoot = (root) => {
      if (!root) return;
      if (root.nodeType === 1) visit(root);
      for (const el of root.querySelectorAll?.("*") || []) {
        visit(el);
        if (el.shadowRoot) walkRoot(el.shadowRoot);
      }
    };
    if (searchRoots.length) {
      for (const root of searchRoots) walkRoot(root);
    } else {
      for (const root of collectDomRoots()) walkRoot(root);
    }
    if (!timers.length) {
      for (const el of document.querySelectorAll("div, span, label, td")) {
        if (insideDeskPanel(el) || isFrozenLegendEl(el)) continue;
        const leaf = String(el.textContent || "")
          .replace(/[\u200B-\u200D\uFEFF]/g, "")
          .replace(/[\u2236\uFF1A\uA789]/g, ":")
          .trim();
        if (!/^\d{2}:\d{2}$/.test(leaf)) continue;
        const mm = Number(leaf.slice(0, 2));
        if (mm < 0 || mm > 4) continue;
        const r = el.getBoundingClientRect();
        if (r.left < minLeft || r.bottom < top || r.top > bot) continue;
        if (r.width > 220 || r.height > 48) continue;
        timers.push(el);
      }
    }
    let best = null;
    let bestScore = -1;
    const consider = (el, overrideText, overrideRect, overridePrice) => {
      if (!el || isFrozenLegendEl(el) || insideDeskPanel(el)) return;
      const text = String(overrideText != null ? overrideText : el.innerText || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text || text.length > 80) return;
      const n = overridePrice != null ? overridePrice : parseAxisLastBadge(text);
      if (n == null) return;
      const r = overrideRect || el.getBoundingClientRect();
      if (r.width < 16 || r.width > 280 || r.height < 10 || r.height > 160) return;
      const area = r.width * r.height;
      let score = 30 - area / 500;
      if (text.length <= 32) score += 8;
      if (isLastValueWidget(el)) score += 40;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    };
    for (const timer of timers) {
      let node = timer;
      for (let i = 0; i < 8 && node; i++) {
        consider(node);
        node = node.parentElement;
      }
      const sib = timer.previousElementSibling;
      if (sib) {
        consider(sib);
        const r1 = sib.getBoundingClientRect();
        const r2 = timer.getBoundingClientRect();
        consider(sib, `${sib.innerText || sib.textContent || ""} ${timer.textContent || ""}`, {
          width: Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left),
          height: Math.max(r1.bottom, r2.bottom) - Math.min(r1.top, r2.top),
          left: Math.min(r1.left, r2.left),
          top: Math.min(r1.top, r2.top),
          bottom: Math.max(r1.bottom, r2.bottom),
        });
      }
    }
    if (!best) {
      for (const el of compact) consider(el);
    }
    if (!best) {
      for (const el of lastValueEls) {
        const n = parseCompactAxisPrice(el.innerText || el.textContent);
        if (n != null) consider(el, el.innerText || el.textContent, null, n);
      }
    }
    if (!best && opaqueEls.length && opaqueEls.length <= 12) {
      for (const el of opaqueEls) {
        if (el.getBoundingClientRect().height < 12) continue;
        const n = parseCompactAxisPrice(el.innerText || el.textContent);
        if (n != null) consider(el, el.innerText || el.textContent, null, n);
      }
    }
    // #region agent log
    dbgPrice("P", "chart-price.js:findAxisLastEl", best ? "axis-last" : "axis-miss", {
      pinClass: best ? String(best.className || "").slice(0, 80) : null,
      value: best ? parseAxisPriceText(best.innerText || best.textContent) : null,
      score: Math.round(bestScore * 10) / 10,
      timers: timers.length,
      compactHits: compact.length,
      lastValueHits: lastValueEls.length,
      opaqueHits: opaqueEls.length,
      opaqueSample: opaqueEls.slice(0, 6).map((el) => {
        const r = el.getBoundingClientRect();
        const text = String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        return {
          tag: el.tagName || "",
          cls: String(el.className || "").slice(0, 48),
          text: text.slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
          left: Math.round(r.left),
          parsed: parseCompactAxisPrice(text),
        };
      }),
      axisRoots: searchRoots.length,
      paneRight: Math.round(paneRect.right),
      priceSnippets,
      pinText: best
        ? String(best.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48)
        : null,
    });
    // #endregion
    return bestScore >= 4 ? best : null;
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
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (isFrozenLegendEl(el)) continue;
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
  let lastTickMeta = {
    chosen: null,
    rawSnippet: null,
    series: null,
    legend: null,
    dom: null,
    axis: null,
    symbol: null,
    parseOk: null,
    completedClose: null,
    formingOpen: null,
    formingClose: null,
  };

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
        if (!text || text.length > 48) continue;
        if (!/\d{1,2},\d{3}(?:\.\d{1,2})?/.test(text) && !/\d{5}\.\d{1,2}/.test(text)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.height > 56) continue;
        if (isFrozenLegendEl(el)) continue;
        const inHeader = r.top >= 0 && r.bottom <= headerBottom;
        const onAxis = r.left >= axisLeft;
        if (inHeader) continue;
        if (!onAxis) continue;
        let n = parseMnqPrice(text, trustedAnchor);
        if (n == null && trustedAnchor != null) n = parseMnqPrice(text, null);
        if (n == null) continue;
        const known = lastWatchedPrice ?? lastQuote?.value ?? trustedAnchor;
        if (known != null && Math.abs(n - known) > 80) continue;
        let score = inHeader ? 6 : 8;
        if (onAxis) score += 10;
        if (text.includes(",")) score += 4;
        if (n >= 25000) score += 2;
        const cls = String(el.className || "");
        if (/last|js-symbol-last|lastValue/i.test(cls) || el.getAttribute?.("data-field") === "last") score += 12;
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
    if (hits[0].el && !isFrozenLegendEl(hits[0].el)) observedPriceEl = hits[0].el;
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
    '[class*="lastPriceLabel"]',
  ];

  function findLivePriceEl() {
    const preferred = detectChartSymbol().root;
    if (observedPriceEl && observedPriceEl.isConnected && !isFrozenLegendEl(observedPriceEl)) {
      const text = (observedPriceEl.innerText || observedPriceEl.textContent || "").replace(/\s+/g, " ").trim();
      const n = parseMnqPrice(text, priceAnchor()) ?? parseMnqPrice(text, null);
      if (n != null && symbolMatchScore(observedPriceEl, preferred) >= 0) return observedPriceEl;
    }
    if (observedPriceEl && isFrozenLegendEl(observedPriceEl)) {
      // #region agent log
      dbgPrice("N", "chart-price.js:findLivePriceEl", "drop-frozen-legend", {
        pinClass: String(observedPriceEl.className || "").slice(0, 80),
      });
      // #endregion
      observedPriceEl = null;
    }
    let best = null;
    let bestScore = -1;
    for (const sel of LIVE_PRICE_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (isFrozenLegendEl(el)) continue;
        const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const n = parseMnqPrice(text, priceAnchor()) ?? parseMnqPrice(text, null);
        if (n == null) continue;
        const r = el.getBoundingClientRect();
        const cls = String(el.className || "");
        let score = 4 + symbolMatchScore(el, preferred);
        if (el.getAttribute("data-field") === "last" || /js-symbol-last/i.test(cls)) score += 16;
        if (r.left >= window.innerWidth - 160) score += 12;
        else if (r.top >= 0 && r.bottom <= 140) score += 6;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    if (best && bestScore >= 16) return best;
    const axisEl = findAxisLastEl();
    if (axisEl) return axisEl;
    return observedPriceEl && observedPriceEl.isConnected && !isFrozenLegendEl(observedPriceEl)
      ? observedPriceEl
      : null;
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
    if (getUpdateMode() === "minute") {
      if (lastQuote && lastQuote.source === "tv_1m_close") {
        const px = usableMnqPx(lastQuote.value);
        if (px != null) return { ...lastQuote, value: px, ageMs: now - lastQuote.timestamp };
      }
      dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
        path: "minute-null",
        symbol: detectChartSymbol().root,
        mode: "minute",
        chosen: lastTickMeta.chosen,
        completedClose: lastTickMeta.completedClose ?? null,
      });
      return null;
    }

    // Tick mode: DC_PRICE_TICK owns the Last badge. Never re-parse with
    // parseMnqPrice (first comma-price = scale/high) or restamp freshness.
    if (getUpdateMode() === "tick") {
      const live =
        lastQuote &&
        (lastQuote.source === "tradingview_live" || lastQuote.source === "tradingview_quote");
      const ageMs = live ? now - lastQuote.timestamp : null;
      if (live && ageMs <= TICK_STALE_MAX_AGE_MS) {
        dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
          path: "tick-last",
          value: lastQuote.value,
          source: lastQuote.source,
          ageMs,
          symbol: lastTickMeta.symbol || detectChartSymbol().root,
          mode: "tick",
          chosen: lastTickMeta.chosen,
          rawSnippet: lastTickMeta.rawSnippet,
        });
        return { ...lastQuote, ageMs };
      }
      const axisEl = findAxisLastEl();
      const axisPx = axisEl
        ? parseAxisPriceText(axisEl.innerText || axisEl.textContent)
        : null;
      if (axisPx != null) {
        const q = makeQuote(axisPx, "tradingview_live", now);
        lastQuote = q;
        lastTickMeta = {
          chosen: "axis-badge-isolated",
          rawSnippet: String(axisEl.innerText || axisEl.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 96),
          series: lastTickMeta.series,
          legend: lastTickMeta.legend,
          dom: axisPx,
          axis: axisPx,
          symbol: detectChartSymbol().root,
          parseOk: true,
        };
        dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
          path: "axis-badge",
          value: q.value,
          source: q.source,
          ageMs: 0,
          symbol: lastTickMeta.symbol,
          mode: "tick",
          chosen: lastTickMeta.chosen,
          rawSnippet: lastTickMeta.rawSnippet,
        });
        return q;
      }
      dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
        path: "tick-null",
        symbol: detectChartSymbol().root,
        mode: "tick",
        ageMs,
        chosen: lastTickMeta.chosen,
        rawSnippet: lastTickMeta.rawSnippet,
      });
      return null;
    }

    const anchor = priceAnchor();

    if (lastQuote && now - lastQuote.timestamp < 80) {
      return { ...lastQuote, ageMs: now - lastQuote.timestamp };
    }

    if (lastQuote && now - lastQuote.timestamp < 1500 && lastQuote.source === "tradingview_live") {
      return { ...lastQuote, ageMs: now - lastQuote.timestamp };
    }

    const pinned = readPinnedPrice();
    if (pinned != null) {
      const q = makeQuote(pinned, "tradingview_live", now);
      lastQuote = q;
      // #region agent log
      const pinEl = observedPriceEl;
      dbgPrice("H", "chart-price.js:readQuoteSync", "quote", {
        path: "pin",
        value: q.value,
        source: q.source,
        ageMs: 0,
        symbol: detectChartSymbol().root,
        mode: getUpdateMode(),
        pinClass: pinEl ? String(pinEl.className || "").slice(0, 80) : null,
        pinField: pinEl?.getAttribute?.("data-field") || null,
      });
      // #endregion
      return q;
    }

    let hit = readFromHeaderLast(anchor) ?? readFromQuoteStrip(anchor);
    if (!hit && anchor != null) {
      hit = readFromHeaderLast(null) ?? readFromQuoteStrip(null);
    }
    if (hit != null) {
      if (lastQuote && now - lastQuote.timestamp < 1500 && Math.abs(hit - lastQuote.value) > 0.5) {
        return { ...lastQuote, ageMs: now - lastQuote.timestamp };
      }
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
        if (lastQuote && now - lastQuote.timestamp < 2000 && Math.abs(slow.value - lastQuote.value) > 0.5) {
          return { ...lastQuote, ageMs: now - lastQuote.timestamp };
        }
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
    if (getUpdateMode() === "tick") return readQuoteSync();
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
    const px = usableMnqPx(value);
    if (px == null) return;
    const det = detectChartSymbol();
    let src = source || "tradingview_live";
    let ts = timestamp || Date.now();
    if (getUpdateMode() === "minute") {
      if ((source || src) !== "tv_1m_close") return;
      const bucket = minuteBucket(ts);
      if (lastMinuteBucket === bucket && lastWatchedPrice != null && lastQuote?.source === "tv_1m_close") {
        return;
      }
      lastMinuteBucket = bucket;
      src = "tv_1m_close";
      if (lastQuote?.source === "tv_1m_close" && lastWatchedPrice === px) {
        ts = lastQuote.timestamp;
      }
    }
    const q = makeQuote(px, src, ts);
    if (lastWatchedPrice === q.value) {
      lastQuote = q;
      priceChangeCb?.(q.value, q);
      return;
    }
    const jump = lastWatchedPrice != null ? Math.abs(q.value - lastWatchedPrice) : 0;
    // #region agent log
    if (jump >= 2) {
      dbgJump("A", "chart-price.js:applyTick", "price-jump", {
        prev: lastWatchedPrice,
        next: q.value,
        jump,
        source: src,
        mode: getUpdateMode(),
        symbol: det.root,
        tickCount,
      });
    }
    // #endregion
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
      const completed = usableMnqPx(lastTickMeta.completedClose);
      if (completed != null) {
        applyTick(completed, "tv_1m_close", Date.now());
        return;
      }
      dbgPrice("F", "chart-price.js:emitPriceIfChanged", "no-completed-close", {
        observed: Boolean(observedPriceEl),
        symbol: detectChartSymbol().root,
        mode: "minute",
        formingOpen: lastTickMeta.formingOpen ?? null,
        formingClose: lastTickMeta.formingClose ?? null,
      });
      return;
    }
    // Tick mode: MAIN-world DC_PRICE_TICK owns the Last box. Isolated poll
    // must not overwrite with header last / scale labels.
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
    if (event.source !== window || event.data?.type !== "DC_PRICE_DIAG") return;
    lastTickMeta = {
      chosen: event.data.chosen || lastTickMeta.chosen,
      rawSnippet: event.data.rawSnippet || lastTickMeta.rawSnippet,
      series: event.data.series ?? lastTickMeta.series,
      legend: event.data.legend ?? lastTickMeta.legend,
      dom: event.data.dom ?? lastTickMeta.dom,
      axis: event.data.axis ?? lastTickMeta.axis,
      symbol: event.data.symbol || lastTickMeta.symbol,
      parseOk: event.data.parseOk,
      completedClose: event.data.completedClose ?? lastTickMeta.completedClose,
      formingOpen: event.data.formingOpen ?? lastTickMeta.formingOpen,
      formingClose: event.data.formingClose ?? lastTickMeta.formingClose,
    };
    dbgJump("Q", "chart-price.js:DC_PRICE_DIAG", "tick-compare", {
      tvLastGuess: event.data.price ?? null,
      copilotDisplayed: lastWatchedPrice,
      chosen: event.data.chosen || null,
      rawSnippet: event.data.rawSnippet || null,
      failSnippets: event.data.failSnippets || null,
      timers: event.data.timers ?? null,
      axisRoots: event.data.axisRoots ?? null,
      compactHits: event.data.compactHits ?? null,
      paneRight: event.data.paneRight ?? null,
      lastValueHits: event.data.lastValueHits ?? null,
      opaqueHits: event.data.opaqueHits ?? null,
      opaqueSample: event.data.opaqueSample || null,
      priceSnippets: event.data.priceSnippets || null,
      series: event.data.series ?? null,
      legend: event.data.legend ?? null,
      completedClose: event.data.completedClose ?? null,
      formingOpen: event.data.formingOpen ?? null,
      formingClose: event.data.formingClose ?? null,
      parseOk: event.data.parseOk,
      ageMs: lastQuote ? Date.now() - lastQuote.timestamp : null,
      symbol: event.data.symbol || detectChartSymbol().root,
      mode: getUpdateMode(),
      chartOk: event.data.chartOk ?? null,
      candleCount: event.data.candleCount ?? null,
    });
    if (getUpdateMode() === "minute") {
      const completed = usableMnqPx(event.data.completedClose);
      if (completed != null) applyTick(completed, "tv_1m_close", event.data.ts);
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "DC_PRICE_TICK") return;
    const completed = usableMnqPx(event.data.completedClose);
    if (getUpdateMode() === "minute") {
      dbgJump("M", "chart-price.js:DC_PRICE_TICK", "minute-ohlc", {
        completedClose: completed,
        formingOpen: event.data.formingOpen ?? null,
        formingClose: event.data.formingClose ?? null,
        live: event.data.price ?? null,
        symbol: event.data.symbol || detectChartSymbol().root,
      });
      if (completed != null) applyTick(completed, "tv_1m_close", event.data.ts);
      return;
    }
    const src = event.data.source || "tradingview_live";
    const n = Number(event.data.price);
    if (!Number.isFinite(n)) return;
    const series = event.data.series ?? null;
    const legend = event.data.legend ?? null;
    const dom = event.data.dom ?? null;
    const axis = event.data.axis ?? null;
    const rawSnippet = event.data.rawSnippet || event.data.pinText || null;
    lastTickMeta = {
      chosen: event.data.chosen || "axis-badge",
      rawSnippet,
      series,
      legend,
      dom,
      axis,
      symbol: event.data.symbol || detectChartSymbol().root,
      parseOk: true,
    };
    const spread = [series, legend, dom, axis].filter((v) => Number.isFinite(v));
    const maxSpread =
      spread.length >= 2 ? Math.max(...spread) - Math.min(...spread) : 0;
    dbgJump("K", "chart-price.js:DC_PRICE_TICK", "tick-compare", {
      tvLastGuess: n,
      copilotDisplayed: lastWatchedPrice,
      chosen: lastTickMeta.chosen,
      rawSnippet,
      series,
      legend,
      dom,
      axis,
      maxSpread,
      ageMs: 0,
      symbol: lastTickMeta.symbol,
      source: src,
      pinW: event.data.pinW ?? null,
      pinH: event.data.pinH ?? null,
    });
    applyTick(n, "tradingview_live", event.data.ts);
  });

  function restartPricePoll() {
    if (pricePollTimer) {
      clearInterval(pricePollTimer);
      pricePollTimer = null;
    }
    const ms = getUpdateMode() === "minute" ? 1000 : 250;
    pricePollTimer = setInterval(() => {
      if (getUpdateMode() !== "tick") {
        attachPriceObserver();
        emitPriceIfChanged();
        return;
      }
      const fresh =
        lastQuote &&
        lastQuote.source === "tradingview_live" &&
        Date.now() - lastQuote.timestamp < TICK_LIVE_MAX_AGE_MS;
      if (fresh) return;
      const axisEl = findAxisLastEl();
      const axisPx = axisEl
        ? parseAxisPriceText(axisEl.innerText || axisEl.textContent)
        : null;
      if (axisPx != null) applyTick(axisPx, "tradingview_live", Date.now());
    }, ms);
  }

  function startPriceWatcher(cb) {
    priceChangeCb = cb;
    if (getUpdateMode() !== "tick") attachPriceObserver();
    restartPricePoll();
    if (getUpdateMode() === "tick") {
      const axisEl = findAxisLastEl();
      const axisPx = axisEl
        ? parseAxisPriceText(axisEl.innerText || axisEl.textContent)
        : null;
      if (axisPx != null) applyTick(axisPx, "tradingview_live", Date.now());
    } else {
      emitPriceIfChanged();
    }
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
    lastTickMeta: () => lastTickMeta,
    TICK_LIVE_MAX_AGE_MS,
    TICK_STALE_MAX_AGE_MS,
    invalidate: () => {
      bridgeCache = { price: null, ts: 0, source: null };
      lastQuote = null;
      lastWatchedPrice = null;
      lastMinuteBucket = -1;
    },
  };
})();
