/** Keep in sync with extension/content.js voice speak dedup helpers. */

/** Streamed replies: speak finalized bubble once — never raw stream buffer + catch-up. */
export function streamVoiceSpeakTarget(bubbleText: string): string {
  return String(bubbleText || "").trim();
}

const STEER_BACK_SPEAK_TAIL =
  /\b(back on track|turn to the nasdaq|on the nasdaq futures chart|do you want a read on the nasdaq|micro e-mini nasdaq)\b/;

/** Longer raw stream buffer with steer-back tail must not block sanitized bubble TTS. */
export function isStaleStreamSuperset(spokenNorm: string, targetNorm: string): boolean {
  if (!spokenNorm || !targetNorm) return false;
  if (spokenNorm.length <= targetNorm.length + 8) return false;
  if (!spokenNorm.includes(targetNorm)) return false;
  const extra = spokenNorm.startsWith(targetNorm)
    ? spokenNorm.slice(targetNorm.length).trim()
    : spokenNorm.replace(targetNorm, " ").replace(/\s+/g, " ").trim();
  if (!extra) return false;
  return STEER_BACK_SPEAK_TAIL.test(extra);
}

/** End-only stream finalize: speak when final bubble is not verbatim what was delivered. */
export function shouldStreamVoiceSpeak(
  bubbleText: string,
  lastDeliveredSpeak: string,
  lastDeliveredSpeakAt: number,
  now = Date.now()
): boolean {
  const target = normalizeSpeakText(bubbleText);
  if (!target) return false;
  const spoken = normalizeSpeakText(lastDeliveredSpeak);
  if (!spoken) return true;
  if (target === spoken) return false;
  if (now - lastDeliveredSpeakAt >= 12000) return true;
  if (isStaleStreamSuperset(spoken, target)) return true;
  if (isFullySpoken(bubbleText, lastDeliveredSpeak)) return false;
  if (isRecentlySpoken(bubbleText, lastDeliveredSpeak, lastDeliveredSpeakAt, 12000, now)) return false;
  return true;
}

/** publishAssistantReply speaks full bubble only — never remainderToSpeak catch-up. */
export function shouldPublishVoiceSpeak(
  toSpeak: string,
  lastDeliveredSpeak: string,
  lastDeliveredSpeakAt: number,
  now = Date.now()
): boolean {
  const target = String(toSpeak || "").trim();
  if (!target) return false;
  const spoken = normalizeSpeakText(lastDeliveredSpeak);
  const targetNorm = normalizeSpeakText(target);
  if (spoken && targetNorm && spoken !== targetNorm && isStaleStreamSuperset(spoken, targetNorm)) {
    return true;
  }
  if (isFullySpoken(target, lastDeliveredSpeak)) return false;
  if (isRecentlySpoken(target, lastDeliveredSpeak, lastDeliveredSpeakAt, 12000, now)) return false;
  return true;
}

export function normalizeSpeakText(text: string): string {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRecentlySpoken(
  text: string,
  lastDeliveredSpeak: string,
  lastDeliveredSpeakAt: number,
  windowMs = 12000,
  now = Date.now()
): boolean {
  const norm = normalizeSpeakText(text);
  if (!norm || !lastDeliveredSpeak) return false;
  if (now - lastDeliveredSpeakAt >= windowMs) return false;
  if (norm === lastDeliveredSpeak) return true;
  if (isStaleStreamSuperset(lastDeliveredSpeak, norm)) return false;
  if (lastDeliveredSpeak.length >= norm.length && lastDeliveredSpeak.includes(norm)) return true;
  return false;
}

export function isFullySpoken(target: string, spoken: string): boolean {
  const t = normalizeSpeakText(target);
  const s = normalizeSpeakText(spoken);
  if (!t) return true;
  if (!s) return false;
  if (t === s) return true;
  if (isStaleStreamSuperset(s, t)) return false;
  if (s.startsWith(t)) return true;
  const shorter = Math.min(t.length, s.length);
  const longer = Math.max(t.length, s.length);
  if (shorter / longer >= 0.92 && t.startsWith(s)) return true;
  return false;
}

function remainderAfterSpokenPrefix(raw: string, spoken: string): string {
  const targetNorm = normalizeSpeakText(raw);
  const spokeNorm = normalizeSpeakText(spoken);
  if (!spokeNorm || !targetNorm.startsWith(spokeNorm) || spokeNorm.length >= targetNorm.length) {
    return "";
  }
  const parts = raw.match(/\S+\s*/g) || [raw];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc += parts[i];
    const norm = normalizeSpeakText(acc);
    if (norm === spokeNorm) {
      return parts.slice(i + 1).join("").trim();
    }
    if (spokeNorm.startsWith(norm)) continue;
    if (norm.startsWith(spokeNorm)) {
      return raw.slice(acc.length).trim();
    }
    break;
  }
  const ratio = spokeNorm.length / targetNorm.length;
  return raw.slice(Math.min(raw.length, Math.floor(raw.length * ratio))).trim();
}

