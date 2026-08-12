/**
 * Draw Desk Copilot levels on TradingView — native chart API (if found) + overlay fallback.
 */
(function () {
  const OVERLAY_ID = "dc-level-overlay";
  const PAGE_SCRIPT_ID = "dc-tv-page-bridge";
  const STORAGE_KEY = "dc-levels-cache";

  let activeLevels = [];
  let activeZones = [];
  let activePriceHint = null;
  let activeVisibleRange = null;
  let overlayOn = false;
  let resizeObserver = null;
  let resizeDebounce = null;

  function injectPageBridge() {
    if (document.getElementById(PAGE_SCRIPT_ID)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = PAGE_SCRIPT_ID;
      script.src = chrome.runtime.getURL("tv-bridge.js");
      script.onload = () => setTimeout(resolve, 100);
      script.onerror = () => {
        script.remove();
        resolve();
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function parsePrice(text) {
    if (!text) return null;
    const cleaned = text.replace(/[\u00a0\s]/g, "").replace(/,/g, "");
    const m = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    if (!Number.isFinite(n)) return null;
    if (n > 0 && n < 50) return null;
    return n;
  }

  function findChartPane() {
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
    if (bestCanvas) {
      let node = bestCanvas.parentElement;
      for (let i = 0; i < 6 && node; i++) {
        const r = node.getBoundingClientRect();
        if (r.width > 300 && r.height > 200) return node;
        node = node.parentElement;
      }
      return bestCanvas.parentElement;
    }

    const selectors = [
      ".chart-markup-table",
      ".chart-container",
      '[class*="chart-gui-wrapper"]',
      "#tv_chart_container",
      '[data-name="pane"]',
    ];
    let best = null;
    let bestBox = 0;
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestBox && r.width > 200 && r.height > 120) {
          bestBox = area;
          best = el;
        }
      }
    }
    return best;
  }

  function scanPriceLabels(paneRect) {
    const points = [];
    const seen = new Set();
    const minX = paneRect ? paneRect.right - Math.max(220, paneRect.width * 0.35) : window.innerWidth * 0.72;

    const roots = [document];
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        if (iframe.contentDocument) roots.push(iframe.contentDocument);
      } catch {
        /* cross-origin */
      }
    }

    for (const root of roots) {
      const nodes = root.querySelectorAll?.("span, div, td, label, p") || [];
      for (const el of nodes) {
        const text = (el.textContent || "").trim();
        if (!text || text.length > 18) continue;
        const price = parsePrice(text);
        if (price == null) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (paneRect) {
          if (r.bottom < paneRect.top - 20 || r.top > paneRect.bottom + 20) continue;
          if (r.left < minX && r.right < paneRect.left + paneRect.width * 0.55) continue;
        } else if (r.left < minX) {
          continue;
        }
        const key = `${price.toFixed(2)}:${Math.round(r.top)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push({ price, y: r.top + r.height / 2, x: r.left });
      }
    }

    if (points.length < 2) return null;

    points.sort((a, b) => a.y - b.y);
    const deduped = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = deduped[deduped.length - 1];
      if (Math.abs(points[i].y - prev.y) > 6) deduped.push(points[i]);
    }
    if (deduped.length < 2) return null;

    const top = deduped[0];
    const bot = deduped[deduped.length - 1];
    if (top.price === bot.price) return null;
    return { top, bot, points: deduped, source: "axis" };
  }

  function buildScale(levels, zones, priceHint, pane) {
    if (!pane) return null;
    const paneRect = pane.getBoundingClientRect();
    if (paneRect.width < 100 || paneRect.height < 80) return null;

    const axis = scanPriceLabels(paneRect);
    if (axis) {
      const yTop = Math.min(axis.top.y, axis.bot.y);
      const yBot = Math.max(axis.top.y, axis.bot.y);
      const minP = Math.min(axis.top.price, axis.bot.price);
      const maxP = Math.max(axis.top.price, axis.bot.price);
      if (maxP > minP && yBot > yTop) {
        return { pane, paneRect, minP, maxP, yTop, yBot, source: "axis" };
      }
    }

    const prices = [
      ...(levels || []).map((l) => Number(l.price)),
      ...(zones || []).flatMap((z) => [Number(z.top), Number(z.bottom)]),
    ].filter(Number.isFinite);
    if (!prices.length && !priceHint) return null;

    let minP = priceHint?.visibleMin;
    let maxP = priceHint?.visibleMax;
    if (!Number.isFinite(minP) || !Number.isFinite(maxP)) {
      minP = Math.min(...prices);
      maxP = Math.max(...prices);
      const pad = Math.max((maxP - minP) * 0.1, 12);
      minP -= pad;
      maxP += pad;
    }
    if (maxP <= minP) return null;

    const yTop = paneRect.top + 12;
    const yBot = paneRect.bottom - 36;
    return { pane, paneRect, minP, maxP, yTop, yBot, source: "hint" };
  }

  function ensureOverlay() {
    let root = document.getElementById(OVERLAY_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
    if (!document.getElementById("dc-level-overlay-style")) {
      const style = document.createElement("style");
      style.id = "dc-level-overlay-style";
      style.textContent = `
#${OVERLAY_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 999990; }
#${OVERLAY_ID} .dc-lvl-zone {
  position: fixed; box-sizing: border-box; opacity: 0.92;
  border-top: 1px solid; border-bottom: 1px solid;
}
#${OVERLAY_ID} .dc-lvl-ce {
  position: fixed; height: 0; border-top: 1px solid #e879f9; opacity: 0.95;
}
#${OVERLAY_ID} .dc-lvl-line { position: fixed; height: 0; border-top: 2px dashed; opacity: 0.92; }
`;
      document.head.appendChild(style);
    }
    return root;
  }

  function priceToY(price, scale) {
    const { minP, maxP, yTop, yBot } = scale;
    const h = yBot - yTop || 1;
    return yTop + h * (1 - (price - minP) / (maxP - minP));
  }

  function timeToX(unixSec, visibleRange, paneRect) {
    const left = paneRect.left + 4;
    const right = paneRect.right - 4;
    const width = Math.max(40, right - left);
    if (!visibleRange || !Number.isFinite(unixSec)) return left;
    const from = Number(visibleRange.from);
    const to = Number(visibleRange.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return left;
    const t = Math.max(from, Math.min(to, unixSec));
    const ratio = (t - from) / (to - from);
    return left + ratio * width;
  }

  function renderOverlay(levels, zones, priceHint, visibleRange) {
    const pane = findChartPane();
    const scale = buildScale(levels, zones, priceHint, pane);
    const root = ensureOverlay();
    root.innerHTML = "";

    if (!scale) {
      return { ok: false, method: "overlay", reason: "no_chart_pane" };
    }

    const { paneRect } = scale;
    const range = visibleRange || activeVisibleRange;
    let drawn = 0;
    const endX = paneRect.right - 4;

    for (const zone of zones || []) {
      const top = Number(zone.top);
      const bottom = Number(zone.bottom);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const yTop = priceToY(Math.max(top, bottom), scale);
      const yBot = priceToY(Math.min(top, bottom), scale);
      if (yBot < paneRect.top - 2 && yTop < paneRect.top - 2) continue;
      if (yTop > paneRect.bottom + 2 && yBot > paneRect.bottom + 2) continue;

      const startX = timeToX(Number(zone.startTime), range, paneRect);
      const box = document.createElement("div");
      box.className = "dc-lvl-zone";
      box.style.left = `${Math.min(startX, endX)}px`;
      box.style.width = `${Math.max(8, endX - Math.min(startX, endX))}px`;
      box.style.top = `${Math.min(yTop, yBot)}px`;
      box.style.height = `${Math.max(2, Math.abs(yBot - yTop))}px`;
      box.style.backgroundColor = zone.fill || "rgba(251, 191, 133, 0.38)";
      box.style.borderColor = zone.borderColor || zone.color || "#78716c";
      root.appendChild(box);
      drawn += 1;

      if (zone.kind === "fvg" && Number.isFinite(Number(zone.ce))) {
        const ceY = priceToY(Number(zone.ce), scale);
        const ce = document.createElement("div");
        ce.className = "dc-lvl-ce";
        ce.style.left = `${Math.min(startX, endX)}px`;
        ce.style.width = `${Math.max(8, endX - Math.min(startX, endX))}px`;
        ce.style.top = `${ceY}px`;
        root.appendChild(ce);
      }
    }

    for (const level of levels) {
      const price = Number(level.price);
      if (!Number.isFinite(price)) continue;
      const y = priceToY(price, scale);
      if (y < paneRect.top - 2 || y > paneRect.bottom + 2) continue;

      const startX = timeToX(Number(level.startTime), range, paneRect);
      const line = document.createElement("div");
      line.className = "dc-lvl-line";
      line.style.left = `${Math.min(startX, endX)}px`;
      line.style.width = `${Math.max(8, endX - Math.min(startX, endX))}px`;
      line.style.top = `${y}px`;
      line.style.borderColor = level.color || "#22d3ee";
      root.appendChild(line);
      drawn += 1;
    }

    return {
      ok: drawn > 0,
      method: "overlay",
      count: drawn,
      source: scale.source,
    };
  }

  function attachResizeWatch() {
    if (typeof ResizeObserver === "undefined") return;
    detachResizeWatch();
    const pane = findChartPane();
    if (!pane) return;
    resizeObserver = new ResizeObserver(() => {
      if (!overlayOn) return;
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        renderOverlay(activeLevels, activeZones, activePriceHint, activeVisibleRange);
      }, 350);
    });
    resizeObserver.observe(pane);
  }

  function detachResizeWatch() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (resizeDebounce) {
      clearTimeout(resizeDebounce);
      resizeDebounce = null;
    }
  }

  function startSyncLoop() {
    attachResizeWatch();
  }

  function stopSyncLoop() {
    detachResizeWatch();
  }

  function waitForTvResult(timeoutMs) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, method: "tv_api", reason: "timeout" });
      }, timeoutMs);
      function onMsg(event) {
        if (event.source !== window || event.data?.type !== "DC_DRAW_TV_RESULT") return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve(event.data);
      }
      window.addEventListener("message", onMsg);
    });
  }

  function refreshVisibleRange() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(activeVisibleRange);
      }, 900);
      function onMsg(event) {
        if (event.source !== window || event.data?.type !== "DC_VISIBLE_RANGE") return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve(event.data.range || null);
      }
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "DC_GET_VISIBLE_RANGE" }, "*");
    });
  }

  function normalizeInput(input) {
    if (Array.isArray(input)) return { levels: input, zones: [], priceHint: null };
    return {
      levels: input?.levels || [],
      zones: input?.zones || [],
      priceHint: input?.priceHint || null,
    };
  }

  async function drawOnChart(input, preferOverlay) {
    const { levels, zones, priceHint } = normalizeInput(input);
    activeLevels = levels || [];
    activeZones = zones || [];
    activePriceHint = priceHint;
    if (!activeLevels.length && !activeZones.length) {
      return { ok: false, method: "overlay", reason: "no_levels" };
    }

    await injectPageBridge();
    activeVisibleRange = await refreshVisibleRange();

    if (!preferOverlay && (activeLevels.length || activeZones.length)) {
      window.postMessage(
        { type: "DC_DRAW_TV", levels: activeLevels, zones: activeZones },
        "*"
      );
      const tvResult = await waitForTvResult(3500);
      if (tvResult.ok) {
        overlayOn = false;
        stopSyncLoop();
        clearOverlay();
        return { ...tvResult, mode: "native", hint: "TradingView lines with labels." };
      }
    }

    overlayOn = true;
    const overlayResult = renderOverlay(
      activeLevels,
      activeZones,
      activePriceHint,
      activeVisibleRange
    );
    startSyncLoop();

    const sourceNote =
      overlayResult.source === "axis"
        ? "aligned to price scale"
        : "aligned to level range — zoom chart if lines look off";

    return {
      ...overlayResult,
      mode: "overlay",
      hint: overlayResult.ok
        ? `Overlay (${sourceNote}) — lines only, no duplicate labels.`
        : "Could not find chart — zoom in on candles, or use Pine indicator",
    };
  }

  function clearOverlay() {
    const root = document.getElementById(OVERLAY_ID);
    if (root) root.innerHTML = "";
  }

  function clearAll() {
    activeLevels = [];
    activeZones = [];
    activePriceHint = null;
    activeVisibleRange = null;
    overlayOn = false;
    stopSyncLoop();
    clearOverlay();
    void injectPageBridge().then(() => {
      window.postMessage({ type: "DC_DRAW_TV", action: "clear" }, "*");
    });
  }

  async function copyLevels(payload) {
    const text = payload?.clipboardText || formatClipboard(payload?.levels || []);
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function formatClipboard(levels) {
    return (levels || [])
      .map((l) => `${l.label}: ${Number(l.price).toFixed(2)}`)
      .join("\n");
  }

  function cacheLevels(payload) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), payload }));
    } catch {
      /* ignore */
    }
  }

  function loadCachedLevels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw)?.payload || null;
    } catch {
      return null;
    }
  }

  window.DeskCopilotDraw = {
    draw: drawOnChart,
    clear: clearAll,
    copy: copyLevels,
    cache: cacheLevels,
    loadCache: loadCachedLevels,
    renderOverlay,
    getActiveLevels: () => activeLevels.slice(),
    isOverlayActive: () => overlayOn,
  };
})();
