/**
 * Runs in page context (MAIN world) — loaded via chrome-extension:// URL to satisfy TradingView CSP.
 */
(function () {
  if (window.__dcTvBridge) {
    window.postMessage({ type: "DC_BRIDGE_READY", reattached: true }, "*");
    return;
  }
  window.__dcTvBridge = true;

  const DC_SHAPE_TAG = "\u200BDC\u200B";
  const REGISTRY_KEY = "dc-tv-shape-registry-v1";

  const WIDGET_KEYS = [
    "tvWidget",
    "widget",
    "tradingViewWidget",
    "_tvWidget",
    "TradingView",
    "tradingViewApi",
    "__tvWidget",
    "__TVWidget",
    "TradingViewWidget",
  ];

  let drawChain = Promise.resolve();
  let activeDrawGeneration = 0;
  let nativeDrawInFlight = false;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function loadRegistry() {
    try {
      const raw = sessionStorage.getItem(REGISTRY_KEY);
      if (!raw) return { ids: [], generation: 0 };
      const parsed = JSON.parse(raw);
      return {
        ids: Array.isArray(parsed?.ids) ? parsed.ids.map(String) : [],
        generation: Number(parsed?.generation) || 0,
      };
    } catch (_) {
      return { ids: [], generation: 0 };
    }
  }

  function saveRegistry(ids, generation) {
    const uniq = [...new Set((ids || []).map(String))];
    window.__dcShapeIds = uniq;
    try {
      sessionStorage.setItem(
        REGISTRY_KEY,
        JSON.stringify({ ids: uniq, generation: generation ?? activeDrawGeneration, ts: Date.now() })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function syncRegistryFromStorage() {
    const reg = loadRegistry();
    window.__dcShapeIds = reg.ids.slice();
    return reg;
  }

  syncRegistryFromStorage();

  function dcTaggedText(label) {
    const visible = label != null ? String(label) : "";
    return visible ? `${DC_SHAPE_TAG}${visible}` : DC_SHAPE_TAG;
  }

  function shapeLooksDcOwned(shape, id, registrySet) {
    if (registrySet && registrySet.has(id)) return true;
    if (!shape) return false;
    const text = String(shape.text || shape.properties?.text || shape.overrides?.text || "");
    if (text.includes(DC_SHAPE_TAG)) return true;
    if (shape.properties?.dcDeskCopilot === true || shape.overrides?.dcDeskCopilot === true) return true;
    return false;
  }

  function looksLikeChartWidget(w) {
    if (!w || typeof w !== "object") return false;
    try {
      if (typeof w.activeChart === "function") return true;
      if (w.widget && typeof w.widget.activeChart === "function") return true;
      if (typeof w.chart === "function") return true;
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function unwrapWidget(w) {
    if (!w) return null;
    if (typeof w.activeChart === "function") return w;
    if (w.widget && typeof w.widget.activeChart === "function") return w.widget;
    return w;
  }

  function findChartWidget() {
    for (const k of WIDGET_KEYS) {
      try {
        const w = window[k];
        if (looksLikeChartWidget(w)) return unwrapWidget(w);
      } catch (_) {
        /* ignore */
      }
    }

    for (const k of Object.keys(window)) {
      try {
        const w = window[k];
        if (!w || typeof w !== "object") continue;
        if (looksLikeChartWidget(w)) return unwrapWidget(w);
      } catch (_) {
        /* ignore */
      }
    }

    const iframeSelectors = [
      'iframe[id*="tradingview"]',
      'iframe[name*="tradingview"]',
      'iframe[src*="tradingview"]',
      "#chart-area iframe",
      ".chart-container iframe",
    ];
    const iframes = [];
    for (const sel of iframeSelectors) {
      for (const iframe of document.querySelectorAll(sel)) {
        if (!iframes.includes(iframe)) iframes.push(iframe);
      }
    }
    for (const iframe of document.querySelectorAll("iframe")) {
      if (!iframes.includes(iframe)) iframes.push(iframe);
    }

    for (const iframe of iframes) {
      try {
        const win = iframe.contentWindow;
        if (!win) continue;
        for (const k of WIDGET_KEYS) {
          const w = win[k];
          if (looksLikeChartWidget(w)) return unwrapWidget(w);
        }
        for (const k of Object.keys(win)) {
          const w = win[k];
          if (looksLikeChartWidget(w)) return unwrapWidget(w);
        }
      } catch (_) {
        /* ignore */
      }
    }
    return null;
  }

  function isChartExportReady(chart) {
    return Boolean(chart && typeof chart.exportData === "function");
  }

  async function waitForChartReady(opts) {
    const maxWaitMs = Math.max(500, Number(opts?.maxWaitMs) || 2400);
    const intervalMs = Math.max(80, Number(opts?.intervalMs) || 160);
    const deadline = Date.now() + maxWaitMs;
    let lastWidget = false;
    while (Date.now() < deadline) {
      const widget = findChartWidget();
      lastWidget = Boolean(widget);
      const chart = widget
        ? typeof widget.activeChart === "function"
          ? widget.activeChart()
          : widget.chart?.()
        : null;
      if (isChartExportReady(chart)) {
        return { ready: true, widgetFound: true, chart, waitedMs: maxWaitMs - (deadline - Date.now()) };
      }
      await sleep(intervalMs);
    }
    const widget = findChartWidget();
    const chart = widget
      ? typeof widget.activeChart === "function"
        ? widget.activeChart()
        : widget.chart?.()
      : null;
    return {
      ready: isChartExportReady(chart),
      widgetFound: Boolean(widget) || lastWidget,
      chart: isChartExportReady(chart) ? chart : null,
      waitedMs: maxWaitMs,
    };
  }

  function getActiveChart() {
    const widget = findChartWidget();
    if (!widget) return null;
    try {
      return typeof widget.activeChart === "function" ? widget.activeChart() : widget.chart?.();
    } catch (_) {
      return null;
    }
  }

  function normalizeUnixSec(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }

  function getVisibleRange(chart) {
    if (!chart) return null;
    try {
      const range = chart.getVisibleRange?.();
      if (range?.from != null && range?.to != null) {
        const from = normalizeUnixSec(range.from);
        const to = normalizeUnixSec(range.to);
        if (from != null && to != null) return { from, to };
      }
    } catch (_) {
      /* ignore */
    }
    const now = Math.floor(Date.now() / 1000);
    return { from: now - 6 * 3600, to: now + 600 };
  }

  function closeFromExportData(data) {
    if (!data?.data?.length || !data?.schema?.length) return null;
    let closeIdx = -1;
    for (let i = 0; i < data.schema.length; i++) {
      const s = data.schema[i];
      const label = String(s.plotTitle || s.name || s.title || s.id || "");
      if (/^close$/i.test(label.trim()) || /\bclose\b/i.test(label)) {
        closeIdx = i;
        break;
      }
    }
    if (closeIdx < 0) {
      const valueCols = [];
      for (let i = 0; i < data.schema.length; i++) {
        const t = data.schema[i]?.type;
        if (t === "value" || t === "line" || t === "ohlc") valueCols.push(i);
      }
      if (valueCols.length >= 4) closeIdx = valueCols[3];
      else if (valueCols.length >= 1) closeIdx = valueCols[valueCols.length - 1];
    }
    if (closeIdx < 0) return null;
    const lastRow = data.data[data.data.length - 1];
    const close = Number(lastRow[closeIdx]);
    if (Number.isFinite(close) && close >= 20000 && close <= 45000) return close;
    return null;
  }

  function findOhlcColumns(schema) {
    if (!Array.isArray(schema)) return null;
    const idx = { time: -1, open: -1, high: -1, low: -1, close: -1, volume: -1 };
    for (let i = 0; i < schema.length; i++) {
      const s = schema[i] || {};
      const label = String(s.plotTitle || s.name || s.title || s.id || "").trim().toLowerCase();
      if (/^time$/.test(label) || label === "date") idx.time = i;
      else if (/^open$/.test(label)) idx.open = i;
      else if (/^high$/.test(label)) idx.high = i;
      else if (/^low$/.test(label)) idx.low = i;
      else if (/^close$/.test(label)) idx.close = i;
      else if (/^volume$/.test(label) || label === "vol") idx.volume = i;
    }
    if (idx.time >= 0 && idx.close >= 0) return idx;
    const valueCols = [];
    for (let i = 0; i < schema.length; i++) {
      const t = schema[i]?.type;
      if (t === "time") idx.time = i;
      else if (t === "value" || t === "line" || t === "ohlc") valueCols.push(i);
    }
    if (idx.time >= 0 && valueCols.length >= 4) {
      idx.open = valueCols[0];
      idx.high = valueCols[1];
      idx.low = valueCols[2];
      idx.close = valueCols[3];
      if (valueCols[4] != null) idx.volume = valueCols[4];
      return idx;
    }
    if (valueCols.length >= 5) {
      idx.time = valueCols[0];
      idx.open = valueCols[1];
      idx.high = valueCols[2];
      idx.low = valueCols[3];
      idx.close = valueCols[4];
      if (valueCols[5] != null) idx.volume = valueCols[5];
      return idx;
    }
    return null;
  }

  function parseExportCandles(data, maxBars) {
    if (!data?.data?.length || !data?.schema?.length) return [];
    const cols = findOhlcColumns(data.schema);
    if (!cols || cols.time < 0 || cols.close < 0) return [];

    const candles = [];
    for (const row of data.data) {
      const t = normalizeUnixSec(row[cols.time]);
      const o = Number(row[cols.open >= 0 ? cols.open : cols.close]);
      const h = Number(row[cols.high >= 0 ? cols.high : cols.close]);
      const l = Number(row[cols.low >= 0 ? cols.low : cols.close]);
      const c = Number(row[cols.close]);
      if (t == null || !Number.isFinite(c)) continue;
      if (c < 20000 || c > 45000) continue;
      const candle = { t, o, h, l, c };
      if (cols.volume >= 0) {
        const v = Number(row[cols.volume]);
        if (Number.isFinite(v)) candle.v = v;
      }
      candles.push(candle);
    }
    candles.sort((a, b) => a.t - b.t);
    const limit = Math.max(10, Math.min(maxBars || 120, 240));
    return candles.slice(-limit);
  }

  async function exportOhlcFromChart(chart, maxBars) {
    if (!isChartExportReady(chart)) return { candles: [], rawRowCount: 0, exportError: "export_not_ready" };
    let rawRowCount = 0;
    let exportPartial = false;
    let exportError = null;

    try {
      const data = await chart.exportData({ includedStudies: "none" });
      rawRowCount = data?.data?.length || 0;
      const candles = parseExportCandles(data, maxBars);
      if (candles.length) {
        if (rawRowCount > 0 && candles.length < Math.min(rawRowCount, maxBars) * 0.5) exportPartial = true;
        return { candles, rawRowCount, exportPartial, exportError: null };
      }
    } catch (e) {
      exportError = String(e?.message || e || "export_failed");
    }

    try {
      const data = await chart.exportData({});
      rawRowCount = data?.data?.length || 0;
      const candles = parseExportCandles(data, maxBars);
      if (rawRowCount > 0 && candles.length < Math.min(rawRowCount, maxBars) * 0.5) exportPartial = true;
      return { candles, rawRowCount, exportPartial, exportError: candles.length ? null : exportError };
    } catch (e) {
      return { candles: [], rawRowCount, exportPartial: true, exportError: String(e?.message || e || "export_failed") };
    }
  }

  function normalizeDrawingType(name) {
    const n = String(name || "other").toLowerCase();
    if (n.includes("horizontal") || n === "hline" || n === "horizontal_ray") return "horizontal_line";
    if (n.includes("rectangle") || n === "box") return "rectangle";
    if (n.includes("trend")) return "trend_line";
    if (n.includes("ray")) return "ray";
    return "other";
  }

  function isDcOwnedShapeId(id, chart, registrySet) {
    if (registrySet.has(id)) return true;
    try {
      const shape = chart.getShapeById?.(id);
      return shapeLooksDcOwned(shape, id, registrySet);
    } catch (_) {
      return false;
    }
  }

  function exportDrawings(chart) {
    const drawings = [];
    if (!chart) return drawings;
    const registrySet = new Set(loadRegistry().ids);
    try {
      const ids = chart.getAllShapes?.() || [];
      for (const id of ids) {
        if (isDcOwnedShapeId(id, chart, registrySet)) continue;
        let shape = null;
        try {
          shape = chart.getShapeById?.(id);
        } catch (_) {
          /* ignore */
        }
        if (!shape) continue;
        const name = shape.name || shape.shape || shape.type || "other";
        const type = normalizeDrawingType(name);
        const points = [];
        const rawPoints = shape.points || shape._points || [];
        if (Array.isArray(rawPoints)) {
          for (const pt of rawPoints) {
            const t = normalizeUnixSec(pt?.time ?? pt?.t);
            const p = Number(pt?.price ?? pt?.p ?? pt?.y);
            if (t != null && Number.isFinite(p)) points.push({ t, p });
          }
        }
        const label = String(shape.text || shape.properties?.text || shape.overrides?.text || "").trim();
        const entry = { type, ...(label ? { label: label.slice(0, 80) } : {}) };
        if (type === "horizontal_line" || type === "ray") {
          const price = Number(points[0]?.p ?? shape.price ?? shape.properties?.price);
          if (Number.isFinite(price)) entry.price = price;
        } else if (type === "rectangle" && points.length >= 2) {
          const prices = points.map((p) => p.p);
          entry.top = Math.max(...prices);
          entry.bottom = Math.min(...prices);
        }
        if (points.length) entry.points = points.slice(0, 8);
        drawings.push(entry);
        if (drawings.length >= 50) break;
      }
    } catch (_) {
      /* ignore */
    }
    return drawings;
  }

  async function getChartSnapshot(opts) {
    const exportStartTs = Date.now();
    const waitMs = Math.max(0, Number(opts?.waitForReadyMs) || 0);
    const ready = waitMs > 0 ? await waitForChartReady({ maxWaitMs: waitMs }) : { ready: false, widgetFound: false, chart: null };
    let chart = ready.chart || getActiveChart();
    const widgetFound = ready.widgetFound || Boolean(findChartWidget());

    if (!chart) {
      return {
        ok: false,
        reason: "widget_not_found",
        candles: [],
        drawings: [],
        source: "none",
        sync: { drawingExportFailed: true, exportPartial: true, widgetFound: false },
        exportStartTs,
        exportCompleteTs: Date.now(),
      };
    }

    if (!isChartExportReady(chart)) {
      return {
        ok: false,
        reason: "export_not_ready",
        candles: [],
        drawings: [],
        source: "none",
        sync: { drawingExportFailed: true, exportPartial: true, widgetFound },
        exportStartTs,
        exportCompleteTs: Date.now(),
      };
    }

    const maxBars = Math.max(20, Math.min(Number(opts?.maxBars) || 120, 240));
    let symbol = null;
    let timeframe = null;
    try {
      symbol = chart.symbol?.() || chart.getSymbol?.() || null;
    } catch (_) {
      /* ignore */
    }
    try {
      timeframe = chart.resolution?.() || chart.interval?.() || null;
    } catch (_) {
      /* ignore */
    }

    const visibleRange = getVisibleRange(chart);
    const exportResult = await exportOhlcFromChart(chart, maxBars);
    const candles = exportResult.candles || [];
    const rawRowCount = exportResult.rawRowCount || 0;
    let exportPartial = exportResult.exportPartial === true;

    let drawingExportFailed = false;
    let drawings = [];
    try {
      drawings = exportDrawings(chart);
    } catch (_) {
      drawingExportFailed = true;
    }

    const lastPrice = candles.length ? candles[candles.length - 1].c : null;
    const lastBarTime = candles.length ? candles[candles.length - 1].t : null;
    const nowSec = Math.floor(Date.now() / 1000);
    let timestampDriftSec = null;
    if (lastBarTime != null && visibleRange?.to != null) {
      timestampDriftSec = Math.abs(visibleRange.to - lastBarTime);
    } else if (lastBarTime != null) {
      timestampDriftSec = Math.max(0, nowSec - lastBarTime);
    }

    let reason;
    if (candles.length >= 20) {
      reason = undefined;
    } else if (exportResult.exportError) {
      reason = exportResult.exportError.includes("export") ? "export_failed" : exportResult.exportError;
    } else {
      reason = "insufficient_candles";
    }

    return {
      ok: candles.length >= 20,
      symbol,
      timeframe: timeframe != null ? String(timeframe) : null,
      visibleRange,
      candles,
      drawings,
      lastPrice,
      source: candles.length ? "tv_export" : "none",
      exportedAt: new Date().toISOString(),
      reason,
      sync: {
        lastBarTime,
        timestampDriftSec,
        drawingExportFailed,
        exportPartial,
        rawRowCount,
        widgetFound,
        exportError: exportResult.exportError || undefined,
      },
      exportStartTs,
      exportCompleteTs: Date.now(),
    };
  }

  async function getLastBarClose(chart) {
    if (!chart) return null;

    try {
      if (typeof chart.exportData === "function") {
        const data = await chart.exportData({ includedStudies: "none" });
        const close = closeFromExportData(data);
        if (close != null) return close;
      }
    } catch (_) {
      /* ignore */
    }

    try {
      if (typeof chart.exportData === "function") {
        const data = await chart.exportData({});
        const close = closeFromExportData(data);
        if (close != null) return close;
      }
    } catch (_) {
      /* ignore */
    }

    try {
      const panes = chart.getPanes?.();
      if (Array.isArray(panes) && panes.length) {
        const main = panes[0];
        const src = main.getMainSource?.() || main.mainSource?.();
        const bars = src?.bars?.() || src?.data?.()?.bars;
        if (bars?.length) {
          const last = bars[bars.length - 1];
          const close = Number(last?.close ?? last?.value ?? last?.[4]);
          if (Number.isFinite(close) && close >= 20000 && close <= 45000) return close;
        }
      }
    } catch (_) {
      /* ignore */
    }

    return null;
  }

  function removeShapeId(chart, id) {
    if (!chart || id == null) return;
    try {
      chart.removeEntity(id);
    } catch (_) {
      /* ignore */
    }
  }

  function clearAllDcShapes(chart) {
    if (!chart) {
      saveRegistry([], activeDrawGeneration);
      return { removed: 0 };
    }

    const registry = loadRegistry();
    const registrySet = new Set(registry.ids);
    let removed = 0;

    for (const id of [...registrySet]) {
      removeShapeId(chart, id);
      removed += 1;
    }

    try {
      const allIds = chart.getAllShapes?.() || [];
      for (const id of allIds) {
        if (registrySet.has(id)) continue;
        try {
          const shape = chart.getShapeById?.(id);
          if (shapeLooksDcOwned(shape, id, registrySet)) {
            removeShapeId(chart, id);
            removed += 1;
          }
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* ignore */
    }

    saveRegistry([], activeDrawGeneration);
    return { removed };
  }

  function isGenerationStale(generation) {
    return Number(generation) !== activeDrawGeneration;
  }

  function withDcTag(opts, label) {
    const showLabel = Boolean(label && opts?.overrides?.showLabel !== false);
    return {
      ...opts,
      text: showLabel ? dcTaggedText(label) : DC_SHAPE_TAG,
      overrides: {
        ...(opts.overrides || {}),
        dcDeskCopilot: true,
        text: showLabel ? dcTaggedText(label) : DC_SHAPE_TAG,
      },
    };
  }

  async function drawLevelsAndZones(levels, zones, generation) {
    const gen = Number(generation) || 0;
    activeDrawGeneration = gen;

    const chart = getActiveChart();
    if (!chart) {
      return { ok: false, method: "tv_api", reason: "widget_not_found", generation: gen, definitive: true };
    }

    clearAllDcShapes(chart);
    if (isGenerationStale(gen)) {
      return { ok: false, method: "tv_api", reason: "superseded", generation: gen, definitive: true };
    }

    const createdIds = [];
    const range = getVisibleRange(chart);
    const endTime = range?.to ?? Math.floor(Date.now() / 1000) + 600;
    const fallbackStart = range?.from ?? endTime - 1800;

    for (const zone of zones || []) {
      if (isGenerationStale(gen)) {
        clearAllDcShapes(chart);
        return { ok: false, method: "tv_api", reason: "superseded", generation: gen, definitive: true };
      }

      const top = Number(zone.top);
      const bottom = Number(zone.bottom);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const startTime = normalizeUnixSec(zone.startTime) ?? fallbackStart;
      const zoneEndTime = normalizeUnixSec(zone.endTime) ?? endTime;
      const zTop = Math.max(top, bottom);
      const zBot = Math.min(top, bottom);
      const color = zone.borderColor || zone.color || "#78716c";
      const label = zone.displayLabel || zone.label || "";
      const opts = withDcTag(
        {
          shape: "rectangle",
          overrides: {
            backgroundColor: zone.fill || "rgba(251, 191, 133, 0.38)",
            color,
            linewidth: 1,
            fillBackground: true,
            transparency: 75,
            showLabel: Boolean(zone.label && zone.showLabel !== false),
            textcolor: color,
          },
          disableSelection: true,
          disableSave: true,
          lock: true,
        },
        label
      );

      try {
        let id;
        if (typeof chart.createMultipointShape === "function") {
          id = await chart.createMultipointShape(
            [
              { time: startTime, price: zTop },
              { time: zoneEndTime, price: zBot },
            ],
            opts
          );
        }
        if (id) createdIds.push(id);

        if (zone.kind === "fvg" && Number.isFinite(Number(zone.ce))) {
          if (isGenerationStale(gen)) {
            clearAllDcShapes(chart);
            return { ok: false, method: "tv_api", reason: "superseded", generation: gen, definitive: true };
          }
          const cePrice = Number(zone.ce);
          const ceOpts = withDcTag(
            {
              shape: "horizontal_ray",
              overrides: {
                linecolor: "#e879f9",
                linewidth: 1,
                linestyle: 0,
                showLabel: false,
              },
              disableSelection: true,
              disableSave: true,
              lock: true,
            },
            ""
          );
          let ceId;
          if (typeof chart.createMultipointShape === "function") {
            ceId = await chart.createMultipointShape([{ time: startTime, price: cePrice }], ceOpts);
          } else if (typeof chart.createShape === "function") {
            ceId = await chart.createShape({ time: startTime, price: cePrice }, ceOpts);
          }
          if (ceId) createdIds.push(ceId);
        }
      } catch (_) {
        /* ignore single shape failure */
      }
    }

    for (const level of levels || []) {
      if (isGenerationStale(gen)) {
        clearAllDcShapes(chart);
        return { ok: false, method: "tv_api", reason: "superseded", generation: gen, definitive: true };
      }

      const price = Number(level.price);
      if (!Number.isFinite(price)) continue;
      const startTime = normalizeUnixSec(level.startTime) ?? fallbackStart;
      const color = level.color || "#22d3ee";
      const label = level.displayLabel || level.label || "";
      const opts = withDcTag(
        {
          shape: "horizontal_ray",
          overrides: {
            linecolor: color,
            linewidth: level.id && String(level.id).includes("ce") ? 2 : 1,
            linestyle: 2,
            showLabel: Boolean(level.label && level.showLabel !== false),
            textcolor: color,
          },
          disableSelection: true,
          disableSave: true,
          lock: true,
        },
        label
      );

      try {
        let id;
        const point = { time: startTime, price };
        if (typeof chart.createMultipointShape === "function") {
          id = await chart.createMultipointShape([point], opts);
        } else if (typeof chart.createShape === "function") {
          id = await chart.createShape(point, opts);
        }
        if (id) createdIds.push(id);
      } catch (_) {
        /* ignore */
      }
    }

    if (isGenerationStale(gen)) {
      clearAllDcShapes(chart);
      return { ok: false, method: "tv_api", reason: "superseded", generation: gen, definitive: true };
    }

    saveRegistry(createdIds, gen);
    return {
      ok: createdIds.length > 0,
      method: "tv_api",
      count: createdIds.length,
      generation: gen,
      definitive: true,
    };
  }

  function enqueueDraw(task) {
    const run = drawChain.then(task);
    drawChain = run.catch(() => {});
    return run;
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === "DC_SYNC_REGISTRY") {
      syncRegistryFromStorage();
      window.postMessage({ type: "DC_SYNC_REGISTRY_RESULT", ok: true, count: window.__dcShapeIds.length }, "*");
      return;
    }

    if (event.data.type === "DC_GET_VISIBLE_RANGE") {
      const chart = getActiveChart();
      const range = getVisibleRange(chart);
      window.postMessage({ type: "DC_VISIBLE_RANGE", range }, "*");
      return;
    }

    if (event.data.type === "DC_GET_LAST_PRICE") {
      try {
        const chart = getActiveChart();
        const price = await getLastBarClose(chart);
        window.postMessage(
          {
            type: "DC_LAST_PRICE",
            price: price != null ? price : null,
            ok: price != null,
            source: price != null ? "tv_api" : "none",
          },
          "*"
        );
      } catch (e) {
        window.postMessage(
          { type: "DC_LAST_PRICE", price: null, ok: false, reason: String(e) },
          "*"
        );
      }
      return;
    }

    if (event.data.type === "DC_GET_CHART_SNAPSHOT") {
      try {
        const snap = await getChartSnapshot(event.data);
        window.postMessage({ type: "DC_CHART_SNAPSHOT", ...snap }, "*");
      } catch (e) {
        window.postMessage(
          {
            type: "DC_CHART_SNAPSHOT",
            ok: false,
            reason: String(e),
            candles: [],
            drawings: [],
            source: "none",
            sync: { exportPartial: true, drawingExportFailed: true, widgetFound: Boolean(findChartWidget()) },
          },
          "*"
        );
      }
      return;
    }

    if (event.data.type === "DC_PING_BRIDGE") {
      const widgetFound = Boolean(findChartWidget());
      const chart = getActiveChart();
      window.postMessage(
        {
          type: "DC_PING_BRIDGE_RESULT",
          ok: true,
          widgetFound,
          exportReady: isChartExportReady(chart),
          nativeDrawInFlight,
          registryCount: loadRegistry().ids.length,
        },
        "*"
      );
      return;
    }

    if (event.data.type !== "DC_DRAW_TV") return;

    await enqueueDraw(async () => {
      const generation = Number(event.data.generation) || 0;
      try {
        if (event.data.action === "clear") {
          const cleared = clearAllDcShapes(getActiveChart());
          window.postMessage(
            {
              type: "DC_DRAW_TV_RESULT",
              ok: true,
              method: "tv_api",
              cleared: true,
              generation,
              removed: cleared.removed,
              definitive: true,
            },
            "*"
          );
          return;
        }

        if (event.data.action === "preclear") {
          const cleared = clearAllDcShapes(getActiveChart());
          window.postMessage(
            {
              type: "DC_DRAW_TV_RESULT",
              ok: true,
              method: "tv_api",
              precleared: true,
              generation,
              removed: cleared.removed,
              definitive: true,
            },
            "*"
          );
          return;
        }

        nativeDrawInFlight = true;
        activeDrawGeneration = generation;
        const result = await drawLevelsAndZones(event.data.levels || [], event.data.zones || [], generation);
        nativeDrawInFlight = false;
        window.postMessage({ type: "DC_DRAW_TV_RESULT", ...result, inFlight: false }, "*");
      } catch (e) {
        nativeDrawInFlight = false;
        window.postMessage(
          {
            type: "DC_DRAW_TV_RESULT",
            ok: false,
            method: "tv_api",
            reason: String(e),
            generation,
            definitive: true,
            inFlight: false,
          },
          "*"
        );
      }
    });
  });

  window.postMessage({ type: "DC_BRIDGE_READY", reattached: false }, "*");
})();
