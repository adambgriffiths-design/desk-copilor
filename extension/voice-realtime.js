/**
 * OpenAI Realtime voice — hands-free speech-to-speech (GA API).
 */
(function () {
  const TARGET_RATE = 24000;
  const RECONNECT_BASE_MS = 1500;
  const RECONNECT_MAX_MS = 30000;
  const MAX_RECONNECTS = 8;
  const CONNECT_TIMEOUT_MS = 20000;

  let ws = null;
  let active = false;
  let wantActive = false;
  let reconnects = 0;
  let reconnectTimer = null;
  let connectInFlight = null;
  let plannedReconnect = false;
  let lastDisconnectReason = "";
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
  let onBargeIn = null;

  let bargeInCooldownUntil = 0;

  let inputTranscriptLive = "";
  let assistantTranscriptBuf = "";
  let lastAssistantSpoken = "";
  let lastFinalTranscript = { text: "", at: 0 };
  let connectResolve = null;
  let connectReject = null;
  let connectTimer = null;
  let lastFatalError = "";

  /** 'trading' | 'casual' | 'tool' — controls who may speak on Realtime PCM. */
  let turnMode = "trading";
  let suppressAssistantEchoUntil = 0;

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
    scheduleSessionRefresh();
    return res;
  }

  function reconnectDelayMs() {
    return Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, Math.max(0, reconnects - 1))
    );
  }

  function wsIsLive() {
    return ws?.readyState === WebSocket.OPEN;
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

  function sendEvent(event) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(event));
  }

  function karenIsSpeaking() {
    return (
      scriptPlaybackAllowed ||
      window.DeskCopilotVoice?.isSpeaking?.() === true
    );
  }

  function triggerBargeIn(reason) {
    if (!karenIsSpeaking()) return false;
    const now = Date.now();
    if (now < bargeInCooldownUntil) return false;
    bargeInCooldownUntil = now + 350;
    voiceDebug("barge-in:", reason || "user");
    stopPlayback();
    if (scriptPlaybackAllowed) abortScriptSpeech();
    window.DeskCopilotVoice?.cancelSpeech?.();
    micPausedForPlayback = false;
    micPausedAt = 0;
    if (micUnpauseTimer) {
      clearTimeout(micUnpauseTimer);
      micUnpauseTimer = null;
    }
    onBargeIn?.();
    return true;
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

  /** Local casual handler owns the turn — mute unsolicited Realtime model audio. */
  function enterCasualTurn() {
    turnMode = "casual";
    suppressAssistantEchoUntil = Date.now() + 2000;
    stopPlayback();
  }

  function setSuppressEchoUntil(until) {
    suppressAssistantEchoUntil = typeof until === "number" ? until : 0;
  }

  function exitCasualTurn() {
    if (turnMode === "casual") turnMode = "trading";
    suppressAssistantEchoUntil = 0;
  }

  /** Tool readout about to be spoken — allow Realtime PCM again. */
  function allowToolSpeech() {
    turnMode = "tool";
    stopPlayback();
  }

  function finishToolSpeech() {
    if (turnMode === "tool") turnMode = "trading";
  }

  /** Realtime is STT-only — never play model PCM. */
  function mayPlayRealtimeAudio() {
    return false;
  }

  function cancelUnsolicitedResponse(reason) {
    if (scriptPlaybackAllowed || turnMode === "tool") return;
    if (responseActive) {
      sendEvent({ type: "response.cancel" });
      responseActive = false;
    }
    stopPlayback();
    voiceDebug("cancel unsolicited:", reason || "response");
  }

  let scriptDoneCallback = null;
  let scriptPlaybackAllowed = false;
  let activeScriptText = "";

  function emitAssistantReply(_text) {
    /* Realtime model must never write chat or speak — Karen owns output. */
  }

  /** Speak exact text using Realtime voice (same voice as trading tools). */
  function speakScript(text, onDone) {
    if (!active || !ws || ws.readyState !== WebSocket.OPEN) {
      onDone?.();
      return false;
    }
    const script = String(text || "").trim().slice(0, 4000);
    if (!script) {
      onDone?.();
      return false;
    }
    stopPlayback();
    scriptPlaybackAllowed = true;
    activeScriptText = script;
    suppressAssistantEchoUntil = Date.now() + 450;
    scriptDoneCallback = typeof onDone === "function" ? onDone : null;
    sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Read this script aloud verbatim — same words, no additions, no paraphrasing:\n\n" +
              script,
          },
        ],
      },
    });
    sendEvent({ type: "response.create" });
    setTimeout(() => {
      if (scriptPlaybackAllowed && activeScriptText === script) finishScriptSpeech();
    }, 45000);
    return true;
  }

  function finishScriptSpeech() {
    if (!scriptPlaybackAllowed && !scriptDoneCallback) return;
    scriptPlaybackAllowed = false;
    activeScriptText = "";
    if (scriptDoneCallback) {
      const cb = scriptDoneCallback;
      scriptDoneCallback = null;
      cb();
    }
  }

  function abortScriptSpeech() {
    scriptPlaybackAllowed = false;
    activeScriptText = "";
    scriptDoneCallback = null;
  }

  function finishConnectAttempt(ok, err) {
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    if (ok && connectResolve) {
      connectResolve(true);
    } else if (!ok && connectReject) {
      connectReject(err instanceof Error ? err : new Error(String(err || "Realtime connection failed")));
    }
    connectResolve = null;
    connectReject = null;
  }

  function isFatalRealtimeError(msg) {
    const text = String(msg?.error?.message || msg?.message || msg || "").toLowerCase();
    return (
      text.includes("invalid") ||
      text.includes("unknown") ||
      text.includes("not supported") ||
      text.includes("api key") ||
      text.includes("unauthorized")
    );
  }

  function failRealtime(message, fatal = false) {
    lastFatalError = message;
    if (fatal) {
      wantActive = false;
      reconnects = MAX_RECONNECTS;
    }
    onStatus?.(message, false);
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
    if (!mayPlayRealtimeAudio()) {
      voiceDebug("blocked realtime PCM (Karen owns reply)");
      cancelUnsolicitedResponse("pcm");
      return;
    }
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
    window.DeskCopilotVoiceLatency?.markFirstPcmDelta?.();
    setSpeaking(true);
  }

  function maybeEnterCasualFromInterim() {
    /* Interim text is display-only — never enter casual or cancel audio early. */
    return false;
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

  function stopCaptureOnly() {
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
  }

  function releaseMic() {
    stopCaptureOnly();
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
  }

  async function ensureCaptureActive() {
    if (!active || !wantActive) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const track = micStream?.getAudioTracks?.()[0];
    if (!track || track.readyState === "ended") {
      voiceDebug("mic heal — renew stream");
      releaseMic();
      try {
        await startCapture();
      } catch {
        /* ignore */
      }
      return;
    }
    if (!track.enabled) track.enabled = true;
    if (!captureNode || !captureCtx || captureCtx.state === "closed") {
      voiceDebug("mic heal — restart capture");
      try {
        await startCapture();
      } catch {
        /* ignore */
      }
      return;
    }
    if (captureCtx.state === "suspended") {
      await captureCtx.resume().catch(() => {});
    }
  }

  async function startCapture() {
    stopCaptureOnly();
    await ensureMic();
    captureCtx = new AudioContext();
    captureSource = captureCtx.createMediaStreamSource(micStream);
    captureNode = captureCtx.createScriptProcessor(4096, 1, 1);
    const inputRate = captureCtx.sampleRate;

    captureNode.onaudioprocess = (e) => {
      if (!active || !ws || ws.readyState !== WebSocket.OPEN) return;
      window.DeskCopilotVoiceLatency?.markFirstAudioAppend?.();
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
    window.DeskCopilotVoiceLatency?.mark?.("audio_capture_begin");
    if (captureCtx.state === "suspended") await captureCtx.resume();
  }

  async function handleFunctionCall(name, callId, argsJson) {
    if (!callId || handledCallIds.has(callId)) return;
    handledCallIds.add(callId);

    let output = `Tool ${name} finished with no message.`;
    try {
      const args = argsJson ? JSON.parse(argsJson) : {};
      if (name === "stop_voice") {
        output = "Voice stopped.";
        wantActive = false;
      } else if (onToolCall) {
        output = (await onToolCall(name, args)) || output;
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
    allowToolSpeech();
    sendEvent({ type: "response.create" });

    if (name === "stop_voice") {
      setTimeout(() => stop(), 300);
    }
  }

  function scheduleReconnect(reason) {
    if (!wantActive || reconnectTimer || connectInFlight || plannedReconnect) return;
    if (reconnects >= MAX_RECONNECTS) {
      voiceDebug("reconnect gave up:", lastDisconnectReason || reason || "max retries");
      onStatus?.("Realtime failed — lower quality responses whilst in fallback", false);
      wantActive = false;
      stop();
      window.DeskCopilotVoice?.startCascadeVoice?.();
      return;
    }
    reconnects += 1;
    const delay = reconnectDelayMs();
    voiceDebug(
      "reconnect scheduled:",
      reconnects,
      `in ${delay}ms`,
      reason || lastDisconnectReason || ""
    );
    if (reconnects === 1) onStatus?.("Reconnecting voice…", null);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (wantActive && !connectInFlight) void connect(true);
    }, delay);
  }

  let micPausedForPlayback = false;
  let micUnpauseTimer = null;
  let micPausedAt = 0;
  let pendingFinalTranscript = "";
  let holdFinalTimer = null;
  let utteranceEpoch = 0;
  let listenWatchdog = null;
  let lastInterimTranscript = "";
  let utteranceCarry = "";
  let lastSpeechStoppedAt = 0;
  const WHISPER_STT_PROMPT =
    "British English. MNQ Nasdaq futures ICT trading previous day high previous day low fair value gap chart read entry target bias verdict. Places: Telford Shropshire England UK weather temperature.";

  const TRANSCRIPT_SETTLE_MS =
    window.DeskCopilotVoiceQuickReply?.TRANSCRIPT_SETTLE_MS ?? 200;
  const UTTERANCE_MERGE_MS =
    window.DeskCopilotVoiceQuickReply?.UTTERANCE_MERGE_MS ?? 1400;
  const MIC_PAUSE_CAP_MS = 45000;
  const MIC_IDLE_UNPAUSE_MS =
    window.DeskCopilotVoiceQuickReply?.MIC_IDLE_UNPAUSE_MS ?? 500;
  const LISTEN_WATCHDOG_MS = 4000;
  const VAD_THRESHOLD = 0.38;
  const VAD_SILENCE_MS =
    window.DeskCopilotVoiceQuickReply?.VAD_SILENCE_MS ?? 500;
  const VAD_PREFIX_PADDING_MS = 400;

  function sttTranscriptsRelated(a, b) {
    const x = String(a || "").trim().toLowerCase();
    const y = String(b || "").trim().toLowerCase();
    if (!x || !y) return false;
    if (x === y) return true;
    return x.startsWith(y) || y.startsWith(x);
  }

  function isSttExtension(shorter, longer) {
    const s = String(shorter || "").trim().toLowerCase();
    const l = String(longer || "").trim().toLowerCase();
    if (!s || !l || l.length <= s.length) return false;
    return l.startsWith(s);
  }

  function pickLongerTranscript(a, b) {
    const x = String(a || "").trim();
    const y = String(b || "").trim();
    if (!x) return y;
    if (!y) return x;
    if (!sttTranscriptsRelated(x, y)) return x;
    const xl = x.toLowerCase();
    const yl = y.toLowerCase();
    if (yl.startsWith(xl) && y.length > x.length) return y;
    if (xl.startsWith(yl) && x.length >= y.length) return x;
    return x.length >= y.length ? x : y;
  }

  function voiceDebug(...parts) {
    window.__dcVoiceLog?.(...parts);
  }

  function flushFinalTranscript(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const now = Date.now();
    const prev = lastFinalTranscript;
    if (
      prev.text &&
      now - prev.at < 8000 &&
      (trimmed === prev.text || sttTranscriptsRelated(trimmed, prev.text))
    ) {
      if (trimmed.length > prev.text.length + 1 || isSttExtension(prev.text, trimmed)) {
        lastFinalTranscript = { text: trimmed, at: now };
        voiceDebug("STT extended:", trimmed.slice(0, 48));
        onInterim?.("");
        if (typeof window.__dcVoiceTurnBusy === "function" && window.__dcVoiceTurnBusy()) {
          voiceDebug("STT extension skipped — turn in flight");
          return;
        }
        onTranscript?.(trimmed);
        return;
      }
      voiceDebug("STT deduped:", trimmed.slice(0, 48));
      return;
    }
    lastFinalTranscript = { text: trimmed, at: now };

    voiceDebug(`STT final (u${utteranceEpoch}):`, trimmed);
    onInterim?.("");
    onTranscript?.(trimmed);
  }

  function deliverFinalTranscript(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    pendingFinalTranscript = pickLongerTranscript(pendingFinalTranscript, trimmed);
    voiceDebug("STT deliver pending:", pendingFinalTranscript.slice(0, 64));
    if (holdFinalTimer) clearTimeout(holdFinalTimer);
    holdFinalTimer = setTimeout(() => {
      holdFinalTimer = null;
      let out = pendingFinalTranscript;
      if (lastInterimTranscript && sttTranscriptsRelated(out, lastInterimTranscript)) {
        out = pickLongerTranscript(out, lastInterimTranscript);
      }
      pendingFinalTranscript = "";
      if (utteranceCarry) {
        out = `${utteranceCarry} ${out}`.replace(/\s+/g, " ").trim();
        utteranceCarry = "";
      }
      if (out) flushFinalTranscript(out);
    }, TRANSCRIPT_SETTLE_MS);
  }

  function resetTranscriptState(clearCarry = false) {
    inputTranscriptLive = "";
    lastInterimTranscript = "";
    pendingFinalTranscript = "";
    if (clearCarry) utteranceCarry = "";
    if (holdFinalTimer) {
      clearTimeout(holdFinalTimer);
      holdFinalTimer = null;
    }
  }

  function handleServerMessage(msg) {
    const type = msg.type || "";

    if (type === "session.created" || type === "session.updated") {
      if (type === "session.created") {
        voiceDebug(
          "STT VAD:",
          `threshold=${VAD_THRESHOLD}`,
          `silence=${VAD_SILENCE_MS}ms`,
          `prefix=${VAD_PREFIX_PADDING_MS}ms`
        );
        sendEvent({
          type: "session.update",
          session: {
            type: "realtime",
            tools: [],
            tool_choice: "none",
            audio: {
              input: {
                noise_reduction: { type: "near_field" },
                transcription: {
                  model: "whisper-1",
                  language: "en",
                  prompt: WHISPER_STT_PROMPT,
                },
                turn_detection: {
                  type: "server_vad",
                  create_response: false,
                  interrupt_response: true,
                  silence_duration_ms: VAD_SILENCE_MS,
                  threshold: VAD_THRESHOLD,
                  prefix_padding_ms: VAD_PREFIX_PADDING_MS,
                },
              },
            },
          },
        });
      }
      if (connectResolve) finishConnectAttempt(true);
    }

    if (type === "error") {
      const errMsg = msg.error?.message || "Realtime error";
      if (connectReject) {
        finishConnectAttempt(false, new Error(errMsg));
        failRealtime(errMsg, isFatalRealtimeError(msg));
        cleanupSocket();
        return;
      }
      failRealtime(errMsg, isFatalRealtimeError(msg));
    }

    if (type === "input_audio_buffer.speech_started") {
      window.DeskCopilotVoiceLatency?.beginTurn?.("realtime");
      void prefetchSession(window.__dcSymbol?.());
      window.__dcPrefetchVoiceTurn?.();
      const echoGuardUntil = Math.max(
        suppressAssistantEchoUntil,
        window.DeskCopilotVoice?.getEchoGuardUntil?.() || 0
      );
      if (karenIsSpeaking() && Date.now() >= echoGuardUntil) {
        triggerBargeIn("speech_started");
        resetTranscriptState(true);
        inputTranscriptLive = "";
        lastInterimTranscript = "";
        onInterim?.("…");
        onStatus?.("Hearing you…", true);
        return;
      }

      const merging =
        pendingFinalTranscript &&
        lastSpeechStoppedAt > 0 &&
        Date.now() - lastSpeechStoppedAt < UTTERANCE_MERGE_MS;
      if (merging) {
        utteranceCarry = pickLongerTranscript(
          utteranceCarry,
          pickLongerTranscript(pendingFinalTranscript, lastInterimTranscript)
        );
        if (holdFinalTimer) {
          clearTimeout(holdFinalTimer);
          holdFinalTimer = null;
        }
        pendingFinalTranscript = "";
        voiceDebug("STT merge carry:", utteranceCarry.slice(0, 64));
      } else {
        resetTranscriptState(true);
      }
      inputTranscriptLive = "";
      lastInterimTranscript = "";
      if (turnMode !== "casual") turnMode = "trading";
      stopPlayback();
      onInterim?.("…");
      onStatus?.("Hearing you…", true);
    }

    if (type === "input_audio_buffer.speech_stopped") {
      utteranceEpoch += 1;
      lastSpeechStoppedAt = Date.now();
      window.DeskCopilotVoiceLatency?.mark?.("vad_speech_end");
      voiceDebug(`speech_stopped u${utteranceEpoch}`);
    }

    if (
      type === "conversation.item.input_audio_transcription.delta" ||
      type === "input_audio_buffer.transcription.delta"
    ) {
      const delta = msg.delta || msg.transcript || "";
      if (delta) {
        inputTranscriptLive += delta;
        lastInterimTranscript = inputTranscriptLive;
        window.DeskCopilotVoiceLatency?.mark?.("first_partial");
        onInterim?.(inputTranscriptLive);
        maybeEnterCasualFromInterim();
        if (karenIsSpeaking() && inputTranscriptLive.trim().length >= 4) {
          triggerBargeIn("interim");
        }
      }
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "input_audio_buffer.transcription.completed"
    ) {
      const fromMsg = extractInputTranscript(msg);
      const text = pickLongerTranscript(fromMsg, inputTranscriptLive);
      lastInterimTranscript = pickLongerTranscript(lastInterimTranscript, text);
      inputTranscriptLive = "";
      cancelUnsolicitedResponse("stt-done");
      if (text) {
        window.DeskCopilotVoiceLatency?.mark?.("final_transcript");
        deliverFinalTranscript(text);
      }
    }

    if (
      type === "conversation.item.input_audio_transcription.failed" ||
      type === "input_audio_buffer.transcription.failed"
    ) {
      inputTranscriptLive = "";
      voiceDebug("STT failed:", msg.error?.message || type);
    }

    if (type === "response.created" || type === "response.started") {
      if (!scriptPlaybackAllowed && turnMode !== "tool") {
        cancelUnsolicitedResponse("response.created");
        return;
      }
      window.DeskCopilotVoiceLatency?.mark?.("model_response_start");
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

    if (type === "response.cancelled" || type === "response.canceled") {
      responseActive = false;
      if (scriptPlaybackAllowed) finishScriptSpeech();
      else if (turnMode === "tool") finishToolSpeech();
    }

    if (type === "response.done") {
      responseActive = false;
      if (turnMode === "tool" && !scriptPlaybackAllowed) finishToolSpeech();
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
        if (scriptPlaybackAllowed) finishScriptSpeech();
      }, 120);
    }

    if (type === "response.function_call_arguments.done") {
      void handleFunctionCall(msg.name, msg.call_id, msg.arguments || "{}");
    }
  }

  /** Echo-guard flag — mic still streams for barge-in VAD; watchdog uses this for idle unpause. */
  function setMicPaused(paused, opts) {
    micPausedForPlayback = Boolean(paused);
    if (micUnpauseTimer) {
      clearTimeout(micUnpauseTimer);
      micUnpauseTimer = null;
    }
    if (micPausedForPlayback) {
      micPausedAt = Date.now();
      const maxMs =
        opts && typeof opts.maxMs === "number"
          ? Math.min(Math.max(opts.maxMs, 3000), MIC_PAUSE_CAP_MS)
          : MIC_PAUSE_CAP_MS;
      micUnpauseTimer = setTimeout(() => {
        micUnpauseTimer = null;
        if (micPausedForPlayback) {
          micPausedForPlayback = false;
          micPausedAt = 0;
          voiceDebug("mic pause safety — listening again");
          void ensureCaptureActive();
        }
      }, maxMs);
    } else {
      micPausedAt = 0;
      void ensureCaptureActive();
    }
  }

  function forceResumeListening(reason) {
    if (micUnpauseTimer) {
      clearTimeout(micUnpauseTimer);
      micUnpauseTimer = null;
    }
    if (micPausedForPlayback) {
      micPausedForPlayback = false;
      micPausedAt = 0;
      voiceDebug("mic force resume:", reason || "watchdog");
    }
    void ensureCaptureActive();
  }

  function startListenWatchdog() {
    if (listenWatchdog) clearInterval(listenWatchdog);
    listenWatchdog = setInterval(() => {
      if (!active || !wantActive) return;
      if (micPausedForPlayback) {
        const pausedFor = micPausedAt > 0 ? Date.now() - micPausedAt : 0;
        const speaking =
          window.DeskCopilotVoice?.isSpeaking?.() ||
          window.DeskCopilotRealtime?.isScriptSpeaking?.();
        if (!speaking && pausedFor > MIC_IDLE_UNPAUSE_MS) {
          forceResumeListening("idle-unpause");
        } else if (!speaking && pausedFor > MIC_PAUSE_CAP_MS + 5000) {
          forceResumeListening("pause-stall");
        }
        return;
      }
      void ensureCaptureActive();
    }, LISTEN_WATCHDOG_MS);
  }

  function stopListenWatchdog() {
    if (listenWatchdog) {
      clearInterval(listenWatchdog);
      listenWatchdog = null;
    }
  }

  async function connect(isReconnect = false, opts = {}) {
    if (active && wsIsLive()) return true;
    if (connectInFlight) return connectInFlight;

    const planned = opts.planned === true || plannedReconnect;
    connectInFlight = (async () => {
      try {
        if (!sessionKey || Date.now() > sessionExpires - 30000) {
          await fetchSession(window.__dcSymbol?.() || "MNQ1!");
        }

        if (!planned) {
          onStatus?.(isReconnect ? "Reconnecting voice…" : "Connecting realtime voice…", null);
        }

        const wsConnectT0 = performance.now();
        await new Promise((resolve, reject) => {
          connectResolve = resolve;
          connectReject = reject;
          connectTimer = setTimeout(() => {
            finishConnectAttempt(false, new Error("Realtime connection timed out"));
          }, CONNECT_TIMEOUT_MS);

          ws = new WebSocket(
            `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(sessionModel)}`,
            ["realtime", `openai-insecure-api-key.${sessionKey}`]
          );

          ws.onopen = () => {
            if (!planned) voiceDebug("ws open");
            const wsMs = Math.round(performance.now() - wsConnectT0);
            window.__dcVoiceLog?.(`[latency] ws_open +${wsMs}ms`);
            window.DeskCopilotVoiceLatency?.mark?.("ws_connect");
          };

          ws.onerror = () => {
            finishConnectAttempt(false, new Error("Realtime connection failed"));
          };

          ws.onclose = (ev) => {
            lastDisconnectReason = `code=${ev.code} clean=${ev.wasClean} ${ev.reason || ""}`.trim();
            voiceDebug("ws closed:", lastDisconnectReason);
            if (connectReject) {
              finishConnectAttempt(
                false,
                new Error(lastFatalError || `Realtime closed (${ev.code})`)
              );
            }
            const wasActive = active;
            active = false;
            if (!plannedReconnect) setListening(false);
            if (wasActive && wantActive && !plannedReconnect) {
              scheduleReconnect(lastDisconnectReason);
            }
          };

          ws.onmessage = (ev) => {
            try {
              handleServerMessage(JSON.parse(ev.data));
            } catch {
              /* ignore */
            }
          };
        });

        active = true;
        reconnects = 0;
        turnMode = "trading";
        resetTranscriptState();
        setListening(true);
        if (!planned) onStatus?.("● Voice live — talk anytime", true);

        if (!captureNode || !micStream?.active) {
          await startCapture();
        } else {
          void ensureCaptureActive();
        }
        micPausedForPlayback = false;
        micPausedAt = 0;
        startListenWatchdog();
        return true;
      } catch (e) {
        active = false;
        const msg = e instanceof Error ? e.message : String(e);
        voiceDebug("connect failed:", msg);
        if (!planned) onStatus?.(msg, false);
        cleanupSocket();
        if (wantActive && !planned) scheduleReconnect(msg);
        return false;
      } finally {
        plannedReconnect = false;
      }
    })();

    try {
      return await connectInFlight;
    } finally {
      connectInFlight = null;
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
    plannedReconnect = false;
    active = false;
    turnMode = "trading";
    stopListenWatchdog();
    micPausedForPlayback = false;
    micPausedAt = 0;
    if (micUnpauseTimer) {
      clearTimeout(micUnpauseTimer);
      micUnpauseTimer = null;
    }
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
    const ms = Math.max(15000, sessionExpires - Date.now() - 90000);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshSessionBeforeExpiry();
    }, ms);
  }

  async function refreshSessionBeforeExpiry() {
    if (!wantActive || connectInFlight) return;
    try {
      plannedReconnect = true;
      voiceDebug("session refresh — rotating token");
      await fetchSession(window.__dcSymbol?.() || "MNQ1!");
      if (!wantActive) return;
      cleanupSocket();
      active = false;
      await connect(true, { planned: true });
    } catch (e) {
      plannedReconnect = false;
      voiceDebug("session refresh failed:", e instanceof Error ? e.message : e);
      if (wantActive) scheduleReconnect("session-refresh-failed");
    }
  }

  async function prefetchSession(symbol, opts = {}) {
    const force = opts?.force === true;
    try {
      if (wsIsLive() && !force) return true;
      if (!sessionKey || Date.now() > sessionExpires - 30000 || force) {
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
    lastFatalError = "";
    return connect(false);
  }

  async function retryUpgrade() {
    wantActive = true;
    reconnects = 0;
    lastFatalError = "";
    sessionKey = "";
    cleanupSocket();
    releaseMic();
    active = false;
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
      onBargeIn = handlers.onBargeIn;
      return true;
    },
    prefetchSession,
    start,
    retryUpgrade,
    stop,
    suspend,
    isActive() {
      return active;
    },
    wantsActive() {
      return wantActive;
    },
    cancelSpeech: stopPlayback,
    cancelActiveResponse: stopPlayback,
    enterCasualTurn,
    exitCasualTurn,
    allowToolSpeech,
    speakScript,
    isScriptSpeaking() {
      return scriptPlaybackAllowed;
    },
    getTurnMode() {
      return turnMode;
    },
    setMicPaused,
    forceResumeListening,
    ensureCaptureActive,
    isMicPaused() {
      return micPausedForPlayback;
    },
    getSuppressUntil() {
      return suppressAssistantEchoUntil;
    },
    setSuppressEchoUntil,
    isSpeaking() {
      return Boolean(playCtx && playTime > (playCtx?.currentTime || 0));
    },
  };
})();
