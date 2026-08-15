/**
 * Decision tracker rail — left chrome, off the right-axis Last; candle-close confirmed state.
 */
(function () {
  const TRACKER_REV = "1.4.118";
  if (window.__dcTrackerRev === TRACKER_REV && window.DeskCopilotTracker) return;
  try {
    window.DeskCopilotTracker?.stop?.();
  } catch {
    /* ignore */
  }
  window.__dcTrackerRev = TRACKER_REV;

  const RAIL_ID = "dc-tracker-rail";
  const CARD_ID = "dc-tracker-card";
  const TIMELINE_KEY = "dc-decision-timeline";
  const BAR_POLL_MS = 15000;
  const STORAGE_PHASE_KEY = "dc-tracker-phase";

  let expanded = false;
  let lastBarTime = null;
  let lastPhase = null;
  let pollTimer = null;
  let enabled = true;

  function ensureStyles() {
    const ver = chrome.runtime.getManifest?.()?.version || "1";
    const href = `${chrome.runtime.getURL("desk-tracker.css")}?v=${encodeURIComponent(ver)}`;
    let link = document.getElementById("dc-tracker-styles");
    if (!link) {
      link = document.createElement("link");
      link.id = "dc-tracker-styles";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.href = href;
  }

  const AXIS_GUTTER_PX = 120;
  let parkBound = false;

  function parkRail() {
    const rail = document.getElementById(RAIL_ID);
    if (!rail) return;
    const panel = document.getElementById("dc-panel");
    const vw = window.innerWidth || 1200;
    const vh = window.innerHeight || 800;
    const railW = 28;
    const gap = 8;
    let left = 394;
    let bottom = 16;
    if (panel) {
      const r = panel.getBoundingClientRect();
      left = Math.round(r.right + gap);
      bottom = Math.max(8, Math.round(vh - r.bottom));
      if (left + railW > vw - AXIS_GUTTER_PX) {
        left = Math.max(8, Math.round(r.left - railW - gap));
      }
      if (left + railW > vw - AXIS_GUTTER_PX) {
        left = 8;
      }
    }
    rail.style.left = `${left}px`;
    rail.style.right = "auto";
    rail.style.top = "auto";
    rail.style.bottom = `${bottom}px`;
    rail.style.transform = "none";
  }

  function bindPark() {
    if (parkBound) return;
    parkBound = true;
    window.addEventListener("resize", parkRail);
    const panel = document.getElementById("dc-panel");
    if (panel) {
      const mo = new MutationObserver(parkRail);
      mo.observe(panel, { attributes: true, attributeFilter: ["style", "class"] });
    }
  }

  function ensureRail() {
    ensureStyles();
    if (document.getElementById(RAIL_ID)) {
      parkRail();
      bindPark();
      return;
    }
    const rail = document.createElement("div");
    rail.id = RAIL_ID;
    rail.className = "dc-tracker-rail";
    rail.innerHTML = `
      <button type="button" class="dc-tracker-strip" id="dc-tracker-strip" title="Desk tracker — click for decision card">
        <span class="dc-tracker-led dc-tracker-green" id="dc-tracker-led"></span>
        <span class="dc-tracker-strip-label">DESK</span>
      </button>
      <div class="dc-tracker-card hidden" id="${CARD_ID}">
        <div class="dc-tracker-card-head">
          <span class="dc-tracker-card-title">Decision snapshot</span>
          <button type="button" class="dc-tracker-close" id="dc-tracker-close">×</button>
        </div>
        <div class="dc-tracker-phase" id="dc-tracker-phase">Waiting for desk thesis</div>
        <div class="dc-tracker-verdict" id="dc-tracker-verdict">Run Analyse Market</div>
        <div class="dc-tracker-meta" id="dc-tracker-meta">Open panel · press Analyse Market</div>
        <div class="dc-tracker-transition" id="dc-tracker-transition">Tracker confirms state on candle close when backend is connected.</div>
        <div class="dc-tracker-pending-wrap hidden" id="dc-tracker-pending-wrap">
          <div class="dc-tracker-pending-label">Watching (unconfirmed)</div>
          <ul class="dc-tracker-pending" id="dc-tracker-pending"></ul>
        </div>
        <div class="dc-tracker-exec hidden" id="dc-tracker-exec"></div>
        <div class="dc-tracker-timeline-wrap">
          <div class="dc-tracker-timeline-label">Timeline</div>
          <input type="range" class="dc-tracker-scrub" id="dc-tracker-scrub" min="0" max="0" value="0" />
          <div class="dc-tracker-scrub-detail" id="dc-tracker-scrub-detail">Timeline fills on candle close when backend is connected.</div>
        </div>
      </div>
    `;
    document.body.appendChild(rail);

    document.getElementById("dc-tracker-strip")?.addEventListener("click", () => {
      expanded = !expanded;
      document.getElementById(CARD_ID)?.classList.toggle("hidden", !expanded);
      if (expanded) {
        applyState(buildLocalFallback());
        void refreshTracker({ freeze: true });
      }
    });
    document.getElementById("dc-tracker-close")?.addEventListener("click", () => {
      expanded = false;
      document.getElementById(CARD_ID)?.classList.add("hidden");
    });
    document.getElementById("dc-tracker-scrub")?.addEventListener("input", (e) => {
      const idx = Number(e.target.value);
      showTimelineIndex(idx);
    });
    parkRail();
    bindPark();
  }

  function setLed(color) {
    const led = document.getElementById("dc-tracker-led");
    if (!led) return;
    led.className = `dc-tracker-led dc-tracker-${color || "green"}`;
  }

  function showCardStatus(kind, message) {
    const phaseEl = document.getElementById("dc-tracker-phase");
    const verdictEl = document.getElementById("dc-tracker-verdict");
    const transEl = document.getElementById("dc-tracker-transition");
    const metaEl = document.getElementById("dc-tracker-meta");
    if (kind === "loading") {
      if (phaseEl) phaseEl.textContent = "Updating…";
      if (verdictEl) verdictEl.textContent = "";
      if (transEl) transEl.textContent = message || "Reading chart state…";
      if (metaEl) metaEl.textContent = "";
      setLed("amber");
      return;
    }
    if (kind === "error") {
      if (phaseEl) phaseEl.textContent = "Offline";
      if (verdictEl) verdictEl.textContent = "Backend unavailable";
      if (transEl) transEl.textContent = message || "Deploy desk-tracker API or click RECONNECT in the panel.";
      if (metaEl) metaEl.textContent = "Local price shown when available.";
      setLed("amber");
    }
  }

  function buildLocalFallback() {
    const ctx = typeof window.__dcDeskContext === "function" ? window.__dcDeskContext() : {};
    const price = window.DeskCopilotChartPrice?.readSync?.() ?? ctx.price;
    const headline = document.getElementById("dc-verdict-headline")?.textContent?.trim();
    const status = document.getElementById("dc-verdict-status")?.textContent?.trim();
    const session = document.getElementById("dc-bar-session")?.textContent?.trim();
    const barPrice = document.getElementById("dc-bar-price")?.textContent?.trim();

    let verdict = "No verdict yet";
    if (headline && headline !== "—" && headline.length > 1) {
      verdict = headline.replace(" BIAS", "");
    } else if (ctx.lastVerdict) {
      const m = String(ctx.lastVerdict).match(/VERDICT:\s*(\w+)/i);
      verdict = m ? m[1] : String(ctx.lastVerdict).slice(0, 48);
    }

    const phase =
      status && status.length > 1
        ? status
        : headline && headline !== "—" && headline.length > 1
          ? "From last Analyse Market"
          : "Waiting for desk thesis";

    const transition =
      headline && headline !== "—" && headline.length > 1
        ? ctx.lastSpokenBrief?.slice(0, 160) ||
          "Showing last panel verdict — deploy backend for candle-close timeline."
        : "Press Analyse Market in the desk panel first. Tracker confirms on candle close when backend is live.";

    const displayPrice =
      Number.isFinite(price) ? price : barPrice && !isNaN(parseFloat(barPrice)) ? parseFloat(barPrice) : null;

    return {
      phase_label: phase,
      verdict,
      htf_bias: session && session !== "—" ? session : "",
      price: displayPrice,
      transition_brief: transition,
      status_color: headline && headline !== "—" && headline.length > 1 ? "green" : "amber",
      pending: [],
      timeline: [],
      local_fallback: true,
    };
  }

  function applyState(data) {
    if (!data) return;
    setLed(data.status_color);
    const phaseEl = document.getElementById("dc-tracker-phase");
    const verdictEl = document.getElementById("dc-tracker-verdict");
    const metaEl = document.getElementById("dc-tracker-meta");
    const transEl = document.getElementById("dc-tracker-transition");
    if (phaseEl) phaseEl.textContent = data.phase_label || data.phase || "Waiting";
    if (verdictEl) verdictEl.textContent = data.verdict || "Run Analyse Market";
    if (metaEl) {
      const parts = [
        data.htf_bias ? `Session ${data.htf_bias}` : "",
        Number.isFinite(Number(data.price)) ? `Price ${Number(data.price).toFixed(2)}` : "",
        data.local_fallback ? "Local snapshot" : "",
        data.last_close_time
          ? `Bar ${new Date(data.last_close_time * 1000).toLocaleTimeString()}`
          : !data.local_fallback
            ? "Bar open"
            : "",
      ].filter(Boolean);
      metaEl.textContent = parts.join(" · ") || "Press Analyse Market in desk panel";
    }
    if (transEl) {
      transEl.textContent =
        data.transition_brief ||
        (data.local_fallback
          ? "Connect backend for candle-close confirmation and timeline."
          : "Nothing material changed.");
    }

    const pendingWrap = document.getElementById("dc-tracker-pending-wrap");
    const pendingList = document.getElementById("dc-tracker-pending");
    const pending = data.pending || [];
    if (pendingWrap && pendingList) {
      pendingWrap.classList.toggle("hidden", !pending.length);
      pendingList.innerHTML = pending
        .slice(0, 4)
        .map((p) => `<li>${p.detail || p.label}</li>`)
        .join("");
    }

    const execEl = document.getElementById("dc-tracker-exec");
    if (execEl) {
      execEl.classList.toggle("hidden", !data.execution_signal);
      execEl.textContent = data.execution_signal || "";
    }

    if (data.timeline?.length) {
      try {
        sessionStorage.setItem(TIMELINE_KEY, JSON.stringify(data.timeline));
      } catch {
        /* ignore */
      }
      updateScrubber(data.timeline);
    } else {
      const detail = document.getElementById("dc-tracker-scrub-detail");
      if (detail) {
        detail.textContent = data.local_fallback
          ? "Timeline needs backend — deploy v1.4.60+ then RECONNECT."
          : "No timeline entries yet — updates on candle close.";
      }
    }

    if (data.phase && data.phase !== lastPhase) {
      lastPhase = data.phase;
      try {
        sessionStorage.setItem(STORAGE_PHASE_KEY, data.phase);
      } catch {
        /* ignore */
      }
      if (window.DeskCopilotVoice?.autoRead && data.transition_brief && !data.nothing_changed) {
        window.DeskCopilotVoice?.speakBrief?.(data.transition_brief, { deskBrief: true, speed: 0.9 });
      }
    }
  }

  function updateScrubber(timeline) {
    const scrub = document.getElementById("dc-tracker-scrub");
    if (!scrub || !timeline.length) return;
    scrub.max = String(Math.max(0, timeline.length - 1));
    scrub.value = String(timeline.length - 1);
    showTimelineIndex(timeline.length - 1, timeline);
  }

  function showTimelineIndex(idx, timeline) {
    let tl = timeline;
    if (!tl) {
      try {
        tl = JSON.parse(sessionStorage.getItem(TIMELINE_KEY) || "[]");
      } catch {
        tl = [];
      }
    }
    const entry = tl[idx];
    const detail = document.getElementById("dc-tracker-scrub-detail");
    if (!entry || !detail) return;
    detail.textContent = `${entry.ts?.slice(11, 19) || ""} · ${entry.price?.toFixed(2)} · ${entry.transition || entry.what_changed}`;
  }

  async function refreshTracker(opts = {}) {
    if (!enabled) return null;
    const transEl = document.getElementById("dc-tracker-transition");
    const prevTrans = transEl?.textContent || "";
    if (expanded && transEl && !opts.freeze) {
      transEl.textContent = `${prevTrans.replace(/ · syncing…$/, "")} · syncing…`;
    }

    const syncPrice = window.DeskCopilotChartPrice?.readSync?.();
    let snapshot = null;
    try {
      snapshot = await window.DeskCopilotChartSnapshot?.collect?.({ maxBars: 80, timeoutMs: 4000 });
    } catch {
      snapshot = null;
    }
    const lastBar = snapshot?.candles?.length ? snapshot.candles[snapshot.candles.length - 1] : null;
    const barTime = snapshot?.sync?.lastBarTime ?? lastBar?.t ?? null;
    let candleClosed = false;
    if (barTime != null && lastBarTime != null && barTime > lastBarTime) {
      candleClosed = true;
    }
    if (barTime != null) lastBarTime = barTime;

    const payload = {
      type: "DESK_TRACKER",
      chartSnapshot: snapshot,
      chartLastPrice: syncPrice,
      lastBarTime: barTime,
      candleClosed: opts.forceClose || candleClosed,
      freeze: opts.freeze === true,
    };

    const send =
      typeof window.__dcBgSend === "function"
        ? window.__dcBgSend
        : (msg, timeout) =>
            new Promise((resolve, reject) => {
              chrome.runtime.sendMessage(msg, (r) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(r);
              });
              if (timeout) setTimeout(() => reject(new Error("timeout")), timeout);
            });

    try {
      const data = await send(payload, 25000);
      if (data?.error) throw new Error(data.error);
      if (!data.local_fallback) {
        window.__dcReportMarketPulse?.("desk-tracker", {
          timestamp: Date.now(),
          symbol: data.symbol,
          timeframe: data.timeframe,
        });
      }
      applyState(data);
      return data;
    } catch (err) {
      console.warn("[dc-tracker]", err);
      const liveOk = window.__dcIsLiveDataAvailable?.() === true;
      if (!liveOk) {
        showCardStatus("error", "LIVE DATA: OFFLINE — tracker paused");
        setLed("amber");
        return null;
      }
      const fallback = buildLocalFallback();
      fallback.transition_brief = `${fallback.transition_brief} (${String(err?.message || "offline").slice(0, 80)})`;
      fallback.local_fallback = true;
      applyState(fallback);
      return fallback;
    }
  }

  function startBarWatcher() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      void refreshTracker();
    }, BAR_POLL_MS);
    void refreshTracker();
  }

  function stopBarWatcher() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function init() {
    if (!enabled) return;
    ensureRail();
    applyState(buildLocalFallback());
    startBarWatcher();
  }

  window.DeskCopilotTracker = {
    init,
    refresh: refreshTracker,
    start: startBarWatcher,
    stop: stopBarWatcher,
    setEnabled: (on) => {
      enabled = on !== false;
      if (enabled) init();
      else stopBarWatcher();
    },
  };
})();
