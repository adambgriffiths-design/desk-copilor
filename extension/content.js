(function () {
  const DC_VERSION = "1.0.45";
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
          <span class="dc-tagline">No signals. Just the read.</span>
          <span class="dc-ver">v1.0.45</span>
        </div>
      </div>
      <button type="button" class="dc-icon-btn" id="dc-collapse" title="Minimize panel">−</button>
    </div>
    <div class="dc-primary" id="dc-primary">
      <div class="dc-stats" id="dc-stats">SESSION READS: —</div>
      <button type="button" class="dc-btn dc-reconnect" id="dc-reconnect" title="Force reconnect to backend">RECONNECT</button>
      <button type="button" class="dc-btn dc-verdict-btn" id="dc-get-verdict" title="Screenshot + desk brief (Alt+Shift+R)">GET THE READ</button>
      <div class="dc-msg" id="dc-msg"></div>
    </div>
    <div class="dc-body" id="dc-body">
    <div class="dc-rate-row hidden" id="dc-rate-row">
      <span class="dc-rate-label">Grade this read</span>
      <button type="button" class="dc-rate-btn dc-rate-up" id="dc-rate-up" title="Desk was right">👍</button>
      <button type="button" class="dc-rate-btn dc-rate-down" id="dc-rate-down" title="Desk was wrong">👎</button>
    </div>
    <div class="dc-levels-row">
      <button type="button" class="dc-btn dc-levels-draw" id="dc-levels-draw" title="Fetch + draw PD / session levels">MARK LEVELS</button>
      <button type="button" class="dc-btn dc-levels-copy" id="dc-levels-copy" title="Copy prices">COPY</button>
      <button type="button" class="dc-btn dc-levels-clear" id="dc-levels-clear" title="Remove lines">STRIP</button>
    </div>
    <label class="dc-levels-auto"><input type="checkbox" id="dc-auto-levels" /> Auto-mark on load</label>
    <div class="dc-levels-hint" id="dc-levels-hint">Permanent lines → Pine Editor → <strong>pine/desk-copilot-levels.pine</strong></div>
    <div class="dc-voice-row">
      <button type="button" class="dc-btn dc-voice" id="dc-voice-toggle">VOICE OFF</button>
      <button type="button" class="dc-btn dc-voice-test" id="dc-voice-test" title="Mic check">CHECK MIC</button>
    </div>
    <button type="button" class="dc-btn dc-stop-speak hidden" id="dc-stop-speak">KILL AUDIO</button>
    <div class="dc-voice-mode hidden" id="dc-voice-mode" aria-live="polite"></div>
    <div class="dc-voice-live" id="dc-voice-live" aria-live="polite"></div>
    <label class="dc-voice-auto"><input type="checkbox" id="dc-auto-voice" checked /> Autonomous agent (hands-free)</label>
    <label class="dc-voice-auto"><input type="checkbox" id="dc-auto-read" checked /> Speak the brief</label>
    <div class="dc-chat" id="dc-chat"></div>
    <div class="dc-chat-input-row">
      <input type="text" id="dc-chat-input" class="dc-chat-input" placeholder="What's the read?" autocomplete="off" />
      <button type="button" id="dc-chat-send" class="dc-chat-send">SEND</button>
    </div>
    <pre class="dc-verdict hidden" id="dc-text"></pre>
    <div class="dc-voice-hint">Hands-free when LIVE · Alt+Shift+V · READ · Alt+Shift+R · LEVELS · Alt+Shift+L</div>
    </div>
  `;
  document.body.appendChild(panel);

  function restorePanelPos() {
    try {
      const raw = localStorage.getItem("dc-panel-pos");
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (typeof pos.left === "number") panel.style.left = `${pos.left}px`;
      if (typeof pos.bottom === "number") panel.style.bottom = `${pos.bottom}px`;
      panel.style.right = "auto";
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
        "button, input, textarea, select, label, a, .dc-chat, .dc-bubble, .dc-rate-row"
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
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      panel.classList.remove("dc-dragging");
      savePanelPos();
    });
  }

  document.getElementById("dc-collapse").onclick = () => {
    const collapsed = panel.classList.toggle("dc-collapsed");
    document.getElementById("dc-collapse").textContent = collapsed ? "+" : "−";
    document.getElementById("dc-collapse").title = collapsed ? "Expand panel" : "Minimize panel";
  };

  document.getElementById("dc-header").ondblclick = () => {
    panel.classList.remove("dc-collapsed");
    document.getElementById("dc-collapse").textContent = "−";
    const body = document.getElementById("dc-body");
    if (body) body.scrollTop = 0;
    panel.scrollTop = 0;
  };

  restorePanelPos();
  initPanelDrag();
  const bodyEl = document.getElementById("dc-body");
  if (bodyEl) bodyEl.scrollTop = 0;
  panel.scrollTop = 0;

  let currentId = null;
  let lastVerdict = "";
  let lastSpokenBrief = "";
  let lastVoiceTranscript = "";
  let voiceReady = false;
  let verdictBusy = false;
  let chatBusy = false;
  let verdictTimer = null;
  let verdictWaiter = null;
  let verdictRequestTs = 0;
  let lastHandledVerdictTs = 0;
  let chatHistory = [];
  let backendOnline = false;
  let lastBackendCheck = 0;
  let lastBackendFail = 0;
  let lastOnlineAt = 0;
  let pingFailStreak = 0;
  let pingInFlight = false;
  let heartbeatTimer = null;
  let agentLoopTimer = null;

  function showTyping(show) {
    const chat = document.getElementById("dc-chat");
    let el = document.getElementById("dc-typing");
    if (show) {
      if (!el) {
        el = document.createElement("div");
        el.id = "dc-typing";
        el.className = "dc-bubble dc-bubble-bot dc-typing";
        el.textContent = "Desk thinking…";
        chat.appendChild(el);
      }
      chat.scrollTop = chat.scrollHeight;
    } else if (el) {
      el.remove();
    }
  }

  async function ensureBackend(force = false) {
    if (!force && backendOnline && Date.now() - lastBackendCheck < 45000) {
      return true;
    }
    return pingBackend(force);
  }

  function offlineChatMessage() {
    return "Backend offline — run npm run dev in the desk-copilot folder, then click ● OFFLINE — RECONNECT. I can't reply until the server is live.";
  }

  let msgQueue = [];
  let processingQueue = false;

  function trimHistory() {
    if (chatHistory.length > 24) chatHistory = chatHistory.slice(-24);
  }

  function enqueueUserMessage(text, opts = {}) {
    const t = text.trim();
    if (!t) return;
    if (msgQueue.length && msgQueue[msgQueue.length - 1].text === t) return;

    if (!opts.skipBubble) {
      appendChatBubble("user", t);
      chatHistory.push({ role: "user", content: t });
      trimHistory();
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
        const item = msgQueue.shift();
        await handleUserMessage(item);
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

  function chartReadContext() {
    return { lastAssistant: lastAssistantText() };
  }

  function applyUnderstood(raw, understood) {
    if (!understood || understood === raw) return;
    const last = chatHistory.at(-1);
    if (last?.role === "user") last.content = understood;
    setMsg(`Understood: "${understood}"`, true);
  }

  async function handleUserMessage(item) {
    const text = (typeof item === "string" ? item : item?.text || "").trim();
    const voice = typeof item === "object" && item?.voice === true;
    if (!text) return;

    if (!voice && wantsChartRead(text, chartReadContext())) {
      await runChartRead(text, { voice: false });
      return;
    }

    if (!(await ensureBackend())) {
      const msg = offlineChatMessage();
      appendChatBubble("assistant", msg);
      setMsg("Backend offline — RECONNECT", false);
      return;
    }

    chatBusy = true;
    showTyping(true);
    setMsg(voice ? "Parsing…" : "Desk thinking…", null);
    try {
      const res = await bgSend(
        {
          type: "CHAT",
          messages: chatHistory,
          symbol: symbol(),
          lastVerdict: lastVerdict || undefined,
          voiceInput: voice,
        },
        90000
      );
      if (res.understoodAs) applyUnderstood(text, res.understoodAs);

      if (res.needsChartRead) {
        chatBusy = false;
        showTyping(false);
        await runChartRead(res.question || res.understoodAs || text, { voice });
        return;
      }
      const reply = (res.reply || "").trim();
      if (!reply) throw new Error("Empty reply from desk — try again");
      chatHistory.push({ role: "assistant", content: reply });
      trimHistory();
      appendChatBubble("assistant", reply);
      setMsg("", null);
      if (voiceReady && window.DeskCopilotVoice?.autoRead) {
        window.DeskCopilotVoice.speak(reply, () => setMsg("", null));
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const friendly = isInfraError(err) ? offlineChatMessage() : err;
      appendChatBubble("assistant", friendly);
      setMsg(friendly, false);
    } finally {
      showTyping(false);
      chatBusy = false;
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
    if (chat && !isInfraError(msg)) appendChatBubble("assistant", msg);
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
    btn.classList.toggle("dc-online", backendOnline);
    const voiceOn = window.DeskCopilotVoice?.isListening?.();
    const agentOn = isAutoVoiceEnabled();

    if (backendOnline && voiceOn && agentOn) {
      const mode = window.DeskCopilotVoice?.getEngineMode?.() || "off";
      if (mode === "cascade") {
        btn.textContent = "● AGENT (FALLBACK)";
        btn.title =
          "Whisper fallback — lower quality responses whilst Realtime is unavailable";
      } else {
        btn.textContent = "● AGENT LIVE";
        btn.title = "Autonomous agent running — backend + voice connected";
      }
    } else if (backendOnline) {
      btn.textContent = "● LIVE";
      btn.title = agentOn
        ? "Backend connected — agent will restart voice automatically"
        : "Backend connected — click to force reconnect";
    } else if (agentOn) {
      btn.textContent = "● RECONNECTING…";
      btn.title = "Agent reconnecting to backend — run npm run dev if needed";
    } else {
      btn.textContent = "● OFFLINE — RECONNECT";
      btn.title = "Backend offline — run npm run dev or set API URL in extension options";
    }
  }

  function setMsg(t, ok) {
    const m = document.getElementById("dc-msg");
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
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Timed out — try again"));
      }, timeoutMs);
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            if (chrome.runtime.lastError) {
              const err = new Error(chrome.runtime.lastError.message || "Extension error");
              if (isInvalidated(err)) recoverFromStaleExtension();
              reject(err);
              return;
            }
            if (res?.error && !Object.prototype.hasOwnProperty.call(res, "ok")) {
              reject(new Error(res.error));
              return;
            }
            if (res?.ok === false) {
              resolve(res);
              return;
            }
            if (res?.error) reject(new Error(res.error));
            else resolve(res);
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      } catch (e) {
        clearTimeout(timer);
        if (isInvalidated(e)) recoverFromStaleExtension();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  function displayText(text) {
    return text.replace(/^META:.*$/gim, "").trim();
  }

  function appendChatBubble(role, text) {
    const chat = document.getElementById("dc-chat");
    const div = document.createElement("div");
    div.className = "dc-bubble " + (role === "user" ? "dc-bubble-user" : "dc-bubble-bot");
    div.textContent = displayText(text);
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
    return true;
  }

  let lastRecordedAssistantText = "";
  let lastRecordedAssistantAt = 0;

  function recordAssistantReply(text) {
    const t = displayText(text).trim();
    if (!t) return false;
    const norm = t.toLowerCase();
    const now = Date.now();
    if (norm === lastRecordedAssistantText && now - lastRecordedAssistantAt < 8000) return false;
    const last = chatHistory.at(-1);
    if (last?.role === "assistant") {
      const prev = last.content.toLowerCase();
      if (prev === norm || prev.includes(norm) || norm.includes(prev.slice(0, 48))) return false;
    }
    lastRecordedAssistantText = norm;
    lastRecordedAssistantAt = now;
    appendChatBubble("assistant", t);
    chatHistory.push({ role: "assistant", content: t });
    trimHistory();
    return true;
  }

  function seedWelcome() {
    if (chatHistory.length) return;
    const welcome = "GET THE READ for the ICT brief. Grade it. You pull the trigger.";
    chatHistory.push({ role: "assistant", content: welcome });
    appendChatBubble("assistant", welcome);
  }

  async function refreshStats() {
    try {
      const s = await bgSend({ type: "STATS" });
      const parts = [`${s.total} READ${s.total === 1 ? "" : "S"} TODAY`];
      if (s.pending) parts.push(`${s.pending} UNGRADED`);
      if (s.up) parts.push(`${s.up} 👍`);
      if (s.down) parts.push(`${s.down} 👎`);
      document.getElementById("dc-stats").textContent = parts.join(" · ");
    } catch {
      /* quiet on load */
    }
  }

  function showRateRow(show) {
    document.getElementById("dc-rate-row")?.classList.toggle("hidden", !show);
    document.getElementById("dc-rate-up")?.classList.remove("dc-rated");
    document.getElementById("dc-rate-down")?.classList.remove("dc-rated");
  }

  async function rateVerdict(rating) {
    if (!currentId) {
      setMsg("No read yet — hit GET THE READ first", false);
      return;
    }
    setMsg("Saving rating…", null);
    try {
      const res = await bgSend({ type: "RATE", id: currentId, rating }, 15000);
      if (res?.error) throw new Error(res.error);
      showRateRow(false);
      document.getElementById(`dc-rate-${rating === "up" ? "up" : "down"}`)?.classList.add("dc-rated");
      setMsg(
        rating === "up"
          ? "Logged — desk learns from wins"
          : "Logged — desk learns from misses",
        true
      );
      refreshStats();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e), false);
    }
  }

  function friendlyConnectError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalidated|extension context/i.test(msg)) {
      return "Extension updated — refresh TradingView (Ctrl+Shift+R)";
    }
    if (/timed out/i.test(msg)) {
      return "Backend slow to respond — is npm run dev running? Then RECONNECT";
    }
    return msg;
  }

  async function pingBackend(reconnect = false) {
    if (pingInFlight) return backendOnline;
    pingInFlight = true;
    try {
      const r = await bgSend({ type: reconnect ? "RECONNECT" : "PING" }, 12000);
      lastBackendCheck = Date.now();
      if (r?.ok) {
        setBackendStatus(true);
        if (reconnect) setMsg(`Desk online (${r.base || "Vercel"})`, true);
        else setMsg("", null);
        if (window.DeskCopilotRealtime?.prefetchSession) {
          void window.DeskCopilotRealtime.prefetchSession(symbol());
        }
        void tryStartAutonomousVoice();
        return true;
      }
      throw new Error(r?.error || "Backend not reachable");
    } catch (e) {
      pingFailStreak += 1;
      lastBackendFail = Date.now();
      const sticky =
        !reconnect &&
        backendOnline &&
        Date.now() - lastOnlineAt < 90000 &&
        pingFailStreak < 3;
      if (sticky) {
        setMsg(friendlyConnectError(e), false);
        return true;
      }
      setBackendStatus(false);
      window.DeskCopilotVoice?.stopVoiceSession?.();
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
    if (await pingBackend(true)) {
      setTimeout(() => refreshStats(), 2500);
      if (document.getElementById("dc-auto-levels")?.checked) {
        setTimeout(() => drawLevels().catch(() => {}), 6000);
      }
      return;
    }
    setTimeout(() => void pingBackend(true), 4000);
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (document.hidden || pingInFlight) return;
      void pingBackend(false);
    }, 60000);
  }

  document.getElementById("dc-reconnect").onclick = () => {
    setMsg("Reconnecting…", null);
    void pingBackend(true);
  };

  async function fetchLevelsPayload() {
    return bgSend({ type: "LEVELS" }, 65000);
  }

  async function drawLevels(opts = {}) {
    if (!window.DeskCopilotDraw) {
      setMsg("Draw module not loaded — reload extension", false);
      return null;
    }
    setMsg("Pulling levels…", null);
    try {
      let payload = opts.cached || null;
      let usedCache = false;
      if (!payload) {
        try {
          payload = await fetchLevelsPayload();
          if (payload?.error) throw new Error(payload.error);
          window.DeskCopilotDraw.cache(payload);
        } catch (fetchErr) {
          payload = window.DeskCopilotDraw.loadCache?.();
          if (!payload?.levels?.length && !payload?.zones?.length) throw fetchErr;
          usedCache = true;
        }
      }
      const result = await window.DeskCopilotDraw.draw(payload, opts.overlayOnly === true);
      const n = result.count || (payload.levels?.length || 0) + (payload.zones?.length || 0);
      if (result.ok) {
        const mode = result.mode === "native" ? "TradingView lines" : "overlay";
        const cacheNote = usedCache ? " · cached" : "";
        setMsg(`${result.count ?? n} levels marked · ${mode}${cacheNote}${result.hint ? " — " + result.hint : ""}`, true);
      } else {
        const hint =
          result.reason === "no_chart_pane"
            ? "Chart not found — maximize chart pane, then MARK LEVELS again"
            : result.hint || result.reason || "Mark failed — backend online? Try RECONNECT";
        setMsg(hint, false);
      }
      return payload;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e), false);
      return null;
    }
  }

  document.getElementById("dc-get-verdict").onclick = () => {
    if (verdictBusy || chatBusy) {
      setMsg("Wait for current request to finish", false);
      return;
    }
    void runChartRead("what do you see on the chart", { voice: false });
  };
  document.getElementById("dc-rate-up").onclick = () => {
    void rateVerdict("up");
  };
  document.getElementById("dc-rate-down").onclick = () => {
    void rateVerdict("down");
  };

  document.getElementById("dc-levels-draw").onclick = () => {
    void drawLevels();
  };
  document.getElementById("dc-levels-clear").onclick = () => {
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
    if (e.target.checked) void drawLevels();
  };

  function isAutoVoiceEnabled() {
    try {
      return localStorage.getItem("dc-auto-voice") !== "0";
    } catch {
      return true;
    }
  }

  async function tryStartAutonomousVoice() {
    if (!voiceReady || !backendOnline || !isAutoVoiceEnabled()) return;
    if (window.DeskCopilotVoice?.isListening?.()) return;
    window.DeskCopilotVoice?.resumeAutonomousAgent?.();
    const ok = await window.DeskCopilotVoice.startAutonomous?.(symbol);
    if (ok) {
      updateVoiceToggle(true, window.DeskCopilotVoice?.isRecording?.());
      updateAgentStatus();
    }
  }

  function startAgentLoop() {
    if (agentLoopTimer) return;
    agentLoopTimer = setInterval(() => {
      if (!isAutoVoiceEnabled()) {
        updateAgentStatus();
        return;
      }
      if (!backendOnline && !pingInFlight) {
        void pingBackend(true);
        return;
      }
      if (backendOnline && voiceReady && !verdictBusy && !chatBusy) {
        if (!window.DeskCopilotVoice?.isListening?.()) {
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
      el.textContent = "Full-quality Realtime voice — talk anytime";
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
      btn.textContent = listening ? "● VOICE LIVE" : "VOICE OFF";
      btn.title = listening
        ? "Full-quality Realtime — talk anytime, click to stop"
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
  }

  document.getElementById("dc-voice-toggle").onclick = async () => {
    if (!voiceReady) {
      setMsg("Voice dead — use Chrome", false);
      return;
    }
    const on = await window.DeskCopilotVoice.toggleAutonomous(symbol);
    updateVoiceToggle(on, window.DeskCopilotVoice.isRecording?.());
  };

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

  function applyVerdict(data) {
    clearVerdictTimer();
    verdictBusy = false;

    if (data?.error) {
      appendChatBubble("assistant", isInfraError(data.error) ? offlineChatMessage() : data.error);
      reportIssue(data.error);
      return;
    }
    currentId = data.id || null;
    lastVerdict = data.verdict || "";
    lastSpokenBrief = data.spokenBrief || "";
    showRateRow(Boolean(currentId));
    const shown = displayText(lastVerdict) || lastSpokenBrief;
    document.getElementById("dc-text").textContent = shown;
    if (shown) recordAssistantReply(shown);
    refreshStats();
    if (voiceReady && window.DeskCopilotVoice?.autoRead) {
      const rtMode = window.DeskCopilotVoice?.getEngineMode?.() === "realtime";
      const toSpeak = lastSpokenBrief || shown;
      if (rtMode) {
        setMsg("Agent live — talk anytime", true);
      } else {
        setMsg("Delivering brief… mic back when done", null);
        window.DeskCopilotVoice.speak(toSpeak, () => {
          setMsg("Agent live — talk anytime", true);
        });
      }
    } else {
      setMsg("Your move.", true);
    }
  }

  function waitForVerdict(timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        verdictWaiter = null;
        reject(new Error("Timed out — try again"));
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
      setMsg("Capturing…", null);
      return;
    }
    if (payload.status === "analyzing") {
      setMsg("Building brief… 15–60 sec", null);
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

  async function runChartRead(userQuestion, opts = {}) {
    if (verdictBusy) {
      throw new Error("Chart read already in progress — wait for it to finish");
    }
    if (!(await ensureBackend())) {
      appendChatBubble("assistant", offlineChatMessage());
      setMsg("Backend offline — RECONNECT", false);
      return null;
    }
    verdictBusy = true;
    clearVerdictTimer();
    verdictWaiter = null;
    verdictRequestTs = Date.now();
    try {
      await chrome.storage.session.remove("dcVerdictResult");
    } catch {
      /* ignore */
    }

    setMsg("Capturing…", null);

    if (
      opts.voice &&
      window.DeskCopilotVoice?.getEngineMode?.() === "cascade"
    ) {
      window.DeskCopilotVoice.speakAck?.("One sec, reading the chart");
    }

    const sym = symbol();
    await bgSend({ type: "PREPARE_VERDICT", symbol }, 5000).catch(() => {});

    try {
      panel.classList.add("dc-capturing");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 100));

      const cap = await bgSend({ type: "CAPTURE_CHART" }, 12000);
      panel.classList.remove("dc-capturing");
      setMsg("Building brief… 15–60 sec", null);

      if (!cap?.base64) {
        throw new Error("Screenshot empty — click The Trading Desk icon in Chrome toolbar once, then ask again");
      }

      verdictTimer = setTimeout(() => {
        if (!verdictBusy) return;
        verdictBusy = false;
        verdictWaiter = null;
        setMsg("Timed out — try again", false);
        reportIssue("Chart read timed out — try again.");
      }, 130000);

      const resultPromise = waitForVerdict(130000);
      await bgSend(
        {
          type: "VERDICT_ASYNC",
          symbol: sym,
          base64: cap.base64,
          question: userQuestion,
          voiceInput: opts.voice === true,
        },
        10000
      );
      const data = await resultPromise;
      if (data?.understoodAs && data.understoodAs !== userQuestion) {
        applyUnderstood(userQuestion, data.understoodAs);
      }
      applyVerdict(data);
      return data;
    } catch (e) {
      verdictBusy = false;
      verdictWaiter = null;
      clearVerdictTimer();
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("toolbar") || msg.includes("activeTab") || msg.includes("all_urls")) {
        const hint = "Click The Trading Desk in toolbar ↑ once — then GET THE READ";
        reportIssue(hint);
      } else {
        reportIssue(msg);
      }
      throw e;
    } finally {
      panel.classList.remove("dc-capturing");
    }
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "VERDICT_RESULT") onVerdictPayload(msg.payload);
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
    if (e.target.checked) {
      window.DeskCopilotVoice?.resumeAutonomousAgent?.();
      if (backendOnline) void tryStartAutonomousVoice();
    } else {
      window.DeskCopilotVoice?.stopAutonomous?.();
    }
    updateAgentStatus();
  };

  document.getElementById("dc-auto-read").onchange = (e) => {
    if (window.DeskCopilotVoice) window.DeskCopilotVoice.autoRead = e.target.checked;
  };

  function setVoiceLive(text) {
    const el = document.getElementById("dc-voice-live");
    if (!el) return;
    const t = String(text || "").trim();
    if (!t) {
      el.textContent = "";
      el.classList.remove("active");
      return;
    }
    // Status / heard lines only — never stream partial assistant replies
    if (t.length > 100 && !/^Heard:/i.test(t) && t !== "…") {
      return;
    }
    el.textContent = t === "…" ? "…" : `"${t}"`;
    el.classList.add("active");
  }

  document.getElementById("dc-voice-test").onclick = async () => {
    if (!window.DeskCopilotVoice?.testMic) {
      setMsg("Voice dead — use Chrome", false);
      return;
    }
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
    window.DeskCopilotVoice?.cancelSpeech?.();
  };

  if (window.DeskCopilotRealtime?.init) {
    window.DeskCopilotRealtime.init({
      onStatus: (text, ok) => setMsg(text, ok),
      onInterim: (text) => setVoiceLive(text),
      onSpeakingChange: (active) => {
        document.getElementById("dc-stop-speak")?.classList.toggle("hidden", !active);
      },
      onListeningChange: (active) => {
        updateVoiceToggle(active, window.DeskCopilotVoice?.isRecording?.());
        updateAgentStatus();
      },
      onTranscript: (text) => {
        if (text?.trim()) lastVoiceTranscript = text.trim();
        recordUserTranscript(text);
      },
      onAssistantReply: (text) => {
        recordAssistantReply(text);
      },
      onToolCall: async (name, args) => {
        if (name === "mark_levels") {
          await drawLevels();
          return "Levels marked on the chart.";
        }
        if (name === "get_last_verdict") {
          const script = chartReadScript({});
          if (!script) {
            return "No chart read yet — say 'read the chart' or click GET THE READ first.";
          }
          return formatRealtimeVoiceOutput(script);
        }
        if (name === "get_chart_read") {
          const question = chartReadQuestion(args?.question);
          const data = await runChartRead(question, { voice: true });
          const script = chartReadScript(data);
          if (!script) {
            throw new Error("Chart read returned empty — try GET THE READ button");
          }
          return formatRealtimeVoiceOutput(script);
        }
        return "Done.";
      },
    });
  }

  if (window.DeskCopilotVoice?.init) {
    voiceReady = window.DeskCopilotVoice.init({
      onStatus: (text, ok) => {
        setMsg(text, ok);
      },
      onInterim: (text) => setVoiceLive(text),
      onSpeakingChange: (active) => {
        document.getElementById("dc-stop-speak")?.classList.toggle("hidden", !active);
      },
      onListeningChange: (active) => {
        updateVoiceToggle(active, window.DeskCopilotVoice?.isRecording?.());
        updateAgentStatus();
      },
      onRecordingChange: (active) => {
        updateVoiceToggle(window.DeskCopilotVoice?.isListening?.(), active);
      },
      getChatContext: () => ({
        messages: chatHistory,
        symbol: symbol(),
        lastVerdict: lastVerdict || undefined,
      }),
      onUserTranscript: (text) => {
        recordUserTranscript(text);
      },
      onAssistantReply: (reply, userText) => {
        recordAssistantReply(reply);
      },
      onNeedsChartRead: async (question) => {
        await runChartRead(question, { voice: true });
      },
      onCommand: (cmd, transcript) => {
        if (cmd === "verdict") {
          void runChartRead(transcript || "what do you see on the chart", { voice: true });
        } else if (cmd === "levels") {
          void drawLevels();
        } else if (cmd === "read") {
          const last = chatHistory.at(-1);
          if (last?.role === "assistant") window.DeskCopilotVoice.speak(last.content);
          else if (lastSpokenBrief) window.DeskCopilotVoice.speakBrief(lastSpokenBrief);
          else if (lastVerdict) window.DeskCopilotVoice.speakBrief(lastVerdict);
        }
      },
      onChat: (transcript, opts) => sendChat(transcript, { voice: true, ...opts }),
    });
    window.DeskCopilotVoice.setCascadeFallback?.(() => {
      void window.DeskCopilotVoice.startCascadeVoice();
    });
    if (!voiceReady) {
      document.getElementById("dc-voice-toggle").disabled = true;
    }
  }

  seedWelcome();
  startServiceWorkerKeepalive();
  initBackend();
  startHeartbeat();
  startAgentLoop();
  setTimeout(() => void tryStartAutonomousVoice(), 2500);

  window.addEventListener("focus", () => {
    if (!backendOnline && !pingInFlight) void pingBackend(true);
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
})();
