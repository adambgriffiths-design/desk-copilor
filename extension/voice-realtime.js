/**
 * OpenAI Realtime voice — hands-free speech-to-speech with server VAD + barge-in.
 */
(function () {
  const TARGET_RATE = 24000;
  const RECONNECT_MS = 2500;
  const MAX_RECONNECTS = 8;

  let ws = null;
  let active = false;
  let wantActive = false;
  let reconnects = 0;
  let reconnectTimer = null;
  let sessionModel = "";
  let sessionKey = "";
  let sessionExpires = 0;

  let micStream = null;
  let captureCtx = null;
  let captureNode = null;
  let captureSource = null;

  let playCtx = null;
  let playTime = 0;
  let playGen = 0;

  let onStatus = null;
  let onInterim = null;
  let onSpeakingChange = null;
  let onListeningChange = null;
  let onToolCall = null;
  let onTranscript = null;

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
    const res = await bgSend({ type: "REALTIME_SESSION", symbol }, 25000);
    if (res?.error) throw new Error(res.error);
    if (!res?.client_secret) throw new Error("No realtime session");
    sessionKey = res.client_secret;
    sessionModel = res.model || "gpt-4o-realtime-preview-2024-12-17";
    sessionExpires = res.expires_at ? res.expires_at * 1000 : Date.now() + 55000;
    return res;
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
      onStatus?.("Voice reconnect failed — using fallback", false);
      wantActive = false;
      stop();
      return;
    }
    reconnects += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (wantActive) void connect(true);
    }, RECONNECT_MS);
  }

  async function connect(isReconnect = false) {
    if (active && ws?.readyState === WebSocket.OPEN) return true;

    try {
      if (!sessionKey || Date.now() > sessionExpires - 5000) {
        await fetchSession(window.__dcSymbol?.() || "MNQ1!");
      }

      onStatus?.(isReconnect ? "Reconnecting voice…" : "Starting voice…", null);

      await new Promise((resolve, reject) => {
        ws = new WebSocket(
          `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(sessionModel)}`,
          ["realtime", `openai-insecure-api-key.${sessionKey}`, "openai-beta.realtime-v1"]
        );

        ws.onopen = () => {
          active = true;
          reconnects = 0;
          setListening(true);
          scheduleSessionRefresh();
          onStatus?.("Agent live — talk anytime", true);
          resolve(true);
        };

        ws.onerror = () => reject(new Error("Realtime connection failed"));

        ws.onclose = () => {
          const wasActive = active;
          active = false;
          setListening(false);
          if (wasActive && wantActive) scheduleReconnect();
        };

        ws.onmessage = (ev) => {
          let msg;
          try {
            msg = JSON.parse(ev.data);
          } catch {
            return;
          }

          const type = msg.type || "";

          if (type === "input_audio_buffer.speech_started") {
            stopPlayback();
            onInterim?.("…");
            onStatus?.("Hearing you…", true);
          }

          if (type === "conversation.item.input_audio_transcription.completed") {
            const text = (msg.transcript || "").trim();
            if (text) {
              onInterim?.("");
              onTranscript?.(text);
            }
          }

          if (type === "response.audio.delta" && msg.delta) {
            void playPcmDelta(msg.delta);
          }

          if (type === "response.audio.done" || type === "response.done") {
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
        };
      });

      await startCapture();
      return true;
    } catch (e) {
      active = false;
      wantActive = false;
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
    const ms = Math.max(15000, sessionExpires - Date.now() - 45000);
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
      return true;
    },
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