/** Speak tail only when a prefix was already delivered — never re-speak opening clause. */
export function resolveVoiceSpeakLine(
  text: string,
  lastDeliveredSpeak: string,
  lastDeliveredSpeakAt: number,
  now = Date.now()
): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const spokenNorm = normalizeSpeakText(lastDeliveredSpeak);
  const targetNorm = normalizeSpeakText(raw);
  if (!spokenNorm) return raw;
  if (spokenNorm && targetNorm && isStaleStreamSuperset(spokenNorm, targetNorm)) {
    return raw;
  }
  if (isFullySpoken(raw, lastDeliveredSpeak)) return "";
  if (isRecentlySpoken(raw, lastDeliveredSpeak, lastDeliveredSpeakAt, 12000, now)) return "";
  const tail = remainderToSpeak(raw, lastDeliveredSpeak);
  if (tail && normalizeSpeakText(tail) !== targetNorm) return tail;
  return raw;
}

export function remainderToSpeak(target: string, spoken: string): string {
  const raw = String(target || "").trim();
  if (!raw || isFullySpoken(raw, spoken)) return "";
  const spokeNorm = normalizeSpeakText(spoken);
  const targetNorm = normalizeSpeakText(raw);

  if (spokeNorm && spokeNorm.startsWith(targetNorm)) return "";

  if (spokeNorm && targetNorm.startsWith(spokeNorm) && spokeNorm.length < targetNorm.length) {
    const prefixRest = remainderAfterSpokenPrefix(raw, spoken);
    if (prefixRest) return prefixRest;
  }

  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
  let skip = 0;
  for (let i = 0; i < sentences.length; i++) {
    const chunk = normalizeSpeakText(sentences.slice(0, i + 1).join(" "));
    if (!spokeNorm) break;
    if (
      chunk === spokeNorm ||
      spokeNorm.startsWith(chunk) ||
      chunk === spokeNorm.slice(0, chunk.length)
    ) {
      skip = i + 1;
      continue;
    }
    break;
  }
  if (skip >= sentences.length) return "";
  const rest = sentences.slice(skip).join(" ").trim();
  if (rest) return rest;
  if (spokeNorm && targetNorm.startsWith(spokeNorm)) {
    return remainderAfterSpokenPrefix(raw, spoken);
  }
  return "";
}

const FIRST_SENTENCE_MIN = 16;

/** First complete sentence — for early TTS while SSE continues. */
export function extractFirstCompleteSentence(text: string): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const m = raw.match(/^(.{16,}?[.!?])(?:\s|$)/);
  if (m) return m[1].trim();
  const idx = raw.search(/[.!?]/);
  if (idx >= FIRST_SENTENCE_MIN - 1) return raw.slice(0, idx + 1).trim();
  return "";
}

export const VOICE_SPOKEN_MAX_SENTENCES = 2;
export const VOICE_SPOKEN_MAX_CHARS = 320;

/** Cap spoken TTS to one idea. Panel/chat can stay longer. */
export function capSpokenVoice(
  text: string,
  opts?: { maxSentences?: number; maxChars?: number }
): string {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const maxSentences = opts?.maxSentences ?? VOICE_SPOKEN_MAX_SENTENCES;
  const maxChars = opts?.maxChars ?? VOICE_SPOKEN_MAX_CHARS;
  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
  let out = "";
  let count = 0;
  for (const s of sentences) {
    const next = out ? `${out} ${s.trim()}` : s.trim();
    if (count >= maxSentences) break;
    if (count >= 1 && next.length > maxChars) break;
    out = next;
    count += 1;
    if (out.length >= maxChars) break;
  }
  return out;
}
