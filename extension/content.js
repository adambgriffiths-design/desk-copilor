(function () {
  const DC_VERSION = "1.4.60";
  const DESK_VERDICT_SPEAK_SPEED = 0.85;
  const DESK_BROWSER_TTS_RATE = 0.88;
  const BOOT = `dc-boot-${DC_VERSION}`;
  if (window[BOOT]) return;
  window[BOOT] = true;
  const WOLF_LOGO = `<svg class="dc-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true"><rect width="64" height="64" fill="#000"/><polygon fill="#fff" points="18,20 12,2 28,16"/><polygon fill="#fff" points="46,20 52,2 36,16"/><polygon fill="#000" points="17,17 14,7 22,15"/><polygon fill="#000" points="47,17 50,7 42,15"/><polygon fill="#fff" points="32,14 44,20 48,32 44,44 32,58 20,44 16,32 20,20"/><polygon fill="#000" points="19,27 27,29 25,33 17,31"/><polygon fill="#000" points="45,27 37,29 39,33 47,31"/><ellipse cx="22" cy="30" rx="3.2" ry="2.6" fill="#38B6FF"/><ellipse cx="42" cy="30" rx="3.2" ry="2.6" fill="#38B6FF"/><circle cx="23" cy="29" r="1" fill="#D4F0FF"/><circle cx="43" cy="29" r="1" fill="#D4F0FF"/><ellipse cx="32" cy="44" rx="3.5" ry="2.5" fill="#000"/><polygon fill="#fff" points="28,47 29,52 30,47"/><polygon fill="#fff" points="34,47 35,52 36,47"/></svg>`;

  document.getElementById("dc-panel")?.remove();

  const panel = document.createElement("div");
  panel.id = "dc-panel";
  panel.dataset.dcVersion = DC_VERSION;
  panel.innerHTML = `
    <div class="dc-header" id="dc-header">
      <div class="dc-brand-row">
        ${WOLF_LOGO}
        <div class="dc-brand">
          <span class="dc-brand-title">The Trading Desk</span>
          <span class="dc-tagline">Karen · your desk co-pilot</span>
          <div class="dc-header-meta">
            <span class="dc-session-badge" id="dc-session-badge" title="Current ICT session">—</span>
            <span class="dc-live-dot hidden" id="dc-live-dot" title="Karen is listening"></span>
          </div>
        </div>
      </div>
      <button type="button" class="dc-icon-btn" id="dc-collapse" title="Minimize panel">−</button>
    </div>
    <div class="dc-status-row" id="dc-status-row" aria-label="Desk connection status">
      <div class="dc-status-item"><span class="dc-status-key">MARKET</span><span class="dc-status-val" id="dc-status-market"></span></div>
      <div class="dc-status-item"><span class="dc-status-key">DATA</span><span class="dc-status-val" id="dc-status-data"></span></div>
      <div class="dc-status-item"><span class="dc-status-key">KAREN</span><span class="dc-status-val" id="dc-status-karen"></span></div>
    </div>
    <div class="dc-panel-scroll" id="dc-panel-scroll">
    <div class="dc-market-bar" id="dc-market-bar">
      <div class="dc-market-bar-top">
        <div class="dc-market-bar-left">
          <span class="dc-bar-symbol" id="dc-bar-symbol">MNQ</span>
          <span class="dc-bar-sep">·</span>
          <span class="dc-bar-tf" id="dc-bar-tf">1m</span>
          <span class="dc-bar-sep">·</span>
          <span class="dc-bar-session" id="dc-bar-session">—</span>
        </div>
        <span class="dc-data-quality" id="dc-data-quality" title="Data quality indicator"></span>
      </div>
      <div class="dc-market-bar-price-row">
        <span class="dc-bar-price dc-price-unavailable" id="dc-bar-price">PRICE UNAVAILABLE</span>
        <span class="dc-bar-change hidden" id="dc-bar-change"></span>
      </div>
      <div class="dc-market-bar-meta">
        <span class="dc-bar-data" id="dc-bar-data">—</span>
        <span class="dc-bar-source" id="dc-bar-source"></span>
        <span class="dc-bar-freshness" id="dc-bar-freshness"></span>
        <span class="dc-bar-updated" id="dc-bar-updated"></span>
      </div>
    </div>
    <div class="dc-desk-primary" id="dc-primary">
      <div class="dc-analyse-market-label">ANALYSE MARKET</div>
      <div class="dc-verdict-card" id="dc-verdict-card">
        <div class="dc-verdict-empty" id="dc-verdict-empty">Press Analyse Market for the current desk verdict.</div>
        <div class="dc-verdict-analyzing hidden" id="dc-verdict-analyzing">
          <div class="dc-verdict-brand-row">
            <span class="dc-verdict-brand">KAREN</span>
            <span class="dc-mock-badge" id="dc-mock-badge-analyzing">DEMO / MOCK</span>
          </div>
          <div class="dc-analyzing-status">THINKING…</div>
          <ul class="dc-analyzing-steps" id="dc-analyzing-steps">
            <li class="dc-analyzing-step dc-analyzing-step-pending">Reading market</li>
            <li class="dc-analyzing-step dc-analyzing-step-pending">Checking structure</li>
            <li class="dc-analyzing-step dc-analyzing-step-pending">Checking liquidity</li>
            <li class="dc-analyzing-step dc-analyzing-step-pending">Checking data quality</li>
          </ul>
        </div>
        <div class="dc-verdict-body hidden" id="dc-verdict-body">
          <div class="dc-verdict-brand-row">
            <span class="dc-verdict-brand">KAREN</span>
            <span class="dc-mock-badge hidden" id="dc-mock-badge">MOCK ANALYSIS</span>
            <span class="dc-verdict-dq" id="dc-verdict-dq"></span>
          </div>
          <div class="dc-verdict-section-label">VERDICT</div>
          <div class="dc-verdict-headline" id="dc-verdict-headline">—</div>
          <div class="dc-verdict-symbol" id="dc-verdict-symbol">NASDAQ / MNQ</div>
          <div class="dc-verdict-meta">
            <div class="dc-v-field hidden"><span class="dc-v-label">BIAS</span><div class="dc-v-row" id="dc-v-bias"></div></div>
            <div class="dc-v-field hidden"><span class="dc-v-label">STRUCTURE</span><div class="dc-v-row" id="dc-v-structure"></div></div>
            <div class="dc-v-field hidden"><span class="dc-v-label">LIQUIDITY</span><div class="dc-v-row" id="dc-v-liquidity"></div></div>
            <div class="dc-v-field hidden"><span class="dc-v-label">FVG</span><div class="dc-v-row" id="dc-v-fvg"></div></div>
            <div class="dc-v-field hidden"><span class="dc-v-label">PD ARRAY</span><div class="dc-v-row" id="dc-v-pd"></div></div>
            <div class="dc-v-field hidden"><span class="dc-v-label">ENTRY</span><div class="dc-v-row" id="dc-v-entry"></div></div>
            <div class="dc-v-field dc-verdict-invalidation-wrap hidden" id="dc-verdict-invalidation-wrap">
              <span class="dc-v-label">INVALIDATION</span>
              <div class="dc-v-row" id="dc-v-invalidation"></div>
            </div>
            <div class="dc-v-field hidden"><span class="dc-v-label">TARGET</span><div class="dc-v-row" id="dc-v-target"></div></div>
            <div class="dc-v-field hidden"><span class="dc-v-label">FRESHNESS</span><div class="dc-v-row" id="dc-v-freshness"></div></div>
          </div>
          <div class="dc-verdict-status" id="dc-verdict-status"></div>
        </div>
      </div>
      <div class="dc-prev-verdict hidden" id="dc-prev-verdict">
        <div class="dc-prev-label">Previous verdict</div>
        <div class="dc-prev-line" id="dc-prev-line"></div>
        <div class="dc-prev-change" id="dc-prev-change"></div>
      </div>
      <div class="dc-evidence-wrap" id="dc-evidence-wrap">
        <div class="dc-evidence-label">WHY · SUMMARY</div>
        <ul class="dc-evidence-list" id="dc-evidence-list"></ul>
      </div>
      <div class="dc-evidence-sections hidden" id="dc-evidence-sections">
        <details class="dc-evidence-block" open>
          <summary>WHY</summary>
          <div class="dc-evidence-block-body" id="dc-evidence-why"></div>
        </details>
        <details class="dc-evidence-block">
          <summary>EVIDENCE</summary>
          <div class="dc-evidence-block-body" id="dc-evidence-facts"></div>
        </details>
        <details class="dc-evidence-block">
          <summary>RISK</summary>
          <div class="dc-evidence-block-body" id="dc-evidence-risk"></div>
        </details>
        <details class="dc-evidence-block">
          <summary>DATA QUALITY</summary>
          <div class="dc-evidence-block-body" id="dc-evidence-dq"></div>
        </details>
      </div>
      <details class="dc-full-analysis-wrap">
        <summary>Full analysis</summary>
        <pre class="dc-full-analysis" id="dc-full-analysis"></pre>
      </details>
      <div class="dc-desk-actions">
        <button type="button" class="dc-btn dc-verdict-btn dc-btn-primary" id="dc-get-verdict" title="Run desk pipeline on live chart data (Alt+Shift+R)">ANALYSE MARKET</button>
        <button type="button" class="dc-btn dc-verdict-btn dc-btn-secondary hidden" id="dc-new-analysis" title="Reset mock analysis lifecycle">NEW ANALYSIS</button>
        <button type="button" class="dc-btn dc-levels-draw dc-btn-levels" id="dc-levels-draw" title="Fetch + draw enabled level categories (Alt+Shift+L)">MARK LEVELS</button>
      </div>
      <div class="dc-levels-status" id="dc-levels-status"></div>
      <div class="dc-levels-row dc-levels-secondary">
        <button type="button" class="dc-btn dc-levels-copy" id="dc-levels-copy" title="Copy level prices to clipboard">COPY</button>
        <button type="button" class="dc-btn dc-levels-clear" id="dc-levels-clear" title="Remove drawn level lines from chart">STRIP</button>
        <button type="button" class="dc-btn dc-reconnect" id="dc-reconnect" title="Connection status — click to force reconnect">RECONNECT</button>
      </div>
      <details class="dc-level-guide" id="dc-level-guide">
        <summary title="Toggle categories + one-line ICT meaning">Level categories</summary>
        <p class="dc-level-guide-intro">Toggle which categories draw when you mark levels.</p>
        <div class="dc-level-toggles" id="dc-level-toggles"></div>
      </details>
    </div>
    <div class="dc-voice-hero-wrap">
      <div class="dc-karen-status" id="dc-karen-status">
        <span class="dc-karen-status-key">KAREN</span>
        <span class="dc-karen-status-val" id="dc-karen-status-value"></span>
      </div>
      <button type="button" class="dc-voice-hero" id="dc-voice-hero" title="Hands-free voice (Alt+Shift+V)">● TALK TO KAREN</button>
      <p class="dc-voice-interrupt-hint hidden" id="dc-voice-interrupt-hint">Speak anytime to interrupt</p>
      <div class="dc-voice-row dc-voice-secondary">
        <button type="button" class="dc-btn dc-voice hidden" id="dc-voice-toggle" title="Toggle voice engine">VOICE</button>
        <button type="button" class="dc-btn dc-voice-test" id="dc-voice-test" title="Mic check">CHECK MIC</button>
        <button type="button" class="dc-btn dc-stop-speak hidden" id="dc-stop-speak" title="Stop Karen from speaking">STOP</button>
      </div>
      <div class="dc-voice-mode hidden" id="dc-voice-mode" aria-live="polite"></div>
      <div class="dc-voice-live-wrap">
        <span class="dc-voice-live-label">Hearing</span>
        <div class="dc-voice-live" id="dc-voice-live" aria-live="polite"></div>
      </div>
    </div>
    <div class="dc-body" id="dc-body">
    <div class="dc-section dc-section-card dc-section-mentor">
      <div class="dc-section-label">Mentor</div>
      <div class="dc-market-data-card hidden" id="dc-market-data-card">
        <div class="dc-mdc-head">MARKET DATA</div>
        <div class="dc-mdc-grid">
          <div class="dc-mdc-row"><span class="dc-mdc-key">Status</span><span class="dc-mdc-val" id="dc-mdc-status">Unavailable</span></div>
          <div class="dc-mdc-row"><span class="dc-mdc-key">Reason</span><span class="dc-mdc-val" id="dc-mdc-reason">—</span></div>
          <div class="dc-mdc-row"><span class="dc-mdc-key">Action</span><span class="dc-mdc-val" id="dc-mdc-action">—</span></div>
        </div>
      </div>
      <p class="dc-mentor-hint">Ask: Why? · What would invalidate this? · What are you waiting for? · Why not short?</p>
      <div class="dc-chat" id="dc-chat"></div>
      <div class="dc-chat-input-row">
        <input type="text" id="dc-chat-input" class="dc-chat-input" placeholder="Ask Karen…" autocomplete="off" />
        <button type="button" id="dc-chat-send" class="dc-chat-send" title="Send message to Karen">SEND</button>
      </div>
    </div>
    <details class="dc-section-card dc-overview-wrap dc-section-overview" id="dc-overview" open>
      <summary title="How Karen reads the chart and marks levels">Overview</summary>
      <div class="dc-overview-body">
        <p class="dc-overview-lead">Karen is your desk co-pilot — not a signal service or financial advice. You decide whether to trade.</p>
        <div class="dc-overview-block dc-overview-block-uses">
          <div class="dc-overview-head"><span class="dc-overview-icon" aria-hidden="true">◈</span> What she uses</div>
          <ul>
            <li><strong>TradingView chart</strong> — structured OHLC + drawings for reads; screenshot fallback.</li>
            <li><strong>Yahoo MNQ bars</strong> — levels, bias, and gaps.</li>
            <li><strong>Session context</strong> — Asia, London, NY, and kill zones (EST).</li>
          </ul>
        </div>
        <div class="dc-overview-block dc-overview-block-bias">
          <div class="dc-overview-head"><span class="dc-overview-icon" aria-hidden="true">◎</span> How bias works</div>
          <ul>
            <li>Playbook — prior-day arrays, gaps, structure, and session timing.</li>
            <li>PD levels set the directional draw first.</li>
            <li>1m chart confirms execution — structure shift, displacement, unfilled gaps.</li>
            <li>Confluence order: higher-timeframe arrays → session → 1m structure.</li>
          </ul>
        </div>
        <div class="dc-overview-block dc-overview-block-note">
          <div class="dc-overview-head"><span class="dc-overview-icon" aria-hidden="true">↕</span> Market verdict</div>
          <p>LONG, SHORT, WAIT, or NO TRADE from the desk pipeline — a lean when PD, structure, and session align. <strong>Not</strong> an order to click.</p>
        </div>
        <div class="dc-overview-block dc-overview-block-levels">
          <div class="dc-overview-head"><span class="dc-overview-icon" aria-hidden="true">─</span> Levels on chart</div>
          <ul>
            <li><strong>Mark levels</strong> draws computed prices; toggle categories in the level guide.</li>
            <li>Alt+Shift+L anytime; <strong>Strip</strong> removes drawn lines (Pine script stays in the editor).</li>
          </ul>
        </div>
        <div class="dc-overview-block dc-overview-block-routes">
          <div class="dc-overview-head"><span class="dc-overview-icon" aria-hidden="true">◉</span> Voice vs chat</div>
          <ul>
            <li>Same brain — voice is hands-free, chat is typed.</li>
            <li>Full chart read uses live chart data first; screenshot only if export fails.</li>
          </ul>
        </div>
      </div>
    </details>
    <details class="dc-section-card dc-diagnostics-wrap" id="dc-diagnostics">
      <summary>Diagnostics</summary>
      <div class="dc-stats" id="dc-stats">—</div>
      <div class="dc-msg" id="dc-msg"></div>
      <span class="dc-route-debug hidden" id="dc-route-debug" title="Routing debug"></span>
      <details class="dc-voice-log-wrap" id="dc-voice-log-wrap">
        <summary>Voice log</summary>
        <pre class="dc-voice-log" id="dc-voice-log"></pre>
      </details>
      <details class="dc-voice-latency-wrap" id="dc-voice-latency-wrap">
        <summary>Voice latency (last turn)</summary>
        <pre class="dc-voice-latency" id="dc-voice-latency">No voice turn recorded yet.</pre>
      </details>
      <details class="dc-mock-dev-wrap" id="dc-mock-dev-wrap">
        <summary>Mock analysis (dev)</summary>
        <label class="dc-mock-dev-toggle"><input type="checkbox" id="dc-mock-enabled" /> Enable mock lifecycle (no backend)</label>
        <label class="dc-mock-dev-scenario">Scenario
          <select id="dc-mock-scenario">
            <option value="WAIT">WAIT</option>
            <option value="LONG">LONG</option>
            <option value="SHORT">SHORT</option>
          </select>
        </label>
      </details>
      <details class="dc-connection-diagnostics-wrap" id="dc-connection-diagnostics-wrap">
        <summary>Connection</summary>
        <pre class="dc-connection-diagnostics" id="dc-connection-diagnostics">—</pre>
      </details>
      <details class="dc-chart-export-wrap" id="dc-chart-export-wrap">
        <summary>Chart export (last attempt)</summary>
        <pre class="dc-chart-export-diagnostics" id="dc-chart-export-diagnostics">No chart export recorded yet.</pre>
      </details>
      <div class="dc-trace-tabs" id="dc-trace-tabs">
        <div class="dc-trace-tab-bar" role="tablist">
          <button type="button" class="dc-trace-tab active" data-tab="live" role="tab">Live pipeline</button>
          <button type="button" class="dc-trace-tab" data-tab="perf" role="tab">Performance</button>
          <button type="button" class="dc-trace-tab" data-tab="failures" role="tab">Failures</button>
          <button type="button" class="dc-trace-tab" data-tab="regression" role="tab">Regression</button>
        </div>
        <pre class="dc-trace-panel active" id="dc-trace-live" data-panel="live">No request trace yet.</pre>
        <pre class="dc-trace-panel" id="dc-trace-perf" data-panel="perf">No traces yet.</pre>
        <pre class="dc-trace-panel" id="dc-trace-failures" data-panel="failures">No failures.</pre>
        <pre class="dc-trace-panel" id="dc-trace-regression" data-panel="regression">Run npm run test:system</pre>
      </div>
    </details>
    <details class="dc-section-card dc-settings-wrap dc-section-settings">
      <summary title="Auto-mark, agent mode, and voice options">Desk settings</summary>
      <label class="dc-levels-auto"><input type="checkbox" id="dc-auto-levels" /> Auto-mark on load</label>
      <label class="dc-voice-auto"><input type="checkbox" id="dc-auto-voice" checked /> Autonomous agent (hands-free)</label>
      <label class="dc-voice-auto"><input type="checkbox" id="dc-auto-read" checked /> Speak the brief</label>
    </details>
    <pre class="dc-verdict hidden" id="dc-text"></pre>
    <div class="dc-voice-hint">Alt+Shift+V voice · Alt+Shift+R analyse · Alt+Shift+L levels</div>
    <div class="dc-footer"><span class="dc-ver" id="dc-ver">v${DC_VERSION}</span></div>
    </div>
    </div>
    <div class="dc-resize-edge dc-resize-edge-bottom" id="dc-resize-edge-bottom" title="Drag to resize height" aria-hidden="true"></div>
    <div class="dc-resize-handle" id="dc-resize-handle" title="Drag to resize panel" aria-hidden="true"></div>
  `;
  document.body.appendChild(panel);

  const PANEL_MIN_WIDTH = 340;
  const PANEL_DEFAULT_WIDTH = 370;
  const PANEL_DEFAULT_HEIGHT = 480;
  const PANEL_SIZE_KEY = "dc-panel-size";
  const PANEL_COLLAPSED_KEY = "dc-panel-collapsed";
  const PANEL_MAX_WIDTH_RATIO = 0.9;
  const PANEL_MAX_HEIGHT_RATIO = 0.9;
  let panelMinHeight = 0;
  let savedExpandedPanelSize = null;

  function setPanelCollapsed(collapsed, opts = {}) {
    const btn = document.getElementById("dc-collapse");
    if (!btn) return;

    if (collapsed) {
      if (panel.classList.contains("dc-sized")) {
        const rect = panel.getBoundingClientRect();
        savedExpandedPanelSize = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        panel.style.height = "auto";
        panel.style.removeProperty("--dc-panel-h");
      }
      panel.classList.add("dc-collapsed");
      btn.textContent = "+";
      btn.title = "Expand panel";
      btn.setAttribute("aria-expanded", "false");
    } else {
      panel.classList.remove("dc-collapsed");
      if (savedExpandedPanelSize) {
        applyPanelSize(savedExpandedPanelSize.width, savedExpandedPanelSize.height);
      }
      const body = document.getElementById("dc-panel-scroll") || document.getElementById("dc-body");
      if (body) body.scrollTop = 0;
      panel.scrollTop = 0;
      btn.textContent = "−";
      btn.title = "Minimize panel";
      btn.setAttribute("aria-expanded", "true");
      if (!opts.skipRefresh) refreshContextStrip({ forceBridge: true, bias: true });
    }

    if (!opts.skipPersist) {
      chrome.storage.local.set({ [PANEL_COLLAPSED_KEY]: collapsed }).catch(() => {});
    }
  }

  function togglePanelCollapsed() {
    setPanelCollapsed(!panel.classList.contains("dc-collapsed"));
  }

  async function restorePanelCollapsed() {
    try {
      const data = await chrome.storage.local.get(PANEL_COLLAPSED_KEY);
      if (data[PANEL_COLLAPSED_KEY] === true) {
        setPanelCollapsed(true, { skipPersist: true, skipRefresh: true });
      }
    } catch {
      /* ignore */
    }
  }

  function panelMaxWidth() {
    return Math.floor(window.innerWidth * PANEL_MAX_WIDTH_RATIO);
  }

  function panelMaxHeight() {
    const bottom = parseFloat(panel.style.bottom);
    const bottomPx = Number.isFinite(bottom) ? bottom : 16;
    const topMargin = 12;
    const byPosition = Math.floor(window.innerHeight - bottomPx - topMargin);
    const byRatio = Math.floor(window.innerHeight * PANEL_MAX_HEIGHT_RATIO);
    return Math.max(200, Math.min(byRatio, byPosition));
  }

  function clampPanelToViewport() {
    if (panel.classList.contains("dc-collapsed")) return;
    const margin = 8;
    let rect = panel.getBoundingClientRect();
    if (rect.top < margin) {
      const bottom = parseFloat(panel.style.bottom);
      const currentBottom = Number.isFinite(bottom) ? bottom : 16;
      panel.style.bottom = `${Math.max(margin, currentBottom - (margin - rect.top))}px`;
      rect = panel.getBoundingClientRect();
    }
    if (rect.left < margin) panel.style.left = `${margin}px`;
    if (rect.right > window.innerWidth - margin) {
      panel.style.left = `${Math.max(margin, window.innerWidth - margin - rect.width)}px`;
    }
    if (panel.classList.contains("dc-sized") && rect.height > panelMaxHeight()) {
      applyPanelSize(rect.width, panelMaxHeight());
    }
  }

  function measurePanelMinHeight() {
    panel.style.width = "";
    panel.style.height = "";
    panel.style.removeProperty("--dc-panel-h");
    panel.classList.remove("dc-sized");
    const prevMaxHeight = panel.style.maxHeight;
    panel.style.maxHeight = "none";
    void panel.offsetHeight;
    const height = Math.round(panel.getBoundingClientRect().height);
    panel.style.maxHeight = prevMaxHeight;
    return height;
  }

  function clampPanelSize(width, height) {
    const maxH = panelMaxHeight();
    const minH = Math.min(panelMinHeight || 200, maxH);
    return {
      width: Math.max(PANEL_MIN_WIDTH, Math.min(panelMaxWidth(), Math.round(width))),
      height: Math.max(minH, Math.min(maxH, Math.round(height))),
    };
  }

  function applyPanelSize(width, height) {
    const size = clampPanelSize(width, height);
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
    panel.style.setProperty("--dc-panel-h", `${size.height}px`);
    panel.style.setProperty("--dc-panel-min-w", `${PANEL_MIN_WIDTH}px`);
    panel.style.setProperty("--dc-panel-min-h", `${panelMinHeight}px`);
    panel.classList.add("dc-sized");
    return size;
  }

  function savePanelSize() {
    if (!panel.classList.contains("dc-sized")) return;
    const rect = panel.getBoundingClientRect();
    chrome.storage.local
      .set({
        [PANEL_SIZE_KEY]: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      })
      .catch(() => {});
  }

  async function restorePanelSize() {
    panelMinHeight = Math.min(measurePanelMinHeight(), panelMaxHeight());
    panel.style.setProperty("--dc-panel-min-w", `${PANEL_MIN_WIDTH}px`);
    panel.style.setProperty("--dc-panel-min-h", `${panelMinHeight}px`);
    panel.style.setProperty("--dc-panel-default-w", `${PANEL_DEFAULT_WIDTH}px`);
    let restored = false;
    try {
      const data = await chrome.storage.local.get(PANEL_SIZE_KEY);
      const size = data[PANEL_SIZE_KEY];
      if (
        size &&
        typeof size.width === "number" &&
        typeof size.height === "number" &&
        size.width >= PANEL_MIN_WIDTH &&
        size.height >= panelMinHeight
      ) {
        applyPanelSize(size.width, size.height);
        restored = true;
      }
    } catch {
      /* ignore */
    }
    if (!restored) {
      applyPanelSize(PANEL_DEFAULT_WIDTH, Math.min(Math.max(panelMinHeight, PANEL_DEFAULT_HEIGHT), panelMaxHeight()));
    }
    clampPanelToViewport();
  }

  function initPanelResize() {
    const handle = document.getElementById("dc-resize-handle");
    const edgeBottom = document.getElementById("dc-resize-edge-bottom");
    if (!handle) return;

    let resizing = false;
    let resizeMode = "both";
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    function beginResize(e, mode) {
      if (e.button !== 0) return;
      if (panel.classList.contains("dc-collapsed")) return;
      e.preventDefault();
      e.stopPropagation();
      resizing = true;
      resizeMode = mode;
      if (!panel.classList.contains("dc-sized")) {
        const rect = panel.getBoundingClientRect();
        applyPanelSize(rect.width, rect.height);
      }
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startW = rect.width;
      startH = rect.height;
      panel.classList.add("dc-resizing");
    }

    handle.addEventListener("mousedown", (e) => beginResize(e, "both"));
    edgeBottom?.addEventListener("mousedown", (e) => beginResize(e, "height"));

    window.addEventListener("mousemove", (e) => {
      if (!resizing) return;
      const dw = resizeMode === "height" ? 0 : e.clientX - startX;
      const dh = e.clientY - startY;
      applyPanelSize(startW + dw, startH + dh);
      clampPanelToViewport();
    });

    window.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false;
      panel.classList.remove("dc-resizing");
      savePanelSize();
    });

    window.addEventListener("resize", () => {
      if (!panel.classList.contains("dc-sized")) return;
      const rect = panel.getBoundingClientRect();
      applyPanelSize(rect.width, rect.height);
      clampPanelToViewport();
    });
  }

  function restorePanelPos() {
    try {
      const raw = localStorage.getItem("dc-panel-pos");
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (typeof pos.left === "number") panel.style.left = `${pos.left}px`;
      if (typeof pos.bottom === "number") panel.style.bottom = `${pos.bottom}px`;
      panel.style.right = "auto";
      clampPanelToViewport();
    } catch {
      /* ignore */
    }
  }

  function savePanelPos() {
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(
      "dc-panel-pos",
      JSON.stringify({
        left: Math.round(rect.left),
        bottom: Math.round(window.innerHeight - rect.bottom),
      })
    );
  }

  function isPanelDragBlocked(target) {
    return Boolean(
      target?.closest?.(
        "button, input, textarea, select, label, a, .dc-chat, .dc-bubble, .dc-resize-handle, .dc-resize-edge, .dc-panel-scroll"
      )
    );
  }

  function initPanelDrag() {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startBottom = 0;

    panel.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (isPanelDragBlocked(e.target)) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;
      panel.style.right = "auto";
      panel.style.left = `${startLeft}px`;
      panel.style.bottom = `${startBottom}px`;
      panel.classList.add("dc-dragging");
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 120, startLeft + dx))}px`;
      panel.style.bottom = `${Math.max(8, Math.min(window.innerHeight - 48, startBottom - dy))}px`;
      clampPanelToViewport();
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove("dc-dragging");
      savePanelPos();
    });
  }

  const collapseBtn = document.getElementById("dc-collapse");
  collapseBtn.setAttribute("aria-expanded", "true");
  collapseBtn.setAttribute("aria-label", "Minimize panel");
  collapseBtn.addEventListener("mousedown", (e) => e.stopPropagation());
  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanelCollapsed();
  });

  document.getElementById("dc-header").addEventListener("dblclick", (e) => {
    if (e.target.closest("#dc-collapse")) return;
    togglePanelCollapsed();
  });

  document.getElementById("dc-header").addEventListener("click", (e) => {
    if (!panel.classList.contains("dc-collapsed")) return;
    if (e.target.closest("#dc-collapse")) return;
    setPanelCollapsed(false);
  });

  restorePanelPos();
  initPanelDrag();
  restorePanelSize()
    .then(() => restorePanelCollapsed())
    .then(() => {
      const el = document.getElementById("dc-route-debug");
      if (el && routeDebugEnabled) el.classList.remove("hidden");
    })
    .finally(() => {
      initPanelResize();
      clampPanelToViewport();
      window.DeskCopilotUI?.updateKarenStatus?.("idle");
      updateMarketBarUI();
    });
  const scrollEl = document.getElementById("dc-panel-scroll") || document.getElementById("dc-body");
  if (scrollEl) scrollEl.scrollTop = 0;
  panel.scrollTop = 0;

  let lastVerdict = "";
  let lastSpokenBrief = "";
  let lastSnapshotAnswer = "";
  let lastSnapshotIntent = "";
  let lastVoiceTranscript = "";
  let voiceReady = false;
  let verdictBusy = false;
  let chatBusy = false;
  let levelsBusy = false;
  let drawLevelsSeq = 0;
  let verdictTimer = null;
  let verdictWaiter = null;
  let verdictRequestTs = 0;
  let lastHandledVerdictTs = 0;
  let currentVerdictRequestId = 0;
  let verdictTimedOut = false;
  let lastVerdictStatusPhase = "";
  let lastChartCapture = { base64: "", ts: 0, symbol: "" };
  const CHART_CAPTURE_CACHE_MS = 12000;
  let lastMarketSnapshotCache = { key: "", data: null, ts: 0 };
  const MI_CONTEXT_KEY = "dc-mi-context";
  const CHAT_STREAM_TIMEOUT_MS = 90000;
  const CHAT_EXTRAS_TIMEOUT_MS = 8000;
  let chatBusyWatchdog = null;

  function getConversationContext() {
    try {
      return JSON.parse(sessionStorage.getItem(MI_CONTEXT_KEY) || "null") || {};
    } catch {
      return {};
    }
  }

  function saveConversationContext(data) {
    if (!data?.last_fact_ids?.length) return;
    try {
      sessionStorage.setItem(
        MI_CONTEXT_KEY,
        JSON.stringify({
          lastFactIds: data.last_fact_ids,
          lastTopic: data.last_fact_ids[0],
        })
      );
    } catch {
      /* ignore */
    }
  }
  const MARKET_SNAPSHOT_CACHE_MS = 5000;
  const CONTEXT_PRICE_MS = 2500;
  const CONTEXT_BIAS_MS = 45000;
  const CONTEXT_SESSION_MS = 30000;
  const CONTEXT_PRICE_STALE_MS = 30000;
  const CONTEXT_BIAS_QUESTION = "what's the chart doing right now";
  const CONTEXT_CHART_READ_BIAS_MS = 300000;
  let contextStripPrice = null;
  let contextStripPriceTs = 0;
  let contextStripPriceSource = null;
  let backendPriceFallbackInflight = null;
  let contextStripBiasHint = "";
  let contextStripPriceTimer = null;
  let contextStripBiasTimer = null;
  let contextStripSessionTimer = null;
  let contextStripPriceInflight = false;
  let contextStripBiasInflight = false;
  let contextStripBiasFailStreak = 0;
  let contextStripBiasBackoffUntil = 0;
  let contextStripSnapshotCache = { hint: "", ts: 0 };
  let chatHistory = [];
  let backendOnline = false;
  let connectionSnapshot = null;
  let lastBackendCheck = 0;
  let lastBackendFail = 0;
  let lastOnlineAt = 0;
  let pingFailStreak = 0;
  let pingInFlight = false;
  let heartbeatTimer = null;
  let agentLoopTimer = null;
  let routeDebugEnabled = false;

  try {
    routeDebugEnabled = localStorage.getItem("dc-route-debug") === "1";
  } catch {
    routeDebugEnabled = false;
  }

  function classifyUserRoute(text, routeText, opts = {}) {
    const lastAssistant =
      opts.lastAssistant ||
      [...chatHistory].reverse().find((m) => m.role === "assistant")?.content ||
      "";
    return (
      window.DeskCopilotRoute?.classifyDeskRoute?.({
        text,
        routeText: routeText || text,
        lastAssistant,
        messages: chatHistory,
      }) || { route: "trading", label: "Trading Q&A" }
    );
  }

  function showRouteDebug(text, routeText, opts = {}) {
    const el = document.getElementById("dc-route-debug");
    if (!el) return;
    if (!routeDebugEnabled) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    const result = classifyUserRoute(text, routeText, opts);
    const line = window.DeskCopilotRoute?.formatDeskRouteDebug?.(result) || result.route;
    el.textContent = `route: ${line}`;
    el.classList.remove("hidden");
    const reqTag = opts.reqId ? `[req=${opts.reqId}] ` : "";
    voiceLog(`${reqTag}route:`, line, "←", String(routeText || text).slice(0, 64));
  }

  function setRouteDebugEnabled(on) {
    routeDebugEnabled = Boolean(on);
    try {
      localStorage.setItem("dc-route-debug", routeDebugEnabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    const el = document.getElementById("dc-route-debug");
    if (!routeDebugEnabled && el) {
      el.classList.add("hidden");
      el.textContent = "";
    }
  }

  window.__dcSetRouteDebug = setRouteDebugEnabled;

  function showTyping(show) {
    const chat = document.getElementById("dc-chat");
    let el = document.getElementById("dc-typing");
    if (show) {
      if (!el) {
        el = document.createElement("div");
        el.id = "dc-typing";
        el.className = "dc-bubble dc-bubble-bot dc-typing";
        const label = document.createElement("span");
        label.className = "dc-bubble-label";
        label.textContent = "Karen";
        const body = document.createElement("span");
        body.className = "dc-bubble-body";
        body.textContent = "Desk thinking…";
        el.appendChild(label);
        el.appendChild(body);
        chat.appendChild(el);
      }
      chat.scrollTop = chat.scrollHeight;
    } else if (el) {
      el.remove();
    }
  }

  function resetChatUiLoading() {
    chatBusy = false;
    showTyping(false);
    if (chatBusyWatchdog) {
      clearTimeout(chatBusyWatchdog);
      chatBusyWatchdog = null;
    }
  }

  function armChatUiLoading(voice) {
    chatBusy = true;
    if (!voice) showTyping(true);
    if (chatBusyWatchdog) clearTimeout(chatBusyWatchdog);
    chatBusyWatchdog = setTimeout(() => {
      if (!chatBusy) return;
      voiceLog("chat loading watchdog — force reset");
      cancelActiveChatStream("watchdog");
      resetChatUiLoading();
      setMsg("Chat timed out — click RECONNECT and try again.", false);
    }, CHAT_STREAM_TIMEOUT_MS + 5000);
  }

  function releaseChatUiLoading(voice) {
    if (chatBusyWatchdog) {
      clearTimeout(chatBusyWatchdog);
      chatBusyWatchdog = null;
    }
    if (!voice) showTyping(false);
    chatBusy = false;
  }

  async function ensureBackend(force = false) {
    if (!force && isLiveDataAvailable()) return true;
    if (!force && connectionSnapshot?.backendUp && Date.now() - lastBackendCheck < 45000) {
      return connectionSnapshot.backendUp;
    }
    return pingBackend(force);
  }

  function isLiveDataAvailable() {
    return window.DeskCopilotConnection?.isLiveDataAvailable?.(connectionSnapshot) === true;
  }

  function reportMarketPulse(source, extra = {}) {
    const receivedAt = Date.now();
    void bgSend({
      type: "CONNECTION_MARKET_PULSE",
      source,
      timestamp: extra.timestamp || receivedAt,
      receivedAt,
      symbol: extra.symbol || symbol(),
      timeframe: extra.timeframe || "1m",
      version: extra.version,
    }, 4000).catch(() => {});
  }

  window.__dcIsLiveDataAvailable = isLiveDataAvailable;
  window.__dcReportMarketPulse = reportMarketPulse;

  function applyConnectionSnapshot(snap) {
    if (!snap) return;
    connectionSnapshot = snap;
    backendOnline = snap.backendUp === true;
    if (backendOnline) {
      lastBackendFail = 0;
      pingFailStreak = 0;
      lastOnlineAt = Date.now();
    }
    updateAgentStatus();
    updateConnectionDiagnostics();
    updateMarketBarUI();
  }

  async function refreshConnectionState() {
    try {
      const snap = await bgSend({ type: "GET_CONNECTION_STATE" }, 4000);
      applyConnectionSnapshot(snap);
      return snap;
    } catch {
      return connectionSnapshot;
    }
  }

  function updateConnectionDiagnostics() {
    const el = document.getElementById("dc-connection-diagnostics");
    if (!el || !connectionSnapshot) return;
    el.textContent =
      window.DeskCopilotConnection?.formatDiagnosticsPanel?.(connectionSnapshot) ||
      JSON.stringify(connectionSnapshot, null, 2);
  }

  function warmBackend() {
    void bgSend({ type: "WARM" }, 8000).catch(() => {});
  }

  let activeChatStreamPort = null;
  let turnExtrasInflight = null;
  let turnExtrasCache = null;
  let turnExtrasCacheAt = 0;
  const TURN_EXTRAS_TTL_MS = 8000;
  let priceTurnInflight = null;
  let prefetchTurnTimer = null;
  let lastPrefetchInterim = "";

  function cancelActiveChatStream(reason) {
    if (!activeChatStreamPort) return;
    voiceLog("chat stream cancelled:", reason || "superseded");
    try {
      activeChatStreamPort.disconnect();
    } catch {
      /* ignore */
    }
    activeChatStreamPort = null;
  }

  function prefetchTurnExtras() {
    const now = Date.now();
    if (turnExtrasCache && now - turnExtrasCacheAt < TURN_EXTRAS_TTL_MS) return;
    if (turnExtrasInflight) return;
    turnExtrasCacheAt = now;
    turnExtrasInflight = chatRequestExtras()
      .then((extras) => {
        turnExtrasCache = extras;
        turnExtrasInflight = null;
        return extras;
      })
      .catch(() => {
        turnExtrasInflight = null;
        return {};
      });
  }

  async function getTurnExtras() {
    const extrasTimeout = new Promise((resolve) => {
      setTimeout(() => resolve({ __timedOut: true }), CHAT_EXTRAS_TIMEOUT_MS);
    });
    const loadExtras = async () => {
      if (turnExtrasInflight) {
        const inflight = await turnExtrasInflight;
        if (inflight && Object.keys(inflight).length) return inflight;
      }
      if (turnExtrasCache && Date.now() - turnExtrasCacheAt < TURN_EXTRAS_TTL_MS) {
        const cached = turnExtrasCache;
        turnExtrasCache = null;
        return cached;
      }
      return chatRequestExtras();
    };
    const extras = await Promise.race([loadExtras(), extrasTimeout]);
    if (extras?.__timedOut) {
      voiceLog("turn extras timed out — continuing without chart price");
      return {};
    }
    return extras || {};
  }

  function prefetchVoiceTurnResources(interimText) {
    const t = String(interimText || "").trim();
    if (!t || t === "…" || t.startsWith("(dropped:") || t.length < 8) return;
    warmBackend();
    void window.DeskCopilotChartPrice?.payload?.();
    prefetchTurnExtras();
    if (!window.DeskCopilotRealtime?.isActive?.()) {
      void window.DeskCopilotRealtime?.prefetchSession?.(symbol());
    }
    if (
      typeof needsScopedChartAnswer === "function" &&
      needsScopedChartAnswer(t) &&
      isFastFactQuestion(t, t)
    ) {
      const px = window.DeskCopilotChartPrice?.readSync?.();
      const pricePayload = px != null ? { chartLastPrice: px } : {};
      void bgSend(
        {
          type: "MARKET_SNAPSHOT",
          question: t,
          voiceInput: false,
          conversationContext: getConversationContext(),
          ...pricePayload,
        },
        12000
      )
        .then((snap) => {
          if (snap?.spoken && !snap.error) {
            lastMarketSnapshotCache = {
              key: `${t.toLowerCase()}|prefetch|${px ?? "na"}`,
              data: {
                spoken: snap.spoken,
                spokenBrief: snap.spoken,
                panel: snap.panel,
                verdict: snap.panel || snap.spoken,
                scoped: true,
                intent: snap.intent,
              },
              ts: Date.now(),
            };
            voiceLog("prefetch snapshot cached", snap.intent);
          }
        })
        .catch(() => {});
    }
  }

  function schedulePrefetchFromInterim(text) {
    const t = String(text || "").trim();
    if (!t || t === "…" || t.startsWith("(dropped:")) return;
    if (t === lastPrefetchInterim) return;
    lastPrefetchInterim = t;
    if (prefetchTurnTimer) clearTimeout(prefetchTurnTimer);
    prefetchTurnTimer = setTimeout(() => {
      prefetchTurnTimer = null;
      prefetchVoiceTurnResources(t);
    }, 180);
  }

  window.__dcPrefetchVoiceTurn = () => prefetchVoiceTurnResources(lastInterimStt);

  function offlineChatMessage() {
    return "Backend offline — Vercel deploy may be down or RECONNECT needed. I can't fetch prices or chart reads until https://desk-copilor.vercel.app responds.";
  }

  async function publishOfflineReply(voice) {
    const msg = offlineChatMessage();
    setMsg("Backend offline — RECONNECT", false);
    if (voice) {
      await publishAssistantReply(msg, voice, { pauseMic: true, instant: true }, () =>
        setKarenPhase("listening")
      );
    } else {
      recordAssistantReply(msg);
    }
  }

  function busyReason() {
    if (verdictBusy) return "a chart read is running (wait for the brief or cancel)";
    if (voiceTurnBusy) return "Karen is processing your last voice turn";
    if (chatBusy) return "the desk is replying to your last message";
    return null;
  }

  function chartReadBlockedReason() {
    if (verdictBusy) return "a chart read is running (wait for the brief or cancel)";
    return null;
  }

  function messageNeedsChartRead(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (typeof needsScopedChartAnswer === "function" && needsScopedChartAnswer(t)) return false;
    return isChartReadCommand(t) || needsFullChartRead(t, chartReadContext());
  }

  function cancelActiveChartRead(reason) {
    if (!verdictBusy && !verdictWaiter && currentVerdictRequestId === 0) return;
    currentVerdictRequestId += 1;
    verdictTimedOut = true;
    verdictBusy = false;
    lastVerdictStatusPhase = "";
    clearVerdictTimer();
    if (verdictWaiter) {
      const w = verdictWaiter;
      verdictWaiter = null;
      w.reject(new Error("Superseded"));
    }
    voiceLog("chart read cancelled:", reason || "superseded");
  }

  function kickOffChartRead(userQuestion, opts = {}) {
    void runChartRead(userQuestion, opts).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Superseded")) return;
      if (opts.turnGen != null && opts.turnGen !== voiceTurnGen) return;
    });
  }

  function explainError(err, context) {
    const msg = err instanceof Error ? err.message : String(err);
    const m = msg.toLowerCase();
    if (m.includes("timed out") && context === "chart") {
      return "Chart read timed out after 2 minutes — the Vercel backend may be cold or OpenAI was slow. Click RECONNECT, then try Analyse Market again.";
    }
    if (m.includes("timed out")) {
      return `Request timed out: ${msg}. Check RECONNECT — backend may be offline or slow.`;
    }
    if (m.includes("backend offline") || m.includes("fetch failed") || m.includes("network")) {
      return offlineChatMessage();
    }
    if (m.includes("openai_api_key")) {
      return "Server missing OPENAI_API_KEY — add it in Vercel env vars and redeploy.";
    }
    if (m.includes("screenshot") || m.includes("activetab")) {
      return "Screenshot blocked — click The Trading Desk icon in the Chrome toolbar once to grant capture permission, then retry.";
    }
    if (m.includes("empty reply")) {
      return "Desk returned an empty reply — usually a backend or API error. Hit RECONNECT and ask again.";
    }
    return msg;
  }

  async function polishVoiceTranscript(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return { text: "", raw: trimmed, changed: false };
    const recentContext =
      window.DeskCopilotVoiceContext?.formatRecentContext?.(chatHistory, 6) || "";
    let ruled = window.DeskCopilotVoiceInterpret?.applyVoiceRules?.(trimmed) || trimmed;
    ruled =
      window.DeskCopilotVoiceInterpret?.fixGreetingStt?.(ruled, recentContext) ||
      window.DeskCopilotVoiceInterpret?.fixGreetingStt?.(trimmed, recentContext) ||
      ruled;
    ruled =
      window.DeskCopilotVoiceContext?.applyContextualSttFixes?.(ruled, recentContext) || ruled;
    if (isChartReadCommand(ruled) || isChartReadCommand(trimmed)) {
      const route = normalizeChartReadCommand(ruled) || normalizeChartReadCommand(trimmed) || ruled;
      return {
        text: route,
        raw: trimmed,
        changed: route.toLowerCase() !== trimmed.toLowerCase(),
      };
    }
    if (
      (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(ruled)) ||
      (typeof needsScopedChartAnswer === "function" && needsScopedChartAnswer(ruled))
    ) {
      return {
        text: ruled,
        raw: trimmed,
        changed: ruled.toLowerCase() !== trimmed.toLowerCase(),
      };
    }
    if (shouldRouteCasual(trimmed) || shouldRouteCasual(ruled) || isCasualMessage(trimmed)) {
      return {
        text: ruled,
        raw: trimmed,
        changed: ruled.toLowerCase() !== trimmed.toLowerCase(),
      };
    }
    return {
      text: ruled,
      raw: trimmed,
      changed: ruled.toLowerCase() !== trimmed.toLowerCase(),
    };
  }

  let voiceTurnGen = 0;
  let voiceTurnBusy = false;
  let lastVoiceReplyAt = 0;
  let lastVoiceAckAt = 0;
  let lastVoiceAckText = "";
  const voiceLogLines = [];

  function voiceLog(...parts) {
    const line = `[${new Date().toLocaleTimeString()}] ${parts.map((p) => String(p)).join(" ")}`;
    voiceLogLines.push(line);
    if (voiceLogLines.length > 64) voiceLogLines.shift();
    const el = document.getElementById("dc-voice-log");
    if (el) {
      el.textContent = voiceLogLines.join("\n");
      el.scrollTop = el.scrollHeight;
    }
    console.log("[DeskCopilot]", line);
  }
  window.__dcVoiceLog = voiceLog;

  window.__dcUpdateLatencyPanel = (snapshot) => {
    const el = document.getElementById("dc-voice-latency");
    if (!el) return;
    el.textContent =
      window.DeskCopilotVoiceLatency?.formatDiagnosticsPanel?.(snapshot) ||
      "No voice turn recorded yet.";
  };

  window.__dcUpdateChartExportPanel = (trace) => {
    const el = document.getElementById("dc-chart-export-diagnostics");
    if (!el) return;
    el.textContent =
      window.DeskCopilotChartSnapshot?.formatExportDiagnosticsPanel?.(trace) ||
      "No chart export recorded yet.";
    const active = window.DeskCopilotRequestTrace?.getActiveTrace?.();
    if (active && trace) window.DeskCopilotRequestTrace.mergeChartExport(active, trace);
    window.__dcUpdateRequestTracePanel?.();
  };

  let lastSystemHealthRun = null;

  function traceRouteAndIntent(text, routeText) {
    const RT = window.DeskCopilotRequestTrace;
    const trace = RT?.getActiveTrace?.();
    if (!trace) return;
    const t0 = performance.now();
    const result = classifyUserRoute(text, routeText);
    const depth =
      window.DeskCopilotRoute?.classifyAnalysisDepth?.({ text, routeText: routeText || text }) ||
      undefined;
    const ms = Math.round(performance.now() - t0);
    RT.markStage(trace, "intent", {
      status: "pass",
      intent: result.detail || result.route,
      depth,
      ms,
    });
    RT.markStage(trace, "route", {
      status: "pass",
      route: result.route,
      detail: result.label,
      ms,
    });
    if (trace.performance.speechEndToTranscript != null) {
      trace.performance.transcriptToRoute = ms;
    }
  }

  function endRequestTrace(opts = {}) {
    const RT = window.DeskCopilotRequestTrace;
    const trace = RT?.getActiveTrace?.();
    if (!trace) return null;

    if (opts.voice !== false && trace.voice) {
      RT.mergeVoiceLatency(trace, window.__dcVoiceLatencyTrace);
    }

    if (opts.skipExport !== true) {
      const exportTrace =
        window.__dcChartExportTrace?.[window.__dcChartExportTrace.length - 1] || null;
      RT.mergeChartExport(trace, exportTrace);
    }

    if (opts.factIds?.length || opts.unknownFacts) {
      RT.mergeObservations(trace, opts.factIds, opts.unknownFacts);
    } else if (opts.skipObservations !== true && trace.stages.observations.status === "pending") {
      RT.mergeObservations(trace, null);
    }

    if (opts.groundingPath) {
      RT.markLlmGrounding(trace, opts.groundingPath, opts.grounded !== false);
    } else if (opts.skipGrounding !== true && trace.stages.llmGrounding.status === "pending") {
      RT.markLlmGrounding(trace, "stream", false);
    }

    if (trace.stages.response.status === "pending") {
      RT.markStage(trace, "response", {
        status: opts.fail ? "fail" : "pass",
        source: opts.source || "unknown",
        preview: String(opts.preview || "").slice(0, 120),
        reason: opts.reason,
      });
    }

    if (opts.failStage) {
      RT.markStage(trace, opts.failStage, { status: "fail", reason: opts.reason || "failed" });
    }

    return RT.finishRequest(trace);
  }

  function updateRequestTracePanel() {
    const RT = window.DeskCopilotRequestTrace;
    if (!RT) return;
    const latest = RT.getLatest();
    const traces = RT.getTraces();
    const liveEl = document.getElementById("dc-trace-live");
    const perfEl = document.getElementById("dc-trace-perf");
    const failEl = document.getElementById("dc-trace-failures");
    const regEl = document.getElementById("dc-trace-regression");
    if (liveEl) liveEl.textContent = RT.formatLivePipeline(latest);
    if (perfEl) perfEl.textContent = RT.formatPerformanceTable(traces);
    if (failEl) failEl.textContent = RT.formatFailures(traces);
    if (regEl) regEl.textContent = RT.formatRegressionTab(lastSystemHealthRun);
  }
  window.__dcUpdateRequestTracePanel = updateRequestTracePanel;

  function initTraceTabs() {
    const bar = document.querySelector(".dc-trace-tab-bar");
    if (!bar) return;
    bar.addEventListener("click", (e) => {
      const btn = e.target.closest(".dc-trace-tab");
      if (!btn) return;
      const tab = btn.dataset.tab;
      bar.querySelectorAll(".dc-trace-tab").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".dc-trace-panel").forEach((p) => {
        p.classList.toggle("active", p.dataset.panel === tab);
      });
    });
  }

  async function loadSystemHealthRun() {
    try {
      const stored = await chrome.storage.local.get("dcSystemHealthLastRun");
      if (stored?.dcSystemHealthLastRun) {
        lastSystemHealthRun = stored.dcSystemHealthLastRun;
      }
    } catch {
      /* ignore */
    }
    try {
      const url = chrome.runtime.getURL("system-health-latest.json");
      const res = await fetch(url);
      if (res.ok) {
        lastSystemHealthRun = await res.json();
        try {
          await chrome.storage.local.set({ dcSystemHealthLastRun: lastSystemHealthRun });
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    updateRequestTracePanel();
  }

  function analysisDepth(text, routeText) {
    return (
      window.DeskCopilotRoute?.classifyAnalysisDepth?.({ text, routeText: routeText || text }) ||
      "GENERAL_QUESTION"
    );
  }

  function isFastFactQuestion(text, routeText) {
    return analysisDepth(text, routeText) === "FAST_FACT";
  }

  function isDeepAnalysisQuestion(text, routeText) {
    return analysisDepth(text, routeText) === "DEEP_ANALYSIS";
  }

  /** Reuse recent snapshot when same intent class (MSS, NWOG, price, etc.). */
  function tryRelaxedSnapshotCache(question) {
    const cached = lastMarketSnapshotCache.data;
    if (!cached?.spoken || Date.now() - lastMarketSnapshotCache.ts > 60000) return null;
    const q = String(question || "").toLowerCase();
    const intent =
      typeof resolveSnapshotIntent === "function" ? resolveSnapshotIntent(question) : "";
    if (intent && cached.intent === intent) return cached;
    if (/\b(mss|structure shift|nwog|ndog|fvg|pdh|pdl|liquidity)\b/.test(q)) return cached;
    return null;
  }

  async function publishFastFactFailure(err, voice, turnGen) {
    const raw = err instanceof Error ? err.message : String(err);
    const msg =
      /offline|fetch failed|network/i.test(raw)
        ? offlineChatMessage()
        : /mask is not a function|internal server|500/i.test(raw)
          ? "Live market data is temporarily unavailable — hit RECONNECT or try again shortly."
          : `Couldn't fetch that from market state — ${raw}. Hit RECONNECT.`;
    setMsg("", null);
    await publishAssistantReply(msg, voice, { pauseMic: true, instant: true }, () =>
      setKarenPhase("listening")
    );
    if (turnGen != null && turnGen === voiceTurnGen) voiceTurnBusy = false;
  }

  function getLastUserText() {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === "user") return String(chatHistory[i].content || "").trim();
    }
    return "";
  }

  function chatMessagesForRequest(text) {
    const t = String(text || "").trim();
    const messages = chatHistory.slice();
    const last = messages.at(-1);
    if (last?.role === "user") {
      if (t && last.content.trim() !== t) last.content = t;
      return messages;
    }
    if (t) messages.push({ role: "user", content: t });
    return messages;
  }

  function needsLiveWebDataInline(text) {
    const normalized =
      window.DeskCopilotWeather?.normalizeWeatherStt?.(text) || String(text || "").trim();
    return (
      window.DeskCopilotCasual?.needsWebSearch?.(normalized) === true ||
      window.DeskCopilotWeather?.hasWeatherWithLocation?.(normalized) === true
    );
  }

  function resolveLiveSearchQuestion(text, routeText) {
    const candidates = [...new Set([routeText, text].map((t) => String(t || "").trim()).filter(Boolean))];
    for (const candidate of candidates) {
      const norm = window.DeskCopilotWeather?.normalizeWeatherStt?.(candidate) || candidate;
      const resolved =
        window.DeskCopilotPending?.resolveSearchQuestion?.(norm, chatHistory) ||
        window.DeskCopilotCasual?.resolveWebSearchQuestion?.(norm, chatHistory);
      const pick = resolved && resolved !== candidate ? resolved : norm;
      if (window.DeskCopilotCasual?.needsWebSearch?.(pick) || needsLiveWebDataInline(pick)) {
        return window.DeskCopilotWeather?.normalizeWeatherStt?.(pick) || pick;
      }
    }
    const pendingResolved =
      window.DeskCopilotPending?.resolveTurnQuestion?.(routeText || text, chatHistory) ||
      routeText ||
      text;
    return window.DeskCopilotWeather?.normalizeWeatherStt?.(pendingResolved) || pendingResolved;
  }

  function logVoiceWeatherRouting({ raw, routeText, needsSearch, searchQuestion }) {
    const query =
      needsSearch && searchQuestion
        ? window.DeskCopilotWeather?.buildSearchQuery?.(searchQuestion) || searchQuestion
        : "";
    voiceLog(
      needsSearch ? "weather voice:" : "casual voice:",
      `raw="${String(raw || "").slice(0, 72)}"`,
      `route="${String(routeText || "").slice(0, 72)}"`,
      `wantsLiveWebData=${needsSearch}`,
      query ? `query="${query.slice(0, 72)}"` : "query=(none)"
    );
  }

  function wantsLiveWebData(text, routeText) {
    const q = String(text || "").trim();
    if (window.DeskCopilotPending?.pendingNeedsLiveWebSearch?.(q, chatHistory) === true) return true;
    if (q && window.DeskCopilotCasual?.isClearlyTrading?.(q)) {
      if (!/\b(news|headline|why did|what happened|earnings|fed|cpi|nfp)\b/i.test(q)) return false;
    }
    const rt = String(routeText || "").trim();
    if (rt && rt !== q && window.DeskCopilotCasual?.isClearlyTrading?.(rt)) {
      if (!/\b(news|headline|why did|what happened|earnings|fed|cpi|nfp)\b/i.test(rt)) return false;
    }
    const texts = [...new Set([text, routeText].map((t) => String(t || "").trim()).filter(Boolean))];
    for (const t of texts) {
      if (window.DeskCopilotCasual?.wantsLiveWebData?.(t, chatHistory) === true) return true;
      if (window.DeskCopilotCasual?.needsWebSearch?.(t) === true) return true;
      if (needsLiveWebDataInline(t)) return true;
      const resolved = window.DeskCopilotCasual?.resolveWebSearchQuestion?.(t, chatHistory);
      if (resolved && resolved !== t) {
        if (window.DeskCopilotCasual?.needsWebSearch?.(resolved) === true) return true;
        if (needsLiveWebDataInline(resolved)) return true;
      }
    }
    return false;
  }

  const LIVE_DATA_FALLBACK_MSG =
    "Couldn't pull live data just now — give it another try in a moment.";

  function isWeatherQuestion(text) {
    return (
      window.DeskCopilotCasual?.isWeatherQuestion?.(text) === true || needsLiveWebDataInline(text)
    );
  }

  function isWeatherGuessReply(reply) {
    return window.DeskCopilotCasual?.isWeatherGuessReply?.(reply) === true;
  }

  function isLiveWeatherReply(reply) {
    return window.DeskCopilotCasual?.isLiveWeatherReply?.(reply) === true;
  }

  function isWeatherAmbiguousPrompt(text) {
    return (
      window.DeskCopilotCasual?.isWeatherAmbiguousPrompt?.(text) === true ||
      (/\bplaces called\b/i.test(String(text || "")) &&
        /\bwhich city or region\b/i.test(String(text || "")))
    );
  }

  function acceptLiveSearchReply(reply, question, routeText) {
    const text = String(reply || "").trim();
    if (!text) return "";
    const questions = [...new Set([question, routeText].map((t) => String(t || "").trim()).filter(Boolean))];
    const weatherQ = questions.some((q) => isWeatherQuestion(q));
    if (!weatherQ) return text;
    if (isLiveWeatherReply(text)) return text;
    if (/\bwhich city\b/i.test(text) && /\bweather\b/i.test(text)) return text;
    if (isWeatherAmbiguousPrompt(text)) return text;
    if (isWeatherGuessReply(text)) return "";
    if (text === LIVE_DATA_FALLBACK_MSG) return text;
    return "";
  }

  async function tryLocalWeatherWithMemory(searchQuestion) {
    const extras = await chatRequestExtras();
    const result = await window.DeskCopilotWeather?.tryLocalWeatherReply?.(searchQuestion, {
      memory: extras?.memory,
      history: chatHistory,
    });
    if (!result) return null;
    if (result.reply) return result;
    return result;
  }

  function logLiveSearchRouting(text, routeText, needsSearch) {
    const label = String(routeText || text || "").slice(0, 72);
    if (needsSearch) {
      voiceLog("live search: ON —", label);
      return;
    }
    if (isWeatherQuestion(text) || isWeatherQuestion(routeText)) {
      voiceLog("live search: SKIPPED (weather intent missed) —", label);
      return;
    }
    if (needsLiveWebDataInline(text) || (routeText && needsLiveWebDataInline(routeText))) {
      voiceLog("live search: SKIPPED (inline only, DeskCopilotCasual miss) —", label);
    }
  }

  let lastDeliveredSpeak = "";
  let lastDeliveredSpeakAt = 0;
  let voiceSpeakInFlight = "";
  let voiceSpeakSession = 0;
  let lastVoiceTurnRaw = "";
  let lastVoiceTurnRawAt = 0;

  function deliverVoiceReply(reply, onDone, opts = {}) {
    const bubbleTarget = resolveSpeakText(reply, opts);
    if (!bubbleTarget) {
      onDone?.();
      return Promise.resolve();
    }
    if (opts.fromBubble) {
      voiceLog("speak from bubble:", bubbleTarget.slice(0, 72));
    }
    voiceSpeakSession += 1;
    voiceSpeakInFlight = "";
    return deliverVoiceReplyNow(bubbleTarget, onDone, opts, voiceSpeakSession);
  }

  function resolveVoiceSpeakLine(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const spokenNorm = normalizeSpeakText(lastDeliveredSpeak);
    const targetNorm = normalizeSpeakText(raw);
    if (!spokenNorm) return raw;
    if (spokenNorm && targetNorm && isStaleStreamSuperset(spokenNorm, targetNorm)) {
      return raw;
    }
    if (isFullySpoken(raw, lastDeliveredSpeak)) return "";
    if (isRecentlySpoken(raw)) return "";
    const tail = remainderToSpeak(raw, lastDeliveredSpeak);
    if (tail && normalizeSpeakText(tail) !== targetNorm) return tail;
    return raw;
  }

  function sanitizeSpokenForVoice(text, opts = {}) {
    const raw = stripAssistantNamePrefix(String(text || "").trim());
    if (!raw) return "";
    return (
      window.DeskCopilotVoiceSpokenSanitize?.sanitizeSpokenBrief?.(raw, opts) ||
      raw.replace(/^META:.*$/gim, "").trim()
    );
  }

  function deliverVoiceReplyNow(bubbleTarget, onDone, opts, session) {
    if (!voiceReady || !window.DeskCopilotVoice?.autoRead) {
      voiceLog("speak blocked — voiceReady:", voiceReady, "autoRead:", window.DeskCopilotVoice?.autoRead);
      onDone?.();
      return Promise.resolve();
    }
    if (session !== voiceSpeakSession) {
      voiceLog("speak superseded");
      onDone?.();
      return Promise.resolve();
    }
    const now = Date.now();
    let speakLine = resolveVoiceSpeakLine(bubbleTarget);
    if (!speakLine) {
      voiceLog("speak deduped (prefix or bubble already delivered)");
      onDone?.();
      return Promise.resolve();
    }
    if (opts.deskBrief === true || opts.sanitizeSpoken === true) {
      speakLine = sanitizeSpokenForVoice(speakLine, {
        levelsQuestion: opts.levelsQuestion === true,
      });
      if (!speakLine) {
        onDone?.();
        return Promise.resolve();
      }
    }
    if (speakLine !== bubbleTarget) {
      voiceLog("speak tail only:", speakLine.slice(0, 72));
    }
    const speakNorm = normalizeSpeakText(speakLine);
    if (speakNorm && voiceSpeakInFlight === speakNorm) {
      voiceLog("speak deduped (in-flight)");
      onDone?.();
      return Promise.resolve();
    }
    voiceSpeakInFlight = speakNorm;
    window.__dcVoiceLatencyMark?.("tts_playback");
    syncVoiceHeroUI("speaking");
    window.DeskCopilotVoice?.primeAudioPlayback?.();
    if (!opts.continueSpeech && !opts.skipCancel) {
      window.DeskCopilotVoice?.cancelSpeech?.();
      window.DeskCopilotRealtime?.cancelActiveResponse?.();
    }
    suppressAssistantEchoUntil = Date.now() + 350;
    lastVoiceReplyAt = now;
    const pauseMic =
      window.DeskCopilotVoiceQuickReply?.shouldPauseMicForReply?.(speakLine, opts) ??
      (opts.pauseMic !== false && speakLine.length >= 120);
    const pauseMs = pauseMic
      ? speakLine.length <= 120
        ? Math.min(12000, speakLine.length * 95 + 3000)
        : Math.min(45000, Math.max(25000, speakLine.length * 95 + 8000))
      : 0;
    const emotion = window.DeskCopilotVoiceEmotion?.speechEmotionFor?.(speakLine);
    const useInstant =
      window.DeskCopilotVoiceQuickReply?.prefersInstantVoice?.(speakLine, {
        instant: opts.instant,
        vercelTts: opts.vercelTts === true,
        preferApiTts: emotion?.preferApiTts,
      }) ?? (opts.instant !== false && speakLine.length <= 520);
    const speed =
      opts.slowSpeech === true
        ? 0.82
        : typeof opts.speed === "number"
          ? opts.speed
          : opts.deskBrief === true
            ? DESK_VERDICT_SPEAK_SPEED
            : 0.92;
    const ttsPrefetch =
      !useInstant && window.DeskCopilotVoice?.prefetchTtsAudio
        ? window.DeskCopilotVoice.prefetchTtsAudio(speakLine, speed, emotion?.instructions)
        : null;
    if (pauseMic) {
      queueMicrotask(() => {
        if (session !== voiceSpeakSession) return;
        window.DeskCopilotRealtime?.setMicPaused?.(true, { maxMs: pauseMs });
      });
    }
    const speakOpts = {
      instant: useInstant,
      pauseMic,
      speed,
      browserRate: opts.deskBrief === true ? DESK_BROWSER_TTS_RATE : opts.browserRate,
      ttsPrefetch,
    };
    voiceLog(
      "speak:",
      speakLine.slice(0, 72),
      speakOpts.instant ? "(instant)" : pauseMic ? "(mic paused)" : "(mic live)"
    );
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done || session !== voiceSpeakSession) return;
        done = true;
        clearTimeout(safetyTimer);
        if (voiceSpeakInFlight === speakNorm) voiceSpeakInFlight = "";
        markDeliveredSpeak(bubbleTarget);
        const echoUntil =
          Date.now() +
          (window.DeskCopilotVoiceQuickReply?.echoSuppressTailMs?.(bubbleTarget) ?? 2000);
        suppressAssistantEchoUntil = echoUntil;
        window.DeskCopilotRealtime?.setSuppressEchoUntil?.(echoUntil);
        window.DeskCopilotRealtime?.forceResumeListening?.("speak-done");
        syncVoiceHeroUI(window.DeskCopilotVoice?.isListening?.() ? "listening" : "idle");
        onDone?.();
        resolve();
      };
      const safetyTimer = setTimeout(() => {
        voiceLog("speak safety timeout — mic unpaused");
        finish();
      }, Math.max(25000, speakLine.length * 95 + 10000));
      window.DeskCopilotVoice.speak(speakLine, finish, speakOpts);
    });
  }

  function transcriptsDifferMeaningfully(a, b) {
    const x = String(a || "").trim().toLowerCase();
    const y = String(b || "").trim().toLowerCase();
    if (!x || !y || x === y) return false;
    if (x.includes(y) || y.includes(x)) return false;
    return true;
  }

  function normalizeSpeakText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isRecentlySpoken(text, windowMs = 12000) {
    const norm = normalizeSpeakText(text);
    if (!norm || !lastDeliveredSpeak) return false;
    if (/couldn t pull live data just now/i.test(norm)) return false;
    if (Date.now() - lastDeliveredSpeakAt >= windowMs) return false;
    if (norm === lastDeliveredSpeak) return true;
    if (isStaleStreamSuperset(lastDeliveredSpeak, norm)) return false;
    // Only skip when we already spoke this line or a longer superset — never when bubble grew.
    if (lastDeliveredSpeak.length >= norm.length && lastDeliveredSpeak.includes(norm)) return true;
    return false;
  }

  function isStaleStreamSuperset(spokenNorm, targetNorm) {
    if (!spokenNorm || !targetNorm) return false;
    if (spokenNorm.length <= targetNorm.length + 8) return false;
    if (!spokenNorm.includes(targetNorm)) return false;
    const extra = spokenNorm.startsWith(targetNorm)
      ? spokenNorm.slice(targetNorm.length).trim()
      : spokenNorm.replace(targetNorm, " ").replace(/\s+/g, " ").trim();
    if (!extra) return false;
    return /\b(back on track|turn to the nasdaq|on the nasdaq futures chart|do you want a read on the nasdaq|micro e-mini nasdaq)\b/.test(
      extra
    );
  }

  function streamVoiceSpeakTarget(bubbleText) {
    return String(bubbleText || "").trim();
  }

  function shouldStreamVoiceSpeak(bubbleText) {
    const target = normalizeSpeakText(bubbleText);
    if (!target) return false;
    const spoken = normalizeSpeakText(lastDeliveredSpeak);
    if (!spoken) return true;
    if (target === spoken) return false;
    if (Date.now() - lastDeliveredSpeakAt >= 12000) return true;
    if (isStaleStreamSuperset(spoken, target)) return true;
    if (isFullySpoken(bubbleText, lastDeliveredSpeak)) return false;
    if (isRecentlySpoken(bubbleText)) return false;
    return true;
  }

  function shouldPublishVoiceSpeak(toSpeak) {
    const target = String(toSpeak || "").trim();
    if (!target) return false;
    const spoken = normalizeSpeakText(lastDeliveredSpeak);
    const targetNorm = normalizeSpeakText(target);
    if (spoken && targetNorm && spoken !== targetNorm && isStaleStreamSuperset(spoken, targetNorm)) {
      return true;
    }
    if (isFullySpoken(target, lastDeliveredSpeak)) return false;
    if (isRecentlySpoken(target)) return false;
    return true;
  }

  function isFullySpoken(target, spoken) {
    const t = normalizeSpeakText(target);
    const s = normalizeSpeakText(spoken);
    if (!t) return true;
    if (!s) return false;
    if (t === s) return true;
    if (isStaleStreamSuperset(s, t)) return false;
    // Stream TTS may include steer-back stripped from the bubble — spoken superset still covers target.
    if (s.startsWith(t)) return true;
    const shorter = Math.min(t.length, s.length);
    const longer = Math.max(t.length, s.length);
    if (shorter / longer >= 0.92 && t.startsWith(s)) return true;
    return false;
  }

  function remainderAfterSpokenPrefix(raw, spoken) {
    const targetNorm = normalizeSpeakText(raw);
    const spokeNorm = normalizeSpeakText(spoken);
    if (!spokeNorm || !targetNorm.startsWith(spokeNorm) || spokeNorm.length >= targetNorm.length) {
      return "";
    }
    const parts = raw.match(/\S+\s*/g) || [raw];
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc += parts[i];
      const norm = normalizeSpeakText(acc);
      if (norm === spokeNorm) {
        return parts.slice(i + 1).join("").trim();
      }
      if (spokeNorm.startsWith(norm)) continue;
      if (norm.startsWith(spokeNorm)) {
        return raw.slice(acc.length).trim();
      }
      break;
    }
    const ratio = spokeNorm.length / targetNorm.length;
    return raw.slice(Math.min(raw.length, Math.floor(raw.length * ratio))).trim();
  }

  function remainderToSpeak(target, spoken) {
    const raw = String(target || "").trim();
    if (!raw || isFullySpoken(raw, spoken)) return "";
    const spokeNorm = normalizeSpeakText(spoken);
    const targetNorm = normalizeSpeakText(raw);
    if (spokeNorm && spokeNorm.startsWith(targetNorm)) return "";
    if (spokeNorm && targetNorm.startsWith(spokeNorm) && spokeNorm.length < targetNorm.length) {
      const prefixRest = remainderAfterSpokenPrefix(raw, spoken);
      if (prefixRest) return prefixRest;
    }
    const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
    let skip = 0;
    for (let i = 0; i < sentences.length; i++) {
      const chunk = normalizeSpeakText(sentences.slice(0, i + 1).join(" "));
      if (!spokeNorm) break;
      if (chunk === spokeNorm || spokeNorm.startsWith(chunk) || chunk === spokeNorm.slice(0, chunk.length)) {
        skip = i + 1;
        continue;
      }
      break;
    }
    if (skip >= sentences.length) return "";
    const rest = sentences.slice(skip).join(" ").trim();
    if (rest) return rest;
    if (spokeNorm && targetNorm.startsWith(spokeNorm)) {
      return remainderAfterSpokenPrefix(raw, spoken);
    }
    return "";
  }

  function markDeliveredSpeak(text) {
    const norm = normalizeSpeakText(text);
    if (!norm) return;
    lastDeliveredSpeak = norm;
    lastDeliveredSpeakAt = Date.now();
  }

  const STT_DEDUP_MS = 8000;

  function isSttExtension(shorter, longer) {
    const s = String(shorter || "").trim().toLowerCase();
    const l = String(longer || "").trim().toLowerCase();
    if (!s || !l || l.length <= s.length) return false;
    return l.startsWith(s);
  }

  function isDuplicateSttTranscript(norm) {
    if (window.DeskCopilotVoiceQuickReply?.shouldDedupeSttTranscript) {
      return window.DeskCopilotVoiceQuickReply.shouldDedupeSttTranscript({
        norm,
        lastVoiceTurnRaw,
        lastVoiceTurnRawAt,
        lastVoiceReplyAt,
        voiceTurnBusy,
        sttDedupMs: STT_DEDUP_MS,
      });
    }
    if (!lastVoiceTurnRaw || Date.now() - lastVoiceTurnRawAt > STT_DEDUP_MS) return false;
    if (norm === lastVoiceTurnRaw) return true;
    if (!sttTranscriptsRelated(norm, lastVoiceTurnRaw)) return false;
    if (isSttExtension(lastVoiceTurnRaw, norm)) return false;
    if (norm.length > lastVoiceTurnRaw.length + 12) return false;
    if (norm.length <= lastVoiceTurnRaw.length + 2) return true;
    if (voiceTurnBusy && norm.length <= lastVoiceTurnRaw.length + 12) return true;
    if (Date.now() - lastVoiceReplyAt < STT_DEDUP_MS && norm.length <= lastVoiceTurnRaw.length + 12) {
      return true;
    }
    return false;
  }

  function replaceLastAssistantReply(text) {
    const t = displayText(text).trim();
    if (!t) return;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === "assistant") {
        chatHistory[i].content = t;
        break;
      }
    }
    const chat = document.getElementById("dc-chat");
    const bots = chat?.querySelectorAll(".dc-bubble-bot");
    const bubble = bots?.[bots.length - 1];
    if (bubble) setBubbleText(bubble, t);
    lastRecordedAssistantText = t.toLowerCase();
    lastRecordedAssistantAt = Date.now();
  }

  let lastInterimStt = "";

  function sttTranscriptsRelated(a, b) {
    const x = String(a || "").trim().toLowerCase();
    const y = String(b || "").trim().toLowerCase();
    if (!x || !y) return false;
    if (x === y) return true;
    return x.startsWith(y) || y.startsWith(x);
  }

  function mergeSttTranscript(finalRaw, interimRaw) {
    const fin = String(finalRaw || "").trim();
    const interim = String(interimRaw || "").trim();
    if (!interim) return fin;
    if (!fin) return interim;
    if (!sttTranscriptsRelated(fin, interim)) return fin;
    if (isSttExtension(fin, interim)) return interim;
    if (isSttExtension(interim, fin)) return fin;
    return fin;
  }

  function logSttPipeline(stage, parts) {
    const bits = Object.entries(parts || {})
      .filter(([, v]) => v != null && String(v).trim())
      .map(([k, v]) => `${k}=${String(v).slice(0, 56)}`);
    if (bits.length) voiceLog(`STT ${stage}:`, bits.join(" | "));
  }

  function sanitizeUserInput(text) {
    return window.DeskCopilotTranscriptGuard?.sanitizeUserTranscript?.(text) ?? String(text || "").trim();
  }

  function shouldDropUserInput(text) {
    return window.DeskCopilotTranscriptGuard?.shouldDropUserTranscript?.(text) === true;
  }

  async function recordVoiceTranscript(sttRaw) {
    const interimSnap = lastInterimStt;
    const heard = mergeSttTranscript(sttRaw, lastInterimStt);
    lastInterimStt = "";
    if (!heard) return { text: "", routeText: "", corrected: false, sttClean: true };

    const cleanedHeard = sanitizeUserInput(heard);
    if (!cleanedHeard) {
      if (shouldDropUserInput(heard)) {
        logSttPipeline("ignored", { raw: heard, reason: "tv-disclaimer" });
      }
      return { text: "", routeText: "", corrected: false, sttClean: true };
    }

    const canonical =
      window.DeskCopilotVoiceInterpret?.applyCanonicalVoiceRules?.(cleanedHeard) ||
      window.DeskCopilotVoiceInterpret?.applyVoiceRules?.(cleanedHeard) ||
      cleanedHeard;
    const canonicalClean = canonical.replace(/\s+/g, " ").trim();

    logSttPipeline("pipeline", {
      raw: sttRaw,
      interim: interimSnap && interimSnap !== heard ? interimSnap : "",
      merged: heard,
      canonical: canonicalClean,
    });

    const recentContext =
      window.DeskCopilotVoiceContext?.formatRecentContext?.(chatHistory, 6) || "";
    const sttClean =
      window.DeskCopilotVoiceInterpret?.needsInterpret?.(canonicalClean, recentContext) !== true;

    let routeText = canonicalClean;
    if (sttClean) {
      window.__dcVoiceLatencyMark?.("interpret_skip");
      routeText = window.DeskCopilotWeather?.normalizeWeatherStt?.(canonicalClean) || canonicalClean;
    } else {
      window.__dcVoiceLatencyMark?.("interpret_start");
      const polish = await polishVoiceTranscript(cleanedHeard);
      routeText = polish.text || canonicalClean;
      routeText = window.DeskCopilotWeather?.normalizeWeatherStt?.(routeText) || routeText;
      window.__dcVoiceLatencyMark?.("interpret_done");
      if (polish.changed && routeText.toLowerCase() !== canonicalClean.toLowerCase()) {
        logSttPipeline("route", { canonical: canonicalClean, route: routeText });
      }
    }

    const now = Date.now();
    const last = chatHistory.at(-1);
    if (last?.role === "user" && now - lastRecordedUserAt < 4000) {
      const previousText = String(last.content || "").trim();
      if (
        previousText &&
        transcriptsDifferMeaningfully(previousText, canonicalClean) &&
        sttTranscriptsRelated(previousText, canonicalClean)
      ) {
        last.content = canonicalClean;
        lastVoiceTranscript = canonicalClean;
        const chat = document.getElementById("dc-chat");
        const bubbles = chat?.querySelectorAll(".dc-bubble-user");
        const bubble = bubbles?.[bubbles.length - 1];
        if (bubble) setBubbleText(bubble, canonicalClean);
        return {
          text: canonicalClean,
          routeText,
          corrected: true,
          previousText,
          sttClean,
        };
      }
    }

    recordUserTranscript(canonicalClean);
    lastVoiceTranscript = canonicalClean;
    return { text: canonicalClean, routeText, corrected: false, sttClean };
  }

  function startMarkLevelsNonBlocking() {
    if (levelsBusy) {
      return karenAck("levels_busy");
    }
    setKarenPhase("marking_levels");
    void drawLevels({ voice: true });
    return karenAck("mark_levels");
  }

  let msgQueue = [];
  let processingQueue = false;

  function trimHistory() {
    if (chatHistory.length > 24) chatHistory = chatHistory.slice(-24);
  }

  function enqueueUserMessage(text, opts = {}) {
    const cleaned = sanitizeUserInput(text);
    if (!cleaned || shouldDropUserInput(text)) return;
    const t = cleaned.trim();
    if (!t) return;
    if (msgQueue.length && msgQueue[msgQueue.length - 1].text === t) return;

    if (!opts.skipBubble) {
      appendChatBubble("user", t);
      chatHistory.push({ role: "user", content: t });
      trimHistory();
      void window.DeskCopilotMemory?.rememberExchange?.(t, "");
    }

    msgQueue.push({ text: t, voice: opts.voice === true });
    if (msgQueue.length > 1) {
      setMsg(`Queued (${msgQueue.length})…`, null);
    }
    drainQueue();
  }

  async function drainQueue() {
    if (processingQueue) return;
    processingQueue = true;
    try {
      while (msgQueue.length > 0) {
        const peek = msgQueue[0];
        const peekNeedsChart = peek ? messageNeedsChartRead(peek.text) : false;
        while (voiceTurnBusy) {
          const why = busyReason();
          if (why) setMsg(`Queued — ${why}`, null);
          await new Promise((r) => setTimeout(r, 200));
        }
        while (verdictBusy && peekNeedsChart) {
          setMsg("Queued — a chart read is running (wait for the brief or cancel)", null);
          await new Promise((r) => setTimeout(r, 200));
        }
        const item = msgQueue.shift();
        try {
          await handleUserMessage(item);
        } catch (e) {
          voiceLog("handleUserMessage uncaught:", e?.message || e);
          cancelActiveChatStream("uncaught");
          resetChatUiLoading();
          const friendly = explainError(e, "chat");
          setMsg(friendly, false);
          if (!item?.voice) recordAssistantReply(friendly);
        }
      }
    } finally {
      processingQueue = false;
      if (msgQueue.length > 0) drainQueue();
    }
  }

  function lastAssistantText() {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === "assistant") return chatHistory[i].content;
    }
    return "";
  }

  /** DOM is authoritative — chatHistory can lag during stream finalize. */
  function lastAssistantBubbleDom() {
    const bots = document.getElementById("dc-chat")?.querySelectorAll(".dc-bubble-bot");
    const last = bots?.[bots.length - 1];
    const body = last?.querySelector(".dc-bubble-body");
    return (body?.textContent || last?.textContent || "").trim();
  }

  function resolveSpeakText(reply, opts = {}) {
    if (opts.fromBubble) {
      return (lastAssistantBubbleDom() || lastAssistantText() || String(reply || "")).trim();
    }
    return String(reply || "").trim();
  }

  function chartReadContext() {
    return { lastAssistant: lastAssistantText() };
  }

  function applyUnderstood(raw, understood) {
    if (!understood || understood === raw) return;
    const last = chatHistory.at(-1);
    if (last?.role === "user") last.content = understood;
    setMsg(`Understood: "${understood}"`, true);
  }

  function isCasualMessage(text) {
    return window.DeskCopilotCasual?.isCasualMessage?.(text, chatHistory) === true;
  }

  function sanitizeCasualReply(text, question) {
    const recent = chatHistory
      .slice(-6)
      .map((m) => m.content)
      .join(" ");
    return (
      window.DeskCopilotCasual?.sanitizeCasualReply?.(text, question, chatHistory) ||
      localCasualReply(text)
    );
  }

  function localCasualReply(text) {
    return (
      window.DeskCopilotCasual?.localCasualReply?.(text, chatHistory) ||
      window.DeskCopilotCasual?.CASUAL_LLM_FAILURE_REPLY ||
      "I'm having trouble responding right now — try that again."
    );
  }

  function shouldSpeakReply(voice) {
    return voice && voiceReady && window.DeskCopilotVoice?.autoRead;
  }

  function isVoiceSessionActive() {
    return (
      window.DeskCopilotVoice?.isListening?.() ||
      window.DeskCopilotRealtime?.isActive?.() ||
      window.DeskCopilotRealtime?.wantsActive?.()
    );
  }

  /** Button UI acks — short browser TTS on every click (independent of auto-read). */
  function shouldSpeakUiFeedback() {
    return Boolean(window.speechSynthesis);
  }

  function acceptApiCasualReply(apiReply, question) {
    const raw = String(apiReply || "").trim();
    if (!raw) return null;
    const stripped = window.DeskCopilotCasual?.stripSteerBack?.(raw) ?? raw;
    if (!stripped || stripped.length < 4) return null;
    if (window.DeskCopilotCasual?.isPersonaQuestion?.(question) && window.DeskCopilotCasual?.isTradingRedirect?.(stripped)) {
      return null;
    }
    if (window.DeskCopilotCasual?.isGenericReply?.(stripped)) return null;
    if (isWeatherQuestion(question) && !acceptLiveSearchReply(stripped, question)) return null;
    return stripped;
  }

  function canUseInstantLocal(text) {
    const cleaned = sanitizeUserInput(text);
    if (!cleaned) return false;
    if (window.DeskCopilotCasual?.isFarewell?.(cleaned)) return true;
    if (window.DeskCopilotCasual?.isGreeting?.(cleaned)) return true;
    return false;
  }

  function karenWorkingAck(key) {
    return window.DeskCopilotPersona?.karenWorkingAck?.(key) || "";
  }

  function normalizeVoiceAck(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ");
  }

  function shouldSkipVoiceAck(line) {
    const now = Date.now();
    if (now - lastVoiceAckAt >= 2000) return false;
    const a = normalizeVoiceAck(line);
    const b = normalizeVoiceAck(lastVoiceAckText);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function voiceSpeakAck(text) {
    if (!voiceReady || !window.DeskCopilotVoice?.autoRead) return;
    const line = String(text || "").trim();
    if (!line || shouldSkipVoiceAck(line)) return;
    lastVoiceAckAt = Date.now();
    lastVoiceAckText = line;
    suppressAssistantEchoUntil = Date.now() + 3200;
    window.DeskCopilotVoice?.speakAck?.(line);
  }

  /** True while a user turn or heavy desk job should not compete with background refresh. */
  function isUserRequestBusy() {
    return verdictBusy || chatBusy || levelsBusy || voiceTurnBusy;
  }

  /** Delayed ack when async work may leave dead air. Cancel once work starts. */
  function beginVoiceWorkingAck(key, delayMs = 1500) {
    if (!voiceReady || !window.DeskCopilotVoice?.autoRead) {
      return { cancel() {} };
    }
    let cancelled = false;
    const phrase = karenWorkingAck(key);
    const timer = setTimeout(() => {
      if (!cancelled && phrase) voiceSpeakAck(phrase);
    }, delayMs);
    return {
      cancel() {
        cancelled = true;
        clearTimeout(timer);
      },
    };
  }

  /** Spoken UI feedback on button clicks — always short browser TTS when available. */
  function karenUiAck(key) {
    return window.DeskCopilotPersona?.karenUiAck?.(key) || "";
  }

  function speakUiFeedback(text, onDone) {
    const line = String(text || "").trim();
    if (!line) {
      onDone?.();
      return;
    }
    if (!shouldSpeakUiFeedback()) {
      onDone?.();
      return;
    }
    lastVoiceAckAt = Date.now();
    lastVoiceAckText = line;
    window.DeskCopilotVoice?.primeAudioPlayback?.();
    if (!window.speechSynthesis) {
      onDone?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 1.05;
      u.lang =
        typeof navigator !== "undefined" &&
        navigator.language &&
        /^en(-|$)/i.test(navigator.language)
          ? navigator.language
          : "en-US";
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        onDone?.();
      };
      u.onend = finish;
      u.onerror = finish;
      setTimeout(finish, Math.min(8000, line.length * 90 + 1500));
      window.speechSynthesis.speak(u);
    } catch {
      onDone?.();
    }
  }

  /** Instant browser ack from raw STT — before interpret/record (target under 500ms). Does not pause mic. */
  function voiceEarlyAck(raw) {
    if (window.DeskCopilotVoiceQuickReply?.isQuickAffirmation?.(String(raw || "").trim().toLowerCase())) {
      return;
    }
    const canon =
      window.DeskCopilotVoiceInterpret?.applyVoiceRules?.(raw) ||
      window.DeskCopilotVoiceInterpret?.applyCanonicalVoiceRules?.(raw) ||
      raw;
    const route = window.DeskCopilotWeather?.normalizeWeatherStt?.(canon) || canon;
    const depth =
      window.DeskCopilotRoute?.classifyAnalysisDepth?.({ text: route, routeText: route }) ||
      "GENERAL_QUESTION";

    if (/\b(mark|draw|show) levels\b/i.test(route)) return;

    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(route)) return;
    if (typeof needsScopedChartAnswer === "function" && needsScopedChartAnswer(route)) {
      if (depth === "FAST_FACT") {
        window.__dcVoiceLatencyMark?.("voice_ack");
        voiceSpeakAck(karenWorkingAck("snapshot"));
      }
      return;
    }

    const ackKey = window.DeskCopilotRoute?.voiceAckKeyForDepth?.(depth);
    if (ackKey) {
      window.__dcVoiceLatencyMark?.("voice_ack");
      voiceSpeakAck(karenWorkingAck(ackKey));
      return;
    }

    if (isChartReadCommand(route) || needsFullChartRead(route, chartReadContext())) {
      voiceSpeakAck(karenWorkingAck("chart_read"));
      return;
    }

    if (wantsLiveWebData(canon, route) || wantsLiveWebData(raw, route)) {
      voiceSpeakAck(karenWorkingAck("lookup"));
      return;
    }

    // Casual, price, and default streaming LLM — no instant ack; slow paths speak later if needed.
    if (shouldRouteCasual(canon, route) || shouldRouteCasual(raw, route)) return;
    if (isPriceQuestion(route)) return;
    if (canUseInstantLocal(canon) || canUseInstantLocal(route)) return;
  }

  function voiceThinkingAck(needsSearch) {
    if (!needsSearch) return;
    return beginVoiceWorkingAck("lookup", 1200);
  }

  let streamAssistantBubble = null;

  function resetStreamingAssistant() {
    streamAssistantBubble = null;
  }

  function updateStreamingAssistant(text, opts = {}) {
    const raw = stripAssistantNamePrefix(displayText(text).trim());
    if (!raw) return;
    const out =
      opts.final && opts.casual !== false ? assistantBubbleText(raw) || raw : raw;
    if (!out) return;
    const chat = document.getElementById("dc-chat");
    if (!streamAssistantBubble) {
      streamAssistantBubble = createBubbleElement("assistant", out);
      chat.appendChild(streamAssistantBubble);
      chatHistory.push({ role: "assistant", content: out });
    } else {
      setBubbleText(streamAssistantBubble, out);
      const last = chatHistory.at(-1);
      if (last?.role === "assistant") last.content = out;
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function finalizeStreamingAssistant(text, opts = {}) {
    let out =
      opts.casual !== false ? assistantBubbleText(text) : displayText(text).trim();
    if (!out) return "";
    if (window.DeskCopilotCasual?.isTradingRedirect?.(out)) {
      const lastUser = getLastUserText();
      out = lastUser ? sanitizeCasualReply(text, lastUser) : "";
      if (!out) return "";
    }
    if (streamAssistantBubble) {
      setBubbleText(streamAssistantBubble, out);
      const last = chatHistory.at(-1);
      if (last?.role === "assistant") last.content = out;
    } else {
      recordAssistantReply(out);
    }
    lastRecordedAssistantText = out.toLowerCase();
    lastRecordedAssistantAt = Date.now();
    streamAssistantBubble = null;
    void rememberLastExchange(out);
    return out;
  }

  function streamChatFromPort(payload, onSse) {
    return new Promise((resolve, reject) => {
      let port;
      let finished = false;
      let timeoutId = null;
      const result = { reply: "", needsChartRead: false, question: "" };

      const finish = (err) => {
        if (finished) return;
        finished = true;
        if (timeoutId) clearTimeout(timeoutId);
        if (activeChatStreamPort === port) activeChatStreamPort = null;
        try {
          port?.disconnect();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve(result);
      };

      timeoutId = setTimeout(() => {
        finish(
          new Error(
            "Chat timed out after 90 seconds — click RECONNECT and try again."
          )
        );
      }, CHAT_STREAM_TIMEOUT_MS);

      try {
        port = chrome.runtime.connect({ name: "desk-copilot-chat-stream" });
        activeChatStreamPort = port;
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }

      port.onMessage.addListener((msg) => {
        if (msg.type === "sse") {
          const data = msg.data || {};
          onSse?.(data, result);
          if (data.type === "done") result.reply = data.reply || result.reply;
        } else if (msg.type === "json") {
          const data = msg.data || {};
          if (data.needsChartRead) {
            result.needsChartRead = true;
            result.question = data.question || "";
          } else {
            result.reply = data.reply || result.reply;
          }
        } else if (msg.type === "done") {
          finish();
        } else if (msg.type === "error") {
          finish(new Error(msg.error || "Stream failed"));
        }
      });

      port.onDisconnect.addListener(() => {
        if (activeChatStreamPort === port) activeChatStreamPort = null;
        if (!finished) finish(new Error("Stream disconnected"));
      });

      port.postMessage({ type: "START", ...payload });
    });
  }

  async function runStreamingChat(payload, opts = {}) {
    const voice = opts.voice === true;
    const turnGen = opts.turnGen;
    let full = "";
    let streamError = null;
    const ackKey = opts.workingAckKey || null;
    const workingAck =
      voice && ackKey
        ? beginVoiceWorkingAck(ackKey, opts.workingAckDelayMs ?? 1500)
        : { cancel() {} };
    if (voice && shouldSpeakReply(voice)) {
      window.DeskCopilotVoice?.cancelSpeech?.();
      lastDeliveredSpeak = "";
      lastDeliveredSpeakAt = 0;
      voiceSpeakSession += 1;
      window.DeskCopilotVoice?.primeAudioPlayback?.();
    }
    // Stream bubble live; speak first sentence early, tail at finalize.
    resetStreamingAssistant();
    let streamEarlySpoke = false;

    const streamCasual = opts.casual !== false;
    try {
      const result = await streamChatFromPort(payload, (data, acc) => {
        if (turnGen != null && turnGen !== voiceTurnGen) return;
        if (data.type === "understood" && opts.lastUser) {
          applyUnderstood(opts.lastUser, data.text);
        } else if (data.type === "delta") {
          if (data.text) workingAck.cancel();
          full += data.text || "";
          acc.reply = full;
          window.__dcVoiceLatencyMark?.("first_sse_token");
          updateStreamingAssistant(full, { casual: streamCasual });
          if (
            voice &&
            shouldSpeakReply(voice) &&
            !streamEarlySpoke &&
            window.DeskCopilotVoiceQuickReply?.extractFirstCompleteSentence
          ) {
            const first = window.DeskCopilotVoiceQuickReply.extractFirstCompleteSentence(full);
            if (first && shouldStreamVoiceSpeak(first)) {
              streamEarlySpoke = true;
              window.__dcVoiceLatencyMark?.("tts_start");
              void deliverVoiceReplyNow(first, () => {}, {
                continueSpeech: true,
                skipCancel: true,
                pauseMic: true,
                instant: first.length <= 520,
              }, voiceSpeakSession);
            }
          }
        } else if (data.type === "done") {
          workingAck.cancel();
          full = data.reply || full;
          acc.reply = full;
          if (full) updateStreamingAssistant(full, { casual: streamCasual, final: true });
        } else if (data.type === "error") {
          workingAck.cancel();
          streamError = new Error(data.error || "Stream failed");
        }
      });

      if (streamError) throw streamError;

      if (turnGen != null && turnGen !== voiceTurnGen) {
        resetStreamingAssistant();
        return null;
      }

      if (result.needsChartRead) {
        resetStreamingAssistant();
        return result;
      }

      full = (result.reply || full).trim();
      const reply = opts.casual ? acceptApiCasualReply(full, opts.lastUser) || full : full;
      if (opts.casual && opts.lastUser && isWeatherQuestion(opts.lastUser)) {
        const accepted = acceptLiveSearchReply(reply, opts.lastUser);
        if (!accepted) throw new Error("Weather guess blocked — live search required");
      }
      if (!reply) throw new Error("Empty reply from desk — try again");

      const finalText = finalizeStreamingAssistant(reply, { casual: opts.casual !== false });
      suppressAssistantEchoUntil = Date.now() + (voice ? 3000 : 4000);
      lastVoiceReplyAt = Date.now();

      if (voice && shouldSpeakReply(voice)) {
        const toSpeak = streamVoiceSpeakTarget(
          lastAssistantBubbleDom() || lastAssistantText() || finalText
        );
        if (toSpeak && shouldStreamVoiceSpeak(toSpeak)) {
          if (!streamEarlySpoke) window.__dcVoiceLatencyMark?.("tts_start");
          voiceLog("stream speak once:", toSpeak.slice(0, 72));
          await deliverVoiceReply("", () => setKarenPhase("listening"), {
            fromBubble: true,
            pauseMic: true,
            instant: toSpeak.length <= 520,
          });
        } else {
          if (toSpeak) voiceLog("stream speak skipped — already spoken");
          setKarenPhase("listening");
        }
      }

      return { reply: finalText || reply, needsChartRead: false, question: "" };
    } finally {
      workingAck.cancel();
      if (voice) window.DeskCopilotVoiceLatency?.endTurn?.("reply_complete");
    }
  }

  async function fetchLiveSearchReply(payload, timeoutMs = 90000) {
    const res = await bgSend(
      {
        type: "CHAT",
        messages: payload.messages,
        symbol: payload.symbol,
        voiceInput: payload.voiceInput === true,
        casualOnly: true,
        wantsLiveWebData: payload.wantsLiveWebData === true,
        searchQuery: payload.searchQuery || undefined,
        memory: payload.memory,
        chartLastPrice: payload.chartLastPrice,
      },
      timeoutMs
    );
    if (res?.error) throw new Error(res.error);
    return (res?.reply || "").trim();
  }

  async function replyCasual(text, voice, turnGen, routeText) {
    const routeForIntent = routeText || text;
    if (
      mustUseTradingStream(text) ||
      mustUseTradingStream(routeText) ||
      mustUseTradingStream(routeForIntent)
    ) {
      voiceLog("replyCasual blocked — trading analysis question");
      window.DeskCopilotRealtime?.exitCasualTurn?.();
      lastSnapshotIntent = null;
      return handleUserMessage({ text, routeText: routeForIntent, voice, turnGen });
    }
    if (typeof needsScopedChartAnswer === "function" && needsScopedChartAnswer(routeForIntent)) {
      voiceLog("scoped chart Q routed from casual — snapshot");
      window.DeskCopilotRealtime?.exitCasualTurn?.();
      lastSnapshotIntent = null;
      setKarenPhase("snapshot");
      if (!voice) setMsg("Karen · checking live prices…", null);
      try {
        await runMarketSnapshot(routeForIntent, { voice, turnGen });
        if (turnGen != null && turnGen !== voiceTurnGen) return;
        return;
      } catch (e) {
        voiceLog("scoped snapshot from casual failed:", e?.message || e);
      }
    }

    lastSnapshotIntent = "casual";
    suppressAssistantEchoUntil = Date.now() + 4000;
    setKarenPhase("chatting");
    window.DeskCopilotRealtime?.enterCasualTurn?.();
    window.DeskCopilotRealtime?.cancelActiveResponse?.();

    const routeCore =
      window.DeskCopilotCasual?.stripLeadingGreeting?.(text) || text;
    const routeCoreText =
      window.DeskCopilotCasual?.stripLeadingGreeting?.(routeText || text) || routeText || text;

    if (window.DeskCopilotCasual?.isUserMemoryQuestion?.(routeCore)) {
      const memory = await memoryPayload();
      const memReply = window.DeskCopilotCasual?.userMemoryReply?.(routeCore, memory);
      if (memReply) {
        setMsg("", null);
        window.DeskCopilotRealtime?.cancelActiveResponse?.();
        await publishAssistantReply(memReply, voice, { pauseMic: true, instant: true }, () => {
          setKarenPhase("listening");
          suppressAssistantEchoUntil = Date.now() + 6000;
        });
        return;
      }
    }

    const needsSearch =
      !window.DeskCopilotCasual?.isPersonaQuestion?.(routeCore) &&
      (wantsLiveWebData(routeCore, routeCoreText) ||
        window.DeskCopilotWeather?.hasWeatherWithLocation?.(routeCore) === true ||
        window.DeskCopilotWeather?.hasWeatherWithLocation?.(routeCoreText) === true);
    const searchQuestion = needsSearch
      ? resolveLiveSearchQuestion(routeCore, routeCoreText)
      : "";
    if (voice) {
      logLiveSearchRouting(text, routeText, needsSearch);
      logVoiceWeatherRouting({ raw: text, routeText, needsSearch, searchQuestion });
    }

    if (!needsSearch && canUseInstantLocal(text)) {
      const local = localCasualReply(text);
      setMsg("", null);
      window.DeskCopilotRealtime?.cancelActiveResponse?.();
      await publishAssistantReply(local, voice, { pauseMic: true, instant: true }, () => {
        setKarenPhase("listening");
        suppressAssistantEchoUntil = Date.now() + 6000;
      });
      return;
    }

    const extrasPromise = getTurnExtras();
    if (!(await ensureBackend())) {
      if (voice) {
        if (turnGen != null && turnGen !== voiceTurnGen) return;
        await publishOfflineReply(true);
      } else {
        recordAssistantReply(localCasualReply(text));
        setMsg("Backend offline — RECONNECT", false);
      }
      return;
    }

    if (needsSearch) {
      const searchAck = voice ? voiceThinkingAck(true) : null;
      if (voice) window.DeskCopilotVoice?.cancelSpeech?.();
      try {
        const localResult = await tryLocalWeatherWithMemory(searchQuestion);
        if (localResult?.reply) {
          const promptAccepted = acceptLiveSearchReply(localResult.reply, text, routeText);
          if (promptAccepted) {
            voiceLog(
              "live search: location clarify —",
              localResult.error || "prompt",
              localResult.location ? `loc=${localResult.location}` : ""
            );
            if (turnGen != null && turnGen !== voiceTurnGen) return;
            setMsg("", null);
            await publishAssistantReply(promptAccepted, voice, { pauseMic: true, instant: true }, () => {
              setKarenPhase("listening");
              suppressAssistantEchoUntil = Date.now() + 3000;
            });
            return;
          }
        }
        const searchQuery =
          localResult?.searchQuery ||
          window.DeskCopilotWeather?.buildWeatherSearchQuery?.(localResult?.location || "") ||
          window.DeskCopilotWeather?.buildSearchQuery?.(searchQuestion) ||
          searchQuestion;
        voiceLog("live search: web query —", searchQuery.slice(0, 72));
        const rawReply = await fetchLiveSearchReply({
          messages: chatMessagesForRequest(text),
          symbol: symbol(),
          voiceInput: voice,
          wantsLiveWebData: true,
          searchQuery,
          ...(await extrasPromise),
        });
        if (turnGen != null && turnGen !== voiceTurnGen) return;
        const reply = acceptLiveSearchReply(rawReply, text, routeText);
        if (!reply) {
          voiceLog(
            "live search: reply rejected (guess or not live) —",
            String(rawReply || "").slice(0, 120)
          );
          throw new Error("Live search returned no usable reply");
        }
        voiceLog("live search: web OK");
        setMsg("", null);
        await publishAssistantReply(reply, voice, { pauseMic: true, instant: true }, () => {
          setKarenPhase("listening");
          suppressAssistantEchoUntil = Date.now() + 3000;
        });
      } catch (e) {
        voiceLog("live search failed:", e?.message || e);
        let fallback = LIVE_DATA_FALLBACK_MSG;
        try {
          const retry = await tryLocalWeatherWithMemory(searchQuestion);
          if (retry?.reply && (retry.error === "no_location" || retry.error === "ambiguous_location")) {
            fallback = retry.reply;
          }
        } catch (retryErr) {
          voiceLog("live search: location retry failed —", retryErr?.message || retryErr);
        }
        setMsg("", null);
        await publishAssistantReply(fallback, voice, { pauseMic: true, instant: true }, () =>
          setKarenPhase("listening")
        );
      } finally {
        searchAck?.cancel?.();
      }
      return;
    }

    try {
      const out = await runStreamingChat(
        {
          messages: chatMessagesForRequest(text),
          symbol: symbol(),
          voiceInput: voice,
          voiceSttClean: true,
          casualOnly: true,
          ...(await extrasPromise),
        },
        { voice, turnGen, casual: true, lastUser: text }
      );
      if (turnGen != null && turnGen !== voiceTurnGen) return;
      if (!out?.reply) {
        if (
          mustUseTradingStream(text) ||
          mustUseTradingStream(routeText || "") ||
          mustUseTradingStream(routeForIntent)
        ) {
          await publishAssistantReply(
            "WAIT — I need validated live chart data before a trading read.",
            voice,
            { pauseMic: true, instant: true }
          );
          return;
        }
        await publishAssistantReply(localCasualReply(text), voice, { pauseMic: true, instant: true });
      }
      setMsg("", null);
    } catch (e) {
      voiceLog("casual stream fallback:", e?.message || e);
      setMsg("", null);
      const gateMsg =
        typeof e?.message === "string" && e.message.startsWith("QUALITY_GATE:")
          ? e.message.slice("QUALITY_GATE:".length)
          : null;
      if (
        gateMsg ||
        mustUseTradingStream(text) ||
        mustUseTradingStream(routeText || "") ||
        mustUseTradingStream(routeForIntent)
      ) {
        await publishAssistantReply(
          gateMsg || "WAIT — I need validated live chart data before a trading read.",
          voice,
          { pauseMic: true, instant: true },
          () => setKarenPhase("listening")
        );
        return;
      }
      await publishAssistantReply(localCasualReply(text), voice, { pauseMic: true, instant: true }, () =>
        setKarenPhase("listening")
      );
    }
  }

  function isSpuriousShortTranscript(text) {
    const t = String(text || "").trim().toLowerCase();
    if (!/^(bye|by|hi|hey|ok|okay|yeah|yes|no|uh|um|hmm)[.!]?$/.test(t)) return false;
    if (window.DeskCopilotVoice?.isSpeaking?.()) return true;
    if (window.DeskCopilotRealtime?.isScriptSpeaking?.()) return true;
    const sinceReply = Date.now() - lastVoiceReplyAt;
    const sinceAssistant = Date.now() - lastRecordedAssistantAt;
    // Block likely echo homophones only right after Karen speaks — keep yes/no/ok as valid replies.
    if (/^(bye|by|hi|hey|uh|um|hmm)[.!]?$/.test(t) && (sinceReply < 2500 || sinceAssistant < 2500)) {
      return true;
    }
    return false;
  }

  function looksLikeUserIntent(text) {
    const t = String(text || "").trim().toLowerCase();
    if (!t) return false;
    return (
      /\?\s*$/.test(t) ||
      /^(what|how|why|when|where|who|can you|could you|tell me|do you|are you|you up to|what's up|whats up|hello|hey|hi|mark|draw|show|give|read|check|look|find|get)\b/i.test(
        t
      ) ||
      /\b(mnq|nasdaq|chart|levels|pdl|pdh|fvg|entry|target|bias|verdict|read|previous day|fair value)\b/i.test(
        t
      )
    );
  }

  function matchesRecentAssistantSpeech(text) {
    const t = displayText(text).trim().toLowerCase();
    if (!t) return false;
    if (window.DeskCopilotCasual?.isTradingRedirect?.(t)) return true;
    if (lastSnapshotIntent === "casual" && /\b(nasdaq|futures|chart|read on|back on track)\b/i.test(t)) {
      return true;
    }
    const recentAssistant =
      lastRecordedAssistantText ||
      (chatHistory.at(-1)?.role === "assistant" ? chatHistory.at(-1).content : "");
    const recentNorm = displayText(recentAssistant).trim().toLowerCase();
    if (recentNorm && Date.now() - lastRecordedAssistantAt < 8000) {
      if (t === recentNorm) return true;
      if (recentNorm.length >= 40 && t.length >= 40 && recentNorm.includes(t)) return true;
      if (t.length >= 40 && recentNorm.includes(t.slice(0, Math.min(t.length, 36)))) return true;
    }
    const narrow = lastSnapshotIntent && lastSnapshotIntent !== "full_read";
    if (narrow && /\b(entry zone|target one|call potential|nasdaq futures last|on that:)\b/i.test(t)) {
      return true;
    }
    const canon = (lastSpokenBrief || lastSnapshotAnswer || "").trim().toLowerCase();
    if (!canon) return false;
    if (t === canon) return true;
    const a = canon.slice(0, 40);
    const b = t.slice(0, 40);
    if (a.length >= 24 && (t.includes(a) || canon.includes(b))) return true;
    const nums = canon.match(/\d{5}\.\d{2}/g);
    if (nums && nums.length >= 2 && nums.every((n) => t.includes(n))) return true;
    return false;
  }

  function shouldIgnoreVoiceTranscript(raw) {
    const t = String(raw || "").trim();
    if (!t) return "empty";
    if (shouldDropUserInput(t)) return "tv-disclaimer";
    const cleaned = sanitizeUserInput(t);
    if (!cleaned) return "tv-disclaimer";
    if (isSpuriousShortTranscript(t)) return "spurious-short";
    if (looksLikeUserIntent(cleaned)) return false;
    if (window.DeskCopilotRealtime?.isScriptSpeaking?.()) {
      return matchesRecentAssistantSpeech(t) ? "echo-script" : false;
    }
    if (window.DeskCopilotVoice?.isSpeaking?.()) {
      return matchesRecentAssistantSpeech(t) ? "echo-speaking" : false;
    }
    const suppressUntil = Math.max(
      suppressAssistantEchoUntil,
      window.DeskCopilotRealtime?.getSuppressUntil?.() || 0
    );
    if (Date.now() < suppressUntil && matchesRecentAssistantSpeech(t)) return "echo-suppress";
    return false;
  }

  async function handleRealtimeTranscript(text) {
    const raw = String(text || "").trim();
    if (!raw) return;
    if (isVoiceStopCommand(raw)) {
      window.DeskCopilotVoice?.stopAutonomous?.();
      updateVoiceToggle(false, false);
      setKarenPhase("idle");
      setMsg("Voice off", null);
      voiceLog("voice stop command");
      return;
    }
    const ignoreReason = shouldIgnoreVoiceTranscript(raw);
    if (ignoreReason) {
      logSttPipeline("ignored", { raw, reason: ignoreReason });
      setVoiceLive(`(dropped: ${ignoreReason})`);
      voiceLog("STT dropped:", raw.slice(0, 64), "→", ignoreReason);
      return;
    }

    const norm = raw.toLowerCase();
    if (
      lastVoiceTurnRaw &&
      isSttExtension(lastVoiceTurnRaw, norm) &&
      voiceTurnBusy
    ) {
      voiceLog("STT extension dropped — turn in flight:", raw.slice(0, 80));
      lastVoiceTurnRaw = norm;
      lastVoiceTurnRawAt = Date.now();
      return;
    }
    if (isDuplicateSttTranscript(norm)) {
      if (isSttExtension(lastVoiceTurnRaw, norm)) {
        voiceLog("STT extension accepted (was dedup-candidate):", raw.slice(0, 80));
      } else {
        if (norm.length > lastVoiceTurnRaw.length) {
          lastVoiceTurnRaw = norm;
          lastVoiceTurnRawAt = Date.now();
        }
        logSttPipeline("ignored", { raw, reason: "duplicate" });
        setVoiceLive(`(dropped: duplicate)`);
        return;
      }
    }
    if (voiceTurnBusy && !window.DeskCopilotVoice?.isSpeaking?.()) {
      voiceLog("supersede — new turn while processing");
      cancelActiveChartRead("new voice turn");
      cancelActiveChatStream("new voice turn");
      window.DeskCopilotVoice?.cancelSpeech?.();
      voiceSpeakSession += 1;
    }
    lastVoiceTurnRaw = norm;
    lastVoiceTurnRawAt = Date.now();

    const gen = ++voiceTurnGen;
    voiceTurnBusy = true;
    window.__dcVoiceLatencyMark?.("transcript_handoff");
    window.__dcVoiceLatencyMark?.("turn_process");
    voiceLog("turn start g", gen, "raw:", raw.slice(0, 80));

    try {
      const speakingNow = window.DeskCopilotVoice?.isSpeaking?.();
      if (speakingNow) {
        voiceLog("barge-in — cancel speak, take new turn");
        cancelActiveChartRead("barge-in");
        cancelActiveChatStream("barge-in");
        window.DeskCopilotVoice?.cancelSpeech?.();
        window.DeskCopilotRealtime?.setMicPaused?.(false);
        voiceSpeakSession += 1;
      }

      voiceEarlyAck(raw);
      window.DeskCopilotVoice?.primeAudioPlayback?.();

      const rec = await recordVoiceTranscript(raw);
      if (gen !== voiceTurnGen) return;

      const resolved = rec.text.trim();
      if (!resolved) return;

      const route = rec.routeText || resolved;
      if (isChartReadCommand(route)) {
        window.DeskCopilotRealtime?.exitCasualTurn?.();
        lastSnapshotIntent = null;
        voiceLog("chart read command — exit casual");
      } else if (
        !mustUseTradingStream(route) &&
        !mustUseTradingStream(resolved) &&
        shouldRouteCasual(route, rec.routeText || resolved)
      ) {
        window.DeskCopilotRealtime?.enterCasualTurn?.();
        window.DeskCopilotRealtime?.cancelActiveResponse?.();
        voiceLog("casual mode early");
      }

      const isCorrection =
        rec.corrected &&
        rec.previousText &&
        transcriptsDifferMeaningfully(rec.previousText, resolved) &&
        Date.now() - lastVoiceReplyAt < 8000;

      if (isCorrection) {
        voiceLog("correction redo:", rec.previousText, "→", resolved);
        window.DeskCopilotVoice?.cancelSpeech?.();
        window.DeskCopilotRealtime?.cancelActiveResponse?.();
        window.DeskCopilotRealtime?.setMicPaused?.(false);
        voiceSpeakSession += 1;
        lastDeliveredSpeak = "";
        lastDeliveredSpeakAt = 0;
        const bots = document.getElementById("dc-chat")?.querySelectorAll(".dc-bubble-bot");
        bots?.[bots.length - 1]?.remove();
        let lastAsstIdx = -1;
        for (let i = chatHistory.length - 1; i >= 0; i--) {
          if (chatHistory[i].role === "assistant") {
            lastAsstIdx = i;
            break;
          }
        }
        if (lastAsstIdx >= 0) chatHistory.splice(lastAsstIdx, 1);
      }

      if (!isCorrection) removeOrphanAssistantBeforeLastUser();
      await handleUserMessage({
        text: resolved,
        routeText: rec.routeText || resolved,
        voice: true,
        turnGen: gen,
        sttClean: rec.sttClean === true,
      });
      voiceLog("reply done g", gen);
    } finally {
      if (gen === voiceTurnGen) {
        voiceTurnBusy = false;
        if (
          !window.DeskCopilotVoice?.isSpeaking?.() &&
          !window.DeskCopilotRealtime?.isScriptSpeaking?.()
        ) {
          window.DeskCopilotRealtime?.forceResumeListening?.("turn-done");
        }
        if (window.DeskCopilotVoiceLatency?.current?.()) {
          window.DeskCopilotVoiceLatency.endTurn("turn_done");
        }
      }
    }
  }
  window.__dcHandleVoiceTurn = handleRealtimeTranscript;
  window.__dcVoiceTurnBusy = () => voiceTurnBusy;

  function shouldRouteCasual(text, routeText) {
    if (window.DeskCopilotPending?.shouldDeferCasualRoute?.(text, chatHistory) === true) return false;
    if (window.DeskCopilotPending?.shouldDeferCasualRoute?.(routeText || text, chatHistory) === true) {
      return false;
    }
    return window.DeskCopilotRoute?.wouldRouteCasual?.(text, routeText || text, chatHistory) === true;
  }

  function mustUseTradingStream(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    if (typeof prefersRichTradingAnswer === "function" && prefersRichTradingAnswer(t)) return true;
    if (typeof isChartStatusQuestion === "function" && isChartStatusQuestion(t)) return false;
    if (window.DeskCopilotCasual?.isClearlyTrading?.(t)) return true;
    return false;
  }

  async function handleUserMessage(item) {
    const text = (typeof item === "string" ? item : item?.text || "").trim();
    const routeText =
      typeof item === "object" && item?.routeText ? String(item.routeText).trim() : text;
    const intentText =
      routeText && routeText.toLowerCase() !== text.toLowerCase() ? routeText : text;
    const voice = typeof item === "object" && item?.voice === true;
    const turnGen = typeof item === "object" ? item?.turnGen : undefined;
    const sttClean = typeof item === "object" && item?.sttClean === true;
    if (!text) return;

    const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    voiceLog(`[req=${reqId}] turn`, text.slice(0, 72));
    window.DeskCopilotRequestTrace?.beginRequest?.(reqId, text, voice);

    showRouteDebug(text, routeText, { lastAssistant: undefined, reqId });
    traceRouteAndIntent(text, routeText);

    if (turnGen != null && turnGen !== voiceTurnGen) {
      endRequestTrace({ source: "cancelled", preview: "", skipGrounding: true, skipObservations: true, skipExport: true });
      return;
    }

    if (voice) {
      window.DeskCopilotVoice?.primeAudioPlayback?.();
      prefetchTurnExtras();
      void primeChartPriceForTurn({ forceRefresh: isPriceQuestion(intentText) });
    }

    const tradingQ =
      mustUseTradingStream(text) ||
      mustUseTradingStream(routeText) ||
      mustUseTradingStream(intentText);
    if (tradingQ) {
      window.DeskCopilotRealtime?.exitCasualTurn?.();
      lastSnapshotIntent = null;
    }

    if (voice && /\b(mark|draw|show) levels\b/i.test(intentText)) {
      const msg = startMarkLevelsNonBlocking();
      await publishAssistantReply(msg, voice, { pauseMic: false, traceSource: "local", groundingPath: "local", grounded: true }, () => setKarenPhase("listening"));
      return;
    }

    if (!tradingQ && shouldRouteCasual(text, routeText)) {
      armChatUiLoading(voice);
      try {
        await replyCasual(text, voice, turnGen, routeText);
      } finally {
        releaseChatUiLoading(voice);
      }
      return;
    }

    const turnPricePayload = await primeChartPriceForTurn({
      forceRefresh: isPriceQuestion(intentText),
    });

    const chartQ = isChartReadCommand(intentText)
      ? normalizeChartReadCommand(intentText) || intentText
      : intentText;
    if (isChartReadCommand(intentText) || needsFullChartRead(intentText, chartReadContext())) {
      window.DeskCopilotRealtime?.exitCasualTurn?.();
      lastSnapshotIntent = null;
      kickOffChartRead(chartQ, { voice, turnGen });
      return;
    }

    window.DeskCopilotRealtime?.exitCasualTurn?.();
    if (tradingQ) {
      lastSnapshotIntent = null;
    } else if (
      window.DeskCopilotCasual?.isClearlyTrading?.(intentText) ||
      window.DeskCopilotCasual?.isClearlyTrading?.(text)
    ) {
      lastSnapshotIntent = null;
    } else {
      lastSnapshotIntent = lastSnapshotIntent === "casual" ? null : lastSnapshotIntent;
    }

    if (isPriceQuestion(intentText)) {
      window.DeskCopilotChartPrice?.invalidate?.();
      const quote =
        window.DeskCopilotChartPrice?.readQuoteSync?.() ||
        (await window.DeskCopilotChartPrice?.readQuote?.());
      const maxAge = window.DeskCopilotChartPrice?.LIVE_PRICE_MAX_AGE_MS ?? 60000;
      const pricePayload =
        quote && quote.ageMs <= maxAge
          ? {
              chartLastPrice: quote.value,
              chartLastPriceSource: quote.source,
              chartLastPriceTs: quote.timestamp,
            }
          : undefined;
      try {
        await runMarketSnapshot(intentText, { voice, turnGen, pricePayload });
        return;
      } catch {
        /* backend + TickStream fallback failed — show unavailable below */
      }
      const blocked = window.DeskCopilotConnection?.LIVE_DATA_UNAVAILABLE_VERDICT;
      const msg =
        blocked?.spokenBrief ||
        "Wait — live data unavailable. I need a fresh TradingView last print before quoting price.";
      setMsg("", null);
      await publishAssistantReply(
        msg,
        voice,
        { pauseMic: true, instant: true, traceSource: "local", groundingPath: "local", grounded: false },
        () => setMsg("", null)
      );
      return;
    }

    if (needsScopedChartAnswer(intentText) && !tradingQ) {
      setKarenPhase("snapshot");
      if (voice) window.DeskCopilotVoice?.primeAudioPlayback?.();
      if (!voice) setMsg("Karen · checking live prices…", null);
      const fpfvg =
        typeof isFirstPresentedFvgQuestion === "function" &&
        isFirstPresentedFvgQuestion(intentText);
      const fastFact = isFastFactQuestion(intentText, routeText);
      try {
        await runMarketSnapshot(intentText, { voice, turnGen, pricePayload: turnPricePayload });
        if (turnGen != null && turnGen !== voiceTurnGen) return;
        return;
      } catch (firstErr) {
        const relaxed = tryRelaxedSnapshotCache(intentText);
        if (relaxed) {
          voiceLog("fast fact — relaxed snapshot cache");
          applySnapshotAnswer(relaxed);
          return;
        }
        if (fastFact) {
          await publishFastFactFailure(firstErr, voice, turnGen);
          return;
        }
        if (fpfvg) {
          try {
            lastMarketSnapshotCache = { key: "", data: null, ts: 0 };
            await runMarketSnapshot(intentText, { voice, turnGen, forceRefresh: true });
            if (turnGen != null && turnGen !== voiceTurnGen) return;
            return;
          } catch (retryErr) {
            const msg =
              retryErr instanceof Error ? retryErr.message : String(retryErr || firstErr);
            setMsg("", null);
            await publishAssistantReply(
              msg.includes("redeploy")
                ? msg
                : "First presented FVG needs a live market snapshot — redeploy the desk backend, click RECONNECT, then ask again.",
              voice,
              { pauseMic: true, instant: true },
              () => setKarenPhase("listening")
            );
            return;
          }
        }
        /* fall through to chat for other scoped intents */
      }
    }

    const extrasPromise = getTurnExtras();
    const backendPromise = ensureBackend();
    if (!(await backendPromise)) {
      if (voice) {
        if (turnGen != null && turnGen !== voiceTurnGen) {
          endRequestTrace({ source: "cancelled", skipGrounding: true, skipObservations: true, skipExport: true });
          return;
        }
        await publishOfflineReply(true);
      } else {
        recordAssistantReply(offlineChatMessage());
        setMsg("Backend offline — RECONNECT", false);
      }
      endRequestTrace({
        source: "offline",
        preview: offlineChatMessage(),
        fail: true,
        failStage: "apis",
        reason: "backend offline",
      });
      return;
    }

    armChatUiLoading(voice);
    setKarenPhase(voice ? "chatting" : "thinking");
    setMsg(voice ? "" : "Karen · thinking…", null);
    try {
      const out = await runStreamingChat(
        {
          messages: chatHistory,
          symbol: symbol(),
          lastVerdict: lastVerdict || undefined,
          voiceInput: voice,
          voiceSttClean: sttClean,
          forceMarket: true,
          casualOnly: false,
          ...(await extrasPromise),
        },
        {
          voice,
          turnGen,
          casual: !tradingQ && inCasualThread(),
          lastUser: text,
          workingAckKey:
            voice &&
            (window.DeskCopilotRoute?.voiceAckKeyForDepth?.(
              window.DeskCopilotRoute?.classifyAnalysisDepth?.({ text, routeText: text })
            ) ||
              (tradingQ && typeof prefersRichTradingAnswer === "function" && prefersRichTradingAnswer(text)
                ? "deep_analysis"
                : null))
              ? null
              : voice && !tradingQ && !inCasualThread()
                ? "check"
                : null,
          workingAckDelayMs: voice && tradingQ ? 2500 : 2000,
        }
      );
      if (turnGen != null && turnGen !== voiceTurnGen) return;
      if (out?.needsChartRead && !inCasualThread()) {
        if (isFastFactQuestion(text, routeText)) {
          voiceLog("blocked chart_read fallback for fast fact");
          await publishFastFactFailure(
            new Error("Market snapshot unavailable — not running full chart read"),
            voice,
            turnGen
          );
          return;
        }
        if (voice) voiceSpeakAck(karenWorkingAck("chart_read"));
        kickOffChartRead(out.question || text, { voice, turnGen });
        return;
      }
      setMsg("", null);
      endRequestTrace({
        source: "stream",
        preview: out?.reply || "",
        groundingPath: "stream",
        grounded: false,
        voice,
      });
    } catch (e) {
      const friendly = explainError(e, "chat");
      setMsg(friendly, false);
      await publishAssistantReply(friendly, voice, {
        pauseMic: true,
        instant: true,
        traceSource: "stream",
        traceFail: true,
        traceFailStage: "apis",
        traceFailReason: friendly,
        groundingPath: "stream",
        grounded: false,
      }, () => setKarenPhase("listening"));
    } finally {
      releaseChatUiLoading(voice);
      if (window.DeskCopilotVoice?.isListening?.()) setKarenPhase("listening");
    }
  }

  function sendChat(userText, opts = {}) {
    enqueueUserMessage(userText, opts);
  }

  function symbol() {
    const el =
      document.querySelector("[data-symbol-short]") ||
      document.querySelector(".js-symbol-edit") ||
      document.querySelector('[data-name="legend-source-title"]');
    return el?.textContent?.trim() || "MNQ1!";
  }

  function shortSymbol(sym) {
    const s = String(sym || symbol()).trim();
    return s.replace(/1!$/, "").replace(/\.P$/, "") || "MNQ";
  }

  function extractDeskOneLiner(verdictText) {
    const t = displayText(verdictText || "");
    if (!t) return "";
    const callMatch = t.match(/^Call:\s*(.+)$/im);
    if (callMatch) return callMatch[1].trim().slice(0, 72);
    const callIsMatch = t.match(/\bCall is\s+(potential buy|potential sell|stand aside)/i);
    if (callIsMatch) {
      const c = callIsMatch[1].toLowerCase();
      if (c === "stand aside") return "Stand aside";
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
    const biasMatch = t.match(/tradeable bias:\s*(\w+)/i);
    if (biasMatch) {
      const b = biasMatch[1].toLowerCase();
      if (b !== "neutral" && b !== "conflicted") return `Bias · ${b}`;
    }
    if (/\bpotential buy\b/i.test(t)) return "Potential buy";
    if (/\bpotential sell\b/i.test(t)) return "Potential sell";
    if (/\bstand aside\b/i.test(t)) return "Stand aside";
    return "";
  }

  function isPanelExpanded() {
    return !panel.classList.contains("dc-collapsed");
  }

  function contextStripPriceDisplay() {
    const sync = window.DeskCopilotChartPrice?.readSync?.();
    if (Number.isFinite(sync)) {
      contextStripPrice = sync;
      contextStripPriceTs = Date.now();
      return sync;
    }
    if (Number.isFinite(contextStripPrice)) {
      const age = Date.now() - contextStripPriceTs;
      if (age < CONTEXT_PRICE_STALE_MS) return contextStripPrice;
    }
    return null;
  }

  function formatPriceSourceLabel(source) {
    const s = String(source || "").toLowerCase();
    if (s === "tradingview_live" || s === "tradingview_quote") return "TV Last";
    if (s === "tv_bar_close" || s === "tv_api") return "TV bar close";
    if (s === "tickstream_live" || s === "tickstream_quote") return "TickStream";
    if (s === "desk_backend" || s === "desk-tracker") return "Desk backend";
    if (s === "chart-price") return "TV Last";
    return source ? String(source).replace(/_/g, " ") : "";
  }

  function noteLivePrice(px, source) {
    if (!Number.isFinite(px)) return;
    const prev = contextStripPrice;
    contextStripPrice = px;
    contextStripPriceTs = Date.now();
    if (source) contextStripPriceSource = source;
    if (Number.isFinite(prev) && Math.abs(px - prev) >= 0.5) {
      lastMarketSnapshotCache = { key: "", data: null, ts: 0 };
    }
    reportMarketPulse(source || "chart-price", { timestamp: contextStripPriceTs });
    updateContextStrip();
  }

  async function fetchBackendPriceFallback() {
    if (backendPriceFallbackInflight) return backendPriceFallbackInflight;
    backendPriceFallbackInflight = (async () => {
      try {
        const payload = await bgSend({ type: "LEVELS" }, 20000);
        const px = Number(payload?.lastPrice1m ?? payload?.priceHint?.last);
        if (Number.isFinite(px) && px >= 20000 && px <= 45000) {
          noteLivePrice(px, "desk_backend");
          return px;
        }
      } catch {
        /* ignore */
      }
      return null;
    })();
    try {
      return await backendPriceFallbackInflight;
    } finally {
      backendPriceFallbackInflight = null;
    }
  }

  async function primeChartPriceForTurn(opts = {}) {
    if (opts.forceRefresh) window.DeskCopilotChartPrice?.invalidate?.();
    const quote =
      window.DeskCopilotChartPrice?.readQuoteSync?.() ||
      (await window.DeskCopilotChartPrice?.readQuote?.());
    if (quote) {
      noteLivePrice(quote.value, quote.source);
      return {
        chartLastPrice: quote.value,
        chartLastPriceSource: quote.source,
        chartLastPriceTs: quote.timestamp,
      };
    }
    if (priceTurnInflight) return priceTurnInflight;
    priceTurnInflight = (async () => {
      try {
        const payload = (await window.DeskCopilotChartPrice?.payload?.()) || {};
        const px = Number(payload.chartLastPrice);
        if (Number.isFinite(px)) noteLivePrice(px, payload.chartLastPriceSource || "tradingview_live");
        return payload;
      } finally {
        priceTurnInflight = null;
      }
    })();
    return priceTurnInflight;
  }

  async function refreshContextStripPrice(forceBridge = false) {
    if (document.hidden || !isPanelExpanded()) return;

    let px = window.DeskCopilotChartPrice?.readSync?.();
    if (Number.isFinite(px)) {
      const q = window.DeskCopilotChartPrice?.readQuoteSync?.();
      noteLivePrice(px, q?.source || "tradingview_live");
      return;
    }

    if (!forceBridge && Number.isFinite(contextStripPrice)) {
      updateContextStrip();
    }

    if (contextStripPriceInflight) return;
    contextStripPriceInflight = true;
    try {
      if (forceBridge) window.DeskCopilotChartPrice?.invalidate?.();
      const payload = await window.DeskCopilotChartPrice?.payload?.();
      px = Number(payload?.chartLastPrice);
      if (Number.isFinite(px)) noteLivePrice(px, payload?.chartLastPriceSource || "tradingview_live");
      else if (!Number.isFinite(contextStripPrice)) await fetchBackendPriceFallback();
    } catch {
      if (!Number.isFinite(contextStripPrice)) await fetchBackendPriceFallback();
    } finally {
      contextStripPriceInflight = false;
    }
    updateContextStrip();
  }

  async function refreshContextStripBias() {
    if (document.hidden || !isPanelExpanded() || !backendOnline) return;
    if (isUserRequestBusy()) return;
    if (Date.now() < contextStripBiasBackoffUntil) return;
    if (
      lastVerdict &&
      lastAppliedVerdictAt &&
      Date.now() - lastAppliedVerdictAt < CONTEXT_CHART_READ_BIAS_MS
    ) {
      updateContextStrip();
      return;
    }
    if (
      contextStripSnapshotCache.hint &&
      Date.now() - contextStripSnapshotCache.ts < CONTEXT_BIAS_MS
    ) {
      contextStripBiasHint = contextStripSnapshotCache.hint;
      updateContextStrip();
      return;
    }
    if (contextStripBiasInflight) return;

    contextStripBiasInflight = true;
    try {
      const syncPrice = contextStripPrice ?? window.DeskCopilotChartPrice?.readSync?.();
      const pricePayload =
        syncPrice != null ? { chartLastPrice: syncPrice } : await chartPricePayload();

      const snap = await bgSend(
        {
          type: "MARKET_SNAPSHOT",
          question: CONTEXT_BIAS_QUESTION,
          voiceInput: false,
          ...pricePayload,
        },
        15000
      );

      if (snap?.error) {
        contextStripBiasFailStreak += 1;
        contextStripBiasBackoffUntil =
          Date.now() + Math.min(300000, 15000 * contextStripBiasFailStreak);
        return;
      }

      contextStripBiasFailStreak = 0;
      const spoken = snap.spoken || snap.panel || "";
      if (spoken) {
        contextStripBiasHint = spoken;
        contextStripSnapshotCache = { hint: spoken, ts: Date.now() };
      }
      updateContextStrip();
    } catch {
      contextStripBiasFailStreak += 1;
      contextStripBiasBackoffUntil =
        Date.now() + Math.min(300000, 15000 * contextStripBiasFailStreak);
    } finally {
      contextStripBiasInflight = false;
    }
  }

  function refreshContextStrip(opts = {}) {
    updateSessionBadge();
    updateContextStrip();
    if (opts.price !== false) void refreshContextStripPrice(Boolean(opts.forceBridge));
    if (opts.bias) void refreshContextStripBias();
  }

  function updateSessionBadge() {
    const el = document.getElementById("dc-session-badge");
    if (!el) return;
    const ctx = window.DeskCopilotSession?.resolve?.() || { label: "—", killZone: false, macroWindow: null };
    el.textContent = window.DeskCopilotSession?.badgeText?.(ctx) || ctx.label;
    el.classList.toggle("dc-kz", Boolean(ctx.killZone));
    el.classList.toggle("dc-macro", Boolean(ctx.macroWindow));
    const tip = [ctx.label];
    if (ctx.killZone) tip.push("kill zone active");
    if (ctx.macroWindow) tip.push(ctx.macroWindow);
    if (ctx.amdPhase) tip.push(`AMD · ${ctx.amdPhase}`);
    el.title = tip.join(" — ");
  }

  function syncVoiceHeroUI(phase) {
    const listening = window.DeskCopilotVoice?.isListening?.();
    const speaking = mockKarenSpeaking || window.DeskCopilotVoice?.isSpeaking?.();
    window.DeskCopilotVerdictUI?.updateVoiceHero?.({
      listening,
      phase: phase || karenUiPhase,
      speaking,
    });
    window.DeskCopilotUI?.updateKarenStatus?.(phase || karenUiPhase, {
      listening,
      speaking,
      degraded: window.DeskCopilotVoice?.getEngineMode?.() === "cascade" && listening,
    });
  }

  let karenUiPhase = "idle";
  let mockKarenSpeaking = false;
  let mockAnalysisBusy = false;

  function syncHeaderStatus(extra = {}) {
    const conn = connectionSnapshot;
    const px = contextStripPriceDisplay();
    const hasPrice = Number.isFinite(px);
    const ui = window.DeskCopilotUI;
    if (!ui?.updateHeaderStatus) return;
    ui.updateHeaderStatus({
      market:
        extra.tvLive && hasPrice
          ? "LIVE"
          : ui.mapConnectionToMarketStatus?.(conn, hasPrice) || "WAITING",
      data: ui.mapConnectionToDataStatus?.(conn) || "WAITING",
      karen:
        extra.karen ||
        ui.mapKarenStatus?.(karenUiPhase, {
          listening: window.DeskCopilotVoice?.isListening?.(),
          speaking: window.DeskCopilotVoice?.isSpeaking?.(),
          degraded: window.DeskCopilotVoice?.getEngineMode?.() === "cascade",
        }),
      marketTip: conn ? window.DeskCopilotConnection?.formatConnectionStatus?.(conn) : "",
      dataTip: conn ? `Backend ${conn.backendUp ? "up" : "down"} · ${conn.state || "unknown"}` : "",
      karenTip: extra.karenTip || "",
    });
  }

  function updateMarketBarUI() {
    const ctx = window.DeskCopilotSession?.resolve?.() || { label: "—" };
    const px = contextStripPriceDisplay();
    const conn = connectionSnapshot;
    const quote = window.DeskCopilotChartPrice?.readQuoteSync?.() || null;
    const priceSourceRaw = quote?.source || contextStripPriceSource || conn?.marketMeta?.source || null;
    const liveQuote =
      quote &&
      (quote.source === "tradingview_live" ||
        quote.source === "tradingview_quote" ||
        quote.source === "tickstream_live" ||
        quote.source === "tickstream_quote") &&
      quote.ageMs <= (window.DeskCopilotChartPrice?.LIVE_PRICE_MAX_AGE_MS ?? 60000);
    const barCloseQuote =
      quote?.source === "tv_bar_close" ||
      quote?.source === "tv_api" ||
      priceSourceRaw === "desk_backend";
    const hasChartPrice = Number.isFinite(px);
    let dataStatus = "—";
    if (liveQuote) {
      dataStatus = "LIVE";
    } else if (barCloseQuote && hasChartPrice) {
      dataStatus = "STALE";
    } else if (!conn?.backendUp) {
      dataStatus = hasChartPrice ? "STALE" : "OFFLINE";
    } else if (conn.state === "CONNECTED") {
      dataStatus = "LIVE";
    } else if (conn.state === "DEGRADED") {
      dataStatus = hasChartPrice ? "STALE" : "STALE";
    } else if (conn.state === "RECONNECTING" || conn.state === "CONNECTING") {
      dataStatus = hasChartPrice ? "STALE" : "WAITING";
    } else {
      dataStatus = hasChartPrice ? "STALE" : conn?.backendUp ? "UNAVAILABLE" : "ERROR";
    }
    const priceAgeMs = contextStripPriceTs > 0 ? Date.now() - contextStripPriceTs : null;
    const ageMs = liveQuote && priceAgeMs != null ? priceAgeMs : conn?.dataAge ?? priceAgeMs;
    const updated =
      ageMs != null
        ? liveQuote
          ? `TV Last · ${ageMs < 1000 ? `${ageMs}ms` : `${Math.round(ageMs / 1000)}s`} ago`
          : conn?.state === "CONNECTED"
            ? `Fresh · ${ageMs < 1000 ? `${ageMs}ms` : `${Math.round(ageMs / 1000)}s`} ago`
            : conn?.state === "DEGRADED"
              ? `Backend stale · ${Math.round((ageMs || 0) / 1000)}s ago`
              : contextStripPriceTs > 0
                ? `Updated ${new Date(contextStripPriceTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""
        : "";
    const dataSource =
      formatPriceSourceLabel(priceSourceRaw) ||
      (conn?.state === "CONNECTED" ? "TradingView + desk" : conn?.backendUp ? "Desk backend" : "");
    window.DeskCopilotVerdictUI?.updateMarketBar?.({
      symbol: "MNQ",
      price: hasChartPrice ? px : null,
      session: ctx.label || "—",
      tf: "1m",
      dataStatus: dataStatus === "OFFLINE" ? "OFFLINE" : dataStatus,
      updatedAt: updated,
      connectionState: conn?.state,
      dataSource,
      tooltip: conn
        ? `${window.DeskCopilotConnection?.formatConnectionStatus?.(conn) || conn.state}${hasChartPrice ? "" : " · Click RECONNECT if price stays unavailable"}`
        : "",
    });
    syncHeaderStatus({ tvLive: Boolean(liveQuote) });
  }

  function updateContextStrip() {
    updateMarketBarUI();
  }

  function updateDeskBiasLine() {
    updateContextStrip();
  }

  function updateLiveDot(listening) {
    document.getElementById("dc-live-dot")?.classList.toggle("hidden", !listening);
  }

  function startPanelContextRefresh() {
    refreshContextStrip({ forceBridge: true, bias: true });

    window.DeskCopilotChartPrice?.startWatcher?.((px) => {
      if (document.hidden || !isPanelExpanded()) return;
      const q = window.DeskCopilotChartPrice?.readQuoteSync?.();
      noteLivePrice(px, q?.source || "tradingview_live");
    });

    contextStripPriceTimer = setInterval(() => {
      if (document.hidden || !isPanelExpanded()) return;
      void refreshContextStripPrice();
    }, CONTEXT_PRICE_MS);

    contextStripBiasTimer = setInterval(() => {
      if (document.hidden || !isPanelExpanded()) return;
      void refreshContextStripBias();
    }, CONTEXT_BIAS_MS);

    contextStripSessionTimer = setInterval(() => {
      if (document.hidden || !isPanelExpanded()) return;
      updateSessionBadge();
    }, CONTEXT_SESSION_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !isPanelExpanded()) return;
      window.DeskCopilotChartPrice?.invalidate?.();
      refreshContextStrip({ forceBridge: true, bias: true });
    });
  }

  function setBubbleText(bubble, text) {
    if (!bubble) return;
    const body = bubble.querySelector(".dc-bubble-body");
    const out = displayText(text);
    if (body) body.textContent = out;
    else bubble.textContent = out;
  }

  function createBubbleElement(role, text) {
    const div = document.createElement("div");
    div.className = "dc-bubble " + (role === "user" ? "dc-bubble-user" : "dc-bubble-bot");
    const label = document.createElement("span");
    label.className = "dc-bubble-label";
    label.textContent = role === "user" ? "You" : "Karen";
    const body = document.createElement("span");
    body.className = "dc-bubble-body";
    body.textContent = displayText(text);
    div.appendChild(label);
    div.appendChild(body);
    return div;
  }

  async function chartPricePayload() {
    const quote =
      window.DeskCopilotChartPrice?.readQuoteSync?.() ||
      (await window.DeskCopilotChartPrice?.readQuote?.());
    if (quote) {
      noteLivePrice(quote.value, quote.source);
      return {
        chartLastPrice: quote.value,
        chartLastPriceSource: quote.source,
        chartLastPriceTs: quote.timestamp,
      };
    }
    window.DeskCopilotChartPrice?.invalidate?.();
    const payload = (await window.DeskCopilotChartPrice?.payload?.()) || {};
    const px = Number(payload.chartLastPrice);
    if (Number.isFinite(px)) noteLivePrice(px);
    return payload;
  }

  async function marketSnapshotExtras(pricePayload) {
    const snapshotPayload =
      (await window.DeskCopilotChartSnapshot?.payload?.({ maxBars: 120 })) || null;
    const rejectionReasons =
      snapshotPayload?.exportTrace?.qualityRejectionReasons ||
      snapshotPayload?.chartSnapshot?.qualityMeta?.reasons ||
      [];
    const candleCount = snapshotPayload?.chartSnapshot?.candles?.length ?? 0;
    const chartExportFailed =
      rejectionReasons.includes("export_failed") ||
      snapshotPayload?.chartSnapshot?.reason === "export_failed" ||
      candleCount === 0;
    return {
      ...pricePayload,
      chartSnapshot: snapshotPayload?.chartSnapshot ?? undefined,
      chartExportFailed: chartExportFailed || undefined,
      chartLastPrice:
        pricePayload?.chartLastPrice ?? snapshotPayload?.chartLastPrice ?? undefined,
      chartLastPriceSource:
        pricePayload?.chartLastPriceSource ??
        (snapshotPayload?.chartLastPrice != null ? "tv_bar_close" : undefined),
      chartLastPriceTs: pricePayload?.chartLastPriceTs ?? Date.now(),
    };
  }

  async function memoryPayload() {
    try {
      return (await window.DeskCopilotMemory?.getMemoryPayload?.()) || null;
    } catch {
      return null;
    }
  }

  async function chatRequestExtras() {
    const [chart, memory] = await Promise.all([chartPricePayload(), memoryPayload()]);
    return { ...chart, memory };
  }

  async function rememberLastExchange(assistantText) {
    const lastUser =
      [...chatHistory].reverse().find((m) => m.role === "user")?.content || "";
    const reply = String(assistantText || "").trim();
    if (!lastUser || !reply) return;
    try {
      await window.DeskCopilotMemory?.rememberExchange?.(lastUser, reply);
    } catch {
      /* ignore */
    }
  }

  function isVoiceStopCommand(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    return (
      /\b(stop listening|stop voice|stop talking)\b/i.test(t) ||
      /^(stop|wait)[.!]?$/i.test(t)
    );
  }

  function isPriceQuestion(text) {
    const t = String(text || "").toLowerCase();
    return (
      /\b(what price|what level|where are we|current price|trading at|currently trading|what are we at|where is price|where's price|how much is|last price)\b/.test(
        t
      ) ||
      (/\bwhat level\b/.test(t) && /\b(we|trading|at|on)\b/.test(t)) ||
      (/\bright now\b/.test(t) && /\b(price|trading|level|at)\b/.test(t))
    );
  }

  function formatLocalPriceAnswer(price) {
    return `We're trading at ${price.toFixed(2)} on Nasdaq futures.`;
  }

  function isInfraError(msg) {
    const m = String(msg || "").toLowerCase();
    return (
      m.includes("backend offline") ||
      m.includes("backend down") ||
      m.includes("backend error") ||
      m.includes("npm run dev") ||
      m.includes("extension context") ||
      m.includes("timed out") ||
      m.includes("openai_api_key")
    );
  }

  function reportIssue(msg, { chat = false } = {}) {
    setMsg(msg, false);
    if (chat) recordAssistantReply(isInfraError(msg) ? offlineChatMessage() : msg);
  }

  function setBackendStatus(online) {
    backendOnline = online;
    if (online) {
      lastBackendFail = 0;
      pingFailStreak = 0;
      lastOnlineAt = Date.now();
    }
    updateAgentStatus();
  }

  function updateAgentStatus() {
    const btn = document.getElementById("dc-reconnect");
    if (!btn) return;
    const voiceOn = window.DeskCopilotVoice?.isListening?.();
    const agentOn = isAutoVoiceEnabled();
    const connState = connectionSnapshot?.state;
    const statusLine =
      connectionSnapshot && window.DeskCopilotConnection?.formatConnectionStatus
        ? window.DeskCopilotConnection.formatConnectionStatus(connectionSnapshot)
        : "";
    const reconnecting =
      connState === "RECONNECTING" ||
      connState === "CONNECTING" ||
      (!backendOnline && agentOn);
    btn.classList.toggle("dc-online", connState === "CONNECTED");
    btn.classList.toggle("dc-reconnecting", reconnecting);
    btn.classList.toggle("dc-degraded", connState === "DEGRADED");

    if (connState === "CONNECTED" && voiceOn && agentOn) {
      const mode = window.DeskCopilotVoice?.getEngineMode?.() || "off";
      if (mode === "cascade") {
        btn.textContent = "● AGENT (FALLBACK)";
        btn.title = statusLine || "Whisper fallback — Realtime unavailable";
      } else {
        btn.textContent = "● KAREN LIVE";
        btn.title = statusLine || "Karen is live — backend + market state fresh";
      }
    } else if (connState === "CONNECTED") {
      btn.textContent = "● LIVE";
      btn.title = statusLine || "Backend + market state connected";
    } else if (connState === "DEGRADED") {
      btn.textContent = "◐ DEGRADED";
      btn.title = statusLine || "Backend up — market state stale";
    } else if (reconnecting) {
      btn.textContent = "● RECONNECTING…";
      btn.title = statusLine || "Reconnecting to backend…";
    } else if (connState === "FAILED") {
      btn.textContent = "● FAILED — RECONNECT";
      btn.title = statusLine || "Connection failed — click RECONNECT";
    } else {
      btn.textContent = "● OFFLINE — RECONNECT";
      btn.title = statusLine || "Backend offline";
    }
  }

  function karenAck(tool, variant) {
    return window.DeskCopilotPersona?.karenToolAck?.(tool, variant) || "";
  }

  function setKarenPhase(phase) {
    karenUiPhase = phase || "idle";
    const el = document.getElementById("dc-voice-mode");
    if (phase === "listening" || (window.DeskCopilotVoice?.isListening?.() && !phase)) {
      updateVoiceModeBanner();
      syncVoiceHeroUI("listening");
      syncHeaderStatus({ karen: "LISTENING" });
      return;
    }
    const line = window.DeskCopilotPersona?.karenStatusLine?.(phase) || "";
    if (el && line) {
      let text = line;
      if (window.DeskCopilotVoice?.isListening?.() && phase === "marking_levels") {
        text = `${line} · talk anytime`;
      }
      el.textContent = text.replace(/^KAREN\s*[·•]\s*/i, "");
      el.classList.add("active");
      el.classList.remove("hidden");
    }
    syncVoiceHeroUI(phase);
    syncHeaderStatus();
  }

  function speakKarenAck(tool, variant) {
    const line = karenAck(tool, variant);
    if (!line) return;
    setMsg(`Karen · ${line}`, null);
    voiceSpeakAck(line);
  }

  function setMsg(t, ok) {
    const m = document.getElementById("dc-msg");
    if (window.DeskCopilotUI?.absorbMarketDataMessage?.(t)) {
      if (m) m.textContent = "";
      return;
    }
    m.textContent = t;
    m.className = "dc-msg" + (ok ? " ok" : ok === false ? " err" : "");
  }

  function isInvalidated(err) {
    const m = (err?.message || String(err)).toLowerCase();
    return m.includes("invalidated") || m.includes("extension context");
  }

  function recoverFromStaleExtension() {
    if (sessionStorage.getItem("dc-stale-reload")) {
      setMsg("Close tab → reload extension → open fresh chart", false);
      return;
    }
    sessionStorage.setItem("dc-stale-reload", "1");
    setMsg("Updating extension…", null);
    setTimeout(() => location.reload(), 400);
  }

  function bgSend(msg, timeoutMs = 20000) {
    const trace = window.DeskCopilotRequestTrace?.getActiveTrace?.();
    const endpoint = msg?.type || "unknown";
    const t0 = performance.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (trace) {
          window.DeskCopilotRequestTrace.recordApiCall(
            trace,
            endpoint,
            Math.round(performance.now() - t0),
            false,
            "timeout"
          );
        }
        reject(new Error("Timed out — try again"));
      }, timeoutMs);
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const ms = Math.round(performance.now() - t0);
          try {
            if (chrome.runtime.lastError) {
              const err = new Error(chrome.runtime.lastError.message || "Extension error");
              if (trace) {
                window.DeskCopilotRequestTrace.recordApiCall(trace, endpoint, ms, false, err.message);
              }
              if (isInvalidated(err)) recoverFromStaleExtension();
              reject(err);
              return;
            }
            if (res?.error && !Object.prototype.hasOwnProperty.call(res, "ok")) {
              if (trace) {
                window.DeskCopilotRequestTrace.recordApiCall(trace, endpoint, ms, false, res.error);
              }
              reject(new Error(res.error));
              return;
            }
            if (res?.ok === false) {
              if (trace) {
                window.DeskCopilotRequestTrace.recordApiCall(trace, endpoint, ms, false, res.error || "ok:false");
              }
              resolve(res);
              return;
            }
            if (res?.error) {
              if (trace) {
                window.DeskCopilotRequestTrace.recordApiCall(trace, endpoint, ms, false, res.error);
              }
              reject(new Error(res.error));
            } else {
              if (trace) window.DeskCopilotRequestTrace.recordApiCall(trace, endpoint, ms, true);
              resolve(res);
            }
          } catch (e) {
            if (trace) {
              window.DeskCopilotRequestTrace.recordApiCall(
                trace,
                endpoint,
                ms,
                false,
                e instanceof Error ? e.message : String(e)
              );
            }
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      } catch (e) {
        clearTimeout(timer);
        if (trace) {
          window.DeskCopilotRequestTrace.recordApiCall(
            trace,
            endpoint,
            Math.round(performance.now() - t0),
            false,
            e instanceof Error ? e.message : String(e)
          );
        }
        if (isInvalidated(e)) recoverFromStaleExtension();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  function expandDeskText(text) {
    return window.DeskCopilotPlainLanguage?.expandTradingAbbreviations?.(text) || text;
  }

  function stripAssistantNamePrefix(text) {
    return window.DeskCopilotPersona?.stripAssistantNamePrefix?.(text) ?? String(text || "").trim();
  }

  function displayText(text) {
    return expandDeskText(String(text || "").replace(/^META:.*$/gim, "").trim());
  }

  function chatLineFromVerdict(data) {
    const brief = (data?.spokenBrief || "").trim();
    if (brief) return displayText(brief);
    const panel = displayText(data?.verdict || "").trim();
    if (!panel) return "";
    const lines = panel
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^META:/i.test(l));
    if (lines.length >= 2) return lines.slice(0, 5).join("\n");
    return lines[0] || panel.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  }

  function ensureChartReadUserBubble(question) {
    const q = String(question || "get the read").trim();
    if (!q) return;
    const norm = q.toLowerCase();
    const lastUser = [...chatHistory].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const lastNorm = lastUser.content.trim().toLowerCase();
      if (lastNorm === norm) return;
      if (isChartReadCommand(lastUser.content) && isChartReadCommand(q)) {
        lastUser.content = q;
        return;
      }
    }
    recordUserTranscript(q);
    const entry = chatHistory.at(-1);
    if (entry?.role === "user") entry.content = q;
  }

  function shouldSkipAssistantEcho(text) {
    if (window.DeskCopilotRealtime?.isScriptSpeaking?.()) return true;
    if (inCasualThread() && window.DeskCopilotCasual?.isTradingRedirect?.(text)) return true;
    return matchesRecentAssistantSpeech(text);
  }

  function appendChatBubble(role, text) {
    const chat = document.getElementById("dc-chat");
    const div = createBubbleElement(role, text);
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  let lastRecordedUserText = "";
  let lastRecordedUserAt = 0;

  function recordUserTranscript(text) {
    const t = displayText(text).trim();
    if (!t) return false;
    const norm = t.toLowerCase();
    const now = Date.now();
    if (norm === lastRecordedUserText && now - lastRecordedUserAt < 8000) return false;
    lastRecordedUserText = norm;
    lastRecordedUserAt = now;
    appendChatBubble("user", t);
    chatHistory.push({ role: "user", content: t });
    trimHistory();
    void window.DeskCopilotMemory?.rememberExchange?.(t, "");
    return true;
  }

  let lastRecordedAssistantText = "";
  let lastRecordedAssistantAt = 0;
  let suppressAssistantEchoUntil = 0;

  function inCasualThread(forText) {
    const lastUser = String(forText || getLastUserText() || "").trim();
    if (!lastUser) return false;
    if (mustUseTradingStream(lastUser)) return false;
    const core = window.DeskCopilotCasual?.normalizeDeskQuestion?.(lastUser) || lastUser;
    if (window.DeskCopilotCasual?.isClearlyTrading?.(lastUser)) return false;
    if (window.DeskCopilotCasual?.isClearlyTrading?.(core)) return false;
    if (typeof prefersRichTradingAnswer === "function" && (prefersRichTradingAnswer(lastUser) || prefersRichTradingAnswer(core))) {
      return false;
    }
    if (typeof needsScopedChartAnswer === "function" && (needsScopedChartAnswer(lastUser) || needsScopedChartAnswer(core))) {
      return false;
    }
    if (lastSnapshotIntent === "casual" && lastUser && isCasualMessage(lastUser)) return true;
    return isCasualMessage(lastUser);
  }

  function shouldAcceptAssistantEcho(text) {
    if (shouldSkipAssistantEcho(text)) return false;
    if (window.DeskCopilotRealtime?.isScriptSpeaking?.()) return false;
    if (window.DeskCopilotRealtime?.getTurnMode?.() === "casual") return false;
    const last = chatHistory.at(-1);
    if (last?.role !== "user") return false;
    const lastUser = last.content || "";
    if (isCasualMessage(lastUser)) return false;
    if (lastSnapshotIntent === "casual") return false;
    return true;
  }

  function removeOrphanAssistantBeforeLastUser() {
    if (chatHistory.length < 2) return;
    const last = chatHistory.at(-1);
    const prev = chatHistory.at(-2);
    if (last?.role !== "user" || prev?.role !== "assistant") return;
    const beforePrev = chatHistory.at(-3);
    if (beforePrev?.role === "user") return;
    chatHistory.splice(-2, 1);
    const chat = document.getElementById("dc-chat");
    const bots = chat?.querySelectorAll(".dc-bubble-bot");
    bots?.[bots.length - 1]?.remove();
  }

  function assistantBubbleText(text) {
    const t = stripAssistantNamePrefix(displayText(text).trim());
    if (!t) return "";
    const lastUser =
      [...chatHistory].reverse().find((m) => m.role === "user")?.content || "";
    const stripped = window.DeskCopilotCasual?.stripSteerBack?.(t) ?? t;
    if (!stripped) return "";
    if (inCasualThread()) {
      if (window.DeskCopilotCasual?.isPersonaQuestion?.(lastUser) && window.DeskCopilotCasual?.isTradingRedirect?.(stripped)) {
        return "";
      }
      if (window.DeskCopilotCasual?.isGenericReply?.(stripped)) {
        return sanitizeCasualReply(stripped, lastUser);
      }
      return stripped.length >= 4 ? stripped : sanitizeCasualReply(stripped, lastUser);
    }
    return stripped;
  }

  function recordAssistantReply(text) {
    const out = assistantBubbleText(text);
    if (!out) return false;
    if (window.DeskCopilotUI?.absorbMarketDataMessage?.(out)) return false;
    if (lastSnapshotIntent === "casual") {
      const last = chatHistory.at(-1);
      if (last?.role === "assistant") {
        replaceLastAssistantReply(out);
        return false;
      }
    }
    const norm = out.toLowerCase();
    const now = Date.now();
    if (norm === lastRecordedAssistantText && now - lastRecordedAssistantAt < 8000) return false;
    const last = chatHistory.at(-1);
    if (last?.role === "assistant") {
      const prev = last.content.toLowerCase();
      if (prev === norm || prev.includes(norm) || norm.includes(prev.slice(0, 48))) return false;
    }
    lastRecordedAssistantText = norm;
    lastRecordedAssistantAt = now;
    appendChatBubble("assistant", out);
    chatHistory.push({ role: "assistant", content: out });
    trimHistory();
    void rememberLastExchange(out);
    return true;
  }

  async function publishAssistantReply(rawText, voice, opts = {}, onDone) {
    const lastUser = getLastUserText();
    let bubbleText = assistantBubbleText(rawText);
    if (lastUser && isWeatherQuestion(lastUser) && bubbleText && !acceptLiveSearchReply(bubbleText, lastUser)) {
      voiceLog("weather guess blocked at publish — using fallback");
      bubbleText = LIVE_DATA_FALLBACK_MSG;
    }
    if (!bubbleText) {
      onDone?.();
      return "";
    }
    if (voice && shouldSpeakReply(voice)) {
      window.DeskCopilotVoice?.primeAudioPlayback?.();
    }
    const recorded = recordAssistantReply(bubbleText);
    if (!recorded) {
      const last = chatHistory.at(-1);
      if (last?.role === "assistant" && last.content.trim() !== bubbleText.trim()) {
        replaceLastAssistantReply(bubbleText);
      }
    }
    if (voice && shouldSpeakReply(voice)) {
      const toSpeak = streamVoiceSpeakTarget(
        lastAssistantBubbleDom() || lastAssistantText() || bubbleText
      );
      if (!shouldPublishVoiceSpeak(toSpeak)) {
        voiceLog("speak skipped — bubble already delivered");
        onDone?.();
        return toSpeak;
      }
      const emotion = window.DeskCopilotVoiceEmotion?.speechEmotionFor?.(toSpeak);
      const speakOpts = {
        ...opts,
        fromBubble: true,
        instant:
          window.DeskCopilotVoiceQuickReply?.prefersInstantVoice?.(toSpeak, {
            instant: opts.instant,
            vercelTts: opts.vercelTts === true,
            preferApiTts: emotion?.preferApiTts,
          }) ?? opts.instant !== false,
      };
      await deliverVoiceReply("", onDone, speakOpts);
    } else {
      onDone?.();
    }
    const spoken = streamVoiceSpeakTarget(lastAssistantBubbleDom() || lastAssistantText() || bubbleText);
    if (window.DeskCopilotRequestTrace?.getActiveTrace?.()) {
      const src = opts.traceSource || (voice ? "voice" : "chat");
      const path =
        opts.groundingPath ||
        (src === "local" ? "local" : src === "snapshot" ? "snapshot" : src === "pipeline" ? "pipeline" : "stream");
      endRequestTrace({
        source: src,
        preview: bubbleText,
        groundingPath: path,
        grounded: opts.grounded ?? (path === "local" || path === "snapshot" || path === "pipeline"),
        voice,
        factIds: opts.factIds,
        skipExport: opts.skipExport === true,
        fail: opts.traceFail === true,
        failStage: opts.traceFailStage,
        reason: opts.traceFailReason,
      });
    }
    return spoken;
  }

  function seedWelcome() {
    if (chatHistory.length) return;
    const welcome =
      window.DeskCopilotPersona?.welcome ||
      "Hey — Karen here. Analyse market for the desk verdict, or ask me why in the mentor panel.";
    chatHistory.push({ role: "assistant", content: welcome });
    appendChatBubble("assistant", welcome);
  }

  async function refreshStats() {
    try {
      const s = await bgSend({ type: "STATS" });
      document.getElementById("dc-stats").textContent = `${s.total} READ${s.total === 1 ? "" : "S"} TODAY`;
    } catch {
      /* quiet on load */
    }
  }

  function friendlyConnectError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalidated|extension context/i.test(msg)) {
      return "Extension updated — refresh TradingView (Ctrl+Shift+R)";
    }
    if (/timed out/i.test(msg)) {
      return "Vercel backend slow — hit RECONNECT on the panel";
    }
    return msg;
  }

  async function pingBackend(reconnect = false) {
    if (pingInFlight) {
      const deadline = Date.now() + (reconnect ? 12000 : 6500);
      while (pingInFlight && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 80));
      }
      if (pingInFlight) return backendOnline;
      if (backendOnline && !reconnect) return true;
    }
    pingInFlight = true;
    try {
      const r = await bgSend({ type: reconnect ? "RECONNECT" : "PING" }, reconnect ? 12000 : 6500);
      lastBackendCheck = Date.now();
      if (r?.ok) {
        applyConnectionSnapshot(r.diagnostics || r);
        if (reconnect) {
          setMsg(r.statusLine || `Desk online (${r.base || "Vercel"})`, r.liveDataAvailable !== false);
          void window.DeskCopilotTracker?.refresh?.({ freeze: true, forceClose: true });
        } else {
          setMsg(r.liveDataAvailable ? "" : r.statusLine || "", r.liveDataAvailable ? null : false);
        }
        if (window.DeskCopilotRealtime?.prefetchSession) {
          void window.DeskCopilotRealtime.prefetchSession(symbol());
        }
        if (!window.DeskCopilotVoice?.isUserVoiceOff?.()) {
          void tryStartAutonomousVoice();
        }
        if (!isUserRequestBusy()) {
          refreshContextStrip({ forceBridge: true, bias: reconnect || !contextStripBiasHint });
        }
        return r.liveDataAvailable !== false || r.ok;
      }
      throw new Error(r?.error || "Backend not reachable");
    } catch (e) {
      pingFailStreak += 1;
      lastBackendFail = Date.now();
      if (connectionSnapshot) {
        applyConnectionSnapshot({
          ...connectionSnapshot,
          backendUp: false,
          state: "DISCONNECTED",
          lastError: e instanceof Error ? e.message : String(e),
        });
      } else {
        setBackendStatus(false);
      }
      setMsg(friendlyConnectError(e), false);
      updateAgentStatus();
      return false;
    } finally {
      pingInFlight = false;
    }
  }

  function startServiceWorkerKeepalive() {
    let port = null;
    let timer = null;

    function connect() {
      try {
        port = chrome.runtime.connect({ name: "desk-copilot-keepalive" });
      } catch {
        port = null;
        return;
      }
      port.onDisconnect.addListener(() => {
        port = null;
        setTimeout(connect, 1500);
      });
    }

    connect();
    timer = setInterval(() => {
      try {
        port?.postMessage({ t: Date.now() });
      } catch {
        connect();
      }
    }, 20000);

    window.addEventListener("beforeunload", () => {
      if (timer) clearInterval(timer);
      try {
        port?.disconnect();
      } catch {
        /* ignore */
      }
    });
  }

  async function initBackend() {
    warmBackend();
    prefetchTurnExtras();
    void refreshConnectionState();
    void window.DeskCopilotRealtime?.prefetchSession?.(symbol());
    if (isAutoVoiceEnabled() && voiceReady && !window.DeskCopilotVoice?.isUserVoiceOff?.()) {
      void tryStartAutonomousVoice();
    }
    if (await pingBackend(true)) {
      setTimeout(() => refreshStats(), 2500);
      if (document.getElementById("dc-auto-levels")?.checked) {
        setTimeout(() => drawLevels({ silent: true }).catch(() => {}), 6000);
      }
      return;
    }
    setTimeout(() => void pingBackend(true), 4000);
  }

  function startWarmKeepalive() {
    setInterval(() => {
      if (document.hidden || !isPanelExpanded()) return;
      warmBackend();
    }, 240000);
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (document.hidden || pingInFlight) return;
      void pingBackend(false);
      void refreshConnectionState();
      updateMarketBarUI();
    }, 60000);
    setInterval(() => {
      if (document.hidden) return;
      void refreshConnectionState();
      updateMarketBarUI();
    }, 5000);
  }

  document.getElementById("dc-reconnect").onclick = () => {
    speakUiFeedback(karenUiAck("reconnect"));
    setMsg("Reconnecting…", null);
    window.DeskCopilotVoice?.primeAudioPlayback?.();
    void pingBackend(true);
  };

  async function fetchLevelsPayload() {
    return bgSend({ type: "LEVELS" }, 65000);
  }

  let levelToggleState = window.DeskCopilotLevelToggles?.defaultToggles?.() || {};

  function readLevelTogglesFromUI() {
    const toggles = window.DeskCopilotLevelToggles?.defaultToggles?.() || {};
    for (const cat of window.DeskCopilotLevelToggles?.CATEGORIES || []) {
      const el = document.getElementById(`dc-toggle-${cat.key}`);
      if (el) toggles[cat.key] = el.checked;
    }
    return toggles;
  }

  function applyLevelTogglesToUI(toggles) {
    for (const cat of window.DeskCopilotLevelToggles?.CATEGORIES || []) {
      const el = document.getElementById(`dc-toggle-${cat.key}`);
      if (el) el.checked = toggles[cat.key] !== false;
    }
  }

  const LEVEL_TOGGLE_GROUPS = [
    { slug: "opening", label: "Opening & execution", keys: ["showOrg", "showFpfvg"] },
    { slug: "htf", label: "Higher timeframe", keys: ["showPd", "showGap", "showDailyFvg"] },
    { slug: "session", label: "Session liquidity", keys: ["showSession", "showRehRel"] },
  ];

  function renderLevelToggle(cat) {
    const tip = cat.teach.replace(/"/g, "&quot;");
    return `
        <label class="dc-level-toggle">
          <input type="checkbox" id="dc-toggle-${cat.key}" data-level-key="${cat.key}" />
          <span class="dc-level-toggle-body">
            <span class="dc-level-toggle-head">
              <span class="dc-level-toggle-name">${cat.label}</span>
              <span class="dc-level-toggle-tip" data-tip="${tip}" tabindex="0" aria-label="${tip}">?</span>
            </span>
            <span class="dc-level-toggle-teach">${cat.teach}</span>
          </span>
        </label>`;
  }

  function initLevelToggleTips() {
    let tipEl = document.getElementById("dc-tip-layer");
    if (!tipEl) {
      tipEl = document.createElement("div");
      tipEl.id = "dc-tip-layer";
      tipEl.className = "dc-tip-layer";
      tipEl.setAttribute("role", "tooltip");
      document.body.appendChild(tipEl);
    }
    const host = document.getElementById("dc-level-toggles");
    if (!host || host.dataset.tipsBound) return;
    host.dataset.tipsBound = "1";

    let activeTip = null;

    function hideTip() {
      activeTip = null;
      tipEl.classList.remove("visible");
    }

    function showTip(anchor) {
      const text = anchor?.dataset?.tip;
      if (!text) return hideTip();
      activeTip = anchor;
      tipEl.textContent = text;
      tipEl.classList.add("visible");
      const rect = anchor.getBoundingClientRect();
      const tipRect = tipEl.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left));
      let top = rect.top - tipRect.height - 8;
      if (top < 8) top = rect.bottom + 8;
      tipEl.style.left = `${Math.round(left)}px`;
      tipEl.style.top = `${Math.round(top)}px`;
    }

    host.addEventListener("mouseover", (e) => {
      const tip = e.target?.closest?.(".dc-level-toggle-tip[data-tip]");
      if (tip) showTip(tip);
    });
    host.addEventListener("mouseout", (e) => {
      const from = e.target?.closest?.(".dc-level-toggle-tip[data-tip]");
      const to = e.relatedTarget?.closest?.(".dc-level-toggle-tip[data-tip]");
      if (from && from !== to) hideTip();
    });
    host.addEventListener("focusin", (e) => {
      const tip = e.target?.closest?.(".dc-level-toggle-tip[data-tip]");
      if (tip) showTip(tip);
    });
    host.addEventListener("focusout", (e) => {
      const from = e.target?.closest?.(".dc-level-toggle-tip[data-tip]");
      const to = e.relatedTarget?.closest?.(".dc-level-toggle-tip[data-tip]");
      if (from && from !== to) hideTip();
    });
    window.addEventListener("scroll", hideTip, true);
    panel.addEventListener("scroll", hideTip, true);
  }

  function buildLevelToggleUI() {
    const host = document.getElementById("dc-level-toggles");
    if (!host || !window.DeskCopilotLevelToggles?.CATEGORIES) return;
    const byKey = Object.fromEntries(
      window.DeskCopilotLevelToggles.CATEGORIES.map((cat) => [cat.key, cat])
    );
    host.innerHTML = LEVEL_TOGGLE_GROUPS.map((group) => {
      const items = group.keys
        .map((key) => byKey[key])
        .filter(Boolean)
        .map((cat) => renderLevelToggle(cat))
        .join("");
      return `<div class="dc-level-group dc-level-group-${group.slug}"><div class="dc-level-group-head">${group.label}</div>${items}</div>`;
    }).join("");
  }

  async function initLevelToggles() {
    if (!window.DeskCopilotLevelToggles) return;
    buildLevelToggleUI();
    levelToggleState = await window.DeskCopilotLevelToggles.load();
    applyLevelTogglesToUI(levelToggleState);
    document.getElementById("dc-level-toggles")?.addEventListener("change", (e) => {
      const input = e.target?.closest?.("input[data-level-key]");
      if (!input) return;
      levelToggleState = readLevelTogglesFromUI();
      void window.DeskCopilotLevelToggles.save(levelToggleState);
      const cached = window.DeskCopilotDraw?.loadCache?.();
      const hasDrawn =
        (window.DeskCopilotDraw?.getActiveLevels?.()?.length || 0) > 0 ||
        window.DeskCopilotDraw?.isOverlayActive?.();
      if (cached && hasDrawn) {
        void drawLevels({ cached, skipFetch: true });
      }
    });
  }

  function filterLevelsForDraw(payload) {
    if (!payload || !window.DeskCopilotLevelToggles?.filter) return payload;
    return window.DeskCopilotLevelToggles.filter(payload, levelToggleState);
  }

  async function drawLevels(opts = {}) {
    if (!window.DeskCopilotDraw) {
      setMsg("Draw module not loaded — reload the extension at chrome://extensions", false);
      return null;
    }
    if (levelsBusy && !opts.cached && !opts.skipFetch) {
      setMsg("Levels already loading — wait for Yahoo fetch to finish (30–60 sec)", null);
      return null;
    }
    const drawSeq = ++drawLevelsSeq;
    levelsBusy = true;
    if (!opts.silent) setKarenPhase("marking_levels");
    setMsg(
      opts.silent
        ? ""
        : opts.skipFetch
          ? "Updating level view…"
          : "Karen · pulling levels (30–60 sec)…",
      null
    );
    try {
      let payload = opts.cached || null;
      let usedCache = false;
      if (!payload && !opts.skipFetch) {
        try {
          payload = await fetchLevelsPayload();
          if (drawSeq !== drawLevelsSeq) return null;
          if (payload?.error) throw new Error(payload.error);
          const live = await window.DeskCopilotChartPrice?.read?.();
          if (drawSeq !== drawLevelsSeq) return null;
          if (live != null) {
            payload.lastPrice1m = live;
            if (payload.priceHint) payload.priceHint.last = live;
            payload.priceSource = "chart";
          }
          window.DeskCopilotDraw.cache(payload);
        } catch (fetchErr) {
          payload = window.DeskCopilotDraw.loadCache?.();
          if (!payload?.levels?.length && !payload?.zones?.length) throw fetchErr;
          usedCache = true;
        }
      }
      if (!payload) {
        payload = window.DeskCopilotDraw.loadCache?.();
        usedCache = Boolean(payload);
      }
      if (drawSeq !== drawLevelsSeq) return null;
      const drawPayload = filterLevelsForDraw(payload);
      if (!drawPayload?.levels?.length && !drawPayload?.zones?.length) {
        window.DeskCopilotDraw?.clear();
        setMsg("No level categories enabled — chart cleared", null);
        return null;
      }
      const result = await window.DeskCopilotDraw.draw(drawPayload, opts.overlayOnly === true);
      if (drawSeq !== drawLevelsSeq) return null;
      const n = result.count || (drawPayload.levels?.length || 0) + (drawPayload.zones?.length || 0);
      if (result.ok) {
        const mode = result.mode === "native" ? "TradingView lines" : "overlay";
        const cacheNote = usedCache ? " · cached" : "";
        window.DeskCopilotVerdictUI?.setLevelsStatus?.(`${result.count ?? n} levels`, true);
        setMsg(`${result.count ?? n} levels marked · ${mode}${cacheNote}${result.hint ? " — " + result.hint : ""}`, true);
        setKarenPhase("listening");
        refreshContextStrip({ forceBridge: true, bias: true });
      } else if (result.reason === "superseded") {
        return null;
      } else {
        const hint =
          result.reason === "no_chart_pane"
            ? "Chart not found — maximize chart pane, then MARK LEVELS again"
            : result.hint || result.reason || "Mark failed — backend online? Try RECONNECT";
        setMsg(hint, false);
      }
      return payload;
    } catch (e) {
      if (drawSeq !== drawLevelsSeq) return null;
      const reason = explainError(e, "levels");
      setMsg(reason, false);
      return null;
    } finally {
      if (drawSeq === drawLevelsSeq) {
        levelsBusy = false;
        if (
          !opts.silent &&
          !verdictBusy &&
          !chatBusy &&
          !window.DeskCopilotVoice?.isListening?.()
        ) {
          setKarenPhase("idle");
          window.DeskCopilotVerdictUI?.showReadyState?.();
        }
      }
    }
  }

  document.getElementById("dc-get-verdict").onclick = () => {
    if (window.DeskCopilotMockAnalysis?.isEnabled?.()) {
      runMockVerdictLifecycle();
      return;
    }
    const blocked = chartReadBlockedReason();
    if (blocked) {
      setMsg(`Busy — ${blocked}.`, false);
      return;
    }
    speakUiFeedback(karenUiAck("chart_read"));
    if (levelsBusy) {
      setMsg("Levels still loading in background — chart read uses live screenshot.", null);
    }
    enqueueUserMessage("get the read", { voice: false });
  };

  document.getElementById("dc-new-analysis")?.addEventListener("click", () => {
    mockAnalysisBusy = false;
    mockKarenSpeaking = false;
    window.DeskCopilotVerdictUI?.resetMockAnalysis?.();
    setKarenPhase("idle");
    syncVoiceHeroUI("idle");
    setMsg("Ready for mock analysis — press ANALYSE MARKET", null);
  });

  function initMockAnalysisControls() {
    const Mock = window.DeskCopilotMockAnalysis;
    if (!Mock) return;
    const enabledEl = document.getElementById("dc-mock-enabled");
    const scenarioEl = document.getElementById("dc-mock-scenario");
    if (enabledEl) {
      enabledEl.checked = Mock.isEnabled();
      enabledEl.onchange = () => {
        Mock.setEnabled(enabledEl.checked);
        setMsg(
          enabledEl.checked
            ? "Mock analysis ON — ANALYSE MARKET uses demo data only"
            : "Mock analysis OFF — live pipeline restored",
          null
        );
        if (!enabledEl.checked) {
          mockAnalysisBusy = false;
          mockKarenSpeaking = false;
          window.DeskCopilotVerdictUI?.resetMockAnalysis?.();
        }
      };
    }
    if (scenarioEl) {
      scenarioEl.value = Mock.getScenarioKey();
      scenarioEl.onchange = () => {
        Mock.setScenarioKey(scenarioEl.value);
        setMsg(`Mock scenario · ${scenarioEl.value}`, null);
      };
    }
  }

  function runMockVerdictLifecycle() {
    if (mockAnalysisBusy) {
      setMsg("Mock analysis already running…", null);
      return;
    }
    mockAnalysisBusy = true;
    mockKarenSpeaking = false;
    setKarenPhase("analyzing");
    setMsg("Karen · MOCK analysis — no backend calls", null);
    syncVoiceHeroUI("analyzing");

    window.DeskCopilotVerdictUI?.runMockAnalysis?.({
      onAnalyzing: () => {
        setKarenPhase("analyzing");
        syncVoiceHeroUI("analyzing");
      },
      onVerdict: (data) => {
        setKarenPhase("thinking");
        syncVoiceHeroUI("thinking");
        const line = data?.spokenBrief || "Mock verdict ready.";
        recordAssistantReply(`[MOCK ANALYSIS] ${line}`);
        setMsg("MOCK ANALYSIS — demo data only", null);
      },
      onSpeaking: () => {
        mockKarenSpeaking = true;
        setKarenPhase("chatting");
        syncVoiceHeroUI("speaking");
        window.DeskCopilotVerdictUI?.showSpeakingState?.(true);
      },
      onSpeakingDone: () => {
        mockKarenSpeaking = false;
        mockAnalysisBusy = false;
        setKarenPhase("idle");
        syncVoiceHeroUI("idle");
        window.DeskCopilotVerdictUI?.showSpeakingState?.(false);
        setMsg("Mock verdict ready — NEW ANALYSIS to reset", null);
      },
    });
  }

  initMockAnalysisControls();
  window.DeskCopilotVerdictUI?.showReadyState?.();

  document.getElementById("dc-levels-draw").onclick = () => {
    speakUiFeedback(karenUiAck("mark_levels"));
    void drawLevels();
  };
  document.getElementById("dc-levels-clear").onclick = () => {
    speakUiFeedback(karenUiAck("strip_levels"));
    window.DeskCopilotDraw?.clear();
    setMsg("Levels stripped", null);
  };
  document.getElementById("dc-levels-copy").onclick = async () => {
    try {
      const payload = window.DeskCopilotDraw?.loadCache?.() || (await fetchLevelsPayload());
      if (payload?.error) throw new Error(payload.error);
      const ok = await window.DeskCopilotDraw?.copy(payload);
      setMsg(ok ? "Levels copied to clipboard" : "Copy failed", ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e), false);
    }
  };

  try {
    document.getElementById("dc-auto-levels").checked = localStorage.getItem("dc-auto-levels") === "1";
  } catch {
    /* ignore */
  }
  document.getElementById("dc-auto-levels").onchange = (e) => {
    try {
      localStorage.setItem("dc-auto-levels", e.target.checked ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (e.target.checked) {
      speakUiFeedback(karenUiAck("mark_levels"));
      void drawLevels();
    }
  };

  void initLevelToggles();
  void window.DeskCopilotDraw?.syncBridge?.();

  function isAutoVoiceEnabled() {
    try {
      return localStorage.getItem("dc-auto-voice") !== "0";
    } catch {
      return true;
    }
  }

  let karenBootSpoken = true;
  let voiceStartInFlight = false;
  let lastRealtimeUpgradeAttempt = 0;
  let lastRealtimeUpgradeFailed = 0;
  const REALTIME_UPGRADE_COOLDOWN_MS = 180000;
  let listenUiTimer = null;
  let listenUiPendingOff = false;

  function shouldRetryRealtimeUpgrade() {
    if (Date.now() - lastRealtimeUpgradeAttempt < REALTIME_UPGRADE_COOLDOWN_MS) return false;
    if (
      lastRealtimeUpgradeFailed &&
      Date.now() - lastRealtimeUpgradeFailed < REALTIME_UPGRADE_COOLDOWN_MS
    ) {
      return false;
    }
    return true;
  }

  function applyListeningUi(active, recording) {
    listenUiPendingOff = false;
    if (listenUiTimer) {
      clearTimeout(listenUiTimer);
      listenUiTimer = null;
    }
    updateVoiceToggle(active, recording);
    updateAgentStatus();
  }

  function queueListeningUi(active, recording) {
    if (active) {
      applyListeningUi(true, recording);
      return;
    }
    if (
      window.DeskCopilotRealtime?.wantsActive?.() &&
      window.DeskCopilotVoice?.getEngineMode?.() === "realtime"
    ) {
      if (listenUiPendingOff) return;
      listenUiPendingOff = true;
      if (listenUiTimer) clearTimeout(listenUiTimer);
      listenUiTimer = setTimeout(() => {
        listenUiTimer = null;
        listenUiPendingOff = false;
        if (window.DeskCopilotRealtime?.isActive?.()) return;
        if (!window.DeskCopilotRealtime?.wantsActive?.()) {
          applyListeningUi(false, recording);
        }
      }, 2000);
      return;
    }
    applyListeningUi(false, recording);
  }

  function setVoiceConnectionStatus(text, ok) {
    const t = String(text || "");
    if (
      /connecting|reconnecting|socket open/i.test(t) &&
      window.DeskCopilotRealtime?.isActive?.() &&
      window.DeskCopilotVoice?.getEngineMode?.() === "realtime"
    ) {
      return;
    }
    setMsg(t, ok);
    if (/hearing you|listening|voice live/i.test(t)) setKarenPhase("listening");
  }

  async function tryStartAutonomousVoice() {
    if (voiceStartInFlight || !voiceReady || !isAutoVoiceEnabled()) return;
    if (window.DeskCopilotVoice?.isUserVoiceOff?.()) return;
    if (window.DeskCopilotVoice?.isListening?.()) return;
    void window.DeskCopilotRealtime?.prefetchSession?.(symbol());
    voiceStartInFlight = true;
    try {
      if (window.DeskCopilotVoice?.getEngineMode?.() === "cascade") {
        if (!shouldRetryRealtimeUpgrade()) return;
        lastRealtimeUpgradeAttempt = Date.now();
        const ok = await window.DeskCopilotVoice.upgradeToRealtime?.(symbol);
        if (ok) {
          lastRealtimeUpgradeFailed = 0;
          window.DeskCopilotRealtime?.setMicPaused?.(false);
          window.DeskCopilotVoice?.primeAudioPlayback?.();
          applyListeningUi(true, window.DeskCopilotVoice?.isRecording?.());
        } else {
          lastRealtimeUpgradeFailed = Date.now();
        }
        return;
      }
      if (window.DeskCopilotVoice?.isListening?.()) return;
      const ok = await window.DeskCopilotVoice.startAutonomous?.(symbol);
      if (ok) {
        lastRealtimeUpgradeFailed = 0;
        window.DeskCopilotRealtime?.setMicPaused?.(false);
        window.DeskCopilotVoice?.primeAudioPlayback?.();
        applyListeningUi(true, window.DeskCopilotVoice?.isRecording?.());
      } else if (window.DeskCopilotVoice?.getEngineMode?.() === "cascade") {
        lastRealtimeUpgradeFailed = Date.now();
      }
    } finally {
      voiceStartInFlight = false;
    }
  }

  function startAgentLoop() {
    if (agentLoopTimer) return;
    agentLoopTimer = setInterval(() => {
      if (!isAutoVoiceEnabled() || window.DeskCopilotVoice?.isUserVoiceOff?.()) {
        updateAgentStatus();
        return;
      }
      if (
        !backendOnline &&
        !pingInFlight &&
        Date.now() - lastBackendFail > 45000
      ) {
        void pingBackend(true);
      }
      if (voiceReady) {
        if (
          window.DeskCopilotRealtime?.isMicPaused?.() &&
          !window.DeskCopilotVoice?.isSpeaking?.()
        ) {
          window.DeskCopilotRealtime?.forceResumeListening?.("agent-loop");
        }
        if (
          !window.DeskCopilotVoice?.isListening?.() &&
          !window.DeskCopilotRealtime?.wantsActive?.()
        ) {
          void tryStartAutonomousVoice();
        } else if (
          window.DeskCopilotVoice?.getEngineMode?.() === "cascade" &&
          shouldRetryRealtimeUpgrade()
        ) {
          void tryStartAutonomousVoice();
        }
      }
      updateAgentStatus();
    }, 20000);
  }

  function updateVoiceModeBanner() {
    const el = document.getElementById("dc-voice-mode");
    if (!el) return;
    const mode = window.DeskCopilotVoice?.getEngineMode?.() || "off";
    const listening = window.DeskCopilotVoice?.isListening?.();
    if (mode === "cascade" && listening) {
      el.textContent =
        "Lower quality responses whilst in fallback — speak, then pause";
      el.classList.add("active");
      el.classList.remove("hidden");
    } else if (mode === "realtime" && listening) {
      el.textContent = "KAREN · live — talk anytime";
      el.classList.add("active");
      el.classList.remove("hidden");
    } else {
      el.textContent = "";
      el.classList.remove("active");
      el.classList.add("hidden");
    }
  }

  function updateVoiceToggle(listening, recording) {
    const btn = document.getElementById("dc-voice-toggle");
    if (!btn) return;
    const mode = window.DeskCopilotVoice?.getEngineMode?.() || "off";
    btn.classList.toggle("dc-voice-on", listening);
    btn.classList.toggle("dc-voice-rec", Boolean(recording));
    btn.classList.toggle("dc-voice-fallback", mode === "cascade" && listening);
    if (mode === "realtime") {
      btn.textContent = listening ? "● KAREN LIVE" : "VOICE OFF";
      btn.title = listening
        ? "Karen is live — talk anytime, click to stop"
        : "Click to start hands-free voice";
    } else if (mode === "cascade" && listening) {
      btn.textContent = recording ? "● FALLBACK · REC" : "● FALLBACK";
      btn.title =
        "Whisper fallback — lower quality responses whilst Realtime is unavailable. Speak, then pause.";
    } else {
      btn.textContent = recording ? "● LIVE" : listening ? "VOICE ON" : "VOICE OFF";
      btn.title = listening
        ? "Voice on — click to stop"
        : "Click to start hands-free voice";
    }
    updateVoiceModeBanner();
    updateLiveDot(listening);
    syncVoiceHeroUI(listening ? "listening" : "idle");
  }

  document.getElementById("dc-voice-hero")?.addEventListener("click", () => {
    document.getElementById("dc-voice-toggle")?.click();
  });

  document.getElementById("dc-voice-toggle").onclick = async () => {
    if (!voiceReady) {
      setMsg("Voice dead — use Chrome", false);
      return;
    }
    window.DeskCopilotVoice?.primeAudioPlayback?.();
    const wasOn = window.DeskCopilotVoice?.isListening?.();
    if (wasOn) {
      speakUiFeedback(karenUiAck("voice_off"), () => {
          window.DeskCopilotVoice?.stopAutonomous?.();
          updateVoiceToggle(false, false);
        });
      return;
    }
    speakUiFeedback(karenUiAck("voice_on"));
    warmBackend();
    prefetchTurnExtras();
    void window.DeskCopilotRealtime?.prefetchSession?.(symbol());
    const on = await window.DeskCopilotVoice.toggleAutonomous(symbol);
    updateVoiceToggle(on, window.DeskCopilotVoice.isRecording?.());
    if (!on) {
      setMsg("Voice could not start — allow mic for TradingView, then try again", false);
    }
  };

  function deskTimeReply() {
    const now = new Date();
    const est = now.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
    return `It's ${est} US Eastern on the desk clock.`;
  }

  function chartReadQuestion(argsQuestion) {
    const fromTool = (argsQuestion || "").trim();
    const generic =
      !fromTool ||
      /^(chart read|what do you see on the chart|read the chart|get the read)$/i.test(
        fromTool
      );
    if (!generic) return fromTool;
    return lastVoiceTranscript.trim() || "what do you see on the chart";
  }

  function normalizeVoiceQuestion(argsQuestion) {
    const q = chartReadQuestion(argsQuestion);
    return window.DeskCopilotVoiceInterpret?.applyVoiceRules?.(q) || q;
  }

  function formatRealtimeVoiceOutput(spokenBrief) {
    return [
      "ENGLISH ONLY. Read the following script verbatim — same words and numbers, no paraphrasing, no extra sentences:",
      spokenBrief,
    ].join("\n\n");
  }

  function clearVerdictTimer() {
    if (verdictTimer) {
      clearTimeout(verdictTimer);
      verdictTimer = null;
    }
  }

  function applySnapshotAnswer(data) {
    clearVerdictTimer();
    verdictBusy = false;

    const lastEntry = chatHistory.at(-1);
    if (lastEntry?.role === "user" && isCasualMessage(lastEntry.content)) {
      return;
    }

    if (data?.error) {
      recordAssistantReply(isInfraError(data.error) ? offlineChatMessage() : data.error);
      reportIssue(data.error);
      return;
    }

    const spoken = data.spokenBrief || data.spoken || data.panel || data.verdict || "";
    const lastUser =
      chatHistory.at(-1)?.role === "user"
        ? String(chatHistory.at(-1).content || "")
            .trim()
            .toLowerCase()
            .slice(0, 48)
        : "";
    const snapKey = `${data?.intent || ""}|${lastUser}|${spoken.slice(0, 80)}`;
    if (spoken && snapKey === lastAppliedVerdictKey && Date.now() - lastAppliedVerdictAt < 15000) {
      voiceLog("snapshot apply deduped");
      return;
    }
    if (spoken) {
      lastAppliedVerdictKey = snapKey;
      lastAppliedVerdictAt = Date.now();
    }
    lastSnapshotAnswer = spoken;
    lastSpokenBrief = spoken;
    lastSnapshotIntent = data.intent || lastSnapshotIntent;
    if (data?.verdict || data?.panel || data?.deskPipeline || data?.spokenBrief) {
      lastVerdict = data.verdict || lastVerdict;
      window.DeskCopilotVerdictUI?.applyVerdictData?.(data);
    }
    updateDeskBiasLine();
    void refreshContextStripPrice(true);
    suppressAssistantEchoUntil = Date.now() + 20000;
    if (spoken) {
      recordAssistantReply(spoken);
      const toSpeak = (
        lastAssistantBubbleDom() || lastAssistantText() || spoken
      ).trim();
      if (voiceReady && window.DeskCopilotVoice?.autoRead && toSpeak) {
        window.DeskCopilotVoice?.primeAudioPlayback?.();
        setMsg("", null);
        void deliverVoiceReply(
          "",
          () => {
            setMsg("Karen · live — talk anytime", true);
            setKarenPhase("listening");
          },
          {
            fromBubble: true,
            pauseMic: false,
            instant: true,
            deskBrief: true,
            speed: DESK_VERDICT_SPEAK_SPEED,
          }
        );
      } else {
        setMsg("Karen · live — talk anytime", true);
      }
    } else {
      setMsg("Karen · live — talk anytime", true);
    }
    if (window.DeskCopilotRequestTrace?.getActiveTrace?.()) {
      endRequestTrace({
        source: "snapshot",
        preview: spoken,
        factIds: data?.last_fact_ids,
        groundingPath: "snapshot",
        grounded: true,
      });
    }
  }

  let lastAppliedVerdictAt = 0;
  let lastAppliedVerdictKey = "";

  function applyVerdict(data) {
    clearVerdictTimer();
    verdictBusy = false;

    if (data?.error) {
      recordAssistantReply(isInfraError(data.error) ? offlineChatMessage() : data.error);
      reportIssue(data.error);
      return;
    }

    if (data?.scoped) {
      applySnapshotAnswer(data);
      return;
    }

    if (!isLiveDataAvailable() && !data?._liveDataBlocked) {
      const blocked = window.DeskCopilotConnection?.LIVE_DATA_UNAVAILABLE_VERDICT;
      window.DeskCopilotVerdictUI?.applyVerdictData?.(blocked, { lastKnown: false, liveDataOffline: true });
      recordAssistantReply(blocked?.spokenBrief || "WAIT / NO TRADE — LIVE DATA UNAVAILABLE");
      setMsg("LIVE DATA: OFFLINE — reconnect before trading on this read", false);
      return;
    }

    if (data?.reasoningLog) {
      window.__dcChartReasoningLog = window.__dcChartReasoningLog || [];
      window.__dcChartReasoningLog.push(data.reasoningLog);
      if (window.__dcChartReasoningLog.length > 40) window.__dcChartReasoningLog.shift();
      try {
        console.info("[dc chart reasoning]", data.reasoningLog);
      } catch {
        /* ignore */
      }
      if (routeDebugEnabled && data.quality) {
        const el = document.getElementById("dc-route-debug");
        if (el) {
          el.textContent = `route: chart_read · quality=${data.quality} · ${data.decisionVerdict || "pipeline"}`;
          el.classList.remove("hidden");
        }
      }
    }

    const applyKey = `${data?.id || ""}|${data?.spokenBrief || ""}|${(data?.verdict || "").slice(0, 64)}`;
    if (applyKey === lastAppliedVerdictKey && Date.now() - lastAppliedVerdictAt < 15000) {
      voiceLog("verdict apply deduped");
      return;
    }
    lastAppliedVerdictKey = applyKey;
    lastAppliedVerdictAt = Date.now();

    lastVerdict = data.verdict || "";
    lastSpokenBrief = data.spokenBrief || "";
    window.DeskCopilotVerdictUI?.applyVerdictData?.(data);
    updateDeskBiasLine();
    void refreshContextStripPrice(true);
    const panelShown = displayText(lastVerdict) || lastSpokenBrief;
    document.getElementById("dc-text").textContent = panelShown;
    const chatLine = chatLineFromVerdict(data);
    if (chatLine) {
      if (!recordAssistantReply(chatLine)) {
        replaceLastAssistantReply(chatLine);
      }
    }
    refreshStats();
    if (voiceReady && window.DeskCopilotVoice?.autoRead && chatLine) {
      const toSpeak = (
        lastAssistantBubbleDom() || lastAssistantText() || chatLine
      ).trim();
      window.DeskCopilotVoice?.primeAudioPlayback?.();
      setMsg("Karen · delivering brief…", null);
      void deliverVoiceReply("", () => {
        setMsg("Karen · live — talk anytime", true);
        setKarenPhase("listening");
      }, {
        fromBubble: true,
        pauseMic: true,
        deskBrief: true,
        speed: DESK_VERDICT_SPEAK_SPEED,
      });
    } else if (voiceReady && window.DeskCopilotVoice?.autoRead) {
      setMsg("Karen · live — talk anytime", true);
      setKarenPhase("listening");
    } else {
      setMsg("Your move.", true);
    }
    if (window.DeskCopilotRequestTrace?.getActiveTrace?.()) {
      endRequestTrace({
        source: "pipeline",
        preview: chatLine || lastSpokenBrief || panelShown,
        groundingPath: "pipeline",
        grounded: true,
      });
    }
  }

  function waitForVerdict(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        verdictWaiter = null;
        reject(new Error("Chart read timed out — backend may be cold or slow. Click RECONNECT, then try Analyse Market again."));
      }, timeoutMs);
      verdictWaiter = {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      };
    });
  }

  function onVerdictPayload(payload) {
    if (!payload) return;
    if (payload.ts && payload.ts <= lastHandledVerdictTs) return;
    if (payload.status === "capturing") {
      if (lastVerdictStatusPhase === "capturing") return;
      lastVerdictStatusPhase = "capturing";
      setKarenPhase("capturing");
      setMsg("Karen · capturing chart…", null);
      voiceSpeakAck(karenAck("capturing"));
      return;
    }
    if (payload.status === "analyzing") {
      if (lastVerdictStatusPhase === "analyzing") return;
      lastVerdictStatusPhase = "analyzing";
      setKarenPhase("analyzing");
      setMsg("Karen · building brief… 8–15 sec", null);
      voiceSpeakAck(karenAck("analyzing"));
      return;
    }
    if (payload.ts) lastHandledVerdictTs = payload.ts;
    if (verdictWaiter) {
      const w = verdictWaiter;
      verdictWaiter = null;
      if (payload.error) w.reject(new Error(payload.error));
      else if (payload.data) w.resolve(payload.data);
      else w.reject(new Error("No verdict returned"));
      return;
    }
    if (verdictTimedOut || currentVerdictRequestId === 0) return;
    if (verdictBusy) return;
    if (payload.error) applyVerdict({ error: payload.error });
    else if (payload.data) applyVerdict(payload.data);
  }

  function chartReadScript(data) {
    return (
      data?.spokenBrief ||
      displayText(data?.verdict || "") ||
      lastSpokenBrief ||
      displayText(lastVerdict || "")
    );
  }

  async function runMarketSnapshot(userQuestion, opts = {}) {
    const question =
      opts.voice === true
        ? window.DeskCopilotVoiceInterpret?.applyVoiceRules?.(userQuestion) || userQuestion
        : userQuestion;
    const quote = window.DeskCopilotChartPrice?.readQuoteSync?.();
    const pricePayload =
      opts.pricePayload ||
      (quote
        ? {
            chartLastPrice: quote.value,
            chartLastPriceSource: quote.source,
            chartLastPriceTs: quote.timestamp,
          }
        : await chartPricePayload());
    const livePx = Number(pricePayload?.chartLastPrice);
    const cacheKey = `${question.trim().toLowerCase()}|${opts.voice === true ? "v" : "t"}|${Number.isFinite(livePx) ? livePx.toFixed(2) : "na"}`;
    const now = Date.now();
    if (
      !opts.forceRefresh &&
      lastMarketSnapshotCache.key === cacheKey &&
      lastMarketSnapshotCache.data &&
      now - lastMarketSnapshotCache.ts < MARKET_SNAPSHOT_CACHE_MS
    ) {
      if (
        typeof isStaleFpfvgSnapshot === "function" &&
        isStaleFpfvgSnapshot(question, lastMarketSnapshotCache.data)
      ) {
        voiceLog("FPFVG stale snapshot cache — bypassing");
      } else {
        voiceLog("snapshot cache hit");
        applySnapshotAnswer(lastMarketSnapshotCache.data);
        return lastMarketSnapshotCache.data;
      }
    }

    if (opts.voice && !opts.skipWorkingAck) voiceSpeakAck(karenWorkingAck("snapshot"));

    const apiPayload = await marketSnapshotExtras(pricePayload);
    const snap = await bgSend(
      {
        type: "MARKET_SNAPSHOT",
        question,
        voiceInput: false,
        conversationContext: getConversationContext(),
        ...apiPayload,
      },
      15000
    );
    if (snap?.error) throw new Error(snap.error);
    if (typeof isStaleFpfvgSnapshot === "function" && isStaleFpfvgSnapshot(question, snap)) {
      voiceLog("FPFVG stale backend response — daily/structure leak", snap?.intent);
      const staleMsg =
        "First presented FVG needs backend v1.4.11+ — redeploy desk-copilot on Vercel, reload the extension, then click RECONNECT.";
      const data = {
        spoken: staleMsg,
        spokenBrief: staleMsg,
        panel: staleMsg,
        verdict: staleMsg,
        scoped: true,
        intent: "first_presented_fvg",
        staleBackend: true,
      };
      applySnapshotAnswer(data);
      return data;
    }
    const data = {
      spoken: snap.spoken,
      spokenBrief: snap.spoken,
      panel: snap.panel,
      verdict: snap.panel || snap.spoken,
      scoped: true,
      intent: snap.intent,
      last_fact_ids: snap.last_fact_ids,
      mode: snap.mode,
    };
    saveConversationContext(snap);
    lastMarketSnapshotCache = { key: cacheKey, data, ts: Date.now() };
    applySnapshotAnswer(data);
    return data;
  }

  async function captureChartScreenshot(forceFresh = false) {
    const sym = symbol();
    const now = Date.now();
    if (
      !forceFresh &&
      lastChartCapture.base64 &&
      lastChartCapture.symbol === sym &&
      now - lastChartCapture.ts < CHART_CAPTURE_CACHE_MS
    ) {
      voiceLog("screenshot cache hit");
      return { base64: lastChartCapture.base64, cached: true };
    }
    const cap = await bgSend({ type: "CAPTURE_CHART" }, 10000);
    if (cap?.base64) {
      lastChartCapture = { base64: cap.base64, ts: now, symbol: sym };
    }
    return cap;
  }

  async function runChartRead(userQuestion, opts = {}) {
    const turnGen = opts.turnGen;
    if (shouldRouteCasual(userQuestion)) {
      voiceLog("runChartRead blocked — casual route");
      return null;
    }
    if (isFastFactQuestion(userQuestion, userQuestion)) {
      voiceLog("runChartRead blocked — fast fact (snapshot only)");
      try {
        const snap = await runMarketSnapshot(userQuestion, { ...opts, skipWorkingAck: true });
        if (turnGen != null && turnGen !== voiceTurnGen) return null;
        return snap;
      } catch (snapErr) {
        const relaxed = tryRelaxedSnapshotCache(userQuestion);
        if (relaxed) {
          applySnapshotAnswer(relaxed);
          return relaxed;
        }
        if (opts.voice) await publishFastFactFailure(snapErr, true, turnGen);
        return { spokenBrief: "", noCall: true, fastFactBlocked: true };
      }
    }
    if (verdictBusy) {
      cancelActiveChartRead("new chart read");
    }
    ensureChartReadUserBubble(userQuestion);
    if (opts.voice) voiceSpeakAck(karenWorkingAck("chart_read"));

    const needsFullRead = needsFullChartRead(userQuestion, chartReadContext());
    const [backendOk, pricePayload] = await Promise.all([
      ensureBackend(),
      chartPricePayload(),
    ]);
    if (!backendOk) {
      if (opts.voice) {
        await publishOfflineReply(true);
      } else {
        recordAssistantReply(offlineChatMessage());
        setMsg("Backend offline — RECONNECT", false);
      }
      return null;
    }
    if (!isLiveDataAvailable()) {
      const blocked = window.DeskCopilotConnection?.LIVE_DATA_UNAVAILABLE_VERDICT;
      if (opts.voice) {
        await publishAssistantReply(
          blocked?.spokenBrief || "Wait — live data unavailable.",
          true,
          { pauseMic: true, instant: true },
          () => setKarenPhase("listening")
        );
      } else {
        recordAssistantReply(blocked?.spokenBrief || "WAIT / NO TRADE — LIVE DATA UNAVAILABLE");
      }
      setMsg("LIVE DATA: OFFLINE", false);
      return null;
    }

    verdictBusy = true;
    setKarenPhase("snapshot");
    setMsg("Karen · checking live prices…", null);

    if (!needsFullRead) {
      try {
        const snap = await runMarketSnapshot(userQuestion, { ...opts, pricePayload, skipWorkingAck: true });
        if (turnGen != null && turnGen !== voiceTurnGen) {
          verdictBusy = false;
          return null;
        }
        return snap;
      } catch (snapErr) {
        if (isFastFactQuestion(userQuestion, userQuestion)) {
          verdictBusy = false;
          const relaxed = tryRelaxedSnapshotCache(userQuestion);
          if (relaxed) {
            applySnapshotAnswer(relaxed);
            return relaxed;
          }
          if (opts.voice) {
            await publishFastFactFailure(snapErr, true, turnGen);
          }
          return { spokenBrief: "", noCall: true, fastFactBlocked: true };
        }
        /* needs screenshot — fall through for deep reads only */
      }
    }

    if (turnGen != null && turnGen !== voiceTurnGen) {
      verdictBusy = false;
      return null;
    }

    const requestId = ++currentVerdictRequestId;
    verdictTimedOut = false;
    lastVerdictStatusPhase = "";
    clearVerdictTimer();
    verdictWaiter = null;
    verdictRequestTs = Date.now();
    try {
      await chrome.storage.session.remove("dcVerdictResult");
    } catch {
      /* ignore */
    }

    setKarenPhase("capturing");
    setMsg("Karen · reading chart data…", null);
    if (opts.voice) voiceSpeakAck(karenAck("capturing"));

    const sym = symbol();
    const warmPromise = bgSend({ type: "PREPARE_VERDICT", symbol: sym }, 4000).catch(() => {});

    try {
      panel.classList.add("dc-capturing");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const snapshotPromise =
        window.DeskCopilotChartSnapshot?.payload?.({
          maxBars: 120,
          requestId: `verdict-${requestId}`,
          expectedSymbol: sym,
        }) ||
        Promise.resolve({ chartSnapshot: null, chartLastPrice: pricePayload?.chartLastPrice, qualityUsable: false });

      const snapshotPayload = await snapshotPromise;
      panel.classList.remove("dc-capturing");

      const chartSnapshot = snapshotPayload?.chartSnapshot;
      const exportTrace = snapshotPayload?.exportTrace;
      const qualityUsable =
        snapshotPayload?.qualityUsable === true ||
        window.DeskCopilotChartSnapshot?.isQualityUsable?.(chartSnapshot?.qualityMeta);
      const hasStructured =
        qualityUsable &&
        chartSnapshot?.ok === true &&
        Array.isArray(chartSnapshot.candles) &&
        chartSnapshot.candles.length >= 20;
      const mergedPrice = {
        ...pricePayload,
        chartLastPrice:
          snapshotPayload?.chartLastPrice ?? pricePayload?.chartLastPrice,
      };

      if (turnGen != null && turnGen !== voiceTurnGen) {
        verdictBusy = false;
        if (requestId === currentVerdictRequestId) currentVerdictRequestId = 0;
        return null;
      }
      if (requestId !== currentVerdictRequestId) return null;

      setKarenPhase("analyzing");
      setMsg(
        hasStructured ? "Karen · running desk rules… 3–8 sec" : "",
        null
      );
      if (!hasStructured) {
        window.DeskCopilotUI?.updateMarketDataCard?.({
          status: "Unavailable",
          reason: "OHLC export unavailable from TradingView chart",
          action: "Maximize chart pane · wait for candles · try ANALYSE MARKET again",
          visible: true,
        });
      }
      if (opts.voice) voiceSpeakAck(karenAck("analyzing"));

      if (!hasStructured) {
        const rejectionReasons =
          exportTrace?.qualityRejectionReasons ||
          chartSnapshot?.qualityMeta?.reasons ||
          (chartSnapshot?.reason ? [chartSnapshot.reason] : ["export_failed"]);
        const noCall =
          window.DeskCopilotChartSnapshot?.buildUnavailableMessage?.(rejectionReasons) ||
          window.DeskCopilotChartSnapshot?.NO_CALL ||
          "No call — couldn't read the chart data right now.";
        window.DeskCopilotChartSnapshot?.pushReasoningLog?.({
          ts: new Date().toISOString(),
          input: {
            quality: chartSnapshot?.quality || exportTrace?.quality || "missing",
            reasons: rejectionReasons,
            candleCount: chartSnapshot?.candles?.length || exportTrace?.candleCount || 0,
            exportTrace,
          },
          output: { verdict: "no trade", call: "no call" },
        });
        if (routeDebugEnabled) {
          const el = document.getElementById("dc-route-debug");
          if (el) {
            const q = chartSnapshot?.quality || exportTrace?.quality || "missing";
            const rs = rejectionReasons.slice(0, 3).join(", ") || "—";
            el.textContent = `route: chart_read · quality=${q} · ${rs}`;
            el.classList.remove("hidden");
          }
        }
        if (exportTrace) window.__dcUpdateChartExportPanel?.(exportTrace);
        verdictBusy = false;
        currentVerdictRequestId = 0;
        recordAssistantReply(noCall);
        if (opts.voice) {
          await publishAssistantReply(noCall, true, { pauseMic: false, instant: true }, () =>
            setKarenPhase("listening")
          );
        }
        return { verdict: noCall, spokenBrief: noCall, noCall: true };
      }

      // Warm runs in parallel with snapshot — don't block verdict on slow Yahoo fetch.
      void warmPromise;

      const resultPromise = waitForVerdict(90000);
      await bgSend(
        {
          type: "VERDICT_ASYNC",
          symbol: sym,
          chartSnapshot,
          question: userQuestion,
          voiceInput: opts.voice === true,
          debug: routeDebugEnabled,
          ...mergedPrice,
        },
        8000
      );
      const data = await resultPromise;
      if (requestId !== currentVerdictRequestId) return null;
      if (turnGen != null && turnGen !== voiceTurnGen) return null;
      if (data?.understoodAs && data.understoodAs !== userQuestion) {
        applyUnderstood(userQuestion, data.understoodAs);
      }
      verdictTimedOut = false;
      currentVerdictRequestId = 0;
      lastVerdictStatusPhase = "";
      applyVerdict(data);
      return data;
    } catch (e) {
      if (requestId === currentVerdictRequestId) {
        currentVerdictRequestId = 0;
        lastVerdictStatusPhase = "";
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Superseded")) {
        verdictBusy = false;
        verdictWaiter = null;
        clearVerdictTimer();
        return null;
      }
      if (requestId === currentVerdictRequestId) {
        verdictTimedOut = true;
      }
      verdictBusy = false;
      verdictWaiter = null;
      clearVerdictTimer();
      reportIssue(explainError(e, "chart"), { chat: true });
      throw e;
    } finally {
      panel.classList.remove("dc-capturing");
    }
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "VERDICT_RESULT") onVerdictPayload(msg.payload);
      if (msg.type === "DC_OVERLAY_SYNC") {
        void window.DeskCopilotDraw?.syncBridge?.();
      }
      if (msg.type === "CONNECTION_STATE") {
        applyConnectionSnapshot(msg.snapshot);
        if (msg.snapshot?.backendUp && msg.snapshot?.state !== "DISCONNECTED") {
          void window.DeskCopilotTracker?.refresh?.({ freeze: true });
        }
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "session" || !changes.dcVerdictResult?.newValue) return;
      onVerdictPayload(changes.dcVerdictResult.newValue);
    });
  } catch {
    /* extension reloading */
  }

  document.getElementById("dc-chat-send").onclick = () => {
    const input = document.getElementById("dc-chat-input");
    const v = input.value;
    input.value = "";
    sendChat(v);
  };

  document.getElementById("dc-chat-input").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("dc-chat-send").click();
    }
  };

  try {
    document.getElementById("dc-auto-voice").checked = isAutoVoiceEnabled();
  } catch {
    /* ignore */
  }
  document.getElementById("dc-auto-voice").onchange = (e) => {
    try {
      localStorage.setItem("dc-auto-voice", e.target.checked ? "1" : "0");
    } catch {
      /* ignore */
    }
    speakUiFeedback(
      e.target.checked ? karenUiAck("hands_free_on") : karenUiAck("hands_free_off")
    );
    if (e.target.checked) {
      window.DeskCopilotVoice?.resumeAutonomousAgent?.();
      void tryStartAutonomousVoice();
    } else {
      window.DeskCopilotVoice?.stopAutonomous?.();
    }
    updateAgentStatus();
  };

  try {
    document.getElementById("dc-auto-read").checked =
      localStorage.getItem("dc-auto-read") !== "0";
  } catch {
    /* ignore */
  }
  document.getElementById("dc-auto-read").onchange = (e) => {
    try {
      localStorage.setItem("dc-auto-read", e.target.checked ? "1" : "0");
    } catch {
      /* ignore */
    }
    speakUiFeedback(
      e.target.checked ? karenUiAck("read_aloud_on") : karenUiAck("read_aloud_off")
    );
    if (window.DeskCopilotVoice) window.DeskCopilotVoice.autoRead = e.target.checked;
  };

  function setVoiceLive(text) {
    const el = document.getElementById("dc-voice-live");
    if (!el) return;
    const t = String(text || "").trim();
    if (!t) {
      lastInterimStt = "";
      el.textContent = "";
      el.classList.remove("active", "hearing", "dropped");
      el.closest(".dc-voice-live-wrap")?.classList.remove("active");
      return;
    }
    const wrap = el.closest(".dc-voice-live-wrap");
    if (t.startsWith("(dropped:")) {
      el.textContent = t;
      el.classList.add("active", "dropped");
      el.classList.remove("hearing");
      wrap?.classList.add("active");
      return;
    }
    if (t !== "…") {
      lastInterimStt = t;
      schedulePrefetchFromInterim(t);
    }
    el.textContent = t === "…" ? "…" : t;
    el.classList.add("active", "hearing");
    el.classList.remove("dropped");
    wrap?.classList.add("active");
  }

  document.getElementById("dc-voice-test").onclick = async () => {
    if (!window.DeskCopilotVoice?.testMic) {
      setMsg("Voice dead — use Chrome", false);
      return;
    }
    speakUiFeedback(karenUiAck("check_mic"));
    if (!window.DeskCopilotVoice.isListening?.()) {
      await window.DeskCopilotVoice.startListening();
      updateVoiceToggle(true, false);
    }
    setVoiceLive("");
    window.DeskCopilotVoice.testMic((text, ok) => {
      setVoiceLive("");
      setMsg(text, ok);
      updateVoiceToggle(
        window.DeskCopilotVoice.isListening?.(),
        window.DeskCopilotVoice.isRecording?.()
      );
    });
  };

  document.getElementById("dc-stop-speak").onclick = () => {
    speakUiFeedback(karenUiAck("stop_audio"));
    window.DeskCopilotVoice?.cancelSpeech?.();
    window.DeskCopilotRealtime?.setMicPaused?.(false);
    cancelActiveChartRead("user stop");
    voiceSpeakInFlight = "";
    voiceTurnBusy = false;
    setKarenPhase("listening");
    setMsg("● Voice live — talk anytime", true);
  };

  if (window.DeskCopilotRealtime?.init) {
    window.DeskCopilotRealtime.init({
      onStatus: (text, ok) => {
        setVoiceConnectionStatus(text, ok);
      },
      onInterim: (text) => setVoiceLive(text),
      onSpeakingChange: (active) => {
        document.getElementById("dc-stop-speak")?.classList.toggle("hidden", !active);
      },
      onListeningChange: (active) => {
        queueListeningUi(active, window.DeskCopilotVoice?.isRecording?.());
      },
      onTranscript: (text) => {
        void handleRealtimeTranscript(text);
      },
      onBargeIn: () => {
        voiceSpeakSession += 1;
        voiceSpeakInFlight = "";
        resetStreamingAssistant();
        cancelActiveChartRead("barge-in");
        cancelActiveChatStream("barge-in");
        window.DeskCopilotVoice?.cancelSpeech?.();
        setKarenPhase("listening");
      },
      onAssistantReply: () => {
        /* Realtime must not write chat — Karen owns bubbles via handleUserMessage. */
      },
      onToolCall: async () => {
        return "Karen handles this from transcript — tool disabled.";
      },
    });
  }

  if (window.DeskCopilotVoice?.init) {
    let autoReadPref = true;
    try {
      autoReadPref = localStorage.getItem("dc-auto-read") !== "0";
    } catch {
      /* ignore */
    }
    voiceReady = window.DeskCopilotVoice.init({
      onStatus: (text, ok) => {
        setMsg(text, ok);
      },
      onInterim: (text) => setVoiceLive(text),
      onSpeakingChange: (active) => {
        document.getElementById("dc-stop-speak")?.classList.toggle("hidden", !active);
      },
      onListeningChange: (active) => {
        queueListeningUi(active, window.DeskCopilotVoice?.isRecording?.());
      },
      onRecordingChange: (active) => {
        queueListeningUi(window.DeskCopilotVoice?.isListening?.(), active);
      },
      getChatContext: () => ({
        messages: chatHistory,
        symbol: symbol(),
        lastVerdict: lastVerdict || undefined,
      }),
      onUserTranscript: () => {
        /* Bubbles come from handleVoiceTurn only. */
      },
      onAssistantReply: () => {
        /* Cascade must not write chat — Karen owns bubbles. */
      },
      onNeedsChartRead: (question) => {
        kickOffChartRead(question, { voice: true });
      },
      onCommand: (cmd, transcript) => {
        if (cmd === "verdict") {
          voiceSpeakAck(karenWorkingAck("chart_read"));
          void runChartRead(transcript || "what do you see on the chart", { voice: true });
        } else if (cmd === "levels") {
          const msg = startMarkLevelsNonBlocking();
          setMsg(msg, null);
          deliverVoiceReply(msg, undefined, { pauseMic: false });
        } else if (cmd === "read") {
          const last = chatHistory.at(-1);
          if (last?.role === "assistant") {
            void deliverVoiceReply("", undefined, { fromBubble: true });
          } else if (lastSpokenBrief) {
            void deliverVoiceReply(lastSpokenBrief, undefined, {
              deskBrief: true,
              speed: DESK_VERDICT_SPEAK_SPEED,
            });
          } else if (lastVerdict) {
            void deliverVoiceReply(lastVerdict, undefined, {
              deskBrief: true,
              sanitizeSpoken: true,
              speed: DESK_VERDICT_SPEAK_SPEED,
            });
          }
        }
      },
      /* Karen owns all voice turns via __dcHandleVoiceTurn — no parallel sendChat path. */
      autoRead: autoReadPref,
    });
    window.DeskCopilotVoice.setCascadeFallback?.(() => {
      void window.DeskCopilotVoice.startCascadeVoice();
    });
    if (!voiceReady) {
      document.getElementById("dc-voice-toggle").disabled = true;
    } else if (window.DeskCopilotVoice?.isUserVoiceOff?.()) {
      updateVoiceToggle(false, false);
    }
  }

  seedWelcome();
  void window.DeskCopilotMemory?.loadMemory?.();
  initTraceTabs();
  void loadSystemHealthRun();
  window.__dcChatHistory = () => chatHistory;
  startServiceWorkerKeepalive();
  startPanelContextRefresh();
  initBackend();
  startHeartbeat();
  startWarmKeepalive();
  startAgentLoop();

  const karenStartupAt = Date.now();
  setInterval(() => {
    const phase = String(karenUiPhase || "idle").toLowerCase();
    const busyPhase =
      phase === "analyzing" ||
      phase === "capturing" ||
      phase === "snapshot" ||
      phase === "marking_levels";
    if (!busyPhase) return;
    if (verdictBusy || chatBusy || levelsBusy || mockAnalysisBusy) return;
    if (Date.now() - karenStartupAt < 120000) return;
    setKarenPhase("idle");
    window.DeskCopilotVerdictUI?.showReadyState?.();
  }, 15000);

  window.addEventListener("focus", () => {
    warmBackend();
    if (!backendOnline && !pingInFlight) void pingBackend(true);
    if (isAutoVoiceEnabled() && !window.DeskCopilotVoice?.isUserVoiceOff?.() && voiceReady) {
      window.DeskCopilotRealtime?.forceResumeListening?.("window-focus");
      void window.DeskCopilotRealtime?.ensureCaptureActive?.();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!isAutoVoiceEnabled() || window.DeskCopilotVoice?.isUserVoiceOff?.()) return;
    window.DeskCopilotRealtime?.forceResumeListening?.("tab-visible");
    void window.DeskCopilotRealtime?.ensureCaptureActive?.();
  });

  document.addEventListener("keydown", (e) => {
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === "v") {
      e.preventDefault();
      document.getElementById("dc-voice-toggle")?.click();
    } else if (k === "l") {
      e.preventDefault();
      document.getElementById("dc-levels-draw")?.click();
    } else if (k === "r") {
      e.preventDefault();
      if (!verdictBusy && !chatBusy) sendChat("what do you see on the chart", { voice: voiceReady });
    }
  });

  window.__dcBgSend = bgSend;
  window.__dcDeskContext = () => ({
    lastVerdict,
    lastSpokenBrief,
    lastSnapshotAnswer,
    price: window.DeskCopilotChartPrice?.readSync?.(),
  });
  try {
    window.DeskCopilotTracker?.init?.();
  } catch {
    /* tracker optional */
  }
})();
