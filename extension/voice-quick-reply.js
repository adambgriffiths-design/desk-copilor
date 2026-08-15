/** Mic pause + echo tail tuning — mirrored from lib/voice-quick-reply.ts + voice-speak-sync.ts */
(function () {
  function shouldPauseMicForReply(text, opts) {
    opts = opts || {};
    if (opts.pauseMic === false) return false;
    const len = String(text || "").trim().length;
    if (len < 72) return false;
    if (opts.pauseMic === true) return len >= 72;
    return len >= 120;
  }

  function echoSuppressTailMs(text) {
    const len = String(text || "").trim().length;
    if (len <= 48) return 350;
    if (len <= 120) return 700;
    if (len <= 280) return 1100;
    return 1800;
  }

  function isQuickAffirmation(norm) {
    return /^(yes|yeah|yep|yup|no|nope|nah|ok|okay|sure|right|correct|thanks|thank you|go on|tell me more|what about that|and|why|really)[.!]?$/.test(
      String(norm || "").trim().toLowerCase()
    );
  }

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

  function shouldDedupeSttTranscript(input) {
    const norm = input.norm;
    const lastVoiceTurnRaw = input.lastVoiceTurnRaw;
    const lastVoiceTurnRawAt = input.lastVoiceTurnRawAt;
    const lastVoiceReplyAt = input.lastVoiceReplyAt;
    const voiceTurnBusy = input.voiceTurnBusy;
    const now = input.now != null ? input.now : Date.now();
    const sttDedupMs = input.sttDedupMs != null ? input.sttDedupMs : 8000;
    if (!lastVoiceTurnRaw || now - lastVoiceTurnRawAt > sttDedupMs) return false;
    if (norm === lastVoiceTurnRaw) return true;
    if (!sttTranscriptsRelated(norm, lastVoiceTurnRaw)) return false;
    if (isQuickAffirmation(norm)) return false;
    if (isSttExtension(lastVoiceTurnRaw, norm)) return false;
    if (norm.length > lastVoiceTurnRaw.length + 12) return false;
    if (norm.length <= lastVoiceTurnRaw.length + 2) return true;
    if (voiceTurnBusy && norm.length <= lastVoiceTurnRaw.length + 12) return true;
    if (now - lastVoiceReplyAt < sttDedupMs && norm.length <= lastVoiceTurnRaw.length + 12) {
      return true;
    }
    return false;
  }

  const MIC_IDLE_UNPAUSE_MS = 350;
  const UTTERANCE_MERGE_MS = 1100;
  const TRANSCRIPT_SETTLE_MS = 100;
  const VAD_SILENCE_MS = 500;
  const VAD_THRESHOLD = 0.22;
  const VAD_PREFIX_PADDING_MS = 450;
  const VAD_MIN_SPEECH_MS = 160;
  const SCRIPT_PROCESSOR_BUFFER = 2048;
  const INSTANT_VOICE_MAX_LEN = 520;
  const BROWSER_TTS_FIRST_MAX_LEN = 140;
  const DESK_TTS_SPEED = 1.05;

  function prefersInstantVoice(text, opts) {
    opts = opts || {};
    if (opts.vercelTts === true) return false;
    if (opts.preferApiTts) return false;
    if (opts.instant === true) return true;
    if (opts.instant === false) return false;
    return String(text || "").trim().length <= INSTANT_VOICE_MAX_LEN;
  }

  function prefersBrowserTtsFirst(text, opts) {
    opts = opts || {};
    if (opts.vercelTts || opts.preferApiTts || opts.hasInstructions) return false;
    return String(text || "").trim().length <= BROWSER_TTS_FIRST_MAX_LEN;
  }

  function extractFirstCompleteSentence(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const m = raw.match(/^(.{16,}?[.!?])(?:\s|$)/);
    if (m) return m[1].trim();
    const idx = raw.search(/[.!?]/);
    if (idx >= 15) return raw.slice(0, idx + 1).trim();
    return "";
  }

  function capSpokenVoice(text, opts) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    opts = opts || {};
    const maxSentences = opts.maxSentences != null ? opts.maxSentences : 2;
    const maxChars = opts.maxChars != null ? opts.maxChars : 320;
    const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
    let out = "";
    let count = 0;
    for (let i = 0; i < sentences.length; i++) {
      const next = out ? `${out} ${sentences[i].trim()}` : sentences[i].trim();
      if (count >= maxSentences) break;
      if (count >= 1 && next.length > maxChars) break;
      out = next;
      count += 1;
      if (out.length >= maxChars) break;
    }
    return out;
  }

  window.DeskCopilotVoiceQuickReply = {
    shouldPauseMicForReply,
    echoSuppressTailMs,
    isQuickAffirmation,
    shouldDedupeSttTranscript,
    prefersInstantVoice,
    prefersBrowserTtsFirst,
    MIC_IDLE_UNPAUSE_MS,
    UTTERANCE_MERGE_MS,
    TRANSCRIPT_SETTLE_MS,
    VAD_SILENCE_MS,
    VAD_THRESHOLD,
    VAD_PREFIX_PADDING_MS,
    VAD_MIN_SPEECH_MS,
    SCRIPT_PROCESSOR_BUFFER,
    INSTANT_VOICE_MAX_LEN,
    BROWSER_TTS_FIRST_MAX_LEN,
    DESK_TTS_SPEED,
    extractFirstCompleteSentence,
    capSpokenVoice,
  };
})();
