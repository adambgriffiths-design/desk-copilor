(function () {
  const DC_VERSION = "0.9.8";
  const existing = document.getElementById("dc-panel");
  if (existing?.dataset.dcVersion === DC_VERSION) return;
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "dc-panel";
  panel.dataset.dcVersion = DC_VERSION;
  panel.innerHTML = `
    <div class="dc-header" id="dc-header">
      <span>Desk Copilot <span class="dc-ver">v0.9.8</span></span>
      <button type="button" class="dc-icon-btn" id="dc-collapse" title="Minimize panel">−</button>
    </div>
    <div class="dc-body" id="dc-body">
    <div class="dc-stats" id="dc-stats">Chart reads today: —</div>
    <div class="dc-levels-row">
      <button type="button" class="dc-btn dc-levels-draw" id="dc-levels-draw" title="Fetch backend levels and draw on chart">Draw levels</button>
      <button type="button" class="dc-btn dc-levels-copy" id="dc-levels-copy" title="Copy level prices">Copy</button>
      <button type="button" class="dc-btn dc-levels-clear" id="dc-levels-clear" title="Remove overlay / native lines">Clear</button>
    </div>
    <label class="dc-levels-auto"><input type="checkbox" id="dc-auto-levels" /> Auto-draw on load</label>
    <div class="dc-levels-hint" id="dc-levels-hint">Stable lines: Pine Editor → paste <strong>pine/desk-copilot-levels.pine</strong> → Add to chart</div>
    <div class="dc-voice-row">
      <button type="button" class="dc-btn dc-voice" id="dc-voice-toggle">🎤 Voice off</button>
      <button type="button" class="dc-btn dc-voice-test" id="dc-voice-test" title="Mic test">Test</button>
    </div>
    <button type="button" class="dc-btn dc-stop-speak hidden" id="dc-stop-speak">⏹ Stop speaking</button>
    <div class="dc-voice-live" id="dc-voice-live" aria-live="polite"></div>
    <label class="dc-voice-auto"><input type="checkbox" id="dc-auto-read" checked /> Speak replies</label>
    <div class="dc-chat" id="dc-chat"></div>
    <div class="dc-chat-input-row">
      <input type="text" id="dc-chat-input" class="dc-chat-input" placeholder="Chat or ask what you see…" autocomplete="off" />
      <button type="button" id="dc-chat-send" class="dc-chat-send">Send</button>
    </div>
    <pre class="dc-verdict hidden" id="dc-text"></pre>
    <div class="dc-msg" id="dc-msg"></div>
    <div class="dc-voice-hint">Voice · Alt+Shift+V · Levels · Alt+Shift+L · Read · Alt+Shift+R · Options: right-click extension icon</div>
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

  function initPanelDrag() {
    const header = document.getElementById("dc-header");
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startBottom = 0;

    header.addEventListener("mousedown", (e) => {
      if (e.target.closest(".dc-icon-btn")) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;
      panel.style.right = "auto";
      panel.style.left = `${startLeft}px`;
      panel.style.bottom = `${startBottom}px`;
      header.classList.add("dc-dragging");
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
      header.classList.remove("dc-dragging");
      savePanelPos();
    });
  }

  document.getElementById("dc-collapse").onclick = () => {
    const collapsed = panel.classList.toggle("dc-collapsed");
    document.getElementById("dc-collapse").textContent = collapsed ? "+" : "−";
    document.getElementById("dc-collapse").title = collapsed ? "Expand panel" : "Minimize panel";
  };

  restorePanelPos();
  initPanelDrag();

  let currentId = null;
  let lastVerdict = "";
  let voiceReady = false;
  let verdictBusy = false;
  let chatBusy = false;
  let verdictTimer = null;
  let verdictWaiter = null;
  let chatHistory = [];
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

    chatBusy = true;
    setMsg(voice ? "Interpreting…" : "Thinking…", null);
    try {
      const res = await bgSend(
        {
          type: "CHAT",
          messages: chatHistory,
          symbol: symbol(),
          lastVerdict: lastVerdict || undefined,
          voiceInput: voice,
        },
        60000
      );
      if (res.understoodAs) applyUnderstood(text, res.understoodAs);

      if (res.needsChartRead) {
        chatBusy = false;
        await runChartRead(res.question || res.understoodAs || text, { voice });
        return;
      }
      const reply = res.reply || "";
      chatHistory.push({ role: "assistant", content: reply });
      trimHistory();
      appendChatBubble("assistant", reply);
      setMsg("", null);
      if (voiceReady && window.DeskCopilotVoice?.autoRead) {
        window.DeskCopilotVoice.speak(reply, () => setMsg("", null));
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      appendChatBubble("assistant", `Sorry — ${err}`);
      setMsg(err, false);
    } finally {
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

  function seedWelcome() {
    if (chatHistory.length) return;
    const welcome =
      "Nasdaq futures desk copilot. Ask what I see on the chart for a live read, or ask about bias, levels, and structure.";
    chatHistory.push({ role: "assistant", content: welcome });
    appendChatBubble("assistant", welcome);
  }

  async function refreshStats() {
    try {
      const s = await bgSend({ type: "STATS" });
      document.getElementById("dc-stats").textContent =
        `${s.total} chart read${s.total === 1 ? "" : "s"} today`;
    } catch {
      /* quiet on load */
    }
  }

  async function pingBackend() {
    try {
      const r = await bgSend({ type: "PING" });
      if (!r?.ok) setMsg(r?.error || "Backend offline — run npm run dev", false);
      else if (document.getElementById("dc-auto-levels")?.checked) {
        drawLevels().catch(() => {});
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e), false);
    }
  }

  async function fetchLevelsPayload() {
    return bgSend({ type: "LEVELS" }, 65000);
  }

  async function drawLevels(opts = {}) {
    if (!window.DeskCopilotDraw) {
      setMsg("Draw module not loaded — reload extension", false);
      return null;
    }
    setMsg("Fetching levels…", null);
    try {
      let payload = opts.cached || null;
      if (!payload) {
        payload = await fetchLevelsPayload();
        if (payload?.error) throw new Error(payload.error);
        window.DeskCopilotDraw.cache(payload);
      }
      const result = await window.DeskCopilotDraw.draw(payload, opts.overlayOnly === true);
      const n = result.count || (payload.levels?.length || 0) + (payload.zones?.length || 0);
      if (result.ok) {
        const mode = result.mode === "native" ? "TradingView lines" : "overlay";
        setMsg(`${n} levels · ${mode}${result.hint ? " — " + result.hint : ""}`, true);
      } else {
        setMsg(result.hint || result.reason || "Could not draw — use Pine indicator", false);
      }
      return payload;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e), false);
      return null;
    }
  }

  document.getElementById("dc-levels-draw").onclick = () => {
    void drawLevels();
  };
  document.getElementById("dc-levels-clear").onclick = () => {
    window.DeskCopilotDraw?.clear();
    setMsg("Levels cleared", null);
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

  function updateVoiceToggle(listening, recording) {
    const btn = document.getElementById("dc-voice-toggle");
    if (!btn) return;
    btn.classList.toggle("dc-voice-on", listening);
    btn.classList.toggle("dc-voice-rec", Boolean(recording));
    btn.textContent = recording
      ? "🔴 Hearing you…"
      : listening
        ? "🎤 Listening"
        : "🎤 Voice off";
    btn.title = listening
      ? "Voice on — click to turn off"
      : "Click once to turn voice on, then speak naturally";
  }

  document.getElementById("dc-voice-toggle").onclick = async () => {
    if (!voiceReady) {
      setMsg("Voice not available — use Chrome", false);
      return;
    }
    const on = await window.DeskCopilotVoice.toggleListening();
    updateVoiceToggle(on, window.DeskCopilotVoice.isRecording?.());
  };

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
      appendChatBubble("assistant", data.error);
      setMsg(data.error, false);
      return;
    }
    currentId = data.id;
    lastVerdict = data.verdict || "";
    const shown = displayText(lastVerdict);
    document.getElementById("dc-text").textContent = shown;
    chatHistory.push({ role: "assistant", content: shown });
    appendChatBubble("assistant", shown);
    refreshStats();
    if (voiceReady && window.DeskCopilotVoice?.autoRead) {
      setMsg("Speaking… mic resumes when done", null);
      window.DeskCopilotVoice.speak(lastVerdict, () => {
        setMsg("Listening — ask another question", true);
      });
    } else {
      setMsg("Ask another question anytime", true);
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
    if (payload.status === "capturing") {
      setMsg("Capturing chart…", null);
      return;
    }
    if (payload.status === "analyzing") {
      setMsg("Reading chart… (15–60 sec)", null);
      return;
    }
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

  async function runChartRead(userQuestion, opts = {}) {
    verdictBusy = true;
    clearVerdictTimer();
    verdictWaiter = null;
    try {
      chrome.storage.session.remove("dcVerdictResult");
    } catch {
      /* ignore */
    }

    setMsg("Capturing chart…", null);

    const sym = symbol();
    await bgSend({ type: "PREPARE_VERDICT", symbol }, 5000).catch(() => {});

    try {
      panel.classList.add("dc-capturing");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 100));

      const cap = await bgSend({ type: "CAPTURE_CHART" }, 12000);
      if (!cap?.base64) {
        throw new Error("Screenshot empty — click Desk Copilot in Chrome toolbar once, then ask again");
      }

      setMsg("Reading chart… (15–60 sec)", null);
      verdictTimer = setTimeout(() => {
        if (!verdictBusy) return;
        verdictBusy = false;
        verdictWaiter = null;
        setMsg("Timed out — try again", false);
        appendChatBubble("assistant", "Chart read timed out — try again.");
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
    } catch (e) {
      verdictBusy = false;
      verdictWaiter = null;
      clearVerdictTimer();
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("toolbar") || msg.includes("activeTab") || msg.includes("all_urls")) {
        const hint = "Click Desk Copilot in Chrome toolbar ↑ once, then ask again";
        appendChatBubble("assistant", hint);
        setMsg(hint, false);
      } else {
        appendChatBubble("assistant", msg);
        setMsg(msg, false);
      }
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

  document.getElementById("dc-auto-read").onchange = (e) => {
    if (window.DeskCopilotVoice) window.DeskCopilotVoice.autoRead = e.target.checked;
  };

  function setVoiceLive(text) {
    const el = document.getElementById("dc-voice-live");
    if (!el) return;
    if (text) {
      el.textContent = `"${text}"`;
      el.classList.add("active");
    } else {
      el.textContent = "";
      el.classList.remove("active");
    }
  }

  document.getElementById("dc-voice-test").onclick = async () => {
    if (!window.DeskCopilotVoice?.testMic) {
      setMsg("Voice not available — use Chrome", false);
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
      },
      onRecordingChange: (active) => {
        updateVoiceToggle(window.DeskCopilotVoice?.isListening?.(), active);
      },
      onCommand: (cmd, transcript) => {
        if (cmd === "verdict") {
          sendChat(transcript || "what do you see", { voice: true });
        } else if (cmd === "read") {
          const last = chatHistory.at(-1);
          if (last?.role === "assistant") window.DeskCopilotVoice.speak(last.content);
          else if (lastVerdict) window.DeskCopilotVoice.speakBrief(lastVerdict);
        }
      },
      onChat: (transcript) => sendChat(transcript, { voice: true }),
    });
    if (!voiceReady) {
      document.getElementById("dc-voice-toggle").disabled = true;
    }
  }

  seedWelcome();
  pingBackend().then(refreshStats);

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
