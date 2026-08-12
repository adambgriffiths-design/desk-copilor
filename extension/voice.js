/**
 * Desk Copilot voice — Whisper + noise-gated VAD (works with background noise).
 */
(function () {
  const SpeechRecognition =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  const VOICE_LANG =
    (typeof navigator !== "undefined" &&
      navigator.language &&
      /^en(-|$)/i.test(navigator.language) &&
      navigator.language) ||
    "en-US";

  const SILENCE_MS = 1300;
  const MIN_SPEECH_MS = 320;
  const MAX_UTTERANCE_MS = 45000;
  const VAD_INTERVAL_MS = 60;
  const VOLUME_THRESHOLD = 0.007;
  const BARGE_IN_THRESHOLD = 0.022;
  const NOISE_CALIBRATION_SAMPLES = 55;
  const SPEECH_FRAMES_REQUIRED = 3;

  const COMMANDS = [
    {
      id: "verdict",
      patterns: [
        /\b(get|give|need)\s+(me\s+)?(a\s+)?(verdict|update)\b/i,
        /\b(get|give|need)\s+(me\s+)?(the|a)\s+read\b/i,
        /\b(look at|check)\s+(the\s+)?chart\b/i,
        /\bwhat do you see\b/i,
      ],
    },
    {
      id: "levels",
      patterns: [
        /\bmark levels\b/i,
        /\bdraw levels\b/i,
        /\bshow levels\b/i,
        /\bplot levels\b/i,
      ],
    },
    {
      id: "read",
      patterns: [/\bread (it|aloud)\b/i, /\bspeak\b/i, /\bsay it\b/i],
    },
    {
      id: "stop",
      patterns: [
        /\bstop listening\b/i,
        /\bstop voice\b/i,
        /\bstop talking\b/i,
        /^stop[.!]?$/i,
        /^wait[.!]?$/i,
      ],
    },
  ];

  const NORMALIZE = [
    [/\bem en q\b/gi, "MNQ"],
    [/\bm and q\b/gi, "MNQ"],
    [/\bf v g\b/gi, "fair value gap"],
    [/\bo r g\b/gi, "opening range gap"],
    [/\bwhat do you see on the char\b/gi, "what do you see on the chart"],
    [/\blook at the char\b/gi, "look at the chart"],
    [/\byour reed\b/gi, "your read"],
    [/\bgive me a reed\b/gi, "give me a read"],
  ];

  let micStream = null;
  let audioContext = null;
  let analyser = null;
  let vadTimer = null;
  let utteranceTimer = null;
  let recorder = null;
  let recordChunks = [];
  let recording = false;
  let transcribing = false;
  let speechStartedAt = 0;
  let lastLoudAt = 0;
  let listening = false;
  let speaking = false;
  let speakDone = null;
  let speakPollTimer = null;
  let speakMaxTimer = null;
  let speakGeneration = 0;
  let autoRead = true;
  let onCommand = null;
  let onChat = null;
  let onStatus = null;
  let onInterim = null;
  let onSpeakingChange = null;
  let onListeningChange = null;
  let onRecordingChange = null;
  let lastHeardAt = 0;
  let lastHeardText = "";
  let recordMimeType = "audio/webm";
  let recognition = null;
  let recognitionPaused = false;
  let recognitionRestartTimer = null;
  let sttMode = SpeechRecognition ? "native" : "whisper";
  let noiseFloor = 0.004;
  let noiseSamples = [];
  let vadCalibrated = false;
  let speechFrames = 0;
  let pendingTranscript = "";
  let pendingTranscriptTimer = null;
  let nativeSttErrors = 0;
  let userVoiceOff = false;
  let engineMode = "off"; // realtime | cascade | off

  const VOICE_OFF_KEY = "dc-voice-user-off";
  const AUTO_READ_KEY = "dc-auto-read";

  function loadPersistedVoiceOff() {
    try {
      return localStorage.getItem(VOICE_OFF_KEY) === "1";
    } catch {
      return false;
    }
  }

  function persistVoiceOff(off) {
    try {
      if (off) localStorage.setItem(VOICE_OFF_KEY, "1");
      else localStorage.removeItem(VOICE_OFF_KEY);
    } catch {
      /* ignore */
    }
  }

  function loadPersistedAutoRead() {
    try {
      const v = localStorage.getItem(AUTO_READ_KEY);
      if (v != null) return v !== "0";
    } catch {
      /* ignore */
    }
    return true;
  }

  userVoiceOff = loadPersistedVoiceOff();
  autoRead = loadPersistedAutoRead();
  let finishingUtterance = false;
  let utteranceBusy = false;
  let transcribeToken = 0;
  let getChatContext = null;
  let onAssistantReply = null;
  let onNeedsChartRead = null;
  let onUserTranscript = null;
  let ttsAudio = null;
  let ttsQueue = [];
  let ttsPlaying = false;
  let chatStreamPort = null;
  let onCascadeFallback = null;
  let echoGuardUntil = 0;

  const UTTERANCE_WATCHDOG_MS = 30000;
  const CASCADE_STATUS =
    "Lower quality responses whilst in fallback — speak, then pause";
  const CASCADE_FALLBACK_INTRO =
    "Realtime unavailable — lower quality responses whilst in fallback";

  function supported() {
    return Boolean(
      (SpeechRecognition || (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined")) &&
        window.speechSynthesis
    );
  }

  function realtimeOwnsStt() {
    return engineMode === "realtime" || Boolean(window.DeskCopilotRealtime?.isActive?.());
  }

  function stopCascadeStt() {
    stopNativeStt();
    stopVadTimer();
    finishRecording();
    if (pendingTranscriptTimer) {
      clearTimeout(pendingTranscriptTimer);
      pendingTranscriptTimer = null;
    }
    pendingTranscript = "";
  }

  function flushPendingTranscript() {
    if (realtimeOwnsStt()) return;
    if (pendingTranscriptTimer) {
      clearTimeout(pendingTranscriptTimer);
      pendingTranscriptTimer = null;
    }
    const merged = pendingTranscript.trim();
    pendingTranscript = "";
    if (merged) handleTranscript(merged);
  }

  function enqueueTranscript(text) {
    if (realtimeOwnsStt()) return;
    const t = text.trim();
    if (!t) return;
    pendingTranscript = pendingTranscript ? `${pendingTranscript} ${t}` : t;
    if (pendingTranscriptTimer) clearTimeout(pendingTranscriptTimer);
    pendingTranscriptTimer = setTimeout(() => {
      pendingTranscriptTimer = null;
      const merged = pendingTranscript.trim();
      pendingTranscript = "";
      if (merged) handleTranscript(merged);
    }, 750);
  }

  function normalizeTranscript(text) {
    let t = text.replace(/\s+/g, " ").trim();
    for (const [pattern, replacement] of NORMALIZE) {
      t = t.replace(pattern, replacement);
    }
    return t;
  }

  function isLikelyHallucination(text) {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return true;

    if (window.DeskCopilotTranscriptGuard?.isTradingViewDisclaimer?.(t)) return true;

    if (/^(mnq|mnq futures|nasdaq|nasdaq futures|mini nasdaq|futures|thank you|thanks|uh|um|hmm|okay|ok|hello|hey)[.!?\s]*$/i.test(t)) {
      return true;
    }

    const lower = t.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const acronyms = (lower.match(/\b(fvg|org|ce|mss|ivfvg|ndog|nwog|ote|pdh|pdl|pdc)\b/gi) || [])
      .length;
    if (
      acronyms >= 4 &&
      words.length <= acronyms + 5 &&
      !/\b(i|you|we|buy|sell|wait|hello|hey|thanks)\b/i.test(t)
    ) {
      return true;
    }
    const echoPhrases = [
      "fair value gap",
      "opening range gap",
      "market structure shift",
      "what do you see on the chart",
      "get the read",
      "chart read",
      "liquidity sweep",
      "ict trading desk",
    ];
    let hits = 0;
    for (const phrase of echoPhrases) {
      if (lower.includes(phrase)) hits++;
    }
    if (hits >= 2 && words.length < 18) return true;
    if (hits >= 2 && acronyms >= 2 && words.length < 14) return true;
    if (/^(fvg|org|ce|mss|liquidity|bias|premium|discount)[\s,;]+/i.test(t)) return true;
    return false;
  }

  function matchCommand(text) {
    const t = text.trim();
    if (!t) return null;
    for (const cmd of COMMANDS) {
      if (cmd.patterns.some((p) => p.test(t))) return cmd.id;
    }
    return null;
  }

  function toSpeakable(text) {
    if (!text) return "";
    const cleaned = text
      .replace(/^META:.*$/gim, "")
      .replace(/^#{1,3}\s+.*$/gm, "")
      .replace(/\*\*/g, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return window.DeskCopilotPlainLanguage?.expandTradingAbbreviations?.(cleaned) || cleaned;
  }

  /** Chrome chokes on one huge utterance — split on sentences, cap chunk size. */
  function chunkForSpeech(text, maxLen = 260) {
    if (text.length <= maxLen) return [text];

    const chunks = [];
    const parts = text.split(/(?<=[.!?])\s+|\n+/);
    let buf = "";

    for (const part of parts) {
      const piece = part.trim();
      if (!piece) continue;
      const next = buf ? `${buf} ${piece}` : piece;
      if (next.length <= maxLen) {
        buf = next;
        continue;
      }
      if (buf) chunks.push(buf);
      if (piece.length <= maxLen) {
        buf = piece;
        continue;
      }
      let rest = piece;
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(" ", maxLen);
        if (cut < Math.floor(maxLen * 0.45)) cut = maxLen;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      buf = rest;
    }

    if (buf) chunks.push(buf);
    return chunks.length ? chunks : [text];
  }

  function estimateSpeakMs(text) {
    return Math.min(180000, text.length * 95 + 4000);
  }

  function cleanMime(mime) {
    return String(mime || "audio/webm").split(";")[0].trim() || "audio/webm";
  }

  function setListening(active) {
    listening = active;
    onListeningChange?.(active);
  }

  function setSpeaking(active) {
    speaking = active;
    if (active) {
      echoGuardUntil = Date.now() + 450;
    }
    onSpeakingChange?.(active);
  }

  function setRecording(active) {
    if (recording === active) return;
    recording = active;
    onRecordingChange?.(active);
  }

  async function resumeAudioContext() {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContext();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }

  function measureVolume() {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  function stopVadTimer() {
    if (vadTimer) {
      clearInterval(vadTimer);
      vadTimer = null;
    }
    analyser = null;
  }

  async function startVad() {
    stopVadTimer();
    if (!micStream) return;

    await resumeAudioContext();

    const source = audioContext.createMediaStreamSource(micStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.25;
    source.connect(analyser);
    lastLoudAt = 0;
    noiseSamples = [];
    vadCalibrated = false;
    speechFrames = 0;
    noiseFloor = 0.004;

    vadTimer = setInterval(() => {
      if (realtimeOwnsStt() || !listening || transcribing) return;
      const volume = measureVolume();

      if (!vadCalibrated && !recording) {
        noiseSamples.push(volume);
        if (noiseSamples.length >= NOISE_CALIBRATION_SAMPLES) {
          const sorted = [...noiseSamples].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)] || 0;
          noiseFloor = Math.max(0.004, median * 3.2);
          vadCalibrated = true;
        }
      }

      const threshold = Math.max(VOLUME_THRESHOLD, noiseFloor);

      if (speaking) {
        if (volume >= Math.max(BARGE_IN_THRESHOLD, threshold * 2)) {
          cancelSpeech();
        }
        return;
      }

      if (volume >= threshold) {
        speechFrames += 1;
        if (speechFrames >= SPEECH_FRAMES_REQUIRED) {
          lastLoudAt = Date.now();
          if (!recording) beginRecording();
        }
        return;
      }

      speechFrames = 0;

      if (recording && lastLoudAt && Date.now() - lastLoudAt >= SILENCE_MS) {
        finishRecording();
      }
    }, VAD_INTERVAL_MS);
  }

  function clearRecognitionRestart() {
    if (recognitionRestartTimer) {
      clearTimeout(recognitionRestartTimer);
      recognitionRestartTimer = null;
    }
  }

  function scheduleRecognitionRestart() {
    if (recognitionRestartTimer || !listening || speaking || recognitionPaused) return;
    recognitionRestartTimer = setTimeout(() => {
      recognitionRestartTimer = null;
      if (!listening || speaking || recognitionPaused || !recognition) return;
      try {
        recognition.start();
      } catch {
        scheduleRecognitionRestart();
      }
    }, 200);
  }

  function stopNativeStt() {
    clearRecognitionRestart();
    recognitionPaused = false;
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      /* ignore */
    }
    recognition = null;
  }

  function pauseNativeStt() {
    if (!recognition || sttMode !== "native") return;
    recognitionPaused = true;
    clearRecognitionRestart();
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  }

  function resumeNativeStt() {
    if (realtimeOwnsStt()) return;
    if (!listening || sttMode !== "native" || speaking) return;
    if (!recognition) {
      if (!startNativeStt()) sttMode = "whisper";
      return;
    }
    recognitionPaused = false;
    scheduleRecognitionRestart();
  }

  function startNativeStt() {
    if (!SpeechRecognition) return false;
    stopNativeStt();

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = VOICE_LANG;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (realtimeOwnsStt() || speaking || !listening) return;

      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result[0]?.transcript || "").trim();
        if (!text) continue;

        if (result.isFinal) {
          nativeSttErrors = 0;
          setRecording(false);
          onInterim?.("");
          const finalText = normalizeTranscript(text);
          if (finalText && !isLikelyHallucination(finalText)) {
            void handleTranscript(finalText);
          }
        } else {
          interim += `${text} `;
        }
      }

      if (interim.trim()) {
        setRecording(true);
        onInterim?.(interim.trim());
        onStatus?.("Hearing you…", true);
      }
    };

    recognition.onerror = (event) => {
      const err = event.error || "";
      if (err === "no-speech" || err === "aborted") return;
      if (err === "not-allowed" || err === "service-not-allowed") {
        onStatus?.("Mic blocked — allow mic for tradingview.com", false);
        stopListening();
        return;
      }
      if (err === "network") {
        nativeSttErrors += 1;
        if (nativeSttErrors >= 2) {
          void switchToWhisperMode("Browser STT flaky — using Whisper");
          return;
        }
        onStatus?.("Speech network error — retrying…", null);
        scheduleRecognitionRestart();
        return;
      }
      if (listening && !speaking) scheduleRecognitionRestart();
    };

    recognition.onend = () => {
      if (listening && !speaking && !recognitionPaused) scheduleRecognitionRestart();
    };

    recognitionPaused = false;
    try {
      recognition.start();
      sttMode = "native";
      return true;
    } catch {
      recognition = null;
      return false;
    }
  }

  function releaseMic() {
    if (utteranceTimer) {
      clearTimeout(utteranceTimer);
      utteranceTimer = null;
    }
    stopVadTimer();
    if (recorder && recording) {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorder = null;
    setRecording(false);
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  }

  async function ensureMicPermission() {
    if (micStream?.active) {
      micStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      await resumeAudioContext();
      return { ok: true };
    }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      micStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
      await resumeAudioContext();
      return { ok: true };
    } catch (e) {
      releaseMic();
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        return {
          ok: false,
          msg: "Mic blocked — click Voice on, or allow mic for tradingview.com in the address bar",
        };
      }
      if (name === "NotFoundError") {
        return { ok: false, msg: "No microphone found — check Windows Sound settings" };
      }
      return {
        ok: false,
        msg: e instanceof Error ? e.message : "Microphone unavailable",
      };
    }
  }

  function pickMimeType() {
    for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        if (typeof data !== "string") {
          reject(new Error("Could not read audio"));
          return;
        }
        resolve(data.split(",")[1] || "");
      };
      reader.onerror = () => reject(new Error("Could not read audio"));
      reader.readAsDataURL(blob);
    });
  }

  function transcribeViaBackground(base64, mimeType) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "TRANSCRIBE", audioBase64: base64, mimeType: cleanMime(mimeType) },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "Extension error"));
            return;
          }
          if (res?.error) reject(new Error(res.error));
          else resolve(res?.text || "");
        }
      );
    });
  }

  function clearSpeakTimers() {
    if (speakPollTimer) {
      clearInterval(speakPollTimer);
      speakPollTimer = null;
    }
    if (speakMaxTimer) {
      clearTimeout(speakMaxTimer);
      speakMaxTimer = null;
    }
  }

  function cancelSpeech() {
    const active = speaking || window.speechSynthesis?.speaking || Boolean(ttsAudio);
    speakGeneration += 1;
    window.speechSynthesis?.cancel();
    stopTtsPlayback();
    if (chatStreamPort) {
      try {
        chatStreamPort.disconnect();
      } catch {
        /* ignore */
      }
      chatStreamPort = null;
    }
    window.DeskCopilotRealtime?.cancelSpeech?.();
    window.DeskCopilotRealtime?.setMicPaused?.(false);
    clearSpeakTimers();
    const done = speakDone;
    speakDone = null;
    setSpeaking(false);
    if (active || done) {
      done?.();
      resumeNativeStt();
      if (listening) {
        onStatus?.(
          engineMode === "realtime" ? "● Voice live — talk anytime" : "Listening…",
          engineMode === "realtime"
        );
      }
      return true;
    }
    return false;
  }

  function beginRecording() {
    if (realtimeOwnsStt() || recording || transcribing || !listening || speaking) return;
    recordMimeType = cleanMime(pickMimeType() || "audio/webm");
    recordChunks = [];
    const mime = pickMimeType();
    const recorderOpts = mime
      ? { mimeType: mime, audioBitsPerSecond: 128000 }
      : { audioBitsPerSecond: 128000 };
    try {
      recorder = new MediaRecorder(micStream, recorderOpts);
    } catch {
      try {
        recorder = mime ? new MediaRecorder(micStream, { mimeType: mime }) : new MediaRecorder(micStream);
      } catch {
        try {
          recorder = new MediaRecorder(micStream);
          recordMimeType = "audio/webm";
        } catch {
          onStatus?.("Recording not supported in this browser", false);
          return;
        }
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data?.size) recordChunks.push(e.data);
    };

    recorder.onstop = () => {
      recorder = null;
      setRecording(false);
      finishingUtterance = false;
      void transcribeChunks(recordMimeType);
    };

    recorder.onerror = () => {
      setRecording(false);
      recorder = null;
      onStatus?.("Recording error — try Voice off/on", false);
    };

    recorder.start(100);
    speechStartedAt = Date.now();
    lastLoudAt = Date.now();
    setRecording(true);
    onInterim?.("…");
    onStatus?.("Hearing you…", true);

    if (utteranceTimer) clearTimeout(utteranceTimer);
    utteranceTimer = setTimeout(finishRecording, MAX_UTTERANCE_MS);
  }

  function finishRecording() {
    if (!recording || !recorder || finishingUtterance) return;
    finishingUtterance = true;
    const activeRecorder = recorder;
    if (utteranceTimer) {
      clearTimeout(utteranceTimer);
      utteranceTimer = null;
    }
    if (Date.now() - speechStartedAt < MIN_SPEECH_MS) {
      try {
        if (activeRecorder.state === "recording") activeRecorder.stop();
      } catch {
        /* ignore */
      }
      recordChunks = [];
      setRecording(false);
      recorder = null;
      finishingUtterance = false;
      onInterim?.("");
      if (listening) onStatus?.("Listening…", true);
      return;
    }
    try {
      if (activeRecorder.state === "recording") {
        activeRecorder.requestData();
        activeRecorder.stop();
      }
    } catch {
      setRecording(false);
      recorder = null;
      finishingUtterance = false;
    }
  }

  async function transcribeChunks(mimeType) {
    if (!recordChunks.length) {
      onInterim?.("");
      if (listening) onStatus?.("Didn't catch that — speak again", null);
      return;
    }

    const token = ++transcribeToken;
    transcribing = true;
    onStatus?.("Transcribing…", null);
    try {
      const blob = new Blob(recordChunks, { type: cleanMime(mimeType) });
      recordChunks = [];
      if (blob.size < 500) {
        onInterim?.("");
        if (listening) onStatus?.("Didn't catch that — speak louder, then pause", null);
        return;
      }
      const base64 = await blobToBase64(blob);
      const raw = await transcribeViaBackground(base64, mimeType);
      const text = normalizeTranscript(raw);
      onInterim?.("");
      if (token !== transcribeToken) return;
      if (text && isLikelyHallucination(text)) {
        if (listening) {
          onStatus?.("Didn't catch that — speak again", null);
          if (autoRead) speakAck("Didn't catch that — speak again");
        }
        return;
      }
      if (text) handleTranscript(text);
      else if (listening) onStatus?.("Listening…", true);
    } catch (e) {
      onInterim?.("");
      const msg = e instanceof Error ? e.message : String(e);
      if (/no speech detected|didn't catch|too short|OPENAI_API_KEY|fetch failed|Failed to fetch/i.test(msg)) {
        if (/OPENAI_API_KEY|fetch failed|Failed to fetch/i.test(msg)) {
          onStatus?.("Backend offline — check Extension Options (Vercel URL)", false);
        } else if (listening) onStatus?.("Didn't catch that — speak again", null);
      } else if (/invalid file format/i.test(msg)) {
        if (listening) onStatus?.("Audio format error — reload extension", false);
      } else {
        onStatus?.(msg, false);
      }
      if (listening) setTimeout(() => onStatus?.("Listening…", true), 1500);
    } finally {
      transcribing = false;
    }
  }

  function isAutonomousEnabled() {
    try {
      return localStorage.getItem("dc-auto-voice") !== "0";
    } catch {
      return true;
    }
  }

  function bgSend(msg, timeoutMs = 60000) {
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

  function splitSentences(text) {
    const parts = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [text.trim()];
  }

  async function getStoredVoice() {
    try {
      const { voiceId } = await chrome.storage.sync.get("voiceId");
      return typeof voiceId === "string" && voiceId.trim() ? voiceId.trim() : "marin";
    } catch {
      return "marin";
    }
  }

  async function fetchTtsAudio(text, speed, instructions) {
    const voice = await getStoredVoice();
    const body = { text: text.slice(0, 4096), voice };
    if (typeof speed === "number") body.speed = speed;
    if (instructions) body.instructions = instructions;
    const res = await bgSend({ type: "TTS", ...body }, 45000);
    if (res?.error) throw new Error(res.error);
    if (!res?.audioBase64) throw new Error("Empty TTS");
    const binary = atob(res.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: res.mimeType || "audio/mpeg" });
  }

  /** Start TTS fetch early (parallel with bubble paint) — consumed by speakTextOnce. */
  function prefetchTtsAudio(text, speed, instructions) {
    const line = toSpeakable(text);
    if (!line) return null;
    return fetchTtsAudio(line.slice(0, 4096), speed, instructions);
  }

  function safeResumeSynthesis() {
    try {
      const syn = window.speechSynthesis;
      if (syn?.paused) syn.resume();
    } catch {
      /* ignore */
    }
  }

  function stopTtsPlayback() {
    ttsQueue = [];
    ttsPlaying = false;
    if (ttsAudio) {
      try {
        ttsAudio.pause();
        ttsAudio.src = "";
      } catch {
        /* ignore */
      }
      ttsAudio = null;
    }
  }

  async function playTtsBlob(blob, gen) {
    return new Promise((resolve) => {
      if (gen !== speakGeneration) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudio = audio;
      let settled = false;
      let started = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(startWatch);
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
        URL.revokeObjectURL(url);
        if (ttsAudio === audio) ttsAudio = null;
        resolve(ok === true ? true : ok === "partial" ? "partial" : false);
      };
      audio.onplaying = () => {
        started = true;
        window.__dcVoiceLatencyMark?.("first_audible");
        window.__dcVoiceLatencyMark?.("tts_playback");
      };
      audio.onended = () => finish(true);
      audio.onerror = () => finish(started ? "partial" : false);
      const startWatch = setTimeout(() => {
        if (started) return;
        if (ttsAudio === audio && !audio.paused && audio.currentTime > 0) {
          started = true;
          return;
        }
        finish(false);
      }, 10000);
      audio
        .play()
        .then(() => {
          if (audio.currentTime > 0 || !audio.paused) started = true;
        })
        .catch(() => finish(started ? "partial" : false));
    });
  }

  async function drainTtsQueue(gen) {
    if (ttsPlaying || gen !== speakGeneration) return;
    ttsPlaying = true;
    while (ttsQueue.length && gen === speakGeneration) {
      const blob = ttsQueue.shift();
      await playTtsBlob(blob, gen);
    }
    ttsPlaying = false;
  }

  async function speakTextOnce(text, gen, speed, instructions, opts) {
    opts = opts || {};
    const line = toSpeakable(text);
    if (!line || gen !== speakGeneration) return;

    const browserRate =
      typeof opts.browserRate === "number"
        ? opts.browserRate
        : typeof speed === "number" && speed < 0.9
          ? 0.88
          : line.length >= 120
            ? 0.9
            : undefined;

    setSpeaking(true);
    pauseNativeStt();
    stopTtsPlayback();
    window.speechSynthesis?.cancel();
    onStatus?.("Speaking — talk to interrupt", null);

    const browserFirst =
      window.DeskCopilotVoiceQuickReply?.prefersBrowserTtsFirst?.(line, {
        hasInstructions: Boolean(instructions),
      }) === true && window.speechSynthesis;

    if (browserFirst) {
      await new Promise((resolve) => {
        if (gen !== speakGeneration) {
          resolve();
          return;
        }
        speakWithBrowserTts(line, resolve, { rate: browserRate });
      });
      return;
    }

    try {
      const prefetched = opts.ttsPrefetch;
      const blob =
        prefetched && typeof prefetched.then === "function"
          ? await prefetched
          : await fetchTtsAudio(line.slice(0, 4096), speed, instructions);
      if (gen !== speakGeneration) return;
      if (!blob) throw new Error("Empty TTS");
      const played = await playTtsBlob(blob, gen);
      if (gen !== speakGeneration) return;
      if (played === true) return;
      if (played === "partial") {
        window.__dcVoiceLog?.("TTS partial playback — skip browser repeat");
        return;
      }
      if (!played && window.speechSynthesis && gen === speakGeneration) {
        stopTtsPlayback();
        window.speechSynthesis.cancel();
        await new Promise((resolve) => speakWithBrowserTts(line, resolve, { rate: browserRate }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.__dcVoiceLog?.("TTS failed:", msg);
      if (window.speechSynthesis && gen === speakGeneration) {
        stopTtsPlayback();
        window.speechSynthesis.cancel();
        await new Promise((resolve) => speakWithBrowserTts(line, resolve, { rate: browserRate }));
      } else {
        onStatus?.("Voice playback failed — check backend / TTS", false);
      }
    }
  }

  function chatViaBackground(payload) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Desk timed out — try again"));
      }, 90000);

      chrome.runtime.sendMessage(
        { type: "CHAT", ...payload, voiceInput: true },
        (res) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "Extension error"));
            return;
          }
          if (res?.error) {
            reject(new Error(res.error));
            return;
          }
          if (res?.needsChartRead) {
            resolve({
              needsChartRead: true,
              question: res.question || "",
              reply: "",
            });
            return;
          }
          resolve({ reply: (res?.reply || "").trim() });
        }
      );
    });
  }

  /** Quick browser-only ack — no API round-trip. Pauses mic so Karen doesn't hear herself. */
  function speakAck(text) {
    if (!text || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      setSpeaking(true);
      window.DeskCopilotRealtime?.setMicPaused?.(true, { maxMs: 2000 });
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.lang = VOICE_LANG;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        setSpeaking(false);
        window.DeskCopilotRealtime?.setMicPaused?.(false);
      };
      u.onend = finish;
      u.onerror = finish;
      setTimeout(finish, Math.min(5000, String(text).length * 80 + 1200));
      window.speechSynthesis.speak(u);
    } catch {
      setSpeaking(false);
      window.DeskCopilotRealtime?.setMicPaused?.(false);
    }
  }

  async function respondWithCascade(transcript) {
    if (!getChatContext) {
      onChat?.(transcript);
      return;
    }

    const ctx = getChatContext();
    if (window.DeskCopilotCasual?.isCasualMessage?.(transcript, ctx?.messages)) {
      window.DeskCopilotRealtime?.enterCasualTurn?.();
      window.DeskCopilotVoice?.cancelSpeech?.();
      if (window.__dcHandleVoiceTurn) {
        void window.__dcHandleVoiceTurn(transcript);
        return;
      }
      onUserTranscript?.(transcript);
      onChat?.(transcript, { skipBubble: true });
      return;
    }

    const messages = [...(ctx.messages || []), { role: "user", content: transcript }];
    onUserTranscript?.(transcript);

    cancelSpeech();
    const gen = ++speakGeneration;
    speakDone = null;
    setSpeaking(true);
    pauseNativeStt();
    onStatus?.("Desk thinking…", null);
    onInterim?.("");

    let watchdogSpoke = false;
    const watchdog = setTimeout(async () => {
      if (gen !== speakGeneration || watchdogSpoke) return;
      watchdogSpoke = true;
      onStatus?.("No reply in 90s — backend slow or offline; try RECONNECT", false);
      if (autoRead) await speakTextOnce("No reply in 90 seconds — try RECONNECT on the panel.", gen);
    }, UTTERANCE_WATCHDOG_MS);

    try {
      const pricePayload =
        (await window.DeskCopilotChartPrice?.payload?.()) || {};
      const result = await chatViaBackground({
        messages,
        symbol: ctx.symbol,
        lastVerdict: ctx.lastVerdict,
        voiceInput: true,
        ...pricePayload,
      });

      if (result.needsChartRead) {
        speakAck("One sec, reading the chart");
        setSpeaking(false);
        resumeNativeStt();
        await onNeedsChartRead?.(result.question || transcript);
        if (listening) onStatus?.(CASCADE_STATUS, null);
        return;
      }

      const reply = (result.reply || "").trim();
      if (!reply) throw new Error("Empty reply");

      onAssistantReply?.(reply, transcript);
      onStatus?.("Speaking — talk to interrupt", null);

      if (autoRead) {
        await speakTextOnce(reply, gen);
      }
      if (gen === speakGeneration) {
        setSpeaking(false);
        resumeNativeStt();
        if (listening) onStatus?.(CASCADE_STATUS, null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const spoken =
        msg.includes("Empty reply")
          ? "Backend returned nothing — hit RECONNECT on the panel and try again."
          : msg.includes("timed out")
            ? "That timed out — backend may be cold. Hit RECONNECT and ask again."
            : msg.includes("offline") || msg.includes("fetch")
              ? "Backend offline — click RECONNECT on the desk panel."
              : `Couldn't answer: ${msg}`;
      onStatus?.(spoken, false);
      if (autoRead && gen === speakGeneration) {
        await speakTextOnce(spoken, gen);
      }
      onChat?.(transcript, { skipBubble: true });
    } finally {
      clearTimeout(watchdog);
      setSpeaking(false);
      resumeNativeStt();
      if (listening) onStatus?.(CASCADE_STATUS, null);
    }
  }

  function handleTranscript(transcript) {
    if (realtimeOwnsStt()) return;
    const t = transcript.trim();
    if (!t) return;

    const cmd = matchCommand(t);
    if (cmd === "stop") {
      if (speaking) {
        cancelSpeech();
        return;
      }
      stopAutonomous();
      return;
    }

    if (speaking) cancelSpeech();

    const now = Date.now();
    const norm = t.toLowerCase();
    if (utteranceBusy || (norm === lastHeardText && now - lastHeardAt < 3000)) {
      if (listening) onStatus?.("Listening…", true);
      return;
    }
    lastHeardAt = now;
    lastHeardText = norm;
    utteranceBusy = true;

    onStatus?.(`Heard: "${t}"`, true);
    onInterim?.("");

    if (cmd) {
      utteranceBusy = false;
      onCommand?.(cmd, t);
      return;
    }
    if (window.__dcHandleVoiceTurn) {
      void window.__dcHandleVoiceTurn(t).finally(() => {
        utteranceBusy = false;
        if (listening) onStatus?.(CASCADE_STATUS, null);
      });
      return;
    }
    utteranceBusy = false;
    if (onChat) {
      onChat(t);
      onStatus?.("Got it…", true);
      return;
    }
  }

  function speakWithBrowserTts(line, onDone, browserOpts) {
    browserOpts = browserOpts || {};
    const gen = speakGeneration;
    const chunks = chunkForSpeech(line);
    let chunkIndex = 0;
    speakDone = onDone;
    setSpeaking(true);
    pauseNativeStt();
    onStatus?.("Speaking — talk to interrupt", null);

    try {
      safeResumeSynthesis();
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
    window.speechSynthesis.cancel();

    let finished = false;
    const finish = () => {
      if (finished || gen !== speakGeneration) return;
      finished = true;
      clearSpeakTimers();
      window.DeskCopilotRealtime?.setMicPaused?.(false);
      const done = speakDone;
      speakDone = null;
      setSpeaking(false);
      done?.();
      resumeNativeStt();
      if (listening) onStatus?.("Listening…", true);
    };

    const armChunkWatchdog = () => {
      if (speakMaxTimer) clearTimeout(speakMaxTimer);
      const chunk = chunks[Math.min(chunkIndex, chunks.length - 1)] || line;
      speakMaxTimer = setTimeout(() => {
        if (finished || gen !== speakGeneration) return;
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
        finish();
      }, Math.max(25000, chunk.length * 110 + 12000));
    };

    const speakNext = () => {
      if (finished || gen !== speakGeneration) return;
      if (chunkIndex >= chunks.length) {
        finish();
        return;
      }

      const excerpt = chunks[chunkIndex++];
      armChunkWatchdog();
      const u = new SpeechSynthesisUtterance(excerpt);
      u.rate =
        typeof browserOpts.rate === "number"
          ? browserOpts.rate
          : browserOpts.chuckle
            ? 1.02
            : line.length >= 120
              ? 0.9
              : 1;
      u.pitch = browserOpts.chuckle ? 1.06 : 1;
      u.lang = VOICE_LANG;
      u.onstart = () => {
        window.__dcVoiceLatencyMark?.("first_audible");
        window.__dcVoiceLatencyMark?.("tts_playback");
      };
      u.onend = () => {
        if (gen !== speakGeneration) return;
        speakNext();
      };
      u.onerror = () => {
        if (gen !== speakGeneration) return;
        speakNext();
      };
      window.speechSynthesis.speak(u);
    };

    // Chrome pauses synthesis on long reads — keep it alive; completion is chunk-driven only.
    speakPollTimer = setInterval(() => {
      if (gen !== speakGeneration || finished) return;
      safeResumeSynthesis();
    }, 8000);

    speakNext();
  }

  function primeAudioPlayback() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        void ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch {
      /* ignore */
    }
    try {
      window.speechSynthesis?.getVoices?.();
      safeResumeSynthesis();
    } catch {
      /* ignore */
    }
  }

  function createStreamingSpeaker(onAllDone, opts = {}) {
    const sessionGen = ++speakGeneration;
    let buffer = "";
    let spokenIdx = 0;
    let chain = Promise.resolve();
    let active = true;
    let micPaused = false;
    let spokeAny = false;
    const spokenChunks = new Set();
    let spokenDelivered = "";

    primeAudioPlayback();

    function ensureMicPaused() {
      if (micPaused || opts.pauseMic === false) return;
      micPaused = true;
      window.DeskCopilotRealtime?.setMicPaused?.(true, { maxMs: 22000 });
    }

    function unpauseMic() {
      if (!micPaused) return;
      micPaused = false;
      window.DeskCopilotRealtime?.setMicPaused?.(false);
    }

    function chunkKey(text) {
      return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/[^\w\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function nextSpeakChunk(from) {
      const pending = buffer.slice(from).trimStart();
      if (!pending) return null;
      const isFirst = !spokeAny;
      const minChars = isFirst ? 3 : 6;
      const sentence = pending.match(
        new RegExp(`^[\\s\\S]{${minChars},}?[.!?](?:\\s+|$)|^[\\s\\S]{${minChars},}?—(?:\\s+|$)`)
      );
      if (sentence) {
        const start = buffer.length - pending.length;
        return { text: sentence[0].trim(), end: start + sentence[0].length };
      }
      const clauseLen = isFirst ? 36 : 72;
      const minCut = isFirst ? 12 : 24;
      if (pending.length >= clauseLen) {
        const cut = pending.lastIndexOf(" ", clauseLen);
        if (cut >= minCut) {
          const start = buffer.length - pending.length;
          return { text: pending.slice(0, cut).trim(), end: start + cut };
        }
      }
      return null;
    }

    function enqueueSpeak(text) {
      const line = toSpeakable(text);
      if (!line || !active || sessionGen !== speakGeneration) return "skip";
      const key = chunkKey(line);
      if (key && spokenChunks.has(key)) return "deduped";
      if (key) spokenChunks.add(key);
      spokeAny = true;
      ensureMicPaused();
      chain = chain.then(
        () =>
          new Promise((resolve) => {
            if (!active || sessionGen !== speakGeneration) {
              resolve();
              return;
            }
            setSpeaking(true);
            pauseNativeStt();
            onStatus?.("Speaking — talk to interrupt", null);
            const chuckle = window.DeskCopilotVoiceEmotion?.shouldChuckle?.(line) === true;
            const u = new SpeechSynthesisUtterance(line);
            u.rate = typeof opts.rate === "number" ? opts.rate : chuckle ? 1.08 : 1.06;
            u.pitch = chuckle ? 1.06 : 1;
            u.lang = VOICE_LANG;
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              clearTimeout(chunkTimer);
              resolve();
            };
            u.onend = () => {
              spokenDelivered = spokenDelivered
                ? `${spokenDelivered} ${line}`.trim()
                : line;
              done();
            };
            u.onerror = done;
            const chunkTimer = setTimeout(done, Math.max(8000, line.length * 85 + 3000));
            try {
              window.speechSynthesis.speak(u);
            } catch {
              done();
            }
          })
      );
      return "enqueued";
    }

    function drainSpeakable() {
      while (active && sessionGen === speakGeneration) {
        const hit = nextSpeakChunk(spokenIdx);
        if (!hit) break;
        const queued = enqueueSpeak(hit.text);
        if (queued === "skip") break;
        spokenIdx = hit.end;
      }
    }

    function spokenBufferPrefix() {
      return buffer.slice(0, spokenIdx).trim();
    }

    return {
      pushDelta(delta) {
        if (!delta || !active || sessionGen !== speakGeneration) return;
        buffer += delta;
        drainSpeakable();
      },
      pushText(text) {
        if (!text || !active || sessionGen !== speakGeneration) return;
        buffer += text;
        drainSpeakable();
      },
      finish() {
        active = false;
        drainSpeakable();
        const rest = buffer.slice(spokenIdx).trim();
        if (rest) {
          const restKey = chunkKey(toSpeakable(rest));
          if (!restKey || !spokenChunks.has(restKey)) {
            enqueueSpeak(rest);
            spokenIdx = buffer.length;
          }
        }
        const finishMs = Math.min(90000, Math.max(15000, buffer.length * 90 + 10000));
        const finishTimeout = new Promise((resolve) => setTimeout(resolve, finishMs));
        return Promise.race([chain, finishTimeout])
          .then(() => spokenBufferPrefix() || spokenDelivered.trim())
          .then((spokenText) => {
            if (sessionGen !== speakGeneration) {
              unpauseMic();
              return spokenText;
            }
            unpauseMic();
            setSpeaking(false);
            resumeNativeStt();
            onAllDone?.(spokenText);
            return spokenText;
          });
      },
      cancel() {
        active = false;
        unpauseMic();
        if (sessionGen === speakGeneration) cancelSpeech();
        else {
          try {
            window.speechSynthesis?.cancel();
          } catch {
            /* ignore */
          }
          setSpeaking(false);
          resumeNativeStt();
        }
      },
      getText() {
        return buffer.trim();
      },
      getSpokenText() {
        return spokenBufferPrefix() || spokenDelivered.trim();
      },
    };
  }

  function speak(text, onDone, opts) {
    const line = toSpeakable(text);
    if (!line) {
      onDone?.();
      return;
    }
    cancelSpeech();
    const gen = ++speakGeneration;
    speakDone = typeof onDone === "function" ? onDone : null;
    const emotion = window.DeskCopilotVoiceEmotion?.speechEmotionFor?.(line) || {};
    const instructions = emotion.instructions || null;
    const forceApi = Boolean(opts?.vercelTts);

    if (opts?.instant && window.speechSynthesis && !forceApi) {
      const pauseMicForInstant =
        opts.pauseMic !== false &&
        (window.DeskCopilotVoiceQuickReply?.shouldPauseMicForReply?.(line, opts) ??
          line.length >= 72);
      if (pauseMicForInstant) {
        const pauseMs = Math.min(12000, Math.max(4000, line.length * 90 + 2000));
        queueMicrotask(() => {
          if (gen !== speakGeneration) return;
          window.DeskCopilotRealtime?.setMicPaused?.(true, { maxMs: pauseMs });
        });
      }
      speakWithBrowserTts(
        line,
        () => {
        if (gen !== speakGeneration) return;
        window.DeskCopilotRealtime?.forceResumeListening?.("instant-tts-done");
        setSpeaking(false);
        const done = speakDone;
        speakDone = null;
        done?.();
        resumeNativeStt();
        if (listening) {
          onStatus?.(
            engineMode === "realtime" ? "● Voice live — talk anytime" : CASCADE_STATUS,
            engineMode === "realtime"
          );
        }
      },
        { chuckle: emotion.chuckle === true }
      );
      return;
    }

    const speed =
      typeof opts?.speed === "number" ? opts.speed : 0.92;
    void speakTextOnce(line, gen, speed, instructions, {
      ttsPrefetch: opts?.ttsPrefetch,
      browserRate: opts?.browserRate,
    }).then(() => {
      if (gen !== speakGeneration) return;
      setSpeaking(false);
      window.DeskCopilotRealtime?.forceResumeListening?.("tts-done");
      const done = speakDone;
      speakDone = null;
      done?.();
      resumeNativeStt();
      if (listening) {
        onStatus?.(
          engineMode === "realtime" ? "● Voice live — talk anytime" : CASCADE_STATUS,
          engineMode === "realtime"
        );
      }
    });
  }

  async function startCascadeVoice() {
    window.DeskCopilotRealtime?.suspend?.();
    engineMode = "cascade";
    const ok = await startListening();
    if (ok) onStatus?.(CASCADE_STATUS, null);
    return ok;
  }

  function stopVoiceSession() {
    engineMode = "off";
    sttMode = SpeechRecognition ? "native" : "whisper";
    stopCascadeStt();
    if (chatStreamPort) {
      try {
        chatStreamPort.disconnect();
      } catch {
        /* ignore */
      }
      chatStreamPort = null;
    }
    if (window.DeskCopilotRealtime?.stop) {
      window.DeskCopilotRealtime.stop();
    } else {
      window.DeskCopilotRealtime?.suspend?.();
    }
    setListening(false);
    cancelSpeech();
    releaseMic();
    onInterim?.("");
  }

  async function upgradeToRealtime(symbolResolver) {
    if (userVoiceOff) return false;
    if (!window.DeskCopilotRealtime?.retryUpgrade) return startAutonomous(symbolResolver);
    window.DeskCopilotRealtime.suspend?.();
    engineMode = "off";
    setListening(false);
    releaseMic();
    onInterim?.("");
    resumeAutonomousAgent();
    return startAutonomous(symbolResolver);
  }

  async function startAutonomous(symbolResolver, opts = {}) {
    const manual = opts.manual === true;
    if (!supported() || userVoiceOff) return false;
    if (!manual && !isAutonomousEnabled()) return false;

    if (window.DeskCopilotRealtime?.start) {
      const sym =
        typeof symbolResolver === "function" ? symbolResolver() : "MNQ1!";
      void window.DeskCopilotRealtime.prefetchSession?.(sym);
      onStatus?.("Connecting voice…", null);
      const rtOk = await window.DeskCopilotRealtime.start(symbolResolver);
      if (rtOk) {
        stopCascadeStt();
        engineMode = "realtime";
        sttMode = "realtime";
        setListening(true);
        onStatus?.("● Voice live — talk anytime", true);
        return true;
      }
      window.DeskCopilotRealtime?.stop?.();
      onStatus?.("Realtime unavailable — lower quality responses whilst in fallback", null);
    }

    return startCascadeVoice();
  }

  function stopAutonomous() {
    userVoiceOff = true;
    persistVoiceOff(true);
    stopVoiceSession();
    onStatus?.("Agent off", null);
  }

  function resumeAutonomousAgent() {
    userVoiceOff = false;
    persistVoiceOff(false);
  }

  async function toggleAutonomous(symbolResolver) {
    const sessionLive =
      listening ||
      engineMode !== "off" ||
      window.DeskCopilotRealtime?.isActive?.();
    if (sessionLive) {
      stopAutonomous();
      return false;
    }
    // Stale reconnect intent — not an active session; clear without persisting user-off.
    if (window.DeskCopilotRealtime?.wantsActive?.()) {
      window.DeskCopilotRealtime?.stop?.();
    }
    resumeAutonomousAgent();
    return startAutonomous(symbolResolver, { manual: true });
  }

  async function switchToWhisperMode(reason) {
    if (sttMode === "whisper" || !listening) return;
    stopNativeStt();
    sttMode = "whisper";
    nativeSttErrors = 0;
    onStatus?.(reason || CASCADE_FALLBACK_INTRO, null);
    await startVad();
    if (listening) onStatus?.(CASCADE_STATUS, null);
  }

  async function startListening() {
    if (!supported()) {
      onStatus?.("Voice needs Chrome + microphone", false);
      return false;
    }
    if (realtimeOwnsStt()) return true;
    if (listening) return true;

    const mic = await ensureMicPermission();
    if (!mic.ok) {
      onStatus?.(mic.msg || "Mic permission denied", false);
      return false;
    }

    nativeSttErrors = 0;
    stopNativeStt();
    finishRecording();
    setListening(true);

    // Whisper + noise-gated VAD — reliable with TV/chart background noise.
    sttMode = "whisper";
    await startVad();
    onStatus?.(CASCADE_STATUS, null);
    return true;
  }

  function stopListening() {
    if (engineMode === "realtime") return;
    setListening(false);
    flushPendingTranscript();
    stopNativeStt();
    cancelSpeech();
    finishRecording();
    releaseMic();
    onInterim?.("");
    onStatus?.("Voice off", null);
  }

  async function toggleListening() {
    if (listening) {
      stopListening();
      return false;
    }
    return startListening();
  }

  async function testMic(statusCb) {
    const wasListening = listening;
    if (!wasListening) await startListening();
    statusCb?.("Say a sentence, then pause…", null);
    const prev = onStatus;
    const timer = setTimeout(() => {
      onStatus = prev;
      statusCb?.("No speech detected — check mic input device", false);
    }, 25000);
    onStatus = (msg, ok) => {
      if (msg.startsWith('Heard: "')) {
        clearTimeout(timer);
        onStatus = prev;
        statusCb?.(msg, ok);
        if (!wasListening) stopListening();
      } else if (msg.includes("Hearing you")) {
        statusCb?.("Mic picking up — keep talking…", true);
      } else if (ok === false && !msg.includes("Listening") && !msg.includes("Transcribing")) {
        statusCb?.(msg, false);
      }
    };
  }

  window.DeskCopilotVoice = {
    init(handlers) {
      if (!supported()) return false;
      onCommand = handlers.onCommand;
      onChat = handlers.onChat;
      onStatus = handlers.onStatus;
      onInterim = handlers.onInterim;
      onSpeakingChange = handlers.onSpeakingChange;
      onListeningChange = handlers.onListeningChange;
      onRecordingChange = handlers.onRecordingChange;
      getChatContext = handlers.getChatContext;
      onAssistantReply = handlers.onAssistantReply;
      onNeedsChartRead = handlers.onNeedsChartRead;
      onUserTranscript = handlers.onUserTranscript;
      userVoiceOff =
        handlers.autonomous === false || loadPersistedVoiceOff();
      autoRead =
        handlers.autoRead != null ? Boolean(handlers.autoRead) : loadPersistedAutoRead();
      return true;
    },
    testMic,
    startListening,
    startAutonomous,
    stopAutonomous,
    stopVoiceSession,
    resumeAutonomousAgent,
    toggleAutonomous,
    toggleListening: toggleAutonomous,
    stopListening: stopAutonomous,
    isAgentEnabled: isAutonomousEnabled,
    isUserVoiceOff() {
      return userVoiceOff;
    },
    cancelSpeech,
    primeAudioPlayback,
    prefetchTtsAudio,
    createStreamingSpeaker,
    speakBrief: speak,
    speak,
    isSpeaking() {
      return (
        speaking ||
        Boolean(ttsAudio) ||
        Boolean(window.speechSynthesis?.speaking) ||
        window.DeskCopilotRealtime?.isSpeaking?.()
      );
    },
    isRecording() {
      return recording;
    },
    get autoRead() {
      return autoRead;
    },
    set autoRead(v) {
      autoRead = Boolean(v);
      try {
        localStorage.setItem(AUTO_READ_KEY, autoRead ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
    supported,
    isListening() {
      return listening || window.DeskCopilotRealtime?.isActive?.();
    },
    getEchoGuardUntil() {
      return echoGuardUntil;
    },
    getEngineMode() {
      return engineMode;
    },
    getSttMode() {
      return sttMode;
    },
    speakAck,
    startCascadeVoice,
    upgradeToRealtime,
    setCascadeFallback(cb) {
      onCascadeFallback = cb;
    },
  };
})();
