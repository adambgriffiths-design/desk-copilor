/**
 * Desk Copilot voice — toggle listening on once, then hands-free VAD + Whisper.
 */
(function () {
  const VOICE_LANG =
    (typeof navigator !== "undefined" &&
      navigator.language &&
      /^en(-|$)/i.test(navigator.language) &&
      navigator.language) ||
    "en-US";

  const SILENCE_MS = 1400;
  const MIN_SPEECH_MS = 400;
  const MAX_UTTERANCE_MS = 28000;
  const VAD_INTERVAL_MS = 60;
  const VOLUME_THRESHOLD = 0.006;
  const BARGE_IN_THRESHOLD = 0.018;

  const COMMANDS = [
    {
      id: "verdict",
      patterns: [
        /\b(get|give|need)\s+(me\s+)?(a\s+)?(verdict|update)\b/i,
        /\b(look at|check)\s+(the\s+)?chart\b/i,
        /\bwhat do you see\b/i,
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
    [/\bem en q\b/gi, "Nasdaq futures"],
    [/\bm and q\b/gi, "Nasdaq futures"],
    [/\bmini nasdaq\b/gi, "Nasdaq futures"],
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

  function supported() {
    return Boolean(
      navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined" &&
        window.speechSynthesis
    );
  }

  function normalizeTranscript(text) {
    let t = text.replace(/\s+/g, " ").trim();
    for (const [pattern, replacement] of NORMALIZE) {
      t = t.replace(pattern, replacement);
    }
    return t;
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
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    lastLoudAt = 0;

    vadTimer = setInterval(() => {
      if (!listening || transcribing) return;
      const volume = measureVolume();

      if (speaking) {
        if (volume >= BARGE_IN_THRESHOLD) cancelSpeech();
        return;
      }

      if (volume >= VOLUME_THRESHOLD) {
        lastLoudAt = Date.now();
        if (!recording) beginRecording();
        return;
      }

      if (recording && lastLoudAt && Date.now() - lastLoudAt >= SILENCE_MS) {
        finishRecording();
      }
    }, VAD_INTERVAL_MS);
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
          noiseSuppression: false,
          autoGainControl: true,
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
    if (!speaking && !window.speechSynthesis?.speaking) return false;
    window.speechSynthesis?.cancel();
    clearSpeakTimers();
    const done = speakDone;
    speakDone = null;
    setSpeaking(false);
    done?.();
    if (listening) onStatus?.("Listening…", true);
    return true;
  }

  function beginRecording() {
    if (recording || transcribing || !listening || speaking) return;
    recordMimeType = cleanMime(pickMimeType() || "audio/webm");
    recordChunks = [];
    try {
      const opts = pickMimeType() ? { mimeType: pickMimeType() } : undefined;
      recorder = opts ? new MediaRecorder(micStream, opts) : new MediaRecorder(micStream);
    } catch {
      try {
        recorder = new MediaRecorder(micStream);
        recordMimeType = "audio/webm";
      } catch {
        onStatus?.("Recording not supported in this browser", false);
        return;
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data?.size) recordChunks.push(e.data);
    };

    recorder.onstop = () => {
      recorder = null;
      setRecording(false);
      void transcribeChunks(recordMimeType);
    };

    recorder.onerror = () => {
      setRecording(false);
      recorder = null;
      onStatus?.("Recording error — try Voice off/on", false);
    };

    recorder.start(200);
    speechStartedAt = Date.now();
    lastLoudAt = Date.now();
    setRecording(true);
    onInterim?.("…");
    onStatus?.("Hearing you…", true);

    if (utteranceTimer) clearTimeout(utteranceTimer);
    utteranceTimer = setTimeout(finishRecording, MAX_UTTERANCE_MS);
  }

  function finishRecording() {
    if (!recording || !recorder) return;
    if (utteranceTimer) {
      clearTimeout(utteranceTimer);
      utteranceTimer = null;
    }
    if (Date.now() - speechStartedAt < MIN_SPEECH_MS) {
      try {
        if (recorder.state === "recording") recorder.stop();
      } catch {
        /* ignore */
      }
      recordChunks = [];
      setRecording(false);
      recorder = null;
      onInterim?.("");
      if (listening) onStatus?.("Listening…", true);
      return;
    }
    try {
      if (recorder.state === "recording") {
        recorder.requestData();
        recorder.stop();
      }
    } catch {
      setRecording(false);
    }
  }

  async function transcribeChunks(mimeType) {
    if (!recordChunks.length) {
      onInterim?.("");
      if (listening) onStatus?.("Didn't catch that — speak again", null);
      return;
    }

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
      if (text) handleTranscript(text);
      else if (listening) onStatus?.("Listening…", true);
    } catch (e) {
      onInterim?.("");
      const msg = e instanceof Error ? e.message : String(e);
      if (/no speech detected|didn't catch/i.test(msg)) {
        if (listening) onStatus?.("Didn't catch that — speak again", null);
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
    if (norm === lastHeardText && now - lastHeardAt < 2000) {
      if (listening) onStatus?.("Listening…", true);
      return;
    }
    lastHeardAt = now;
    lastHeardText = norm;

    onStatus?.(`Heard: "${t}"`, true);
    onInterim?.(t);

    if (cmd) {
      onCommand?.(cmd, t);
      return;
    }
    if (onChat) {
      onChat(t);
      onStatus?.("Got it…", true);
      return;
    }
  }

  function speak(text, onDone) {
    const line = toSpeakable(text);
    if (!line || !window.speechSynthesis) {
      onDone?.();
      return;
    }

    cancelSpeech();
    const excerpt = line.slice(0, 420);
    speakDone = onDone;
    setSpeaking(true);
    onStatus?.("Speaking — talk to interrupt", null);

    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(excerpt);
    u.rate = 1;
    u.pitch = 1;
    u.lang = VOICE_LANG;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearSpeakTimers();
      const done = speakDone;
      speakDone = null;
      setSpeaking(false);
      done?.();
      if (listening) onStatus?.("Listening…", true);
    };

    u.onend = finish;
    u.onerror = finish;

    speakPollTimer = setInterval(() => {
      if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) finish();
    }, 300);

    speakMaxTimer = setTimeout(finish, Math.min(35000, excerpt.length * 85 + 1500));
    window.speechSynthesis.speak(u);
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

    setListening(true);
    await startVad();
    onStatus?.("Listening… speak, then pause", true);
    return true;
  }

  function stopListening() {
    setListening(false);
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
      return true;
    },
    testMic,
    startListening,
    toggleListening,
    stopListening,
    cancelSpeech,
    speakBrief: speak,
    speak,
    isSpeaking() {
      return speaking;
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
      return listening;
    },
  };
})();
