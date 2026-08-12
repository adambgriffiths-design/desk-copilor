/** Mic pause + echo tail tuning — mirrored from lib/voice-quick-reply.ts */
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
    if (len <= 48) return 500;
    if (len <= 120) return 900;
    if (len <= 280) return 1500;
    return 2400;
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
  const UTTERANCE_MERGE_MS = 1400;
  const TRANSCRIPT_SETTLE_MS = 200;
  const VAD_SILENCE_MS = 500;
  const INSTANT_VOICE_MAX_LEN = 520;
  const BROWSER_TTS_FIRST_MAX_LEN = 100;

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

  /** First complete sentence (min 20 chars) — early TTS while stream continues. */
  function extractFirstCompleteSentence(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const m = raw.match(/^(.{20,}?[.!?])(?:\s|$)/);
    if (m) return m[1].trim();
    const idx = raw.search(/[.!?]/);
    if (idx >= 19) return raw.slice(0, idx + 1).trim();
    return "";
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
    INSTANT_VOICE_MAX_LEN,
    BROWSER_TTS_FIRST_MAX_LEN,
    extractFirstCompleteSentence,
  };
})();
