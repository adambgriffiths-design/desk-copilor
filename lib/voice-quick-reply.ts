/** Mic pause + echo tail tuning for fast voice follow-ups after Karen speaks. */

export type PauseMicOpts = { pauseMic?: boolean };

/** Keep mic live for short Karen lines; pause only when echo risk is real. */
export function shouldPauseMicForReply(text: string, opts: PauseMicOpts = {}): boolean {
  if (opts.pauseMic === false) return false;
  const len = String(text || "").trim().length;
  if (len < 72) return false;
  if (opts.pauseMic === true) return len >= 72;
  return len >= 120;
}

/** Echo-suppression tail from when Karen *finishes* speaking (not when she starts). */
export function echoSuppressTailMs(text: string): number {
  const len = String(text || "").trim().length;
  if (len <= 48) return 500;
  if (len <= 120) return 900;
  if (len <= 280) return 1500;
  return 2400;
}

/** Short affirmations / follow-ups that must never be treated as STT dedup refinements. */
export function isQuickAffirmation(norm: string): boolean {
  return /^(yes|yeah|yep|yup|no|nope|nah|ok|okay|sure|right|correct|thanks|thank you|go on|tell me more|what about that|and|why|really)[.!]?$/.test(
    String(norm || "").trim().toLowerCase()
  );
}

export function sttTranscriptsRelated(a: string, b: string): boolean {
  const x = String(a || "").trim().toLowerCase();
  const y = String(b || "").trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.startsWith(y) || y.startsWith(x);
}

function isSttExtension(shorter: string, longer: string): boolean {
  const s = String(shorter || "").trim().toLowerCase();
  const l = String(longer || "").trim().toLowerCase();
  if (!s || !l || l.length <= s.length) return false;
  return l.startsWith(s);
}

export type SttDedupInput = {
  norm: string;
  lastVoiceTurnRaw: string;
  lastVoiceTurnRawAt: number;
  lastVoiceReplyAt: number;
  voiceTurnBusy: boolean;
  now?: number;
  sttDedupMs?: number;
};

/** Returns true when an STT final should be ignored as a duplicate refinement. */
export function shouldDedupeSttTranscript(input: SttDedupInput): boolean {
  const {
    norm,
    lastVoiceTurnRaw,
    lastVoiceTurnRawAt,
    lastVoiceReplyAt,
    voiceTurnBusy,
    now = Date.now(),
    sttDedupMs = 8000,
  } = input;
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

/** Idle mic-unpause watchdog after Karen stops speaking. */
export const MIC_IDLE_UNPAUSE_MS = 350;

/** Merge window for split utterances — tighter so rapid separate replies stay distinct. */
export const UTTERANCE_MERGE_MS = 1400;

/** Wait for late STT finals before delivering a turn — lower = faster handoff. */
export const TRANSCRIPT_SETTLE_MS = 200;

/** Server VAD silence before end-of-utterance — 500ms balances speed vs natural pauses. */
export const VAD_SILENCE_MS = 500;

/** Max reply length for low-latency browser TTS (no API round-trip). */
export const INSTANT_VOICE_MAX_LEN = 520;

/** Prefer browser TTS first for very short replies — target ~200ms time-to-first-audio. */
export const BROWSER_TTS_FIRST_MAX_LEN = 100;

export type InstantVoiceOpts = {
  instant?: boolean;
  vercelTts?: boolean;
  preferApiTts?: boolean;
};

/** Whether to use instant browser TTS instead of API /tts. */
export function prefersInstantVoice(text: string, opts: InstantVoiceOpts = {}): boolean {
  if (opts.vercelTts === true) return false;
  if (opts.preferApiTts) return false;
  if (opts.instant === true) return true;
  if (opts.instant === false) return false;
  return String(text || "").trim().length <= INSTANT_VOICE_MAX_LEN;
}

/** Short replies that should never wait on /api/voice/tts before speaking. */
export function prefersBrowserTtsFirst(
  text: string,
  opts: InstantVoiceOpts & { hasInstructions?: boolean } = {}
): boolean {
  if (opts.vercelTts || opts.preferApiTts || opts.hasInstructions) return false;
  return String(text || "").trim().length <= BROWSER_TTS_FIRST_MAX_LEN;
}
