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
    let lastPostedAt = 0;
    let lastDiagAt = 0;
    let lastFullLastScanAt = 0;
    let lastLiveForRoll = null;
    let lastLiveBucket = -1;
    let rolledClose = null;
    let pinnedEl = null;
    function roundTick(n) {
      return Math.round(Number(n) * 4) / 4;
    }
    function clipSnippet(text) {
      return String(text || "")
        .replace(/[\u00a0\s\u202f]+/g, " ")
        .trim()
        .slice(0, 96);
    }
    // Keep in sync with lib/tv-last-badge.ts parseTvAxisLastBadge.
    // LAST = price immediately before bar remaining 00:ss–04:ss. Not first
    // comma-price (scale/high). Clocks like 08:14 must not match.
    function parseLastBox(text) {
      if (!text) return null;
      const raw = String(text)
        .replace(/[\u2236\uFF1A\uA789]/g, ":")
        .replace(/[\u00a0\s\u202f]+/g, " ")
        .trim();
      const hits = [...raw.matchAll(/(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)(?=\s*0[0-4]:\d{2}\b)/g)];
      if (!hits.length) return null;
      const n = parseFloat(hits[hits.length - 1][1].replace(/,/g, ""));
      if (n >= 20000 && n <= 45000) return roundTick(n);
      return null;
    }
    function isBarCountdownLeaf(text) {
      const t = String(text || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\u2236\uFF1A\uA789]/g, ":")
        .trim();
      if (!/^\d{2}:\d{2}$/.test(t)) return false;
      const mm = Number(t.slice(0, 2));
      return mm >= 0 && mm <= 4;
    }
    function isLastValueWidget(el) {
      const blob = `${el?.className || ""} ${el?.getAttribute?.("data-name") || ""}`;
      return /price-axis-last|lastValue|last-value|lastValueBar/i.test(blob);
    }
    function parseCompactAxisPrice(text) {
      const boxed = parseLastBox(text);
      if (boxed != null) return boxed;
      const raw = String(text || "")
        .replace(/[\u2236\uFF1A\uA789]/g, ":")
        .replace(/[\u00a0\s\u202f]+/g, " ")
        .trim();
      if (!raw || raw.length > 24) return null;
      const m = raw.match(/(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)/);
      if (!m) return null;
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (n >= 20000 && n <= 45000) return roundTick(n);
      return null;
    }
    function nodeText(el) {
      return el ? el.innerText || el.textContent || "" : "";
    }
    function insideDeskPanel(el) {
      try {
        return !!(el && el.closest && el.closest("#dc-panel"));
      } catch (_) {
        return false;
      }
    }
    function opaqueBg(el) {
      try {
        const cs = getComputedStyle(el);
        const bg = String(cs.backgroundColor || "");
        if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
        if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)" || bg === "rgb(0, 0, 0, 0)") return false;
        const m = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
        if (m) {
          const a = m[4] == null ? 1 : Number(m[4]);
          return a >= 0.25;
        }
        if (/oklch|oklab|color\(|hsla?\(|hwb\(|lab\(|lch\(|#[0-9a-f]{3,8}/i.test(bg)) return true;
        return bg !== "none";
      } catch (_) {
        return false;
      }
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
    function readLegendClose() {
      const items = document.querySelectorAll(
        '[data-name="legend-source-item"], [class*="legendSourceWrapper"], [class*="legend-source-item"]'
      );
      for (const el of items) {
        const text = (el.textContent || "").replace(/\s+/g, " ");
        const m = text.match(/\bC[:\s]*(\d{1,2},\d{3}(?:\.\d{1,2})?|\d{5}(?:\.\d{1,2})?)/i);
        if (!m) continue;
        const n = parseFloat(String(m[1]).replace(/,/g, ""));
        if (n >= 20000 && n <= 45000) return roundTick(n);
      }
      return null;
    }
    function findPaneCanvas() {
      let best = null;
      let bestArea = 0;
      for (const canvas of document.querySelectorAll("canvas")) {
        const r = canvas.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > bestArea && r.width > 280 && r.height > 160 && r.top < window.innerHeight * 0.92) {
          bestArea = area;
          best = { el: canvas, rect: r };
        }
      }
      return best;
    }
    function axisSearchRoots(pane) {
      const roots = [];
      const seen = new Set();
      const add = (el) => {
        if (!el || seen.has(el) || el.id === "dc-panel") return;
        seen.add(el);
        roots.push(el);
      };
      if (pane.el.parentElement) add(pane.el.parentElement);
      let node = pane.el.parentElement;
      for (let i = 0; i < 5 && node; i++) {
        for (const child of node.children || []) {
          if (child.id === "dc-panel" || insideDeskPanel(child)) continue;
          const r = child.getBoundingClientRect();
          if (r.height < 24 || r.width < 8) continue;
          if (r.right < pane.rect.right - 280) continue;
          if (r.left > pane.rect.right + 180) continue;
          add(child);
          if (child.shadowRoot) add(child.shadowRoot);
        }
        node = node.parentElement;
      }
      return roots;
    }
    function walkAxisEls(pane, visit) {
      const roots = axisSearchRoots(pane);
      const minLeft = pane.rect.right - 360;
      const maxLeft = pane.rect.right + 180;
      const top = pane.rect.top - 16;
      const bot = pane.rect.bottom + 16;
      const visitNode = (el) => {
        if (!el || el.nodeType !== 1 || el.id === "dc-panel" || insideDeskPanel(el)) return;
        let r;
        try {
          r = el.getBoundingClientRect();
        } catch (_) {
          return;
        }
        if (r.width < 4 || r.height < 4) return;
        const nearAxisRight = r.right >= pane.rect.right - 80 && r.left <= pane.rect.right + 180;
        const inAxisCol = r.left >= minLeft && r.left <= maxLeft;
        if (!nearAxisRight && !inAxisCol) return;
        if (r.bottom < top || r.top > bot) return;
        visit(el, r);
      };
      const walkRoot = (root) => {
        if (!root) return;
        if (root.nodeType === 1) visitNode(root);
        const list = root.querySelectorAll ? root.querySelectorAll("*") : [];
        for (const el of list) {
          visitNode(el);
          if (el.shadowRoot) walkRoot(el.shadowRoot);
        }
      };
      if (!roots.length) {
        walkRoot(document.body);
        return 0;
      }
      for (const root of roots) walkRoot(root);
      return roots.length;
    }
    function readAxisLastBadge() {
      const pane = findPaneCanvas();
      if (!pane) {
        return {
          price: null,
          el: null,
          timers: 0,
          failSnippets: [],
          axisRoots: 0,
          compactHits: 0,
          paneRight: null,
          chosen: "none",
          priceSnippets: [],
          lastValueHits: 0,
          opaqueHits: 0,
          opaqueSample: [],
        };
      }
      const timers = [];
      const failSnippets = [];
      const compact = [];
      const lastValueEls = [];
      const opaqueEls = [];
      const priceSnippets = [];
      const opaqueSample = [];
      const axisRoots = walkAxisEls(pane, (el, r) => {
        const raw = nodeText(el);
        const text = clipSnippet(raw);
        if (isBarCountdownLeaf(el.textContent)) {
          if (r.width >= 4 && r.width <= 220 && r.height >= 4 && r.height <= 48) timers.push(el);
        }
        if (text.length >= 8 && text.length <= 80 && /0[0-4]:\d{2}/.test(text)) compact.push(el);
        if (isLastValueWidget(el)) lastValueEls.push(el);
        if (opaqueBg(el) && r.width >= 20 && r.width <= 160 && r.height >= 12 && r.height <= 56) {
          opaqueEls.push(el);
          if (opaqueSample.length < 6) {
            opaqueSample.push({
              tag: el.tagName || "",
              cls: String(el.className || "").slice(0, 48),
              text: text.slice(0, 40),
              w: Math.round(r.width),
              h: Math.round(r.height),
              left: Math.round(r.left),
              parsed: parseCompactAxisPrice(raw),
            });
          }
        }
        if (priceSnippets.length < 6 && text.length <= 40 && /\d{4,}/.test(text)) {
          priceSnippets.push(text);
        }
      });
      if (!timers.length) {
        const top = pane.rect.top - 16;
        const bot = pane.rect.bottom + 16;
        const minLeft = pane.rect.right - 360;
        for (const el of document.querySelectorAll("div, span, label, td")) {
          if (insideDeskPanel(el) || !isBarCountdownLeaf(el.textContent)) continue;
          const r = el.getBoundingClientRect();
          if (r.left < minLeft || r.bottom < top || r.top > bot) continue;
          if (r.width > 220 || r.height > 48) continue;
          timers.push(el);
        }
      }
      let best = null;
      let bestEl = null;
      let bestScore = -1e9;
      let chosen = "none";
      const consider = (node, overrideText, overrideRect, overridePrice) => {
        if (!node || insideDeskPanel(node)) return;
        const raw = overrideText != null ? overrideText : nodeText(node);
        const n = overridePrice != null ? overridePrice : parseLastBox(raw);
        if (n == null) return;
        const len = clipSnippet(raw).length;
        if (len > 80) return;
        const r = overrideRect || node.getBoundingClientRect();
        if (r.width < 16 || r.height < 10 || r.width > 280 || r.height > 160) return;
        let score = 30 - (r.width * r.height) / 500;
        if (opaqueBg(node)) score += 28;
        if (isLastValueWidget(node)) score += 40;
        if (len <= 32) score += 8;
        if (score > bestScore) {
          bestScore = score;
          best = n;
          bestEl = node;
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
          consider(sib, `${nodeText(sib)} ${nodeText(timer)}`, {
            width: Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left),
            height: Math.max(r1.bottom, r2.bottom) - Math.min(r1.top, r2.top),
            left: Math.min(r1.left, r2.left),
            top: Math.min(r1.top, r2.top),
            bottom: Math.max(r1.bottom, r2.bottom),
          });
        }
      }
      if (best == null) {
        for (const el of compact) {
          const n = parseLastBox(nodeText(el));
          if (n == null) {
            if (failSnippets.length < 3) failSnippets.push(clipSnippet(nodeText(el)));
            continue;
          }
          consider(el);
        }
        if (best != null) chosen = "axis-badge";
      } else {
        chosen = "axis-badge";
      }
      if (best == null) {
        for (const el of lastValueEls) {
          const n = parseCompactAxisPrice(nodeText(el));
          if (n == null) continue;
          consider(el, nodeText(el), null, n);
        }
        if (best != null) chosen = "last-value-widget";
      }
      if (best == null && opaqueEls.length && opaqueEls.length <= 16) {
        for (const el of opaqueEls) {
          if (el.getBoundingClientRect().height < 12) continue;
          const n = parseCompactAxisPrice(nodeText(el));
          if (n == null) continue;
          consider(el, nodeText(el), null, n);
        }
        if (best != null) chosen = "axis-opaque";
      }
      if (bestEl) pinnedEl = bestEl;
      return {
        price: best,
        el: bestEl,
        timers: timers.length,
        failSnippets: failSnippets.length ? failSnippets : priceSnippets,
        axisRoots,
        compactHits: compact.length,
        paneRight: Math.round(pane.rect.right),
        chosen,
        priceSnippets,
        lastValueHits: lastValueEls.length,
        opaqueHits: opaqueEls.length,
        opaqueSample,
      };
    }
    window.__dcPriceTickTimer = setInterval(() => {
      let series = null;
      let completedClose = null;
      let formingOpen = null;
      let formingClose = null;
      let chartOk = false;
      let candleCount = 0;
      try {
        const fast = window.__dcLastCloseFast;
        const completedFn = window.__dcLastCompletedBar;
        const chartFn = window.__dcGetActiveChart;
        if (typeof chartFn === "function") {
          const chart = chartFn();
          chartOk = Boolean(chart);
          if (typeof fast === "function") series = fast(chart);
          if (typeof completedFn === "function") {
            const snap = completedFn(chart);
            if (snap) {
              completedClose = snap.completedClose;
              formingOpen = snap.formingOpen;
              formingClose = snap.formingClose;
              candleCount = snap.candleCount || 0;
            }
          }
        }
      } catch (_) {
        /* ignore */
      }
      const legend = readLegendClose();
      let axis = null;
      let scanMeta = {
        timers: 0,
        failSnippets: [],
        axisRoots: 0,
        compactHits: 0,
        paneRight: null,
        chosen: "none",
        priceSnippets: [],
        lastValueHits: 0,
        opaqueHits: 0,
        opaqueSample: [],
      };
      if (pinnedEl && pinnedEl.isConnected) {
        axis =
          parseLastBox(pinnedEl.innerText || pinnedEl.textContent) ||
          (isLastValueWidget(pinnedEl) || opaqueBg(pinnedEl)
            ? parseCompactAxisPrice(pinnedEl.innerText || pinnedEl.textContent)
            : null);
        if (axis == null) pinnedEl = null;
        else scanMeta.chosen = "axis-pin";
      }
      if (axis == null) {
        const scanned = readAxisLastBadge();
        axis = scanned.price;
        scanMeta = {
          timers: scanned.timers,
          failSnippets: scanned.failSnippets,
          axisRoots: scanned.axisRoots,
          compactHits: scanned.compactHits,
          paneRight: scanned.paneRight,
          chosen: scanned.chosen,
          priceSnippets: scanned.priceSnippets,
          lastValueHits: scanned.lastValueHits,
          opaqueHits: scanned.opaqueHits,
          opaqueSample: scanned.opaqueSample,
        };
      }
      const now = Date.now();
      if (axis == null && now - lastFullLastScanAt >= 400) {
        lastFullLastScanAt = now;
        const pane = findPaneCanvas();
        if (pane) {
          const top = pane.rect.top - 40;
          const bot = pane.rect.bottom + 40;
          const minRight = pane.rect.right - 140;
          const maxLeft = pane.rect.right + 200;
          const nodes = document.querySelectorAll("div, span, label, td, p, b, strong");
          for (const el of nodes) {
            if (insideDeskPanel(el)) continue;
            const raw = nodeText(el);
            if (!raw || raw.length > 80) continue;
            const n = parseLastBox(raw);
            if (n == null) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8 || r.width > 280) continue;
            if (r.bottom < top || r.top > bot) continue;
            if (r.right < minRight || r.left > maxLeft) continue;
            axis = n;
            pinnedEl = el;
            scanMeta.chosen = "axis-badge-full";
            break;
          }
        }
      }
      const rawSnippet = pinnedEl
        ? clipSnippet(pinnedEl.innerText || pinnedEl.textContent)
        : scanMeta.failSnippets[0] || null;
      const seriesN = series != null ? roundTick(series) : null;
      const legendN = legend != null ? roundTick(legend) : null;
      let completedN = completedClose != null ? roundTick(completedClose) : null;
      const formingOpenN = formingOpen != null ? roundTick(formingOpen) : null;
      const formingCloseN = formingClose != null ? roundTick(formingClose) : null;
      let chosen = scanMeta.chosen || "none";
      if (axis == null && seriesN != null) {
        axis = seriesN;
        chosen = "tv-lastValue";
      }
      const livePx = axis != null ? roundTick(axis) : seriesN;
      const bucket = Math.floor(now / 60000);
      if (lastLiveForRoll != null && lastLiveBucket >= 0 && bucket !== lastLiveBucket) {
        rolledClose = lastLiveForRoll;
      }
      if (livePx != null) {
        lastLiveForRoll = livePx;
        lastLiveBucket = bucket;
      }
      if (completedN == null && rolledClose != null) completedN = rolledClose;
      const parseOk = axis != null && Number.isFinite(Number(axis));
      if (now - lastDiagAt >= 2000) {
        lastDiagAt = now;
        window.postMessage(
          {
            type: "DC_PRICE_DIAG",
            price: parseOk ? roundTick(axis) : null,
            parseOk,
            chosen: parseOk ? chosen : "none",
            rawSnippet,
            failSnippets: scanMeta.failSnippets,
            priceSnippets: scanMeta.priceSnippets,
            timers: scanMeta.timers,
            axisRoots: scanMeta.axisRoots,
            compactHits: scanMeta.compactHits,
            paneRight: scanMeta.paneRight,
            lastValueHits: scanMeta.lastValueHits,
            opaqueHits: scanMeta.opaqueHits,
            opaqueSample: scanMeta.opaqueSample,
            series: seriesN,
            legend: legendN,
            completedClose: completedN,
            formingOpen: formingOpenN,
            formingClose: formingCloseN,
            chartOk,
            candleCount,
            dom: parseOk && chosen !== "tv-lastValue" ? roundTick(axis) : null,
            axis: parseOk ? roundTick(axis) : null,
            symbol: preferredRoot(),
            ts: now,
          },
          "*"
        );
      }
      if (!parseOk) {
        if (completedN != null && completedN !== lastPosted) {
          lastPosted = completedN;
          lastPostedAt = now;
          window.postMessage(
            {
              type: "DC_PRICE_TICK",
              price: completedN,
              source: "tv_1m_close",
              ts: now,
              symbol: preferredRoot(),
              series: seriesN,
              legend: legendN,
              completedClose: completedN,
              formingOpen: formingOpenN,
              formingClose: formingCloseN,
              chartOk,
              candleCount,
              chosen: "completed-1m-close",
            },
            "*"
          );
        }
        return;
      }
      const rounded = roundTick(axis);
      if (rounded === lastPosted && now - lastPostedAt < 1000) return;
      lastPosted = rounded;
      lastPostedAt = now;
      const pinRect = pinnedEl ? pinnedEl.getBoundingClientRect() : null;
      window.postMessage(
        {
          type: "DC_PRICE_TICK",
          price: rounded,
          source: "tradingview_live",
          ts: now,
          symbol: preferredRoot(),
          series: seriesN,
          legend: legendN,
          completedClose: completedN,
          formingOpen: formingOpenN,
          formingClose: formingCloseN,
          dom: chosen !== "tv-lastValue" ? rounded : null,
          axis: rounded,
          chosen,
          pinW: pinRect ? Math.round(pinRect.width) : null,
          pinH: pinRect ? Math.round(pinRect.height) : null,
          pinText: rawSnippet,
          rawSnippet,
        },
        "*"
      );
    }, 50);
  })();

  const BRIDGE_REV = "1.4.137";
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
    if (/^reh(_|$)/i.test(rawId) || /^eqh(_|$)/i.test(rawId)) return "Relative Equal Highs";
    if (/^rel(_|$)/i.test(rawId) || /^eql(_|$)/i.test(rawId)) return "Relative Equal Lows";
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

  const OVERLAY_SHORT_ID = {
    asia_high: "Asia High",
    asia_low: "Asia Low",
    london_high: "London High",
    london_low: "London Low",
    ny_pre_high: "NY Pre High",
    ny_pre_low: "NY Pre Low",
    ny_rth_high: "NY RTH High",
    ny_rth_low: "NY RTH Low",
    ny_pm_high: "NY PM High",
    ny_pm_low: "NY PM Low",
  };
  const OVERLAY_SHORT_TEXT = [
    [/New York Regular Trading Hours High/gi, "NY RTH High"],
    [/New York Regular Trading Hours Low/gi, "NY RTH Low"],
    [/New York Pre-Market High/gi, "NY Pre High"],
    [/New York Pre-Market Low/gi, "NY Pre Low"],
    [/New York Afternoon Session High/gi, "NY PM High"],
    [/New York Afternoon Session Low/gi, "NY PM Low"],
    [/London Session High/gi, "London High"],
    [/London Session Low/gi, "London Low"],
    [/Asia Session High/gi, "Asia High"],
    [/Asia Session Low/gi, "Asia Low"],
    [/Relative Equal Highs/gi, "REH"],
    [/Relative Equal Lows/gi, "REL"],
  ];

  function formatChartOverlayLabel(label, id) {
    const rawId = String(id || "");
    if (/^reh(_|$)/i.test(rawId) || /^eqh(_|$)/i.test(rawId)) return "REH";
    if (/^rel(_|$)/i.test(rawId) || /^eql(_|$)/i.test(rawId)) return "REL";
    if (OVERLAY_SHORT_ID[rawId]) return OVERLAY_SHORT_ID[rawId];
    let s = formatChartLevelLabel(label, id);
    for (const pair of OVERLAY_SHORT_TEXT) s = s.replace(pair[0], pair[1]);
    return s.replace(/\s{2,}/g, " ").trim();
  }

  function looksLikeOurLevelText(s) {
    return /^(PDH|PDL|PDC|PDO|ORG|FVG|NDOG|NWOG|REH|REL|FHDR|EQH|EQL|BPR|OB|CE|NY |London |Asia |Previous |Opening |New Day|New Week|Daily |Fair Value|First |Relative Equal|Current Day|New York|Order Block)/i.test(
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

  function isSlashJoinedChartLabel(text) {
    return /\s\/\s/.test(String(text || ""));
  }

  function dcTaggedText(label, id, preformatted) {
    const raw = label != null ? String(label) : "";
    const visible = preformatted
      ? raw.replace(/\s{2,}/g, " ").trim()
      : formatChartOverlayLabel(raw, id);
    return visible ? `${DC_SHAPE_TAG}${visible}` : DC_SHAPE_TAG;
  }

  function resolveNativeShapeTitle(item) {
    const extra = String(item?.displayLabel || "").trim();
    if (extra && !isSlashJoinedChartLabel(extra)) return extra;
    const formatted = formatChartOverlayLabel(item?.label || "", item?.id);
    if (formatted) return formatted;
    return String(item?.label || "").trim();
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
    const step = Math.max(90, Math.floor(span / 16));
    return n * step;
  }

  function labelClusterThreshold(priceMin, priceMax) {
    const span = Math.max(0, Number(priceMax) - Number(priceMin));
    const adaptive = span * 0.0035;
    return Math.max(4, Math.min(14, adaptive || 8));
  }

  function assignCollisionLayout(levels, zones, opts) {
    const items = [];
    for (const level of levels || []) {
      const price = Number(level.price);
      if (!level.label || level.showLabel === false) continue;
      if (!Number.isFinite(price) || price <= 0) continue;
      items.push({ kind: "level", ref: level, price });
    }
    for (const zone of zones || []) {
      if (!zone.label || zone.showLabel === false) continue;
      items.push({ kind: "zone", ref: zone, price: Math.max(Number(zone.top), Number(zone.bottom)) });
    }
    if (!items.length) return;
    items.sort((a, b) => b.price - a.price);
    const prices = items.map((i) => i.price);
    const pMin = opts?.priceMin ?? Math.min(...prices);
    const pMax = opts?.priceMax ?? Math.max(...prices);
    const threshold = labelClusterThreshold(pMin, pMax);
    const spanSec = opts?.visibleSpanSec;
    const clusters = [];
    for (const item of items) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(last[last.length - 1].price - item.price) <= threshold) last.push(item);
      else clusters.push([item]);
    }
    for (const cluster of clusters) {
      cluster.forEach((item, i) => {
        item.ref.labelLane = i;
        item.ref.labelAlign = labelLaneToAlign(i);
        item.ref.labelHorzAlign = labelLaneToHorzAlign(i);
        item.ref.labelTimeShiftSec = labelLaneToTimeShiftSec(i, spanSec);
      });
    }
  }

  function nativeVertAlign(item, price, pMin, pMax) {
    let vert = item?.labelAlign === "middle" ? "middle" : item?.labelAlign === "bottom" ? "bottom" : "top";
    // Never dump the title into the pane/price-scale gutter while the ray sits elsewhere.
    if (
      vert === "bottom" &&
      Number.isFinite(price) &&
      Number.isFinite(pMin) &&
      Number.isFinite(pMax) &&
      pMax > pMin &&
      price <= pMin + (pMax - pMin) * 0.22
    ) {
      vert = "top";
    }
    if (vert !== "middle" && vert !== "bottom") vert = "top";
    return vert;
  }

  function nativeLabelAlignOverrides(item, price, pMin, pMax) {
    const lane = Math.max(0, Math.floor(Number(item?.labelLane) || 0));
    const horzRaw = item?.labelHorzAlign || labelLaneToHorzAlign(lane);
    const horz = horzRaw === "center" || horzRaw === "right" ? horzRaw : "left";
    return {
      vertLabelsAlign: nativeVertAlign(item, price, pMin, pMax),
      horzLabelsAlign: horz,
    };
  }

  function shiftedRayTime(startTime, shiftSec, range) {
    const shift = Math.max(0, Number(shiftSec) || 0);
    let t = Number(startTime) + shift;
    const from = Number(range?.from);
    const to = Number(range?.to);
    if (!Number.isFinite(t)) t = startTime;
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
      const span = to - from;
      if (t > to) t = from + (shift % Math.max(1, span - 60));
      if (t < from) t = from + Math.min(shift, Math.max(0, span - 60));
    }
    return t;
  }

  function applyShapePoints(chart, id, time, price) {
    if (!chart || id == null || !Number.isFinite(price) || price <= 0) return;
    try {
      const shape = chart.getShapeById?.(id);
      if (!shape) return;
      const pt = { time, price };
      if (typeof shape.setPoints === "function") shape.setPoints([pt]);
      else if (typeof shape.setPoint === "function") shape.setPoint(0, pt);
    } catch (_) {
      /* ignore */
    }
  }

  /** Re-assign native TV label slots after every create/update. Never merge names. Never change price. */
  function applyNativeCollisionLayout(chart, records, range) {
    const levels = [];
    const zones = [];
    for (const rec of records || []) {
      if (rec.kind === "zone") zones.push(rec.item);
      else levels.push(rec.item);
    }
    const prices = records.map((r) => Number(r.price)).filter((p) => Number.isFinite(p) && p > 0);
    const pMin = prices.length ? Math.min(...prices) : undefined;
    const pMax = prices.length ? Math.max(...prices) : undefined;
    const spanSec =
      range && Number.isFinite(range.to) && Number.isFinite(range.from) ? Math.max(180, range.to - range.from) : 3600;
    assignCollisionLayout(levels, zones, { priceMin: pMin, priceMax: pMax, visibleSpanSec: spanSec });
    for (const rec of records || []) {
      if (rec.kind === "ce") continue;
      const price = Number(rec.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const align = nativeLabelAlignOverrides(rec.item, price, pMin, pMax);
      const paint =
        rec.kind === "level"
          ? nativeLinePaintOverrides({ ...(rec.overrides || {}), ...align, showLabel: rec.showLabel !== false })
          : { ...align, showLabel: rec.showLabel !== false };
      applyShapeOverrides(chart, rec.id, paint);
      if (rec.kind === "level") {
        const t0 = shiftedRayTime(rec.startTime, rec.item.labelTimeShiftSec, range);
        applyShapePoints(chart, rec.id, t0, price);
      }
    }
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
      if (typeof w.exportData === "function") return true;
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

  function isChartExportReady(chart) {
    return Boolean(
      chart &&
        (typeof chart.exportData === "function" ||
          typeof chart.getSeries === "function" ||
          typeof chart.mainSeries === "function" ||
          typeof chart.getMainSeries === "function" ||
          typeof chart.getPanes === "function")
    );
  }

  function chartFromWidget(widget) {
    if (!widget) return null;
    try {
      if (typeof widget.activeChart === "function") {
        const c = widget.activeChart();
        if (isChartExportReady(c)) return c;
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof widget.chart === "function") {
        const c = widget.chart();
        if (isChartExportReady(c)) return c;
      }
    } catch (_) {
      /* ignore */
    }
    if (isChartExportReady(widget)) return widget;
    return null;
  }

  function considerChartWidget(w) {
    if (!w || typeof w !== "object") return null;
    if (!looksLikeChartWidget(w)) return null;
    const unwrapped = unwrapWidget(w);
    if (chartFromWidget(unwrapped)) return unwrapped;
    if (unwrapped !== w && chartFromWidget(w)) return w;
    return null;
  }

  function findChartWidget() {
    for (const k of WIDGET_KEYS) {
      try {
        const hit = considerChartWidget(window[k]);
        if (hit) return hit;
      } catch (_) {
        /* ignore */
      }
    }

    const names = new Set(Object.keys(window));
    try {
      for (const n of Object.getOwnPropertyNames(window)) names.add(n);
    } catch (_) {
      /* ignore */
    }
    let scanned = 0;
    for (const k of names) {
      if (WIDGET_KEYS.includes(k)) continue;
      scanned += 1;
      if (scanned > 400) break;
      try {
        const hit = considerChartWidget(window[k]);
        if (hit) return hit;
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
          const hit = considerChartWidget(win[k]);
          if (hit) return hit;
        }
        for (const k of Object.keys(win)) {
          const hit = considerChartWidget(win[k]);
          if (hit) return hit;
        }
      } catch (_) {
        /* ignore */
      }
    }
    return null;
  }

  async function waitForChartReady(opts) {
    const maxWaitMs = Math.max(500, Number(opts?.maxWaitMs) || 2400);
    const intervalMs = Math.max(80, Number(opts?.intervalMs) || 160);
    const deadline = Date.now() + maxWaitMs;
    let lastWidget = false;
    while (Date.now() < deadline) {
      const widget = findChartWidget();
      lastWidget = Boolean(widget);
      const chart = chartFromWidget(widget);
      if (chart) {
        return { ready: true, widgetFound: true, chart, waitedMs: maxWaitMs - (deadline - Date.now()) };
      }
      await sleep(intervalMs);
    }
    const widget = findChartWidget();
    const chart = chartFromWidget(widget);
    return {
      ready: Boolean(chart),
      widgetFound: Boolean(widget) || lastWidget,
      chart: chart || null,
      waitedMs: maxWaitMs,
    };
  }

  function getActiveChart() {
    return chartFromWidget(findChartWidget());
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

  function priceRangeFromScale(ps) {
    if (!ps) return null;
    try {
      const r =
        (typeof ps.getVisiblePriceRange === "function" ? ps.getVisiblePriceRange() : null) ||
        ps.visiblePriceRange ||
        null;
      if (r && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to))) {
        const a = Number(r.from);
        const b = Number(r.to);
        if (b !== a) return { min: Math.min(a, b), max: Math.max(a, b) };
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function getVisiblePriceRange(chart) {
    if (!chart) return null;
    try {
      const panes = chart.getPanes?.();
      const pane = Array.isArray(panes) ? panes[0] : panes;
      if (!pane) return null;
      const scales = [];
      try {
        const right = pane.getRightPriceScales?.();
        if (Array.isArray(right)) scales.push(...right);
      } catch (_) {
        /* ignore */
      }
      try {
        const left = pane.getLeftPriceScales?.();
        if (Array.isArray(left)) scales.push(...left);
      } catch (_) {
        /* ignore */
      }
      try {
        scales.push(pane.getMainSource?.()?.priceScale?.());
      } catch (_) {
        /* ignore */
      }
      try {
        scales.push(pane.priceScale?.());
      } catch (_) {
        /* ignore */
      }
      for (const ps of scales) {
        const hit = priceRangeFromScale(ps);
        if (hit && isNasdaqIndexPrice(hit.min) && isNasdaqIndexPrice(hit.max)) return hit;
      }
      for (const ps of scales) {
        const hit = priceRangeFromScale(ps);
        if (hit) return hit;
      }
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function postVisibleViewport() {
    const chart = getActiveChart();
    const range = getVisibleRange(chart);
    const prices = getVisiblePriceRange(chart);
    window.postMessage(
      {
        type: "DC_VISIBLE_RANGE",
        range,
        priceMin: prices?.min ?? null,
        priceMax: prices?.max ?? null,
      },
      "*"
    );
  }

  let viewportSubscribed = false;
  function ensureViewportSubscription() {
    if (viewportSubscribed) return;
    const chart = getActiveChart();
    if (!chart) return;
    try {
      const sub = chart.onVisibleRangeChanged?.();
      if (sub && typeof sub.subscribe === "function") {
        sub.subscribe(null, postVisibleViewport);
        viewportSubscribed = true;
      }
    } catch (_) {
      /* ignore */
    }
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

  function asSeriesList(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((s) => s && typeof s === "object");
    if (typeof raw !== "object") return [];
    if (
      typeof raw.lastValueData === "function" ||
      typeof raw.lastValue === "function" ||
      typeof raw.data === "function" ||
      typeof raw.bars === "function"
    ) {
      return [raw];
    }
    try {
      if (typeof raw.size === "function" && typeof raw.valueAt === "function") {
        const n = Number(raw.size()) || 0;
        const out = [];
        for (let i = 0; i < n; i++) {
          const s = raw.valueAt(i);
          if (s && typeof s === "object") out.push(s);
        }
        if (out.length) return out;
      }
    } catch (_) {
      /* ignore */
    }
    const vals = Object.values(raw).filter((s) => s && typeof s === "object");
    const seriesLike = vals.filter(
      (s) =>
        typeof s.lastValueData === "function" ||
        typeof s.lastValue === "function" ||
        typeof s.data === "function" ||
        typeof s.bars === "function"
    );
    return seriesLike.length ? seriesLike : [];
  }

  function priceFromLastValueBlob(lvd) {
    if (lvd == null || lvd === false) return null;
    if (lvd.noData === true) return null;
    return (
      closeFromValue(lvd) ||
      closeFromValue(lvd.price) ||
      closeFromValue(lvd.value) ||
      closeFromValue(lvd.close) ||
      closeFromValue(lvd.last) ||
      closeFromValue(lvd.current) ||
      closeFromValue(lvd.v) ||
      closeFromValue(typeof lvd.price === "object" ? lvd.price.value ?? lvd.price.close : null)
    );
  }

  function lastOfSeries(series) {
    if (!series) return null;
    try {
      if (typeof series.lastValueData === "function") {
        const forming = priceFromLastValueBlob(series.lastValueData(true) || series.lastValueData());
        if (forming != null) return forming;
        const done = priceFromLastValueBlob(series.lastValueData(false));
        if (done != null) return done;
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (typeof series.lastValue === "function") {
        const hit = priceFromLastValueBlob(series.lastValue());
        if (hit != null) return hit;
      }
    } catch (_) {
      /* ignore */
    }
    try {
      const data = series.data?.() || series.bars?.();
      const last =
        (typeof data?.last === "function" ? data.last() : null) ||
        (typeof data?.lastValue === "function" ? data.lastValue() : null) ||
        (Array.isArray(data) && data.length ? data[data.length - 1] : null);
      const hit = priceFromLastValueBlob(last) || closeFromValue(last);
      if (hit != null) return hit;
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function seriesCandidates(chart) {
    if (!chart) return [];
    const raws = [];
    try {
      raws.push(chart.getSeries?.());
    } catch (_) {
      /* ignore */
    }
    try {
      raws.push(chart.mainSeries?.());
    } catch (_) {
      /* ignore */
    }
    try {
      raws.push(chart.getMainSeries?.());
    } catch (_) {
      /* ignore */
    }
    try {
      const panes = chart.getPanes?.();
      const main = Array.isArray(panes) ? panes[0] : panes;
      raws.push(main?.getMainSource?.() || main?.mainSource?.());
    } catch (_) {
      /* ignore */
    }
    const out = [];
    const seen = new Set();
    for (const raw of raws) {
      for (const s of asSeriesList(raw)) {
        if (s && !seen.has(s)) {
          seen.add(s);
          out.push(s);
        }
      }
    }
    return out;
  }

  /** Fast last print — forming bar close / lastValue, not legend OHLC. */
  function lastCloseFast(chart) {
    if (!chart) return null;
    try {
      for (const series of seriesCandidates(chart)) {
        const hit = lastOfSeries(series);
        if (hit != null) return hit;
      }
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

  function completedCloseFromSeries(chart) {
    try {
      for (const series of seriesCandidates(chart)) {
        if (typeof series.lastValueData !== "function") continue;
        const forming = priceFromLastValueBlob(series.lastValueData(true) || series.lastValueData());
        const done = priceFromLastValueBlob(series.lastValueData(false));
        if (done != null && forming != null && done !== forming) return done;
        if (done != null && forming == null) return done;
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

  function plausibleUnixSec(t) {
    const n = normalizeUnixSec(t);
    if (n == null) return null;
    if (n < 1e9 || n > 4e9) return null;
    return n;
  }

  function candleFromBar(bar) {
    if (bar == null || typeof bar === "number") return null;
    if (Array.isArray(bar)) {
      const t = plausibleUnixSec(bar[0]);
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
    const t = plausibleUnixSec(bar.time ?? bar.t ?? bar.timestamp ?? bar.date);
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
      for (const series of seriesCandidates(chart)) {
        const tries = [
          series?.data?.(),
          series?.bars?.(),
          series?.data,
          typeof series?.data === "function" ? series.data()?.bars?.() : null,
          typeof series?.bars === "function" ? series.bars()?.data?.() : null,
        ];
        for (const raw of tries) {
          const fromSeries = plotToArray(raw);
          if (fromSeries.length) return fromSeries;
        }
      }
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

  function lastCompletedBarSnapshot(chart) {
    if (!chart) return null;
    const candles = candlesFromSeries(chart, 8);
    const seriesCompleted = completedCloseFromSeries(chart);
    if (candles.length >= 2) {
      const prev = candles[candles.length - 2];
      const last = candles[candles.length - 1];
      return {
        completedClose: prev.c,
        formingOpen: last.o,
        formingClose: last.c,
        candleCount: candles.length,
      };
    }
    if (seriesCompleted != null) {
      const last = candles[candles.length - 1];
      return {
        completedClose: seriesCompleted,
        formingOpen: last?.o ?? null,
        formingClose: last?.c ?? lastCloseFast(chart),
        candleCount: candles.length,
      };
    }
    if (candles.length === 1) {
      return {
        completedClose: null,
        formingOpen: candles[0].o,
        formingClose: candles[0].c,
        candleCount: 1,
      };
    }
    return { completedClose: null, formingOpen: null, formingClose: null, candleCount: 0 };
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
      const data = await withTimeout(chart.exportData({ includedStudies: "none" }), 2500, "export_timeout");
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
      const data = await withTimeout(chart.exportData({}), 2500, "export_timeout");
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

  const TV_LINE_STYLE_LARGE_DASHED = 3;
  const TV_LINE_WIDTH = 2;
  const CREATE_CONCURRENCY = 8;
  const MAX_NATIVE_LEVELS = 28;
  const MAX_NATIVE_ZONES = 5;
  const MAX_REH_REL_EACH = 4;

  const LEVEL_DRAW_PRIORITY = {
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

  function levelDrawPriority(level) {
    const id = String(level?.id || "");
    if (LEVEL_DRAW_PRIORITY[id] != null) return LEVEL_DRAW_PRIORITY[id];
    if (level?.group === "daily") return 90;
    if (level?.group === "org") return 88;
    if (level?.group === "gap") return 84;
    if (level?.group === "structure") return 76;
    if (level?.group === "session") return 52;
    return 40;
  }

  function capNativeDrawItems(levels, zones) {
    const z = Array.isArray(zones) ? zones.slice() : [];
    const fhdr = z.filter((x) => x.kind === "fhdr");
    const fp = z.filter((x) => String(x.id || "").includes("fpfvg"));
    const rest = z.filter((x) => x.kind !== "fhdr" && !String(x.id || "").includes("fpfvg"));
    const cappedZones = [...fhdr, ...fp, ...rest].slice(0, MAX_NATIVE_ZONES);

    const lv = (Array.isArray(levels) ? levels.slice() : []).sort(
      (a, b) => levelDrawPriority(b) - levelDrawPriority(a)
    );
    let reh = 0;
    let rel = 0;
    const cappedLevels = [];
    for (const l of lv) {
      const id = String(l.id || "");
      if (/^reh(_|$)/i.test(id) || /^eqh(_|$)/i.test(id)) {
        if (reh >= MAX_REH_REL_EACH) continue;
        reh += 1;
      } else if (/^rel(_|$)/i.test(id) || /^eql(_|$)/i.test(id)) {
        if (rel >= MAX_REH_REL_EACH) continue;
        rel += 1;
      }
      cappedLevels.push(l);
      if (cappedLevels.length >= MAX_NATIVE_LEVELS) break;
    }
    return { levels: cappedLevels, zones: cappedZones };
  }

  async function runCreatePool(tasks, gen) {
    const created = [];
    let i = 0;
    async function worker() {
      while (i < tasks.length) {
        if (isGenerationStale(gen)) return;
        const idx = i++;
        try {
          const id = await tasks[idx]();
          if (id) created.push(id);
        } catch (_) {
          /* ignore single shape failure */
        }
      }
    }
    const n = Math.min(CREATE_CONCURRENCY, Math.max(1, tasks.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return created;
  }

  async function createChartShape(chart, points, opts) {
    if (typeof chart.createMultipointShape === "function") {
      return chart.createMultipointShape(points, opts);
    }
    if (typeof chart.createShape === "function" && points[0]) {
      return chart.createShape(points[0], opts);
    }
    return null;
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

    const capped = capNativeDrawItems(levels, zones);
    const range = getVisibleRange(chart);
    const endTime = range?.to ?? Math.floor(Date.now() / 1000) + 600;
    const fallbackStart = range?.from ?? endTime - 1800;
    const spanSec =
      range && Number.isFinite(range.to) && Number.isFinite(range.from)
        ? Math.max(180, range.to - range.from)
        : 3600;
    const capPrices = [
      ...capped.levels.map((l) => Number(l.price)).filter((p) => Number.isFinite(p) && p > 0),
      ...capped.zones.flatMap((z) => [Number(z.top), Number(z.bottom)]).filter((p) => Number.isFinite(p) && p > 0),
    ];
    const capMin = capPrices.length ? Math.min(...capPrices) : undefined;
    const capMax = capPrices.length ? Math.max(...capPrices) : undefined;
    assignCollisionLayout(capped.levels, capped.zones, {
      priceMin: capMin,
      priceMax: capMax,
      visibleSpanSec: spanSec,
    });
    const tasks = [];
    const createdRecords = [];

    for (const zone of capped.zones) {
      const top = Number(zone.top);
      const bottom = Number(zone.bottom);
      if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
      const startTime = normalizeUnixSec(zone.startTime) ?? fallbackStart;
      const zoneEndTime = normalizeUnixSec(zone.endTime) ?? endTime;
      const zTop = Math.max(top, bottom);
      const zBot = Math.min(top, bottom);
      const color = zone.borderColor || zone.color || "#78716c";
      const zoneLabel = resolveNativeShapeTitle(zone);
      const zonePreformatted = Boolean(
        String(zone.displayLabel || "").trim() && !isSlashJoinedChartLabel(zone.displayLabel || "")
      );
      const zoneAlign = nativeLabelAlignOverrides(zone, zTop, capMin, capMax);
      const opts = withDcTag(
        {
          shape: "rectangle",
          overrides: {
            backgroundColor: zone.fill || "rgba(251, 191, 133, 0.38)",
            color,
            linewidth: 1,
            fillBackground: true,
            transparency: 75,
            showLabel: Boolean(zoneLabel),
            vertLabelsAlign: zoneAlign.vertLabelsAlign,
            horzLabelsAlign: zoneAlign.horzLabelsAlign,
          },
          disableSelection: true,
          disableSave: true,
          lock: true,
        },
        zoneLabel,
        zone.id,
        zonePreformatted
      );
      tasks.push(async () => {
        const id = await createChartShape(
          chart,
          [
            { time: startTime, price: zTop },
            { time: zoneEndTime, price: zBot },
          ],
          opts
        );
        if (id) {
          createdRecords.push({
            id,
            kind: "zone",
            item: zone,
            price: zTop,
            startTime,
            showLabel: Boolean(zoneLabel),
            overrides: opts.overrides,
          });
        }
        return id;
      });

      if (zone.kind === "fvg" && Number.isFinite(Number(zone.ce))) {
        const ceOpts = withDcTag(
          {
            shape: "horizontal_ray",
            overrides: {
              linecolor: "#e879f9",
              linewidth: TV_LINE_WIDTH,
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
        const cePrice = Number(zone.ce);
        tasks.push(() => createChartShape(chart, [{ time: startTime, price: cePrice }], ceOpts));
      }
    }

    for (const level of capped.levels) {
      const price = Number(level.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const startTime = normalizeUnixSec(level.startTime) ?? fallbackStart;
      const drawTime = shiftedRayTime(startTime, level.labelTimeShiftSec, range);
      const color = contrastRayColor(rayColorForLevel(level));
      const levelLabel = resolveNativeShapeTitle(level);
      const levelPreformatted = Boolean(
        String(level.displayLabel || "").trim() && !isSlashJoinedChartLabel(level.displayLabel || "")
      );
      const levelAlign = nativeLabelAlignOverrides(level, price, capMin, capMax);
      const lineOverrides = {
        linecolor: color,
        lineColor: color,
        color,
        linewidth: TV_LINE_WIDTH,
        linestyle: TV_LINE_STYLE_LARGE_DASHED,
        showLabel: Boolean(levelLabel),
        vertLabelsAlign: levelAlign.vertLabelsAlign,
        horzLabelsAlign: levelAlign.horzLabelsAlign,
      };
      const opts = withDcTag(
        {
          shape: "horizontal_ray",
          overrides: lineOverrides,
          disableSelection: true,
          disableSave: true,
          lock: true,
        },
        levelLabel,
        level.id,
        levelPreformatted
      );
      tasks.push(async () => {
        const id = await createChartShape(chart, [{ time: drawTime, price }], opts);
        if (id) {
          createdRecords.push({
            id,
            kind: "level",
            item: level,
            price,
            startTime,
            showLabel: Boolean(levelLabel),
            overrides: opts.overrides,
          });
          applyShapeOverrides(chart, id, nativeLinePaintOverrides(opts.overrides));
        }
        return id;
      });
    }

    const createdIds = await runCreatePool(tasks, gen);
    if (!isGenerationStale(gen)) applyNativeCollisionLayout(chart, createdRecords, range);

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

  function isLightChartTheme() {
    try {
      const cls = `${document.documentElement?.className || ""} ${document.body?.className || ""}`;
      if (/\b(theme-light|tv-theme--light)\b/i.test(cls)) return true;
      if (/\b(theme-dark|tv-theme--dark)\b/i.test(cls)) return false;
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function rayColorForLevel(level) {
    const id = String(level?.id || "");
    const group = String(level?.group || "");
    if (/^reh(_|$)/i.test(id) || /^rel(_|$)/i.test(id) || /^eqh(_|$)/i.test(id) || /^eql(_|$)/i.test(id)) {
      return "#e879f9";
    }
    if (group === "session" || /^(asia_|london_|ny_)/i.test(id)) return "#38bdf8";
    if (id === "org_ce") return "#e879f9";
    if (group === "org" || /^org_/i.test(id)) return "#22d3ee";
    if (group === "gap" || /^(ndog|nwog)/i.test(id)) return "#ef4444";
    if (group === "daily" || /^(pdh|pdl|pdc|pdo|pdeq|cdeq|cdo)$/i.test(id)) return "#a78bfa";
    if (group === "structure") return "#fb7185";
    const c = String(level?.color || "").toLowerCase();
    if (c === "#94a3b8" || c === "#64748b") return "#38bdf8";
    if (c === "#cbd5e1") return "#a78bfa";
    return contrastRayColor(c || "#22d3ee");
  }

  function contrastRayColor(color) {
    const c = String(color || "").toLowerCase();
    const light = isLightChartTheme();
    if (!light) return c || "#22d3ee";
    if (c === "#38bdf8") return "#0284c7";
    if (c === "#22d3ee" || c === "#7dd3fc") return "#0e7490";
    if (c === "#e879f9") return "#c026d3";
    if (c === "#a78bfa") return "#6d28d9";
    if (c === "#ef4444") return "#b91c1c";
    if (c === "#fb7185") return "#e11d48";
    if (c === "#f59e0b") return "#b45309";
    if (c === "#2dd4bf") return "#0f766e";
    if (c === "#94a3b8" || c === "#64748b") return "#0284c7";
    if (c === "#cbd5e1") return "#6d28d9";
    return c || "#0e7490";
  }

  function readableRayColor(color) {
    return contrastRayColor(color);
  }

  function nativeLinePaintOverrides(overrides) {
    const o = overrides || {};
    return {
      linecolor: o.linecolor,
      lineColor: o.lineColor,
      color: o.color,
      linewidth: o.linewidth,
      linestyle: o.linestyle,
      showLabel: o.showLabel === true,
      vertLabelsAlign: o.vertLabelsAlign,
      horzLabelsAlign: o.horzLabelsAlign,
    };
  }

  function applyShapeOverrides(chart, id, overrides) {
    if (!chart || id == null || !overrides) return;
    try {
      const shape = chart.getShapeById?.(id);
      if (shape && typeof shape.setProperties === "function") {
        shape.setProperties(overrides);
      }
    } catch (_) {
      /* ignore */
    }
  }

  function withDcTag(opts, label, id, preformatted) {
    const showLabel = Boolean(label && opts?.overrides?.showLabel !== false);
    const tagged = showLabel ? dcTaggedText(label, id, preformatted) : DC_SHAPE_TAG;
    return {
      ...opts,
      text: tagged,
      overrides: {
        ...(opts.overrides || {}),
        dcDeskCopilot: true,
        showLabel,
        text: tagged,
      },
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
      ensureViewportSubscription();
      postVisibleViewport();
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

    const generation = Number(event.data.generation) || 0;
    if (event.data.action !== "clear" && event.data.action !== "preclear") {
      activeDrawGeneration = generation;
    }

    await enqueueDraw(async () => {
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
  window.__dcLastCompletedBar = lastCompletedBarSnapshot;
  window.__dcGetActiveChart = getActiveChart;
})();
