import {
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
  INSTANT_VOICE_MAX_LEN,
  BROWSER_TTS_FIRST_MAX_LEN,
} from "../lib/voice-quick-reply";
import { capSpokenVoice, extractFirstCompleteSentence } from "../lib/voice-speak-sync";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

assert(!shouldPauseMicForReply("Sure.", { pauseMic: true }), "short ack keeps mic live");
assert(
  shouldPauseMicForReply(
    "That is a longer Karen line with enough words in it to risk speaker echo from the desk.",
    { pauseMic: true }
  ),
  "long reply pauses mic"
);
assert(!shouldPauseMicForReply("OK", { pauseMic: false }), "explicit pauseMic false");

assert(echoSuppressTailMs("OK.") <= 400, "short reply short echo tail");
assert(echoSuppressTailMs("x".repeat(300)) >= 1600, "long reply longer echo tail");
assert(echoSuppressTailMs("x".repeat(60)) < echoSuppressTailMs("x".repeat(200)), "echo tail scales");

assert(isQuickAffirmation("yes"), "yes is quick affirmation");
assert(isQuickAffirmation("yeah."), "yeah. is quick affirmation");
assert(!isQuickAffirmation("yes please tell me more about that"), "long phrase not quick affirmation");

const now = 1_000_000;
assert(
  !shouldDedupeSttTranscript({
    norm: "yes",
    lastVoiceTurnRaw: "what do you think about kfc",
    lastVoiceTurnRawAt: now - 2000,
    lastVoiceReplyAt: now - 1500,
    voiceTurnBusy: false,
    now,
  }),
  "yes after Karen not deduped"
);
assert(
  !shouldDedupeSttTranscript({
    norm: "what do you see on the chart",
    lastVoiceTurnRaw: "what do you see on the",
    lastVoiceTurnRawAt: now - 500,
    lastVoiceReplyAt: now - 400,
    voiceTurnBusy: true,
    now,
  }),
  "extended stt final not deduped while busy"
);
assert(
  shouldDedupeSttTranscript({
    norm: "what do you think",
    lastVoiceTurnRaw: "what do you think about",
    lastVoiceTurnRawAt: now - 500,
    lastVoiceReplyAt: now - 400,
    voiceTurnBusy: true,
    now,
  }),
  "stt refinement still deduped while busy"
);
assert(
  !shouldDedupeSttTranscript({
    norm: "what about mcdonalds instead",
    lastVoiceTurnRaw: "what do you think about kfc",
    lastVoiceTurnRawAt: now - 3000,
    lastVoiceReplyAt: now - 2500,
    voiceTurnBusy: false,
    now,
  }),
  "new unrelated utterance not deduped"
);

assert(UTTERANCE_MERGE_MS === 1100, "utterance merge tightened");
assert(VAD_SILENCE_MS === 500, "vad silence 500ms (less mid-pause cut, under 900)");
assert(TRANSCRIPT_SETTLE_MS === 100, "transcript settle tuned for latency");

assert(VAD_THRESHOLD === 0.22, "vad threshold easier pickup than 0.34");
assert(VAD_PREFIX_PADDING_MS === 450, "prefix padding keeps first syllable");
assert(VAD_MIN_SPEECH_MS === 160, "min speech 160ms not 240ms");
assert(prefersInstantVoice("Sure thing!", {}), "short reply prefers instant browser TTS");
assert(prefersInstantVoice("x".repeat(520), {}), "520-char reply still instant");
assert(!prefersInstantVoice("x".repeat(521), {}), "521-char reply uses API TTS");
assert(!prefersInstantVoice("Hello", { vercelTts: true }), "vercelTts forces API");
assert(!prefersInstantVoice("Hello", { preferApiTts: true }), "preferApiTts forces API");
assert(prefersInstantVoice("Hello", { instant: true }), "explicit instant true");
assert(!prefersInstantVoice("Hello", { instant: false }), "explicit instant false");

assert(prefersBrowserTtsFirst("OK.", {}), "very short reply browser-first");
assert(!prefersBrowserTtsFirst("x".repeat(141), {}), "141-char not browser-first");
assert(!prefersBrowserTtsFirst("OK.", { hasInstructions: true }), "instructions use API");
assert(INSTANT_VOICE_MAX_LEN === 520, "instant max len constant");
assert(BROWSER_TTS_FIRST_MAX_LEN === 140, "browser-first max len constant");

assert(extractFirstCompleteSentence("Short.") === "", "short sentence below min length skipped");
assert(
  extractFirstCompleteSentence("Hello there my friend. More text follows.") ===
    "Hello there my friend.",
  "extractFirstCompleteSentence basic"
);
assert(
  capSpokenVoice("One idea here. Second sentence follows. Third should drop. Fourth too.") ===
    "One idea here. Second sentence follows.",
  "spoken cap is two sentences"
);

console.log("\nAll voice quick-reply tests passed.");
