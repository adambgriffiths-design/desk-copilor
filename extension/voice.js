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

  const UTTERANCE_WATCHDOG_MS = 30000;

  function supported() {
    return Boolean(
      (SpeechRecognition || (navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined")) &&
        window.speechSynthesis
    );
  }

  function flushPendingTranscript() {
    if (pendingTranscriptTimer) {
      clearTimeout(pendingTranscriptTimer);
      pendingTranscriptTimer = null;
    }
    const merged = pendingTranscript.trim();
    pendingTranscript = "";
    if (merged) handleTranscript(merged);
  }

  function enqueueTranscript(text) {
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
    return text
      .replace(/^META:.*$/gim, "")
      .replace(/^#{1,3}\s+.*$/gm, "")
      .replace(/\*\*/g, "")
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
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
      if (!listening || transcribing) return;
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
      if (speaking || !listening) return;

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
    if (!speaking && !window.speechSynthesis?.speaking && !ttsAudio) return false;
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
    clearSpeakTimers();
    const done = speakDone;
    speakDone = null;
    setSpeaking(false);
    done?.();
    resumeNativeStt();
    if (listening) onStatus?.("Listening…", true);
    return true;
  }

  function beginRecording() {
    if (recording || transcribing || !listening || speaking) return;
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

  async function fetchTtsAudio(text) {
    const voice = await getStoredVoice();
    const res = await bgSend({ type: "TTS", text: text.slice(0, 4096), voice }, 45000);
    if (res?.error) throw new Error(res.error);
    if (!res?.audioBase64) throw new Error("Empty TTS");
    const binary = atob(res.audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: res.mimeType || "audio/mpeg" });
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
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (ttsAudio === audio) ttsAudio = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.play().catch(() => resolve());
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

  async function speakTextOnce(text, gen) {
    const line = toSpeakable(text);
    if (!line || gen !== speakGeneration) return;

    setSpeaking(true);
    pauseNativeStt();
    stopTtsPlayback();
    onStatus?.("Speaking — talk to interrupt", null);

    try {
      const blob = await fetchTtsAudio(line.slice(0, 4096));
      if (gen !== speakGeneration) return;
      await playTtsBlob(blob, gen);
    } catch {
      if (gen !== speakGeneration) return;
      await new Promise((resolve) => speakWithBrowserTts(line, resolve));
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

  /** Quick browser-only ack — no API round-trip. */
  function speakAck(text) {
    if (!text || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.lang = VOICE_LANG;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  async function respondWithCascade(transcript) {
    if (!getChatContext) {
      onChat?.(transcript);
      return;
    }

    const ctx = getChatContext();
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
      onStatus?.("Didn't get that — try again", null);
      if (autoRead) await speakTextOnce("Didn't get that — try again", gen);
    }, UTTERANCE_WATCHDOG_MS);

    try {
      const result = await chatViaBackground({
        messages,
        symbol: ctx.symbol,
        lastVerdict: ctx.lastVerdict,
      });

      if (result.needsChartRead) {
        speakAck("One sec, reading the chart");
        setSpeaking(false);
        resumeNativeStt();
        await onNeedsChartRead?.(result.question || transcript);
        if (listening) onStatus?.("Voice live — talk anytime", true);
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
        if (listening) onStatus?.("Voice live — talk anytime", true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onStatus?.(msg, false);
      if (autoRead && gen === speakGeneration) {
        await speakTextOnce("Didn't get that — try again", gen);
      }
      onChat?.(transcript, { skipBubble: true });
    } finally {
      clearTimeout(watchdog);
      setSpeaking(false);
      resumeNativeStt();
      if (listening) onStatus?.("Voice live — talk anytime", true);
    }
  }

  function handleTranscript(transcript) {
    const t = transcript.trim();
    if (!t) return;

    const cmd = matchCommand(t);
    if (cmd === "stop") {
      if (speaking) {
        cancelSpeech();
        return;
      }
      stopListening();
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
    if (engineMode === "cascade" && getChatContext) {
      void respondWithCascade(t).finally(() => {
        utteranceBusy = false;
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

  function speakWithBrowserTts(line, onDone) {
    const gen = speakGeneration;
    const chunks = chunkForSpeech(line);
    let chunkIndex = 0;
    speakDone = onDone;
    setSpeaking(true);
    pauseNativeStt();
    onStatus?.("Speaking — talk to interrupt", null);

    try {
      window.speechSynthesis.resume();
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
      const done = speakDone;
      speakDone = null;
      setSpeaking(false);
      done?.();
      resumeNativeStt();
      if (listening) onStatus?.("Listening…", true);
    };

    const speakNext = () => {
      if (finished || gen !== speakGeneration) return;
      if (chunkIndex >= chunks.length) {
        finish();
        return;
      }

      const excerpt = chunks[chunkIndex++];
      const u = new SpeechSynthesisUtterance(excerpt);
      u.rate = 1;
      u.pitch = 1;
      u.lang = VOICE_LANG;
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

    // Chrome pauses synthesis on long reads — keep it alive; don't infer "done" from polling.
    speakPollTimer = setInterval(() => {
      if (gen !== speakGeneration || finished) return;
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }, 8000);

    speakMaxTimer = setTimeout(finish, estimateSpeakMs(line));
    speakNext();
  }

  function speak(text, onDone) {
    const line = toSpeakable(text);
    if (!line) {
      onDone?.();
      return;
    }
    cancelSpeech();
    const gen = speakGeneration;
    void speakTextOnce(text, gen).then(() => {
      if (gen !== speakGeneration) return;
      setSpeaking(false);
      speakDone = null;
      onDone?.();
      resumeNativeStt();
      if (listening) onStatus?.("Voice live — talk anytime", true);
    });
  }

  async function startCascadeVoice() {
    window.DeskCopilotRealtime?.suspend?.();
    engineMode = "cascade";
    const ok = await startListening();
    if (ok) onStatus?.("Voice live — talk anytime", true);
    return ok;
  }

  function stopVoiceSession() {
    engineMode = "off";
    if (chatStreamPort) {
      try {
        chatStreamPort.disconnect();
      } catch {
        /* ignore */
      }
      chatStreamPort = null;
    }
    if (window.DeskCopilotRealtime?.suspend) {
      window.DeskCopilotRealtime.suspend();
    } else if (window.DeskCopilotRealtime?.isActive?.()) {
      window.DeskCopilotRealtime.stop();
    }
    setListening(false);
    flushPendingTranscript();
    stopNativeStt();
    cancelSpeech();
    finishRecording();
    releaseMic();
    onInterim?.("");
  }

  async function startAutonomous(symbolResolver) {
    if (!supported() || !isAutonomousEnabled() || userVoiceOff) return false;

    if (window.DeskCopilotRealtime?.start) {
      const sym =
        typeof symbolResolver === "function" ? symbolResolver() : "MNQ1!";
      void window.DeskCopilotRealtime.prefetchSession?.(sym);
      onStatus?.("Connecting voice…", null);
      const rtOk = await window.DeskCopilotRealtime.start(symbolResolver);
      if (rtOk) {
        engineMode = "realtime";
        setListening(true);
        onStatus?.("● Voice live — talk anytime", true);
        return true;
      }
      window.DeskCopilotRealtime?.stop?.();
      onStatus?.("Realtime unavailable — using voice fallback", null);
    }

    return startCascadeVoice();
  }

  function stopAutonomous() {
    userVoiceOff = true;
    stopVoiceSession();
    onStatus?.("Agent off", null);
  }

  function resumeAutonomousAgent() {
    userVoiceOff = false;
  }

  async function toggleAutonomous(symbolResolver) {
    if (
      engineMode !== "off" ||
      listening ||
      window.DeskCopilotRealtime?.isActive?.() ||
      window.DeskCopilotRealtime?.wantsActive?.()
    ) {
      stopAutonomous();
      return false;
    }
    resumeAutonomousAgent();
    return startAutonomous(symbolResolver);
  }

  async function switchToWhisperMode(reason) {
    if (sttMode === "whisper" || !listening) return;
    stopNativeStt();
    sttMode = "whisper";
    nativeSttErrors = 0;
    onStatus?.(reason || "Using Whisper fallback…", null);
    await startVad();
    if (listening) onStatus?.("Listening… speak, then pause", true);
  }

  async function startListening() {
    if (!supported()) {
      onStatus?.("Voice needs Chrome + microphone", false);
      return false;
    }
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
    onStatus?.("Voice live — speak, then pause", true);
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
      userVoiceOff = handlers.autonomous === false;
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
    cancelSpeech,
    speakBrief: speak,
    speak,
    isSpeaking() {
      return speaking || Boolean(ttsAudio) || window.DeskCopilotRealtime?.isSpeaking?.();
    },
    isRecording() {
      return recording;
    },
    get autoRead() {
      return autoRead;
    },
    set autoRead(v) {
      autoRead = Boolean(v);
    },
    supported,
    isListening() {
      return listening || window.DeskCopilotRealtime?.isActive?.();
    },
    getEngineMode() {
      return engineMode;
    },
    getSttMode() {
      return sttMode;
    },
    speakAck,
    startCascadeVoice,
    setCascadeFallback(cb) {
      onCascadeFallback = cb;
    },
  };
})();
