/**
 * Runs in page context (MAIN world) — loaded via chrome-extension:// URL to satisfy TradingView CSP.
 */
(function () {
  if (window.__dcTvBridge) return;
  window.__dcTvBridge = true;

  function findChartWidget() {
    const keys = [
      "tvWidget",
      "widget",
      "tradingViewWidget",
      "_tvWidget",
      "TradingView",
      "tradingViewApi",
      "__tvWidget",
    ];
    for (const k of keys) {
      try {
        const w = window[k];
        if (w && typeof w.activeChart === "function") return w;
        if (w && w.widget && typeof w.widget.activeChart === "function") return w.widget;
      } catch (_) {
        /* ignore */
      }
    }
    for (const k of Object.keys(window)) {
      try {
        const w = window[k];
        if (!w || typeof w !== "object") continue;
        if (typeof w.activeChart === "function") return w;
        if (w.chart && typeof w.chart === "function") return w;
      } catch (_) {
        /* ignore */
      }
    }
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        const win = iframe.contentWindow;
        if (!win) continue;
        for (const k of keys) {
          const w = win[k];
          if (w && typeof w.activeChart === "function") return w;
        }
      } catch (_) {
        /* ignore */
      }
    }
    return null;
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

  function clearShapes(chart) {
    if (!chart || !window.__dcShapeIds) return;
    for (const id of window.__dcShapeIds) {
      try {
        chart.removeEntity(id);
      } catch (_) {
        /* ignore */
      }
    }
    window.__dcShapeIds = [];
  }

  async function drawLevelsAndZones(levels, zones) {
    const chart = getActiveChart();
    if (!chart) return { ok: false, method: "none", reason: "widget_not_found" };

    clearShapes(chart);
    window.__dcShapeIds = window.__dcShapeIds || [];
    const range = getVisibleRange(chart);
    const endTime = range?.to ?? Math.floor(Date.now() / 1000) + 600;
    const fallbackStart = range?.from ?? endTime - 1800;

    for (const zone of zones || []) {
      const top = Number(zone.top);
      const bottom = Number(zone.bottom);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const startTime = normalizeUnixSec(zone.startTime) ?? fallbackStart;
      const zTop = Math.max(top, bottom);
      const zBot = Math.min(top, bottom);
      const color = zone.borderColor || zone.color || "#78716c";
      const opts = {
        shape: "rectangle",
        text: zone.label || "",
        overrides: {
          backgroundColor: zone.fill || "rgba(251, 191, 133, 0.38)",
          color,
          linewidth: 1,
          fillBackground: true,
          transparency: 75,
          showLabel: Boolean(zone.label),
          textcolor: color,
        },
        disableSelection: true,
        disableSave: true,
        lock: true,
      };
      try {
        let id;
        if (typeof chart.createMultipointShape === "function") {
          id = await chart.createMultipointShape(
            [
              { time: startTime, price: zTop },
              { time: endTime, price: zBot },
            ],
            opts
          );
        }
        if (id) window.__dcShapeIds.push(id);
        if (zone.kind === "fvg" && Number.isFinite(Number(zone.ce))) {
          const cePrice = Number(zone.ce);
          const ceOpts = {
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
          };
          let ceId;
          if (typeof chart.createMultipointShape === "function") {
            ceId = await chart.createMultipointShape([{ time: startTime, price: cePrice }], ceOpts);
          } else if (typeof chart.createShape === "function") {
            ceId = await chart.createShape({ time: startTime, price: cePrice }, ceOpts);
          }
          if (ceId) window.__dcShapeIds.push(ceId);
        }
      } catch (_) {
        /* ignore */
      }
    }

    for (const level of levels || []) {
      const price = Number(level.price);
      if (!Number.isFinite(price)) continue;
      const startTime = normalizeUnixSec(level.startTime) ?? fallbackStart;
      const color = level.color || "#22d3ee";
      const opts = {
        shape: "horizontal_ray",
        text: level.label || "",
        overrides: {
          linecolor: color,
          linewidth: level.id && String(level.id).includes("ce") ? 2 : 1,
          linestyle: 2,
          showLabel: Boolean(level.label),
          textcolor: color,
        },
        disableSelection: true,
        disableSave: true,
        lock: true,
      };
      try {
        let id;
        const point = { time: startTime, price };
        if (typeof chart.createMultipointShape === "function") {
          id = await chart.createMultipointShape([point], opts);
        } else if (typeof chart.createShape === "function") {
          id = await chart.createShape(point, opts);
        }
        if (id) window.__dcShapeIds.push(id);
      } catch (_) {
        /* ignore */
      }
    }
    return { ok: window.__dcShapeIds.length > 0, method: "tv_api", count: window.__dcShapeIds.length };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === "DC_GET_VISIBLE_RANGE") {
      const chart = getActiveChart();
      const range = getVisibleRange(chart);
      window.postMessage({ type: "DC_VISIBLE_RANGE", range }, "*");
      return;
    }

    if (event.data.type !== "DC_DRAW_TV") return;
    try {
      if (event.data.action === "clear") {
        clearShapes(getActiveChart());
        window.postMessage({ type: "DC_DRAW_TV_RESULT", ok: true, method: "tv_api", cleared: true }, "*");
        return;
      }
      const result = await drawLevelsAndZones(event.data.levels || [], event.data.zones || []);
      window.postMessage({ type: "DC_DRAW_TV_RESULT", ...result }, "*");
    } catch (e) {
      window.postMessage(
        { type: "DC_DRAW_TV_RESULT", ok: false, method: "tv_api", reason: String(e) },
        "*"
      );
    }
  });
})();
