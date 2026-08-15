/**
 * Draw Desk Copilot levels on TradingView — native chart API (if found) + overlay fallback.
 *
 * Renders filtered payload from /api/levels (see lib/drawing-levels.ts LEVEL DRAW CATALOG):
 * - Lines: ORG top/CE/bottom, NWOG, session H/L, PDH/PDL/PDC/EQ, NDOG, REH/REL
 * - Zones: daily FVGs, first presented 1m FVG, FHDR band
 * Visibility toggles applied in content.js via DeskCopilotLevelToggles.filter().
 */
(function () {
  const OVERLAY_ID = "dc-level-overlay";
  const PAGE_SCRIPT_ID = "dc-tv-page-bridge";
  const BRIDGE_REV = "1.4.112";
  const STORAGE_KEY = "dc-levels-cache";
  const PRICE_HINT_MAX_AGE_MS = 60000;

  let activeLevels = [];
  let activeZones = [];
  let activePriceHint = null;
  let activeVisibleRange = null;
  let overlayOn = false;
  let lastDrawFingerprint = "";
  let overlayLabelsOnly = false;
  let resizeObserver = null;
  let resizeDebounce = null;
  let trackRaf = null;
  let rangePollTimer = null;
  let lastTrackKey = "";
  let lastAxisScanAt = 0;
  let interacting = false;
  let interactionPane = null;
  let drawGeneration = 0;
  let overlayGeneration = 0;
  let nativeDrawInFlight = false;
  let drawMutex = Promise.resolve();
  const AXIS_INSET_DEFAULT_PX = 84;

  function syncBridgeRegistry() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(false);
      }, 280);
      function onMsg(event) {
        if (event.source !== window) return;
        if (event.data?.type === "DC_SYNC_REGISTRY_RESULT" || event.data?.type === "DC_BRIDGE_READY") {
          clearTimeout(timer);
          window.removeEventListener("message", onMsg);
          resolve(true);
        }
      }
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "DC_SYNC_REGISTRY" }, "*");
    });
  }

  function injectPageBridge() {
    const existing = document.getElementById(PAGE_SCRIPT_ID);
    if (existing && existing.dataset.dcRev === BRIDGE_REV) {
      return syncBridgeRegistry();
    }
    if (existing) existing.remove();
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.id = PAGE_SCRIPT_ID;
      script.dataset.dcRev = BRIDGE_REV;
      script.src = `${chrome.runtime.getURL("tv-bridge.js")}?v=${BRIDGE_REV}`;
      script.onload = () => setTimeout(() => syncBridgeRegistry().then(resolve), 100);
      script.onerror = () => {
        script.remove();
        resolve();
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function withDrawMutex(fn) {
    const run = drawMutex.then(fn);
    drawMutex = run.catch(() => {});
    return run;
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

  /** MNQ trades ~20k–45k; reject volume/indicator scales (often ~15k). */
  function isMnqPrice(n, anchor) {
    if (!Number.isFinite(n)) return false;
    if (Number.isFinite(anchor) && anchor > 0) {
      return n >= anchor * 0.88 && n <= anchor * 1.12;
    }
    return n >= 20000 && n <= 45000;
  }

  function priceAnchor(levels, zones, _priceHint) {
    const prices = [
      ...(levels || []).map((l) => Number(l.price)),
      ...(zones || []).flatMap((z) => [Number(z.top), Number(z.bottom)]),
    ].filter(Number.isFinite);
    if (!prices.length) return null;
    prices.sort((a, b) => a - b);
    return prices[Math.floor(prices.length / 2)];
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

  function scanPriceLabels(paneRect, anchor) {
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
        if (price == null || !isMnqPrice(price, anchor)) continue;
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

    const anchor = priceAnchor(levels, zones, priceHint);
    const yTop = paneRect.top + 12;
    const yBot = paneRect.bottom - 36;
    const axis = scanPriceLabels(paneRect, anchor);
    const axisInsetPx = estimateAxisInset(paneRect, axis);

    // Live axis first — API visibleMin/Max is a snapshot and will not track pan/zoom.
    if (axis) {
      const minP = Math.min(axis.top.price, axis.bot.price);
      const maxP = Math.max(axis.top.price, axis.bot.price);
      const axisYTop = Math.min(axis.top.y, axis.bot.y);
      const axisYBot = Math.max(axis.top.y, axis.bot.y);
      if (maxP > minP && axisYBot > axisYTop && isMnqPrice(minP, anchor) && isMnqPrice(maxP, anchor)) {
        return {
          pane,
          paneRect,
          minP,
          maxP,
          yTop: axisYTop,
          yBot: axisYBot,
          source: "axis",
          axisInsetPx,
        };
      }
    }

    if (
      priceHint &&
      Number.isFinite(priceHint.visibleMin) &&
      Number.isFinite(priceHint.visibleMax) &&
      priceHint.visibleMax > priceHint.visibleMin &&
      isMnqPrice(priceHint.visibleMin, anchor) &&
      isMnqPrice(priceHint.visibleMax, anchor)
    ) {
      return {
        pane,
        paneRect,
        minP: priceHint.visibleMin,
        maxP: priceHint.visibleMax,
        yTop,
        yBot,
        source: "api",
        axisInsetPx,
      };
    }

    const prices = [
      ...(levels || []).map((l) => Number(l.price)),
      ...(zones || []).flatMap((z) => [Number(z.top), Number(z.bottom)]),
    ].filter(Number.isFinite);
    if (!prices.length) return null;

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

    return { pane, paneRect, minP, maxP, yTop, yBot, source: "hint", axisInsetPx };
  }

  function estimateAxisInset(paneRect, axis) {
    if (axis?.points?.length) {
      const axisX = Math.min(...axis.points.map((p) => p.x));
      const inset = paneRect.right - axisX;
      if (inset >= 40 && inset <= 220) return inset;
    }
    return AXIS_INSET_DEFAULT_PX;
  }

  function ensureOverlay() {
    let root = document.getElementById(OVERLAY_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = OVERLAY_ID;
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
    const styleId = "dc-level-overlay-style";
    let style = document.getElementById(styleId);
    if (!style || style.dataset.dcRev !== BRIDGE_REV) {
      if (style) style.remove();
      style = document.createElement("style");
      style.id = styleId;
      style.dataset.dcRev = BRIDGE_REV;
      style.textContent = `
#${OVERLAY_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 999990; }
#${OVERLAY_ID} .dc-lvl-zone {
  position: fixed; box-sizing: border-box; opacity: 0.92;
  border-top: 1px solid; border-bottom: 1px solid;
}
#${OVERLAY_ID} .dc-lvl-zone.dc-fhdr {
  border-left: 1px solid; border-right: 1px solid;
  opacity: 0.88;
}
#${OVERLAY_ID} .dc-lvl-ce {
  position: fixed; height: 2px; background: #e879f9; opacity: 1; border: none;
}
#${OVERLAY_ID} .dc-lvl-line {
  position: fixed; height: 2px; opacity: 1; border: none; pointer-events: none;
}
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

  function renderOverlay(levels, zones, priceHint, visibleRange, opts) {
    const labelsOnly = opts?.labelsOnly === true;
    const pane = findChartPane();
    const scale = buildScale(levels, zones, priceHint, pane);
    const root = ensureOverlay();
    root.innerHTML = "";

    if (!scale) {
      return { ok: false, method: "overlay", reason: "no_chart_pane" };
    }

    assignStaggeredLabelAlign(levels, zones, {
      priceMin: scale.minP,
      priceMax: scale.maxP,
      plotHeightPx: scale.yBot - scale.yTop,
      yOffsetPx: scale.yTop,
    });

    const { paneRect, axisInsetPx } = scale;
    const range = visibleRange || activeVisibleRange;
    const light = isLightChartPane(scale.pane);
    let drawn = 0;
    const endX = paneRect.right - Math.max(4, axisInsetPx || AXIS_INSET_DEFAULT_PX);

    for (const zone of zones || []) {
      const top = Number(zone.top);
      const bottom = Number(zone.bottom);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const yTop = priceToY(Math.max(top, bottom), scale);
      const yBot = priceToY(Math.min(top, bottom), scale);
      if (yBot < paneRect.top - 2 && yTop < paneRect.top - 2) continue;
      if (yTop > paneRect.bottom + 2 && yBot > paneRect.bottom + 2) continue;

      const startX = timeToX(Number(zone.startTime), range, paneRect);
      const zoneEndX = zone.endTime
        ? timeToX(Number(zone.endTime), range, paneRect)
        : endX;
      const leftX = Math.min(startX, zoneEndX, endX);
      const rightX = Math.max(startX, zoneEndX);
      if (!labelsOnly) {
        const box = document.createElement("div");
        box.className = zone.kind === "fhdr" ? "dc-lvl-zone dc-fhdr" : "dc-lvl-zone";
        box.style.left = `${Math.round(leftX)}px`;
        box.style.width = `${Math.max(8, Math.round(Math.min(endX, rightX) - leftX))}px`;
        box.style.top = `${Math.round(Math.min(yTop, yBot))}px`;
        box.style.height = `${Math.max(2, Math.round(Math.abs(yBot - yTop)))}px`;
        box.style.backgroundColor = zone.fill || "rgba(251, 191, 133, 0.38)";
        box.style.borderColor = zone.borderColor || zone.color || "#78716c";
        root.appendChild(box);
        drawn += 1;

        if (zone.kind === "fvg" && Number.isFinite(Number(zone.ce))) {
          const ceY = priceToY(Number(zone.ce), scale);
          const ce = document.createElement("div");
          ce.className = "dc-lvl-ce";
          ce.style.left = `${Math.round(leftX)}px`;
          ce.style.width = `${Math.max(8, Math.round(Math.min(endX, rightX) - leftX))}px`;
          ce.style.top = `${Math.round(ceY - 1)}px`;
          root.appendChild(ce);
        }
      }

      // Names are native TV drawings — overlay never paints HTML pills.
    }

    for (const level of levels) {
      const price = Number(level.price);
      if (!Number.isFinite(price)) continue;
      const y = priceToY(price, scale);
      if (y < paneRect.top - 2 || y > paneRect.bottom + 2) continue;

      const startX = timeToX(Number(level.startTime), range, paneRect);
      if (!labelsOnly) {
        appendOverlayLine(
          root,
          Math.min(startX, endX),
          Math.max(8, endX - Math.min(startX, endX)),
          y,
          overlayLineColorForLevel(level, light),
          level.dash
        );
        drawn += 1;
      }

      // Level names stay on native rays so they track pan/zoom.
    }

    return {
      ok: drawn > 0,
      method: "overlay",
      count: drawn,
      labelsOnly,
      source: scale.source,
    };
  }

  function attachResizeWatch() {
    if (typeof ResizeObserver === "undefined") return;
    detachResizeWatch();
    const pane = findChartPane();
    if (!pane) return;
    const watchGen = overlayGeneration;
    resizeObserver = new ResizeObserver(() => {
      if (!overlayOn || watchGen !== overlayGeneration) return;
      lastTrackKey = "";
      requestVisibleRange();
      paintOverlayNow();
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

  function onChartInteractStart() {
    interacting = true;
    requestVisibleRange();
  }

  function onChartInteractEnd() {
    interacting = false;
    lastTrackKey = "";
    requestVisibleRange();
    paintOverlayNow();
  }

  function attachInteractionWatch() {
    detachInteractionWatch();
    const pane = findChartPane();
    if (!pane) return;
    interactionPane = pane;
    pane.addEventListener("wheel", onChartInteractStart, { passive: true, capture: true });
    pane.addEventListener("pointerdown", onChartInteractStart, { capture: true });
    window.addEventListener("pointerup", onChartInteractEnd, true);
    window.addEventListener("pointercancel", onChartInteractEnd, true);
  }

  function detachInteractionWatch() {
    if (interactionPane) {
      interactionPane.removeEventListener("wheel", onChartInteractStart, true);
      interactionPane.removeEventListener("pointerdown", onChartInteractStart, true);
    }
    window.removeEventListener("pointerup", onChartInteractEnd, true);
    window.removeEventListener("pointercancel", onChartInteractEnd, true);
    interactionPane = null;
    interacting = false;
  }

  function overlayTrackKey() {
    const pane = findChartPane();
    const r = pane?.getBoundingClientRect();
    return [
      r?.left,
      r?.top,
      r?.width,
      r?.height,
      activeVisibleRange?.from,
      activeVisibleRange?.to,
      activePriceHint?.visibleMin,
      activePriceHint?.visibleMax,
      overlayLabelsOnly ? 1 : 0,
    ].join("|");
  }

  function maybeRefreshLiveScale() {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - lastAxisScanAt < (interacting ? 32 : 160)) return;
    lastAxisScanAt = now;
    const pane = findChartPane();
    if (!pane) return;
    const paneRect = pane.getBoundingClientRect();
    const axis = scanPriceLabels(paneRect, priceAnchor(activeLevels, activeZones, activePriceHint));
    if (!axis) return;
    const minP = Math.min(axis.top.price, axis.bot.price);
    const maxP = Math.max(axis.top.price, axis.bot.price);
    if (!(maxP > minP) || !isMnqPrice(minP) || !isMnqPrice(maxP)) return;
    activePriceHint = { ...(activePriceHint || {}), visibleMin: minP, visibleMax: maxP };
  }

  function paintOverlayNow() {
    if (!overlayOn) return;
    renderOverlay(activeLevels, activeZones, activePriceHint, activeVisibleRange, {
      labelsOnly: overlayLabelsOnly,
    });
  }

  function tickOverlayTrack() {
    if (!overlayOn) {
      trackRaf = null;
      return;
    }
    maybeRefreshLiveScale();
    const key = overlayTrackKey();
    if (key !== lastTrackKey) {
      lastTrackKey = key;
      paintOverlayNow();
    }
    trackRaf = requestAnimationFrame(tickOverlayTrack);
  }

  function startTrackLoop() {
    if (trackRaf != null) return;
    lastTrackKey = "";
    trackRaf = requestAnimationFrame(tickOverlayTrack);
  }

  function stopTrackLoop() {
    if (trackRaf != null) {
      cancelAnimationFrame(trackRaf);
      trackRaf = null;
    }
    lastTrackKey = "";
  }

  function startRangePoll() {
    stopRangePoll();
    rangePollTimer = setInterval(() => {
      if (!overlayOn) return;
      requestVisibleRange();
    }, interacting ? 80 : 220);
  }

  function stopRangePoll() {
    if (rangePollTimer) {
      clearInterval(rangePollTimer);
      rangePollTimer = null;
    }
  }

  function startSyncLoop() {
    attachResizeWatch();
    attachInteractionWatch();
    startRangePoll();
    startTrackLoop();
  }

  function stopSyncLoop() {
    stopTrackLoop();
    stopRangePoll();
    detachInteractionWatch();
    detachResizeWatch();
  }

  function waitForTvResult(generation, opts) {
    const maxWaitMs = Math.max(1500, Number(opts?.maxWaitMs) || 12000);
    const pollMs = Math.max(250, Number(opts?.pollMs) || 500);
    return new Promise((resolve) => {
      let settled = false;
      const started = Date.now();
      let bridgeNativeInFlight = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMsg);
        clearInterval(pollTimer);
        clearInterval(waitTimer);
        resolve(result);
      }

      function onMsg(event) {
        if (event.source !== window) return;
        if (event.data?.type === "DC_PING_BRIDGE_RESULT") {
          if (event.data.nativeDrawInFlight) {
            bridgeNativeInFlight = true;
            nativeDrawInFlight = true;
          } else if (bridgeNativeInFlight) {
            bridgeNativeInFlight = false;
            nativeDrawInFlight = false;
          }
          return;
        }
        if (event.data?.type !== "DC_DRAW_TV_RESULT") return;
        const msgGen = Number(event.data.generation);
        if (Number.isFinite(msgGen) && msgGen !== generation) return;
        if (event.data.inFlight === true) return;
        nativeDrawInFlight = false;
        finish(event.data);
      }

      const pollTimer = setInterval(() => {
        if (generation !== drawGeneration) {
          finish({
            ok: false,
            method: "tv_api",
            reason: "superseded",
            generation,
            definitive: true,
          });
          return;
        }
        window.postMessage({ type: "DC_PING_BRIDGE" }, "*");
      }, pollMs);

      const waitTimer = setInterval(() => {
        if (generation !== drawGeneration) {
          finish({
            ok: false,
            method: "tv_api",
            reason: "superseded",
            generation,
            definitive: true,
          });
          return;
        }
        if (Date.now() - started >= maxWaitMs && !bridgeNativeInFlight && !nativeDrawInFlight) {
          finish({
            ok: false,
            method: "tv_api",
            reason: "timeout",
            generation,
            definitive: false,
            waitedMs: Date.now() - started,
          });
        }
      }, pollMs);

      window.addEventListener("message", onMsg);
    });
  }

  async function preClearNativeShapes(generation) {
    window.postMessage({ type: "DC_DRAW_TV", action: "preclear", generation }, "*");
    await waitForTvResult(generation, { maxWaitMs: 8000 });
  }

  function applyViewportMessage(data) {
    if (!data) return;
    if (data.range && Number.isFinite(data.range.from) && Number.isFinite(data.range.to)) {
      activeVisibleRange = data.range;
    }
    const pMin = Number(data.priceMin);
    const pMax = Number(data.priceMax);
    if (Number.isFinite(pMin) && Number.isFinite(pMax) && pMax > pMin) {
      activePriceHint = { ...(activePriceHint || {}), visibleMin: pMin, visibleMax: pMax };
    }
  }

  function requestVisibleRange() {
    window.postMessage({ type: "DC_GET_VISIBLE_RANGE" }, "*");
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
        applyViewportMessage(event.data);
        resolve(event.data.range || activeVisibleRange || null);
      }
      window.addEventListener("message", onMsg);
      requestVisibleRange();
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "DC_VISIBLE_RANGE") return;
    applyViewportMessage(event.data);
  });

  function normalizeInput(input) {
    if (Array.isArray(input)) return { levels: input, zones: [], priceHint: null };
    return {
      levels: input?.levels || [],
      zones: input?.zones || [],
      priceHint: input?.priceHint || null,
    };
  }

  const LABEL_CLUSTER_MIN = 4;
  const LABEL_CLUSTER_DEFAULT = 8;
  const LABEL_CLUSTER_MAX = 14;
  const LABEL_CLUSTER_RATIO = 0.0035;
  const LABEL_MIN_GAP_PX = 4;
  const LABEL_OFFSET_TOP_PX = 4;
  const LABEL_OFFSET_BOTTOM_PX = 16;
  const LABEL_LANE_STEP_PX = 20;
  const LABEL_LANE_X_STEP_PX = 28;
  const LABEL_EST_HEIGHT_PX = 18;
  const LABEL_MAX_LANES = 24;
  const LINE_THICK_PX = 2;
  const DASH_ON_MIN_PX = 10;
  const DASH_GAP_MIN_PX = 6;

  const LABEL_ID_PRIORITY = {
    pdh: 100,
    pdl: 100,
    pdc: 96,
    pdeq: 92,
    cdeq: 92,
    ndog_top: 88,
    ndog_bot: 88,
    org_top: 90,
    org_bottom: 90,
    org_ce: 82,
    nwog_top: 86,
    nwog_bottom: 86,
  };

  function labelPriorityForDraw(item) {
    if (item.kind === "level") {
      const id = item.ref.id;
      if (LABEL_ID_PRIORITY[id] != null) return LABEL_ID_PRIORITY[id];
      if (item.ref.group === "daily") return 90;
      if (item.ref.group === "org") return 88;
      if (item.ref.group === "gap") return 84;
      if (item.ref.group === "structure") return 76;
      if (item.ref.group === "session") return 52;
      return 40;
    }
    if (item.ref.kind === "fhdr") return 68;
    if (item.ref.id && String(item.ref.id).includes("fpfvg")) return 74;
    if (item.ref.kind === "fvg") return 58;
    return 48;
  }

  function labelLaneToAlign(lane) {
    const n = Math.max(0, Math.floor(Number(lane) || 0));
    return ["top", "middle", "bottom"][n % 3];
  }

  function labelLaneToHorzAlign(lane) {
    const n = Math.max(0, Math.floor(Number(lane) || 0));
    return ["left", "center", "right"][n % 3];
  }

  function labelLaneToTimeShiftSec(lane, visibleSpanSec) {
    const n = Math.max(0, Math.floor(Number(lane) || 0));
    if (n === 0) return 0;
    const span = Number.isFinite(visibleSpanSec) && visibleSpanSec > 0 ? visibleSpanSec : 3600;
    return n * Math.max(90, Math.floor(span / 16));
  }

  function isSlashJoinedChartLabel(text) {
    return /\s\/\s/.test(String(text || ""));
  }

  function labelYOffsetPx(lineY, align, lane) {
    const stack = Math.floor(Math.max(0, lane || 0) / 2);
    const step = stack * LABEL_LANE_STEP_PX;
    if (align === "bottom") return lineY + LABEL_OFFSET_BOTTOM_PX + step;
    return lineY - LABEL_OFFSET_TOP_PX - step;
  }

  function labelOffsetXPx(lane) {
    return 4 + Math.max(0, lane || 0) * LABEL_LANE_X_STEP_PX;
  }

  function priceToLineY(price, priceMin, priceMax, plotHeightPx, yOffsetPx) {
    const plotH = plotHeightPx ?? 480;
    const yOff = yOffsetPx ?? 0;
    const range = priceMax - priceMin || 1;
    return yOff + plotH * (1 - (price - priceMin) / range);
  }

  function labelBBox(lineY, align, lane) {
    const top = labelYOffsetPx(lineY, align, lane);
    return { top, bottom: top + LABEL_EST_HEIGHT_PX };
  }

  function labelBboxesOverlap(a, b) {
    return a.bottom + LABEL_MIN_GAP_PX > b.top && b.bottom + LABEL_MIN_GAP_PX > a.top;
  }

  function findLabelLane(lineY, placed, maxLanes = LABEL_MAX_LANES, startLane = 0) {
    for (let offset = 0; offset < maxLanes; offset++) {
      const lane = startLane + offset;
      if (lane >= maxLanes) break;
      const bbox = labelBBox(lineY, labelLaneToAlign(lane), lane);
      if (!placed.some((p) => labelBboxesOverlap(p, bbox))) return lane;
    }
    return maxLanes - 1;
  }

  function overlayNameFor(ref) {
    return formatOverlayLabel(ref.label, ref.id);
  }

  function nativeTitleFor(ref) {
    const extra = String(ref.displayLabel || "").trim();
    if (extra && !isSlashJoinedChartLabel(extra)) return extra;
    const short = overlayNameFor(ref).trim();
    if (short) return short;
    return String(ref.label || "").trim();
  }

  function formatOverlayLabel(text, id) {
    const short = window.DeskCopilotPlainLanguage?.formatChartOverlayLabel;
    if (typeof short === "function") return short(text || "", id);
    const fmt = window.DeskCopilotPlainLanguage?.formatChartLevelLabel;
    if (typeof fmt === "function") return fmt(text || "", id);
    return String(text || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/^DC\s+/i, "")
      .replace(/^DC(?=[A-Z(])/, "");
  }

  function isLightChartPane(pane) {
    try {
      const root = document.documentElement;
      const body = document.body;
      const cls = `${root?.className || ""} ${body?.className || ""} ${pane?.className || ""}`;
      if (/\b(theme-light|tv-theme--light)\b/i.test(cls)) return true;
      if (/\b(theme-dark|tv-theme--dark)\b/i.test(cls)) return false;
      const el = pane || body;
      if (!el || typeof getComputedStyle !== "function") return false;
      const bg = getComputedStyle(el).backgroundColor || "";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return false;
      const lum = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
      return lum > 0.55;
    } catch {
      return false;
    }
  }

  /** Type hues stay distinct — never flatten session/PD/REL onto one teal. */
  function overlayLineColorForLevel(level, light) {
    const id = String(level?.id || "");
    const group = String(level?.group || "");
    let hex = String(level?.color || "").toLowerCase();
    if (/^reh(_|$)/i.test(id) || /^rel(_|$)/i.test(id) || /^eqh(_|$)/i.test(id) || /^eql(_|$)/i.test(id)) {
      hex = "#e879f9";
    } else if (group === "session" || /^(asia_|london_|ny_)/i.test(id)) {
      hex = "#38bdf8";
    } else if (id === "org_ce") {
      hex = "#e879f9";
    } else if (group === "org" || /^org_/i.test(id)) {
      hex = "#22d3ee";
    } else if (group === "gap" || /^(ndog|nwog)/i.test(id)) {
      hex = "#ef4444";
    } else if (group === "daily" || /^(pdh|pdl|pdc|pdo|pdeq|cdeq|cdo)$/i.test(id)) {
      hex = "#a78bfa";
    } else if (hex === "#94a3b8" || hex === "#64748b") {
      hex = "#38bdf8";
    } else if (hex === "#cbd5e1") {
      hex = "#a78bfa";
    } else if (!hex) {
      hex = "#22d3ee";
    }
    if (!light) return hex;
    if (hex === "#38bdf8") return "#0284c7";
    if (hex === "#22d3ee") return "#0e7490";
    if (hex === "#e879f9") return "#c026d3";
    if (hex === "#a78bfa") return "#6d28d9";
    if (hex === "#ef4444") return "#b91c1c";
    return hex;
  }

  function readableOverlayLineColor(color, light) {
    return overlayLineColorForLevel({ color }, light);
  }

  function overlayDashPair(dash) {
    const m = String(dash || "").trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
    const on = m ? Number(m[1]) : DASH_ON_MIN_PX;
    const off = m ? Number(m[2]) : DASH_GAP_MIN_PX;
    return {
      on: Math.max(DASH_ON_MIN_PX, on),
      off: Math.max(DASH_GAP_MIN_PX, off),
    };
  }

  /** 2px repeating dashes — CSS border-top:dashed on height:0 disappears at zoom. */
  function appendOverlayLine(root, x, width, y, color, dash) {
    const el = document.createElement("div");
    el.className = "dc-lvl-line";
    const { on, off } = overlayDashPair(dash);
    const period = on + off;
    el.style.left = `${Math.round(x)}px`;
    el.style.width = `${Math.max(8, Math.round(width))}px`;
    el.style.top = `${Math.round(y - LINE_THICK_PX / 2)}px`;
    el.style.height = `${LINE_THICK_PX}px`;
    el.style.backgroundImage = `repeating-linear-gradient(to right, ${color} 0 ${on}px, transparent ${on}px ${period}px)`;
    el.style.backgroundColor = "transparent";
    root.appendChild(el);
    return el;
  }

  function labelClusterThreshold(priceMin, priceMax, clusterPoints) {
    if (clusterPoints != null && Number.isFinite(clusterPoints)) return clusterPoints;
    const span = Math.max(0, priceMax - priceMin);
    const adaptive = span * LABEL_CLUSTER_RATIO;
    return Math.max(
      LABEL_CLUSTER_MIN,
      Math.min(LABEL_CLUSTER_MAX, adaptive || LABEL_CLUSTER_DEFAULT)
    );
  }

  function assignStaggeredLabelAlign(levels, zones, opts) {
    for (const level of levels || []) {
      level.displayLabel = undefined;
      const title = nativeTitleFor(level);
      level.displayLabel = title || undefined;
      level.showLabel = Boolean(title);
      level.labelLane = undefined;
      level.labelAlign = undefined;
      level.labelHorzAlign = undefined;
      level.labelTimeShiftSec = undefined;
    }
    for (const zone of zones || []) {
      zone.displayLabel = undefined;
      const title = nativeTitleFor(zone);
      zone.displayLabel = title || undefined;
      zone.showLabel = Boolean(title);
      zone.labelLane = undefined;
      zone.labelAlign = undefined;
      zone.labelHorzAlign = undefined;
      zone.labelTimeShiftSec = undefined;
    }

    const items = [];
    for (const level of levels || []) {
      if (!level.label || level.showLabel === false) continue;
      if (!Number.isFinite(Number(level.price)) || Number(level.price) <= 0) continue;
      items.push({ kind: "level", ref: level, price: level.price });
    }
    for (const zone of zones || []) {
      if (!zone.label || zone.showLabel === false) continue;
      items.push({ kind: "zone", ref: zone, price: Math.max(zone.top, zone.bottom) });
    }
    if (!items.length) return;

    items.sort((a, b) => b.price - a.price || labelPriorityForDraw(b) - labelPriorityForDraw(a));
    const prices = items.map((i) => i.price);
    const pMin = opts?.priceMin ?? Math.min(...prices);
    const pMax = opts?.priceMax ?? Math.max(...prices);
    const threshold = labelClusterThreshold(pMin, pMax, opts?.clusterPoints);
    const spanSec = opts?.visibleSpanSec;

    const clusters = [];
    for (const item of items) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last[last.length - 1].price - item.price) <= threshold) last.push(item);
      else clusters.push([item]);
    }
    for (const cluster of clusters) {
      cluster.sort((a, b) => labelPriorityForDraw(b) - labelPriorityForDraw(a) || b.price - a.price);
      cluster.forEach((item, i) => {
        item.ref.labelLane = i;
        item.ref.labelAlign = labelLaneToAlign(i);
        item.ref.labelHorzAlign = labelLaneToHorzAlign(i);
        item.ref.labelTimeShiftSec = labelLaneToTimeShiftSec(i, spanSec);
      });
    }
  }

  function drawingPayloadFingerprint(levels, zones) {
    const lv = (levels || [])
      .map((l) => `${l.id}:${Number(l.price).toFixed(2)}:${l.label || ""}:${l.color || ""}`)
      .sort()
      .join("|");
    const zn = (zones || [])
      .map((z) => `${z.id}:${Number(z.top).toFixed(2)}:${Number(z.bottom).toFixed(2)}:${z.label || ""}`)
      .sort()
      .join("|");
    return `${lv}#${zn}`;
  }

  async function drawOnChart(input, preferOverlay) {
    return withDrawMutex(async () => {
      const { levels, zones, priceHint } = normalizeInput(input);
      const reason = input?.reason || input?.drawReason || "user";
      const fp = drawingPayloadFingerprint(levels, zones);
      if (reason === "tick") {
        return { ok: true, method: "skipped_tick", skipped: true, generation: drawGeneration };
      }
      if (fp && fp === lastDrawFingerprint && reason !== "user" && reason !== "reconnect" && reason !== "toggle") {
        return { ok: true, method: "skipped_unchanged", skipped: true, generation: drawGeneration };
      }

      const myGeneration = ++drawGeneration;
      overlayGeneration = myGeneration;
      nativeDrawInFlight = false;
      overlayOn = false;
      overlayLabelsOnly = false;
      stopSyncLoop();
      clearOverlay();

      activeLevels = levels || [];
      activeZones = zones || [];
      activePriceHint = priceHint;
      if (!activeLevels.length && !activeZones.length) {
        return { ok: false, method: "overlay", reason: "no_levels", generation: myGeneration };
      }

      await injectPageBridge();
      if (myGeneration !== drawGeneration) {
        return { ok: false, method: "overlay", reason: "superseded", generation: myGeneration };
      }

      const priceMin = priceHint?.visibleMin;
      const priceMax = priceHint?.visibleMax;
      let plotHeightPx = 480;
      try {
        const pane = findChartPane();
        const h = pane?.getBoundingClientRect?.().height;
        if (Number.isFinite(h) && h > 80) plotHeightPx = h;
      } catch (_) {
        /* keep default */
      }
      let visibleSpanSec = 3600;
      try {
        const from = Number(activeVisibleRange?.from);
        const to = Number(activeVisibleRange?.to);
        if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
          visibleSpanSec = Math.max(180, to - from);
        }
      } catch (_) {
        /* keep default */
      }
      if (Number.isFinite(priceMin) && Number.isFinite(priceMax)) {
        assignStaggeredLabelAlign(activeLevels, activeZones, {
          priceMin,
          priceMax,
          plotHeightPx,
          visibleSpanSec,
        });
      } else {
        assignStaggeredLabelAlign(activeLevels, activeZones, { plotHeightPx, visibleSpanSec });
      }

      if (!preferOverlay && (activeLevels.length || activeZones.length)) {
        nativeDrawInFlight = true;
        window.postMessage(
          {
            type: "DC_DRAW_TV",
            generation: myGeneration,
            levels: activeLevels,
            zones: activeZones,
          },
          "*"
        );
        const tvResult = await waitForTvResult(myGeneration, { maxWaitMs: 12000 });
        nativeDrawInFlight = false;

        if (myGeneration !== drawGeneration) {
          return { ok: false, method: "tv_api", reason: "superseded", generation: myGeneration };
        }

        if (tvResult.ok) {
          overlayOn = false;
          overlayLabelsOnly = false;
          overlayGeneration = myGeneration;
          clearOverlay();
          stopSyncLoop();
          lastDrawFingerprint = fp;
          return {
            ...tvResult,
            mode: "native",
            overlayLabels: false,
            generation: myGeneration,
            hint: "TradingView rays with native drawing labels.",
          };
        }

        const canFallback =
          tvResult.definitive === true &&
          tvResult.reason !== "superseded" &&
          !nativeDrawInFlight;
        if (!canFallback) {
          return {
            ...tvResult,
            mode: "native",
            generation: myGeneration,
            hint:
              tvResult.reason === "superseded"
                ? "Draw superseded by newer request."
                : "Native draw still running — overlay skipped to avoid duplication.",
          };
        }
      }

      if (myGeneration !== drawGeneration) {
        return { ok: false, method: "overlay", reason: "superseded", generation: myGeneration };
      }

      overlayOn = true;
      overlayLabelsOnly = false;
      overlayGeneration = myGeneration;
      const overlayResult = renderOverlay(
        activeLevels,
        activeZones,
        activePriceHint,
        activeVisibleRange
      );
      startSyncLoop();

      const sourceNote =
        overlayResult.source === "api"
          ? "aligned to live MNQ prices"
          : overlayResult.source === "axis"
          ? "aligned to price scale"
          : "aligned to level range — zoom chart if lines look off";

      if (overlayResult.ok) lastDrawFingerprint = fp;
      return {
        ...overlayResult,
        mode: "overlay",
        generation: myGeneration,
        hint: overlayResult.ok
          ? `Overlay (${sourceNote}) — lines only; names need native TV drawings.`
          : "Could not find chart — zoom in on candles, or use Pine indicator",
      };
    });
  }

  function clearOverlay() {
    const root = document.getElementById(OVERLAY_ID);
    if (root) root.innerHTML = "";
  }

  function clearAll() {
    const clearGen = ++drawGeneration;
    overlayGeneration = clearGen;
    nativeDrawInFlight = false;
    activeLevels = [];
    activeZones = [];
    activePriceHint = null;
    activeVisibleRange = null;
    overlayOn = false;
    overlayLabelsOnly = false;
    stopSyncLoop();
    clearOverlay();
    void withDrawMutex(async () => {
      await injectPageBridge();
      window.postMessage({ type: "DC_DRAW_TV", action: "clear", generation: clearGen }, "*");
      await waitForTvResult(clearGen, { maxWaitMs: 8000 });
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
      .map((l) => `${formatOverlayLabel(l.label, l.id)}: ${Number(l.price).toFixed(2)}`)
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
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed?.ts ?? 0);
      let payload = parsed?.payload || null;
      if (!payload) return null;
      if (
        age > PRICE_HINT_MAX_AGE_MS &&
        payload.priceHint &&
        Number.isFinite(payload.priceHint.last)
      ) {
        const { last: _drop, ...restHint } = payload.priceHint;
        payload = { ...payload, priceHint: Object.keys(restHint).length ? restHint : null };
      }
      if (age > PRICE_HINT_MAX_AGE_MS && Number.isFinite(payload.lastPrice1m)) {
        const { lastPrice1m: _drop, ...rest } = payload;
        payload = rest;
      }
      return payload;
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
    getDrawGeneration: () => drawGeneration,
    syncBridge: syncBridgeRegistry,
  };
})();
