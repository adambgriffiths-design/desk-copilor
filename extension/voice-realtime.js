/**
 * OpenAI Realtime voice — hands-free speech-to-speech (GA API).
 */
(function () {
  const TARGET_RATE = 24000;
  const RECONNECT_MS = 2500;
  const MAX_RECONNECTS = 8;
  const CONNECT_TIMEOUT_MS = 20000;

  let ws = null;
  let active = false;
  let wantActive = false;
  let reconnects = 0;
  let reconnectTimer = null;
  let sessionModel = "";
  let sessionKey = "";
  let sessionExpires = 0;
  let handledCallIds = new Set();

  let micStream = null;
  let captureCtx = null;
  let captureNode = null;
  let captureSource = null;

  let playCtx = null;
  let playTime = 0;
  let playGen = 0;
  let responseActive = false;

  let onStatus = null;
  let onInterim = null;
  let onSpeakingChange = null;
  let onListeningChange = null;
  let onToolCall = null;
  let onTranscript = null;
  let onAssistantReply = null;

  let inputTranscriptLive = "";
  let assistantTranscriptBuf = "";
  let lastAssistantSpoken = "";

  function setSpeaking(v) {
    onSpeakingChange?.(Boolean(v));
  }

  function setListening(v) {
    onListeningChange?.(Boolean(v));
  }

  function bgSend(msg, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out")), timeoutMs);
      chrome.runtime.sendMessage(msg, (res) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Extension error"));
          return;
        }
        resolve(res);
      });
    });
  }

  function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  function resample(input, inputRate, outputRate) {
    if (inputRate === outputRate) return input;
    const ratio = inputRate / outputRate;
    const newLength = Math.round(input.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = i * ratio;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, input.length - 1);
      const frac = idx - lo;
      result[i] = input[lo] * (1 - frac) + input[hi] * frac;
    }
    return result;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function fetchSession(symbol) {
    let voice = "marin";
    try {
      const stored = await chrome.storage.sync.get("voiceId");
      if (stored.voiceId) voice = stored.voiceId;
    } catch {
      /* ignore */
    }
    const res = await bgSend({ type: "REALTIME_SESSION", symbol, voice }, 25000);
    if (res?.error) throw new Error(res.error);
    if (!res?.client_secret) throw new Error("No realtime session");
    sessionKey = res.client_secret;
    sessionModel = res.model || "gpt-realtime";
    sessionExpires = res.expires_at ? res.expires_at * 1000 : Date.now() + 550000;
    handledCallIds = new Set();
    return res;
  }

  function extractInputTranscript(msg) {
    return (
      msg.transcript ||
      msg.item?.content?.find((c) => c?.transcript)?.transcript ||
      msg.item?.content?.[0]?.transcript ||
      ""
    )
      .trim();
  }

  function extractOutputTranscript(msg) {
    return (msg.transcript || msg.delta || assistantTranscriptBuf || "").trim();
  }

  function emitAssistantReply(text) {
    const t = String(text || "").trim();
    if (!t || t === lastAssistantSpoken) return;
    lastAssistantSpoken = t;
    onAssistantReply?.(t);
  }

  function sendEvent(event) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(event));
  }

  function stopPlayback() {
    playGen += 1;
    playTime = 0;
    if (playCtx) {
      playCtx.close().catch(() => {});
      playCtx = null;
    }
    setSpeaking(false);
    if (responseActive) {
      sendEvent({ type: "response.cancel" });
      responseActive = false;
    }
  }

  async function ensurePlayCtx() {
    if (!playCtx || playCtx.state === "closed") {
      playCtx = new AudioContext();
      playTime = playCtx.currentTime;
    }
    if (playCtx.state === "suspended") await playCtx.resume();
    return playCtx;
  }

  async function playPcmDelta(base64Pcm) {
    const gen = playGen;
    const ctx = await ensurePlayCtx();
    if (gen !== playGen) return;

    const pcm16 = new Int16Array(base64ToArrayBuffer(base64Pcm));
    const floats = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) floats[i] = pcm16[i] / 32768;

    const buffer = ctx.createBuffer(1, floats.length, TARGET_RATE);
    buffer.copyToChannel(floats, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, playTime);
    src.start(startAt);
    playTime = startAt + buffer.duration;
    setSpeaking(true);
  }

  async function ensureMic() {
    if (micStream?.active) return micStream;
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    return micStream;
  }

  function releaseMic() {
    if (captureNode) {
      captureNode.disconnect();
      captureNode.onaudioprocess = null;
      captureNode = null;
    }
    if (captureSource) {
      captureSource.disconnect();
      captureSource = null;
    }
    if (captureCtx) {
      captureCtx.close().catch(() => {});
      captureCtx = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
  }

  async function startCapture() {
    await ensureMic();
    captureCtx = new AudioContext();
    captureSource = captureCtx.createMediaStreamSource(micStream);
    captureNode = captureCtx.createScriptProcessor(4096, 1, 1);
    const inputRate = captureCtx.sampleRate;

    captureNode.onaudioprocess = (e) => {
      if (!active || !ws || ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      const down = resample(input, inputRate, TARGET_RATE);
      const pcm = floatTo16BitPCM(down);
      sendEvent({
        type: "input_audio_buffer.append",
        audio: arrayBufferToBase64(pcm),
      });
    };

    captureSource.connect(captureNode);
    captureNode.connect(captureCtx.destination);
    if (captureCtx.state === "suspended") await captureCtx.resume();
  }

  async function handleFunctionCall(name, callId, argsJson) {
    if (!callId || handledCallIds.has(callId)) return;
    handledCallIds.add(callId);

    let output = "Done.";
    try {
      const args = argsJson ? JSON.parse(argsJson) : {};
      if (name === "stop_voice") {
        output = "Voice stopped.";
        wantActive = false;
      } else if (onToolCall) {
        output = (await onToolCall(name, args)) || "Done.";
      }
    } catch (e) {
      output = e instanceof Error ? e.message : String(e);
    }

    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: String(output).slice(0, 8000),
      },
    });
    sendEvent({ type: "response.create" });

    if (name === "stop_voice") {
      setTimeout(() => stop(), 300);
    }
  }

  function scheduleReconnect() {
    if (!wantActive || reconnectTimer) return;
    if (reconnects >= MAX_RECONNECTS) {
      onStatus?.("Realtime failed — lower quality responses whilst in fallback", false);
      wantActive = false;
      stop();
      window.DeskCopilotVoice?.startCascadeVoice?.();
      return;
    }
    reconnects += 1;
    onStatus?.("Reconnecting voice…", null);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (wantActive) void connect(true);
    }, RECONNECT_MS);
  }

  function handleServerMessage(msg) {
    const type = msg.type || "";

    if (type === "input_audio_buffer.speech_started") {
      stopPlayback();
      inputTranscriptLive = "";
      onInterim?.("…");
      onStatus?.("Hearing you…", true);
    }

    if (
      type === "conversation.item.input_audio_transcription.delta" ||
      type === "input_audio_buffer.transcription.delta"
    ) {
      const delta = msg.delta || msg.transcript || "";
      if (delta) {
        inputTranscriptLive += delta;
        onInterim?.(inputTranscriptLive);
      }
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio_transcription.done" ||
      type === "input_audio_buffer.transcription.completed"
    ) {
      const text = extractInputTranscript(msg) || inputTranscriptLive;
      inputTranscriptLive = "";
      if (text) {
        onInterim?.("");
        onTranscript?.(text);
      }
    }

    if (type === "response.created" || type === "response.started") {
      responseActive = true;
      assistantTranscriptBuf = "";
      lastAssistantSpoken = "";
    }

    if (
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta"
    ) {
      const delta = msg.delta || "";
      if (delta) assistantTranscriptBuf += delta;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const text = extractOutputTranscript(msg);
      assistantTranscriptBuf = "";
      emitAssistantReply(text);
    }

    if (
      type === "response.done" ||
      type === "response.cancelled" ||
      type === "response.canceled"
    ) {
      responseActive = false;
    }

    if (type === "response.done" && Array.isArray(msg.response?.output)) {
      for (const item of msg.response.output) {
        if (item.type === "function_call" && item.call_id) {
          void handleFunctionCall(item.name, item.call_id, item.arguments || "{}");
          continue;
        }
        if (item.type === "message" && Array.isArray(item.content)) {
          const spoken = item.content
            .map((c) => c.transcript || c.text || "")
            .filter(Boolean)
            .join(" ")
            .trim();
          if (spoken) emitAssistantReply(spoken);
        }
      }
    }

    const audioDelta = msg.delta || msg.audio;
    if (
      (type === "response.output_audio.delta" ||
        type === "response.audio.delta") &&
      audioDelta
    ) {
      void playPcmDelta(audioDelta);
    }

    if (type === "response.output_audio.done" || type === "response.audio.done") {
      setTimeout(() => {
        if (playCtx && playCtx.currentTime >= playTime - 0.05) setSpeaking(false);
      }, 120);
    }

    if (type === "response.function_call_arguments.done") {
      void handleFunctionCall(msg.name, msg.call_id, msg.arguments || "{}");
    }

    if (type === "error") {
      const errMsg = msg.error?.message || "Realtime error";
      onStatus?.(errMsg, false);
    }
  }

  async function connect(isReconnect = false) {
    if (active && ws?.readyState === WebSocket.OPEN) return true;

    try {
      if (!sessionKey || Date.now() > sessionExpires - 5000) {
        await fetchSession(window.__dcSymbol?.() || "MNQ1!");
      }

      onStatus?.(isReconnect ? "Reconnecting voice…" : "Connecting realtime voice…", null);

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Realtime connection timed out"));
        }, CONNECT_TIMEOUT_MS);

        ws = new WebSocket(
          `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(sessionModel)}`,
          ["realtime", `openai-insecure-api-key.${sessionKey}`]
        );

        ws.onopen = () => {
          clearTimeout(timer);
          active = true;
          reconnects = 0;
          setListening(true);
          scheduleSessionRefresh();
          onStatus?.("● Voice live — talk anytime", true);
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Realtime connection failed"));
        };

        ws.onclose = () => {
          const wasActive = active;
          active = false;
          setListening(false);
          if (wasActive && wantActive) scheduleReconnect();
        };

        ws.onmessage = (ev) => {
          try {
            handleServerMessage(JSON.parse(ev.data));
          } catch {
            /* ignore */
          }
        };
      });

      await startCapture();
      return true;
    } catch (e) {
      active = false;
      const msg = e instanceof Error ? e.message : String(e);
      onStatus?.(msg, false);
      cleanupSocket();
      return false;
    }
  }

  function cleanupSocket() {
    if (ws) {
      try {
        ws.onclose = null;
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    }
  }

  function suspend() {
    active = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    stopPlayback();
    cleanupSocket();
    releaseMic();
    setListening(false);
    setSpeaking(false);
    onInterim?.("");
  }

  function stop() {
    wantActive = false;
    reconnects = 0;
    suspend();
    onStatus?.("Voice off", null);
  }

  let refreshTimer = null;

  function scheduleSessionRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (!wantActive || !sessionExpires) return;
    const ms = Math.max(15000, sessionExpires - Date.now() - 120000);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (!wantActive) return;
      sessionKey = "";
      if (active) {
        cleanupSocket();
        releaseMic();
        active = false;
        void connect(true);
      }
    }, ms);
  }

  async function prefetchSession(symbol) {
    try {
      if (!sessionKey || Date.now() > sessionExpires - 15000) {
        await fetchSession(symbol || window.__dcSymbol?.() || "MNQ1!");
      }
      return true;
    } catch {
      return false;
    }
  }

  async function start(symbolResolver) {
    if (symbolResolver) window.__dcSymbol = symbolResolver;
    if (active && ws?.readyState === WebSocket.OPEN) return true;
    wantActive = true;
    reconnects = 0;
    return connect(false);
  }

  window.DeskCopilotRealtime = {
    init(handlers) {
      onStatus = handlers.onStatus;
      onInterim = handlers.onInterim;
      onSpeakingChange = handlers.onSpeakingChange;
      onListeningChange = handlers.onListeningChange;
      onToolCall = handlers.onToolCall;
      onTranscript = handlers.onTranscript;
      onAssistantReply = handlers.onAssistantReply;
      return true;
    },
    prefetchSession,
    start,
    stop,
    suspend,
    isActive() {
      return active;
    },
    wantsActive() {
      return wantActive;
    },
    cancelSpeech: stopPlayback,
    isSpeaking() {
      return Boolean(playCtx && playTime > (playCtx?.currentTime || 0));
    },
  };
})();
