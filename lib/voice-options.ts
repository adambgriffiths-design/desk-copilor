/** OpenAI voice IDs for TTS and Realtime. */
export const TTS_VOICES = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

export const REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type TtsVoice = (typeof TTS_VOICES)[number];
export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

export const DEFAULT_REALTIME_VOICE: RealtimeVoice = "marin";
export const DEFAULT_TTS_VOICE: TtsVoice = "nova";

export function isRealtimeVoice(v: string): v is RealtimeVoice {
  return (REALTIME_VOICES as readonly string[]).includes(v);
}

export function isTtsVoice(v: string): v is TtsVoice {
  return (TTS_VOICES as readonly string[]).includes(v);
}

/** Map realtime voice to closest TTS voice for cascade fallback. */
export function ttsVoiceForPreference(pref?: string): TtsVoice {
  if (pref && isTtsVoice(pref)) return pref;
  if (pref === "marin" || pref === "cedar" || pref === "coral") return "nova";
  if (pref === "ash" || pref === "ballad" || pref === "sage" || pref === "verse")
    return "alloy";
  return DEFAULT_TTS_VOICE;
}

export function realtimeVoiceForPreference(pref?: string): RealtimeVoice {
  if (pref && isRealtimeVoice(pref)) return pref;
  return DEFAULT_REALTIME_VOICE;
}
