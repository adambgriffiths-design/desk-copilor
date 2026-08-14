/**
 * Runs in page context (MAIN world) — loaded via chrome-extension:// URL to satisfy TradingView CSP.
 */
(function () {
  // Tick stream must start even if the bridge was already injected (extension reload).
  (function dcPriceTickStream() {
    if (window.__dcPriceTickTimer) {
      clearInterval(window.__dcPriceTickTimer);
      window.__dcPriceTickTimer = 0;
    }
    let lastPosted = null;
    let pinnedEl = null;
    const SEL =
      '[data-field="last"],[data-field="last_price"],[data-field="lp"],.js-symbol-last,[class*="js-symbol-last"],[class*="price-axis-last"],[class*="lastValueBar"]';
    function parseTxt(text) {
      if (!text) return null;
      const raw = String(text).replace(/[\u00a0\s\u202f]/g, " ");
      const comma = raw.match(/\b(\d{1,2},\d{3}(?:\.\d{1,2})?)\b/);
      if (comma) {
        const n = parseFloat(comma[1].replace(/,/g, ""));
        if (n >= 20000 && n <= 45000) return Math.round(n * 4) / 4;
      }
      const plain = raw.replace(/[,，']/g, "").match(/(\d{5}(?:\.\d{1,2})?)/);
      if (plain) {
        const n = parseFloat(plain[1]);
        if (n >= 20000 && n <= 45000) return Math.round(n * 4) / 4;
      }
      return null;
    }
    function classifyRoot(text) {
      const s = String(text || "").toUpperCase();
      if (/(?:^|[^A-Z])MNQ(?:1!|[FGHJKMNQUVXZ]\d{1,4}|[^A-Z]|$)/.test(s)) return "MNQ";
      if (/(?:^|[^A-Z])NQ(?:1!|[FGHJKMNQUVXZ]\d{1,4}|[^A-Z]|$)/.test(s)) return "NQ";
      return null;
    }
    function preferredRoot() {
      try {
        const q = new URL(location.href).searchParams.get("symbol");
        if (q) {
          const root = classifyRoot(decodeURIComponent(q));
          if (root) return root;
        }
      } catch (_) {
        /* ignore */
      }
      const header = document.querySelector("[data-symbol-short], .js-symbol-edit");
      const t = header?.getAttribute("data-symbol-short") || header?.textContent || "";
      return classifyRoot(t) || "MNQ";
    }
    function pickPinnedLastEl() {
      const preferred = preferredRoot();
      const nodes = document.querySelectorAll(SEL);
      let best = null;
      let bestScore = -1;
      for (const el of nodes) {
        const price = parseTxt(el.textContent);
        if (price == null) continue;
        let score = 1;
        let node = el;
        let blob = "";
        for (let i = 0; i < 5 && node; i++) {
          blob += " " + (node.getAttribute?.("data-symbol-short") || "");
          node = node.parentElement;
        }
        const nearby = classifyRoot(blob);
        if (nearby === preferred) score += 12;
        else if (nearby && nearby !== preferred) score -= 20;
        const r = el.getBoundingClientRect();
        if (r.top >= 0 && r.bottom <= 140) score += 5;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
      return best;
    }
    window.__dcPriceTickTimer = setInterval(() => {
      let price = null;
      let source = "tradingview_live";
      if (pinnedEl && pinnedEl.isConnected) price = parseTxt(pinnedEl.textContent);
      if (price == null) {
        const el = pickPinnedLastEl();
        if (el) {
          pinnedEl = el;
          price = parseTxt(el.textContent);
        }
      }
      if (price == null) {
        try {
          const fast = window.__dcLastCloseFast;
          const chartFn = window.__dcGetActiveChart;
          if (typeof fast === "function" && typeof chartFn === "function") {
            price = fast(chartFn());
            if (price != null) source = "tv_bar_close";
          }
        } catch (_) {
          /* ignore */
        }
      }
      if (price == null || !Number.isFinite(Number(price))) return;
      const rounded = Math.round(Number(price) * 4) / 4;
      if (lastPosted != null && rounded === lastPosted) return;
      lastPosted = rounded;
      window.postMessage(
        { type: "DC_PRICE_TICK", price: rounded, source, ts: Date.now(), symbol: preferredRoot() },
        "*"
      );
    }, 50);
  })();

  const BRIDGE_REV = "1.4.73";
  if (window.__dcTvBridgeRev === BRIDGE_REV) {
    window.postMessage({ type: "DC_BRIDGE_READY", reattached: true }, "*");
    return;
  }
  if (typeof window.__dcTvBridgeOnMessage === "function") {
    window.removeEventListener("message", window.__dcTvBridgeOnMessage);
  }
  window.__dcTvBridge = true;
  window.__dcTvBridgeRev = BRIDGE_REV;

  // Invisible ownership mark only — never put "DC" in user-visible label text.
  // TradingView strips ZWSP around letters, which previously leaked as "DC PDH".
  const DC_SHAPE_TAG_LEGACY = "\u200BDC\u200B";
  const DC_SHAPE_TAG = "\u200B\u2060\u200C\u200B";
  const REGISTRY_KEY = "dc-tv-shape-registry-v1";
  const CHART_INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;
  const CHART_ABBREV = [
    [/\bFirst presented 1m FVG\b/gi, "First Presented One-Minute Fair Value Gap"],
    [/\bORG bot\b/gi, "Opening Range Gap Bottom"],
    [/\bORG top\b/gi, "Opening Range Gap Top"],
    [/\bORG 50%\b/gi, "Opening Range Gap Midpoint"],
    [/\bNY RTH H\b/gi, "New York Regular Trading Hours High"],
    [/\bNY pre H\b/gi, "New York Pre-Market High"],
    [/\bNY pre L\b/gi, "New York Pre-Market Low"],
    [/\bD EQ\b/gi, "Daily Equilibrium"],
    [/\bFHDR\b/gi, "First Hour Dealing Range"],
    [/\bFPFVG\b/gi, "First Presented Fair Value Gap"],
    [/\bNDOG\b/gi, "New Day Opening Gap"],
    [/\bNWOG\b/gi, "New Week Opening Gap"],
    [/\bBPR\b/gi, "Balanced Price Range"],
    [/\bFVGs\b/gi, "Fair Value Gaps"],
    [/\bFVG\b/gi, "Fair Value Gap"],
    [/\bPDH\b/gi, "Previous Day High"],
    [/\bPDL\b/gi, "Previous Day Low"],
    [/\bPDC\b/gi, "Previous Day Close"],
    [/\bPDO\b/gi, "Previous Day Open"],
    [/\bEQH\b/gi, "Relative Equal Highs"],
    [/\bEQL\b/gi, "Relative Equal Lows"],
    [/\bREH\b/gi, "Relative Equal Highs"],
    [/\bREL\b/gi, "Relative Equal Lows"],
    [/\bORG\b/gi, "Opening Range Gap"],
    [/\bRTH\b/gi, "Regular Trading Hours"],
    [/\bOB\b/gi, "Order Block"],
    [/\b1m\b/gi, "One-Minute"],
    [/\bCE\b/gi, "Consequent Encroachment"],
    [/\bEQ\b/gi, "Equilibrium"],
  ];

  function formatChartLevelLabel(label, id) {
    const rawId = String(id || "");
    if (/^reh(_|$)/i.test(rawId)) return "Relative Equal Highs";
    if (/^rel(_|$)/i.test(rawId)) return "Relative Equal Lows";
    const idNames = {
      pdh: "Previous Day High",
      pdl: "Previous Day Low",
      pdc: "Previous Day Close",
      pdo: "Previous Day Open",
      cdo: "Current Day Open",
      cdeq: "Current Day Equilibrium",
      pdeq: "Previous Day Equilibrium",
      ndog_top: "New Day Opening Gap Top",
      ndog_bot: "New Day Opening Gap Bottom",
      nwog_top: "New Week Opening Gap Top",
      nwog_bottom: "New Week Opening Gap Bottom",
      nwog_bot: "New Week Opening Gap Bottom",
      org_top: "Opening Range Gap Top",
      org_bottom: "Opening Range Gap Bottom",
      org_ce: "Opening Range Gap Midpoint",
      fhdr_band: "First Hour Dealing Range (9:30–10:30)",
      fpfvg_ny_opening: "First Presented One-Minute Fair Value Gap",
      asia_high: "Asia Session High",
      asia_low: "Asia Session Low",
      london_high: "London Session High",
      london_low: "London Session Low",
      ny_pre_high: "New York Pre-Market High",
      ny_pre_low: "New York Pre-Market Low",
      ny_rth_high: "New York Regular Trading Hours High",
      ny_rth_low: "New York Regular Trading Hours Low",
      ny_pm_high: "New York Afternoon Session High",
      ny_pm_low: "New York Afternoon Session Low",
    };
    if (idNames[rawId]) {
      const extra = String(label || "").match(/[·•].+$/);
      return extra ? `${idNames[rawId]} ${extra[0].trim()}` : idNames[rawId];
    }
    let s = String(label || "").replace(CHART_INVISIBLE, "").trim();
    s = s.replace(/^DC\s+/i, "");
    s = s.replace(/^DC(?=[A-Z(])/, "");
    s = s.replace(
      /\(\s*(PDH|PDL|PDC|PDO|CDO|NDOG|NWOG|FVG|ORG|CE|OB|EQ|REH|REL|FHDR|BPR|EQH|EQL)\s*\)/gi,
      ""
    );
    s = s.replace(/\s{2,}/g, " ").trim();
    if (!s) return "";
    for (const pair of CHART_ABBREV) s = s.replace(pair[0], pair[1]);
    s = s.replace(/[A-Za-z][A-Za-z']*/g, (word, offset) => {
      if (offset > 0 && /^(and|of|to|the|or)$/i.test(word)) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
    return s.replace(/\s{2,}/g, " ").trim();
  }

  function looksLikeOurLevelText(s) {
    return /^(PDH|PDL|PDC|PDO|ORG|FVG|NDOG|NWOG|REH|REL|FHDR|EQH|EQL|BPR|OB|CE|Previous |Opening |New Day|New Week|Daily |Fair Value|First |Asia |London |Relative Equal|Current Day|New York|Order Block)/i.test(
      String(s || "").trim()
    );
  }

  function textHasDcOwnershipMark(text) {
    const raw = String(text || "");
    if (!raw) return false;
    if (raw.includes(DC_SHAPE_TAG) || raw.includes(DC_SHAPE_TAG_LEGACY)) return true;
    const visible = raw.replace(CHART_INVISIBLE, "");
    if (/^DC\s+/i.test(visible) && looksLikeOurLevelText(visible.replace(/^DC\s+/i, ""))) return true;
    if (/^DC(?=[A-Z(])/.test(visible) && looksLikeOurLevelText(visible.slice(2))) return true;
    return false;
  }

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

  function dcTaggedText(label, id) {
    const visible = formatChartLevelLabel(label != null ? String(label) : "", id);
    return visible ? `${DC_SHAPE_TAG}${visible}` : DC_SHAPE_TAG;
  }

  function shapeLooksDcOwned(shape, id, registrySet) {
    if (registrySet && registrySet.has(id)) return true;
    if (!shape) return false;
    const text = String(shape.text || shape.properties?.text || shape.overrides?.text || "");
    if (textHasDcOwnershipMark(text)) return true;
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
    return Boolean(
      chart &&
        (typeof chart.exportData === "function" ||
          typeof chart.getSeries === "function" ||
          typeof chart.mainSeries === "function" ||
          typeof chart.getPanes === "function")
    );
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

  function isNasdaqIndexPrice(n) {
    return Number.isFinite(n) && n >= 20000 && n <= 45000;
  }

  function closeFromValue(last) {
    const close = Number(
      last?.close ?? last?.value ?? last?.c ?? last?.[4] ?? (typeof last === "number" ? last : NaN)
    );
    return isNasdaqIndexPrice(close) ? close : null;
  }

  /** Fast last print — pane/series bars, no exportData (export often exceeds the 200ms caller timeout). */
  function lastCloseFast(chart) {
    if (!chart) return null;
    try {
      const series = chart.getSeries?.() || chart.mainSeries?.();
      const data = series?.data?.() || series?.bars?.();
      const last =
        (typeof data?.last === "function" ? data.last() : null) ||
        (typeof data?.lastValue === "function" ? data.lastValue() : null) ||
        (Array.isArray(data) && data.length ? data[data.length - 1] : null);
      const hit = closeFromValue(last);
      if (hit != null) return hit;
    } catch (_) {
      /* ignore */
    }
    try {
      const panes = chart.getPanes?.();
      if (Array.isArray(panes) && panes.length) {
        const main = panes[0];
        const src = main.getMainSource?.() || main.mainSource?.();
        const bars = src?.bars?.() || src?.data?.()?.bars || src?.data?.();
        if (bars?.length) {
          const hit = closeFromValue(bars[bars.length - 1]);
          if (hit != null) return hit;
        }
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function ohlcFromValueField(value) {
    if (Array.isArray(value) && value.length >= 4) {
      return { o: Number(value[0]), h: Number(value[1]), l: Number(value[2]), c: Number(value[3]) };
    }
    if (Array.isArray(value) && value.length >= 1) {
      const c = Number(value[value.length - 1]);
      return { o: c, h: c, l: c, c };
    }
    if (value && typeof value === "object") {
      const c = Number(value.close ?? value.c ?? value.value);
      if (!Number.isFinite(c)) return null;
      return {
        o: Number(value.open ?? value.o ?? c),
        h: Number(value.high ?? value.h ?? c),
        l: Number(value.low ?? value.l ?? c),
        c,
      };
    }
    const c = Number(value);
    if (!Number.isFinite(c)) return null;
    return { o: c, h: c, l: c, c };
  }

  function candleFromBar(bar) {
    if (bar == null || typeof bar === "number") return null;
    if (Array.isArray(bar)) {
      const t = normalizeUnixSec(bar[0]);
      const c = Number(bar[4] ?? bar[bar.length - 1]);
      if (t == null || !isNasdaqIndexPrice(c)) return null;
      const o = Number(bar[1]);
      const h = Number(bar[2]);
      const l = Number(bar[3]);
      return {
        t,
        o: Number.isFinite(o) ? o : c,
        h: Number.isFinite(h) ? h : c,
        l: Number.isFinite(l) ? l : c,
        c,
      };
    }
    const t = normalizeUnixSec(bar.time ?? bar.t ?? bar.timestamp ?? bar.date ?? bar.index);
    const packed = ohlcFromValueField(bar.value);
    const c = Number(bar.close ?? bar.c ?? packed?.c);
    if (t == null || !isNasdaqIndexPrice(c)) return null;
    const o = Number(bar.open ?? bar.o ?? packed?.o ?? c);
    const h = Number(bar.high ?? bar.h ?? packed?.h ?? c);
    const l = Number(bar.low ?? bar.l ?? packed?.l ?? c);
    return {
      t,
      o: Number.isFinite(o) ? o : c,
      h: Number.isFinite(h) ? h : c,
      l: Number.isFinite(l) ? l : c,
      c,
    };
  }

  function plotToArray(plot) {
    if (!plot) return [];
    if (Array.isArray(plot)) return plot;
    const out = [];
    try {
      if (typeof plot.size === "function" && typeof plot.valueAt === "function") {
        const n = Number(plot.size()) || 0;
        const start = Math.max(0, n - 240);
        for (let i = start; i < n; i++) out.push(plot.valueAt(i));
        if (out.length) return out;
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof plot.each === "function") {
        plot.each((b) => out.push(b));
        if (out.length) return out;
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof plot.bars === "function") {
        const nested = plotToArray(plot.bars());
        if (nested.length) return nested;
      }
    } catch (_) {
      /* ignore */
    }
    for (const key of ["_items", "items", "_bars", "m_bars", "_data", "_plotList", "_values", "values"]) {
      try {
        const v = plot[key];
        if (Array.isArray(v) && v.length) return v;
      } catch (_) {
        /* ignore */
      }
    }
    try {
      if (typeof plot.last === "function") {
        let row = plot.last();
        const prevFn = plot.previous || plot.prev || plot.prior;
        for (let i = 0; i < 240 && row; i++) {
          out.push(row);
          row = typeof prevFn === "function" ? prevFn.call(plot, row) : null;
        }
        if (out.length) return out.reverse();
      }
    } catch (_) {
      /* ignore */
    }
    return out;
  }

  function collectSeriesBars(chart) {
    try {
      const series = chart.getSeries?.() || chart.mainSeries?.();
      const fromSeries = plotToArray(series?.data?.() || series?.bars?.() || series?.data);
      if (fromSeries.length) return fromSeries;
    } catch (_) {
      /* ignore */
    }
    try {
      const panes = chart.getPanes?.();
      const main = Array.isArray(panes) && panes[0];
      const src = main?.getMainSource?.() || main?.mainSource?.();
      const fromPane = plotToArray(src?.bars?.() || src?.data?.()?.bars || src?.data?.() || src?.bars);
      if (fromPane.length) return fromPane;
    } catch (_) {
      /* ignore */
    }
    return [];
  }

  function candlesFromSeries(chart, maxBars) {
    if (!chart) return [];
    const limit = Math.max(20, Math.min(maxBars || 120, 240));
    const raw = collectSeriesBars(chart);
    const range = getVisibleRange(chart);
    const to = range?.to || Math.floor(Date.now() / 1000);
    const from = range?.from || to - Math.max(raw.length, limit) * 60;
    const step = raw.length > 1 ? Math.max(1, Math.floor((to - from) / Math.max(1, raw.length - 1))) : 60;
    const candles = [];
    for (let i = 0; i < raw.length; i++) {
      let c = candleFromBar(raw[i]);
      if (!c) {
        const close = closeFromValue(raw[i]);
        if (close == null) continue;
        c = { t: from + i * step, o: close, h: close, l: close, c: close };
      }
      candles.push(c);
    }
    candles.sort((a, b) => a.t - b.t);
    return candles.slice(-limit);
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
    return isNasdaqIndexPrice(close) ? close : null;
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

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(label || "timeout")), Math.max(200, ms))
      ),
    ]);
  }

  async function exportOhlcFromChart(chart, maxBars) {
    if (!chart) return { candles: [], rawRowCount: 0, origin: "none", exportError: "export_not_ready" };

    const seriesCandles = candlesFromSeries(chart, maxBars);
    if (seriesCandles.length >= 20) {
      return {
        candles: seriesCandles,
        rawRowCount: seriesCandles.length,
        origin: "tv_series",
        exportPartial: false,
        exportError: null,
      };
    }

    if (typeof chart.exportData !== "function") {
      return {
        candles: seriesCandles,
        rawRowCount: seriesCandles.length,
        origin: seriesCandles.length ? "tv_series" : "none",
        exportError: seriesCandles.length ? "insufficient_candles" : "export_not_ready",
      };
    }

    let rawRowCount = 0;
    let exportPartial = false;
    let exportError = null;

    try {
      const data = await withTimeout(chart.exportData({ includedStudies: "none" }), 800, "export_timeout");
      rawRowCount = data?.data?.length || 0;
      const candles = parseExportCandles(data, maxBars);
      if (candles.length >= 20) {
        if (rawRowCount > 0 && candles.length < Math.min(rawRowCount, maxBars) * 0.5) exportPartial = true;
        return { candles, rawRowCount, origin: "tv_export", exportPartial, exportError: null };
      }
      if (candles.length > seriesCandles.length) {
        return {
          candles,
          rawRowCount,
          origin: "tv_export",
          exportPartial: true,
          exportError: candles.length < 20 ? "insufficient_candles" : null,
        };
      }
    } catch (e) {
      exportError = String(e?.message || e || "export_failed");
    }

    try {
      const data = await withTimeout(chart.exportData({}), 800, "export_timeout");
      rawRowCount = data?.data?.length || 0;
      const candles = parseExportCandles(data, maxBars);
      if (candles.length) {
        if (rawRowCount > 0 && candles.length < Math.min(rawRowCount, maxBars) * 0.5) exportPartial = true;
        return {
          candles,
          rawRowCount,
          origin: "tv_export",
          exportPartial,
          exportError: candles.length >= 20 ? null : "insufficient_candles",
        };
      }
    } catch (e) {
      exportError = String(e?.message || e || "export_failed");
    }

    return {
      candles: seriesCandles,
      rawRowCount: seriesCandles.length,
      origin: seriesCandles.length ? "tv_series" : "none",
      exportPartial: false,
      exportError: exportError || (seriesCandles.length ? "insufficient_candles" : "export_failed"),
    };
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
        sync: { drawingExportFailed: true, widgetFound: false },
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
      source: candles.length ? exportResult.origin || "tv_export" : "none",
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

    const fast = lastCloseFast(chart);
    if (fast != null) return fast;

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

    return lastCloseFast(chart);
  }

  function parseDomPriceText(text) {
    if (!text) return null;
    const raw = String(text).replace(/[\u00a0\s\u202f]/g, " ");
    const comma = raw.match(/\b(\d{2},\d{3}(?:\.\d{1,2})?)\b/);
    if (comma) {
      const n = parseFloat(comma[1].replace(/,/g, ""));
      if (isNasdaqIndexPrice(n)) return n;
    }
    const plain = raw.replace(/[,，']/g, "").match(/(\d{5}(?:\.\d{1,2})?)/);
    if (plain) {
      const n = parseFloat(plain[1]);
      if (isNasdaqIndexPrice(n) && !(n >= 20200 && n < 20400 && Math.abs(n - Math.round(n)) < 0.001)) {
        return n;
      }
    }
    return null;
  }

  function readPageDomLast() {
    const selectors = [
      ".js-symbol-last",
      '[class*="js-symbol-last"]',
      '[data-field="last"]',
      '[data-field="last_price"]',
      '[class*="tv-symbol-price-quote"]',
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const n = parseDomPriceText(el.innerText || el.textContent);
        if (n != null) return n;
      }
    }
    const headerBottom = 180;
    const axisLeft = window.innerWidth - 160;
    let best = null;
    let bestScore = -1;
    for (const el of document.querySelectorAll("span, div")) {
      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 22) continue;
      const n = parseDomPriceText(text);
      if (n == null) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.height > 64) continue;
      let score = 1;
      if (r.top < headerBottom) score += 8;
      if (r.left > axisLeft) score += 6;
      if (text.includes(",")) score += 3;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
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

  function withDcTag(opts, label, id) {
    const showLabel = Boolean(label && opts?.overrides?.showLabel !== false);
    const tagged = showLabel ? dcTaggedText(label, id) : DC_SHAPE_TAG;
    return {
      ...opts,
      text: tagged,
      overrides: {
        ...(opts.overrides || {}),
        dcDeskCopilot: true,
        text: tagged,
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
        label,
        zone.id
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
            "",
            zone.id
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
        label,
        level.id
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

  window.__dcTvBridgeOnMessage = async function dcTvBridgeOnMessage(event) {
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
        let price = await getLastBarClose(chart);
        let source = "tv_api";
        if (price == null) {
          price = readPageDomLast();
          source = "tradingview_live";
        }
        window.postMessage(
          {
            type: "DC_LAST_PRICE",
            price: price != null ? price : null,
            ok: price != null,
            source: price != null ? source : "none",
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
            sync: { drawingExportFailed: true, widgetFound: Boolean(findChartWidget()) },
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
  };
  window.addEventListener("message", window.__dcTvBridgeOnMessage);

  window.postMessage({ type: "DC_BRIDGE_READY", reattached: false }, "*");
  window.__dcLastCloseFast = lastCloseFast;
  window.__dcGetActiveChart = getActiveChart;
})();
