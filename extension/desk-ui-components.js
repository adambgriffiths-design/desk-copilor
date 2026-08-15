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

  /** Amber KAREN only when auto-voice wants a mic and there is no session. */
  function isKarenVoiceDownState(opts = {}) {
    const {
      autoVoice = false,
      userOff = false,
      listening = false,
      speaking = false,
      connecting = false,
      engineMode = "off",
      realtimeActive = false,
      realtimeWants = false,
    } = opts;
    if (userOff || !autoVoice) return false;
    if (listening || speaking) return false;
    if (connecting) return false;
    if (engineMode === "cascade" || engineMode === "realtime") return false;
    if (realtimeActive || realtimeWants) return false;
    return true;
  }

  /**
   * Idle/READY green = desk ONLINE (request path), never TV Last alone.
   * DEGRADED/cached health must not paint LIVE.
   */
  function isKarenReadyOnline(opts = {}) {
    if (opts.healthDegraded === true) return false;
    if (opts.deskOnline === true) return true;
    if (opts.deskOnline === false) return false;
    const state = String(opts.connState || opts.connectionState || "").toUpperCase();
    // Hop-aware path when provided
    if (opts.apiHop || opts.marketHop) {
      if (opts.apiHop !== "CONNECTED") return false;
      if (opts.marketHop === "DISCONNECTED") return false;
      if (opts.chatHop === "FAILED") return false;
      return true;
    }
    // Snapshot fallback: only machine CONNECTED (not DEGRADED+backendUp, not tvLive)
    return state === "CONNECTED";
  }

  function mapKarenStatus(phase, opts = {}) {
    const { listening, speaking, degraded, connecting, engineMode } = opts;
    // Listening/speaking always win — Whisper cascade is a working mic, not a dead Karen.
    if (speaking) return "THINKING";
    if (listening) return "LISTENING";
    const p = String(phase || "idle").toLowerCase();
    if (p === "listening") return "LISTENING";
    if (p === "thinking" || p === "chatting" || p === "speaking") return "THINKING";
    if (p === "analyzing" || p === "capturing" || p === "snapshot" || p === "marking_levels") return "ANALYZING";
    if (connecting) return "WAITING";
    if (engineMode === "cascade" || engineMode === "realtime") return "LISTENING";
    if (degraded) return "DEGRADED";
    // Idle: LIVE green when online, grey READY when offline/reconnecting/failed.
    if (isKarenReadyOnline(opts)) return "LIVE";
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

  function escHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );
  }

  function renderEqhEqlTrack(payload, opts = {}) {
    let host = document.getElementById("dc-levels-track");
    if (!host) {
      const status = document.getElementById("dc-levels-status");
      if (!status) return;
      host = document.createElement("div");
      host.id = "dc-levels-track";
      host.className = "dc-levels-track";
      status.insertAdjacentElement("afterend", host);
    }
    const enabled = opts.enabled !== false;
    const rows = payload?.eqhEqlLiquidity?.rows;
    if (!enabled || !payload) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    const list = Array.isArray(rows) ? rows : [];
    const statusLabel = {
      active: "Active",
      touched: "Touched",
      swept: "Swept",
      closed_through: "Closed through",
      invalidated: "Invalidated",
    };
    const items = list
      .map((row) => {
        const kind = row.kind === "eql" ? "EQL" : "EQH";
        const st = statusLabel[row.status] || row.status;
        const swings = (row.swingPrices || []).map((p) => Number(p).toFixed(2)).join(" · ");
        const sweep =
          row.sweptAt != null && row.sweepPrice != null
            ? `<div class="dc-eqh-meta">Swept ${escHtml(Number(row.sweepPrice).toFixed(2))} · ${escHtml(row.sweptAtLabel || "")}</div>`
            : "";
        return `<article class="dc-eqh-row dc-eqh-${escHtml(row.status)}" data-kind="${escHtml(row.kind)}">
          <div class="dc-eqh-top">
            <span class="dc-eqh-kind">${kind}</span>
            <span class="dc-eqh-name">${escHtml(row.label)}</span>
            <span class="dc-eqh-price">${escHtml(Number(row.price).toFixed(2))}</span>
          </div>
          <div class="dc-eqh-meta">
            <span class="dc-eqh-status">${escHtml(st)}</span>
            · ${row.swingCount || 0} swings ${escHtml(swings)}
            · ${row.tickDifference ?? 0} of ${row.toleranceTicks ?? 0} ticks
          </div>
          <div class="dc-eqh-meta">Formed ${escHtml(row.formedAtLabel || "—")} · confirmed ${escHtml(row.confirmationLabel || "—")}</div>
          ${sweep}
          <p class="dc-eqh-why">${escHtml(row.why || "")}</p>
        </article>`;
      })
      .join("");
    host.hidden = false;
    host.innerHTML = list.length
      ? `<div class="dc-levels-track-head">Relative equal liquidity</div>${items}`
      : `<div class="dc-levels-track-head">Relative equal liquidity</div><p class="dc-eqh-empty">No confirmed relative equal highs or lows in lookback.</p>`;
  }

  function renderKarenVerdictMeta(contract, opts = {}) {
    const dqEl = document.getElementById("dc-verdict-dq");
    if (dqEl && contract) {
      const dq = String(contract.data_quality || "DEGRADED").toUpperCase();
      if (dq === "GOOD") {
        dqEl.innerHTML = "";
        dqEl.classList.add("hidden");
      } else {
        dqEl.classList.remove("hidden");
        const key = dq === "OFFLINE" ? "OFFLINE" : dq === "DEGRADED" ? "DEGRADED" : "STALE";
        dqEl.innerHTML = renderStatusBadge(key, `Data quality · ${dq}`);
      }
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

  const api = {
    STATUS,
    renderStatusBadge,
    setBadgeEl,
    updateHeaderStatus,
    updateCurrentPrice,
    updateKarenStatus,
    updateMarketDataCard,
    updateLevelStatus,
    renderEqhEqlTrack,
    renderKarenVerdictMeta,
    absorbMarketDataMessage,
    isMarketDataMessage,
    mapConnectionToDataStatus,
    mapConnectionToMarketStatus,
    mapKarenStatus,
    isKarenVoiceDownState,
    isKarenReadyOnline,
    normalizeKey,
  };
  if (typeof window !== "undefined") window.DeskCopilotUI = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      mapKarenStatus,
      isKarenVoiceDownState,
      isKarenReadyOnline,
      mapConnectionToDataStatus,
      mapConnectionToMarketStatus,
    };
  }
})();
