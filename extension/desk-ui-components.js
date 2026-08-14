/**
 * Reusable desk panel UI primitives — status badges, price strip, Karen state, market data card.
 */
(function () {
  const STATUS = {
    LIVE: { icon: "●", label: "LIVE", cls: "dc-badge-live" },
    DELAYED: { icon: "◷", label: "DELAYED", cls: "dc-badge-delayed" },
    DEGRADED: { icon: "◐", label: "DEGRADED", cls: "dc-badge-degraded" },
    STALE: { icon: "◷", label: "STALE", cls: "dc-badge-stale" },
    OFFLINE: { icon: "○", label: "OFFLINE", cls: "dc-badge-offline" },
    INVALID: { icon: "✕", label: "INVALID", cls: "dc-badge-invalid" },
    WAITING: { icon: "…", label: "WAITING", cls: "dc-badge-waiting" },
    LISTENING: { icon: "◉", label: "LISTENING", cls: "dc-badge-listening" },
    THINKING: { icon: "…", label: "THINKING", cls: "dc-badge-thinking" },
    ANALYZING: { icon: "◌", label: "ANALYZING", cls: "dc-badge-analyzing" },
    READY: { icon: "●", label: "READY", cls: "dc-badge-ready" },
    UNAVAILABLE: { icon: "○", label: "UNAVAILABLE", cls: "dc-badge-offline" },
  };

  let lastPrice = null;
  let marketDataCardVisible = false;

  function normalizeKey(key) {
    const k = String(key || "").toUpperCase().replace(/[^A-Z_]/g, "_");
    if (k.includes("LISTEN")) return "LISTENING";
    if (k.includes("THINK")) return "THINKING";
    if (k.includes("ANALYS") || k.includes("CAPTUR") || k.includes("SNAPSHOT")) return "ANALYZING";
    if (k.includes("DEGRAD")) return "DEGRADED";
    if (k.includes("DELAY")) return "DELAYED";
    if (k.includes("STALE") || k.includes("LAST_KNOWN")) return "STALE";
    if (k.includes("OFFLINE") || k.includes("FAILED") || k.includes("DISCONNECT")) return "OFFLINE";
    if (k.includes("INVALID")) return "INVALID";
    if (k.includes("WAIT")) return "WAITING";
    if (k.includes("LIVE")) return "LIVE";
    if (k.includes("READY") || k.includes("IDLE")) return "READY";
    if (k.includes("UNAVAILABLE")) return "UNAVAILABLE";
    return k in STATUS ? k : "WAITING";
  }

  function renderStatusBadge(key, title) {
    const spec = STATUS[normalizeKey(key)] || STATUS.WAITING;
    return `<span class="dc-status-badge ${spec.cls}" title="${title || spec.label}"><span class="dc-status-badge-icon" aria-hidden="true">${spec.icon}</span><span class="dc-status-badge-text">${spec.label}</span></span>`;
  }

  function setBadgeEl(el, key, title) {
    if (!el) return;
    const spec = STATUS[normalizeKey(key)] || STATUS.WAITING;
    el.innerHTML = renderStatusBadge(key, title);
    el.title = title || spec.label;
  }

  function updateHeaderStatus(opts = {}) {
    const { market, data, karen, marketTip, dataTip, karenTip } = opts;
    if (market != null) setBadgeEl(document.getElementById("dc-status-market"), market, marketTip);
    if (data != null) setBadgeEl(document.getElementById("dc-status-data"), data, dataTip);
    if (karen != null) setBadgeEl(document.getElementById("dc-status-karen"), karen, karenTip);
  }

  function formatPriceChange(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
    const delta = current - previous;
    if (Math.abs(delta) < 0.25) return null;
    const sign = delta > 0 ? "+" : "";
    return {
      text: `${sign}${delta.toFixed(2)}`,
      cls: delta > 0 ? "dc-price-up" : "dc-price-down",
    };
  }

  function updateCurrentPrice(opts = {}) {
    const {
      symbol = "MNQ",
      price,
      session,
      tf = "1m",
      dataStatus,
      dataSource,
      updatedAt,
      connectionState,
      tooltip,
    } = opts;

    const symEl = document.getElementById("dc-bar-symbol");
    const tfEl = document.getElementById("dc-bar-tf");
    const sessEl = document.getElementById("dc-bar-session");
    const priceEl = document.getElementById("dc-bar-price");
    const changeEl = document.getElementById("dc-bar-change");
    const dataEl = document.getElementById("dc-bar-data");
    const sourceEl = document.getElementById("dc-bar-source");
    const freshEl = document.getElementById("dc-bar-freshness");
    const upEl = document.getElementById("dc-bar-updated");
    const strip = document.getElementById("dc-market-bar");
    const dqEl = document.getElementById("dc-data-quality");

    if (symEl) symEl.textContent = symbol || "MNQ";
    if (tfEl) tfEl.textContent = tf || "1m";
    if (sessEl) sessEl.textContent = session || "—";

    const hasPrice = Number.isFinite(price);
    const normStatus = normalizeKey(dataStatus);
    const staleMark = normStatus === "STALE" || normStatus === "OFFLINE";

    if (priceEl) {
      if (hasPrice) {
        priceEl.textContent = staleMark ? `${price.toFixed(2)}*` : price.toFixed(2);
        priceEl.classList.remove("dc-price-unavailable");
        priceEl.title = staleMark ? "Last known — not confirmed live" : "";
      } else {
        priceEl.textContent = "PRICE UNAVAILABLE";
        priceEl.classList.add("dc-price-unavailable");
        priceEl.title = "No live price on chart";
      }
    }

    if (changeEl) {
      const ch = hasPrice ? formatPriceChange(price, lastPrice) : null;
      if (ch && hasPrice) {
        changeEl.textContent = ch.text;
        changeEl.className = `dc-bar-change ${ch.cls}`;
        changeEl.classList.remove("hidden");
      } else {
        changeEl.textContent = "";
        changeEl.classList.add("hidden");
      }
    }
    if (hasPrice) lastPrice = price;

    if (dataEl) {
      const spec = STATUS[normStatus] || STATUS.WAITING;
      dataEl.innerHTML = `<span class="dc-status-badge-icon" aria-hidden="true">${spec.icon}</span> ${spec.label}`;
      dataEl.className = "dc-bar-data " + (spec.cls || "");
      dataEl.title = tooltip || dataSource || spec.label;
    }
    if (sourceEl) {
      sourceEl.textContent = dataSource ? `SRC · ${dataSource}` : "";
      sourceEl.classList.toggle("hidden", !dataSource);
    }
    if (freshEl) {
      freshEl.textContent = updatedAt || "";
      freshEl.classList.toggle("hidden", !updatedAt);
    }
    if (upEl) upEl.textContent = "";

    if (strip) {
      strip.classList.toggle("dc-market-bar-offline", normStatus === "OFFLINE" || !hasPrice);
      strip.classList.toggle("dc-market-bar-live", normStatus === "LIVE" && hasPrice);
    }

    if (dqEl) {
      const spec = STATUS[normStatus] || STATUS.WAITING;
      dqEl.innerHTML = `<span class="dc-dq-dot ${spec.cls}" aria-hidden="true">${spec.icon}</span><span class="dc-dq-label">${spec.label}</span>`;
      dqEl.title =
        tooltip ||
        [dataSource, updatedAt].filter(Boolean).join(" · ") ||
        "Data quality — source and freshness";
    }
  }

  function mapConnectionToDataStatus(conn, dataStatusRaw) {
    if (!conn?.backendUp) return "OFFLINE";
    if (conn.state === "CONNECTED") return "LIVE";
    if (conn.state === "DEGRADED") return "STALE";
    if (conn.state === "RECONNECTING" || conn.state === "CONNECTING") return "WAITING";
    if (conn.state === "FAILED") return "OFFLINE";
    return normalizeKey(dataStatusRaw);
  }

  function mapConnectionToMarketStatus(conn, hasPrice) {
    if (hasPrice) return conn?.backendUp === false ? "STALE" : "LIVE";
    if (!conn?.backendUp) return "OFFLINE";
    if (conn.state === "RECONNECTING" || conn.state === "CONNECTING") return "WAITING";
    if (conn.state === "DEGRADED") return "DEGRADED";
    if (conn.state === "FAILED" || conn.state === "DISCONNECTED") return "OFFLINE";
    return "UNAVAILABLE";
  }

  function mapKarenStatus(phase, opts = {}) {
    const { listening, speaking, degraded } = opts;
    if (degraded) return "DEGRADED";
    if (speaking) return "THINKING";
    if (listening) return "LISTENING";
    const p = String(phase || "idle").toLowerCase();
    if (p === "listening") return "LISTENING";
    if (p === "thinking" || p === "chatting" || p === "speaking") return "THINKING";
    if (p === "analyzing" || p === "capturing" || p === "snapshot" || p === "marking_levels") return "ANALYZING";
    return "READY";
  }

  function updateKarenStatus(phase, opts = {}) {
    const key = mapKarenStatus(phase, opts);
    const el = document.getElementById("dc-karen-status-value");
    setBadgeEl(el, key);
    const row = document.getElementById("dc-karen-status");
    if (row) {
      row.classList.toggle("dc-karen-status-active", key === "LISTENING" || key === "ANALYZING" || key === "THINKING");
      row.classList.toggle("dc-karen-status-degraded", key === "DEGRADED");
    }
    const voiceMode = document.getElementById("dc-voice-mode");
    if (voiceMode && (key === "LISTENING" || key === "ANALYZING" || key === "THINKING")) {
      voiceMode.classList.add("dc-karen-mode-pill");
    } else if (voiceMode) {
      voiceMode.classList.remove("dc-karen-mode-pill");
    }
  }

  const MARKET_DATA_PATTERNS = [
    /ohlc\s*unavailable/i,
    /chart data unavailable/i,
    /live data unavailable/i,
    /waiting\s*[—–-]\s*ohlc/i,
    /couldn't read the chart/i,
    /no call\s*[—–-]/i,
    /export_failed/i,
    /missing_ohlc/i,
  ];

  function isMarketDataMessage(text) {
    const t = String(text || "");
    return MARKET_DATA_PATTERNS.some((re) => re.test(t));
  }

  function updateMarketDataCard(opts = {}) {
    const { status, reason, action, visible } = opts;
    const card = document.getElementById("dc-market-data-card");
    if (!card) return false;
    const show = visible !== false && (visible === true || Boolean(reason || status));
    card.classList.toggle("hidden", !show);
    marketDataCardVisible = show;
    const st = document.getElementById("dc-mdc-status");
    const rs = document.getElementById("dc-mdc-reason");
    const ac = document.getElementById("dc-mdc-action");
    if (st) st.textContent = status || "Unavailable";
    if (rs) rs.textContent = reason || "—";
    if (ac) ac.textContent = action || "Wait for chart OHLC export or press RECONNECT";
    return show;
  }

  function absorbMarketDataMessage(text) {
    if (!isMarketDataMessage(text)) {
      if (marketDataCardVisible && /reconnect|live|ready|verdict|long|short/i.test(String(text || ""))) {
        updateMarketDataCard({ visible: false });
      }
      return false;
    }
    const t = String(text || "").trim();
    let reason = t;
    if (/ohlc/i.test(t)) reason = "OHLC export unavailable from TradingView chart";
    else if (/live data unavailable/i.test(t)) reason = "Live price feed unavailable";
    else if (/chart data unavailable/i.test(t)) reason = "Structured chart snapshot missing";
    updateMarketDataCard({
      status: "Unavailable",
      reason,
      action: "Ensure chart is visible · try ANALYSE MARKET · or RECONNECT",
      visible: true,
    });
    return true;
  }

  function updateLevelStatus(opts = {}) {
    const { count, synced, degraded, error } = opts;
    const el = document.getElementById("dc-levels-status");
    if (!el) return;
    el.className = "dc-levels-status";
    if (error) {
      el.classList.add("err");
      el.innerHTML = `<span class="dc-levels-status-icon">✕</span> ${error}`;
      return;
    }
    if (degraded) {
      el.classList.add("degraded");
      el.innerHTML = `<span class="dc-levels-status-icon">◐</span> DEGRADED`;
      return;
    }
    if (Number.isFinite(count) && count > 0) {
      el.classList.add("ok");
      const syncLabel = synced !== false ? "SYNCED" : "PARTIAL";
      el.innerHTML = `<span class="dc-levels-status-icon">●</span> ${count} LEVELS · ${syncLabel}`;
      return;
    }
    el.textContent = "";
  }

  function renderKarenVerdictMeta(contract, opts = {}) {
    const dqEl = document.getElementById("dc-verdict-dq");
    if (dqEl && contract) {
      const dq = String(contract.data_quality || "DEGRADED").toUpperCase();
      const key = dq === "GOOD" ? "LIVE" : dq === "OFFLINE" ? "OFFLINE" : dq === "DEGRADED" ? "DEGRADED" : "STALE";
      dqEl.innerHTML = renderStatusBadge(key, `Data quality · ${dq}`);
    }
    const invLabel = document.getElementById("dc-verdict-invalidation-wrap");
    if (invLabel && contract) {
      const hasInv = contract.invalidation && contract.invalidation !== "unknown";
      invLabel.classList.toggle("hidden", !hasInv);
    }
    const card = document.getElementById("dc-verdict-card");
    if (card && contract) {
      card.classList.toggle("dc-verdict-uncertain", contract.verdict === "WAIT" || contract.verdict === "NO_TRADE");
    }
    if (opts.liveDataOffline && card) card.classList.add("dc-verdict-offline");
  }

  window.DeskCopilotUI = {
    STATUS,
    renderStatusBadge,
    setBadgeEl,
    updateHeaderStatus,
    updateCurrentPrice,
    updateKarenStatus,
    updateMarketDataCard,
    updateLevelStatus,
    renderKarenVerdictMeta,
    absorbMarketDataMessage,
    isMarketDataMessage,
    mapConnectionToDataStatus,
    mapConnectionToMarketStatus,
    mapKarenStatus,
    normalizeKey,
  };
})();
