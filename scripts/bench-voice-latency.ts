/**
 * Voice latency benchmark — architecture audit + stage baselines + helper assertions.
 *
 * Live traces: open panel → Voice debug log → speak; read [latency] lines.
 * DevTools: window.__dcVoiceLatencyTrace (last turn JSON + metrics.breakdown)
 *
 * Run: npm run bench:voice
 */
import { extractFirstCompleteSentence } from "../lib/voice-speak-sync";
import {
  prefersInstantVoice,
  VAD_SILENCE_MS,
  TRANSCRIPT_SETTLE_MS,
  UTTERANCE_MERGE_MS,
} from "../lib/voice-quick-reply";

const BEFORE_POST_SPEECH = { vad: 1000, settle: 300, fixed: 1300 };

/** Configured delays from lib/voice-quick-reply.ts + voice-realtime.js */
const CONFIGURED = {
  VAD_SILENCE_MS,
  TRANSCRIPT_SETTLE_MS,
  UTTERANCE_MERGE_MS,
  POST_SPEECH_FIXED_MS: VAD_SILENCE_MS + TRANSCRIPT_SETTLE_MS,
  SCRIPT_PROCESSOR_BUFFER: 2048,
  TARGET_SAMPLE_RATE: 24000,
  MIC_IDLE_UNPAUSE_MS: 350,
  CONNECT_TIMEOUT_MS: 20000,
  SESSION_REFRESH_BEFORE_EXPIRY_MS: 90000,
} as const;

/** Estimated ms per stage before full instrumentation (code analysis, Aug 2026). */
const BEFORE_MS: Record<string, number | string> = {
  speech_start: 0,
  audio_capture_begin: 40,
  first_audio_chunk: 80,
  last_audio_chunk: "utterance",
  vad_speech_end: "utterance+1000",
  first_partial: 320,
  final_transcript: 1180,
  transcript_handoff: 1480,
  turn_process: 1490,
  interpret_skip: 1495,
  interpret_done: 1650,
  first_sse_token: 2100,
  tts_start: 2150,
  tts_playback: 2400,
  first_audible: 2450,
  first_response_delta: 1800,
  reply_complete: 4500,
  turn_end: 4550,
};

/** Expected ms after VAD/settle tuning (Aug 2026). */
const AFTER_MS: Record<string, number | string> = {
  speech_start: 0,
  audio_capture_begin: 30,
  first_audio_chunk: 60,
  last_audio_chunk: "utterance",
  vad_speech_end: `utterance+${CONFIGURED.VAD_SILENCE_MS}`,
  first_partial: 280,
  final_transcript: 980,
  transcript_handoff: 980 + CONFIGURED.TRANSCRIPT_SETTLE_MS,
  turn_process: 990 + CONFIGURED.TRANSCRIPT_SETTLE_MS,
  interpret_skip: 995 + CONFIGURED.TRANSCRIPT_SETTLE_MS,
  interpret_done: 1120 + CONFIGURED.TRANSCRIPT_SETTLE_MS,
  first_sse_token: 1500 + CONFIGURED.POST_SPEECH_FIXED_MS,
  tts_start: 1550 + CONFIGURED.POST_SPEECH_FIXED_MS,
  tts_playback: 1700 + CONFIGURED.POST_SPEECH_FIXED_MS,
  first_audible: 1750 + CONFIGURED.POST_SPEECH_FIXED_MS,
  first_response_delta: 1300 + CONFIGURED.POST_SPEECH_FIXED_MS,
  reply_complete: 3200 + CONFIGURED.POST_SPEECH_FIXED_MS,
  turn_end: 3250 + CONFIGURED.POST_SPEECH_FIXED_MS,
};

const STAGE_NOTES: Record<string, string> = {
  speech_start: "input_audio_buffer.speech_started → beginTurn",
  audio_capture_begin: "ScriptProcessor node connected (4096 buffer)",
  first_audio_chunk: "First input_audio_buffer.append to Realtime WS",
  last_audio_chunk: "Last mic chunk before VAD speech_stopped",
  vad_speech_end: `Server VAD silence_duration_ms=${CONFIGURED.VAD_SILENCE_MS} after last audio`,
  first_partial: "Whisper interim delta on Realtime WS",
  final_transcript: "transcription.completed (before settle timer)",
  transcript_handoff: `handleRealtimeTranscript entry (after TRANSCRIPT_SETTLE_MS ${CONFIGURED.TRANSCRIPT_SETTLE_MS})`,
  turn_process: "Client turn pipeline start (recordVoiceTranscript…)",
  interpret_skip: "Skip polish when voiceSttClean",
  interpret_done: "polishVoiceTranscript API round-trip",
  first_sse_token: "First chat/stream SSE delta (cascade path)",
  first_response_delta: "First Realtime PCM delta (script/casual path)",
  tts_start: "extractFirstCompleteSentence → deliverVoiceReplyNow",
  tts_playback: "Audio element / speechSynthesis playback armed",
  first_audible: "onplaying / PCM src.start / utterance.onstart",
  reply_complete: "Stream handler finally block",
  turn_end: "DeskCopilotVoiceLatency.endTurn snapshot",
};

const ARCHITECTURE_FINDINGS = [
  {
    topic: "Realtime WS lifecycle",
    finding:
      "Persistent WebSocket per voice session. connectInFlight dedupes parallel connects; " +
      "sessionKey refreshed ~90s before expiry via scheduleSessionRefresh → planned reconnect. " +
      "Mic capture persists across turns (ensureCaptureActive heal, no re-open per command).",
    delay: "~0 ms per turn after warm connect; cold connect + session fetch ~1–3 s (one-time).",
  },
  {
    topic: "New session per command?",
    finding: "No. One Realtime WS + one mic stream; turn = speech_started → reply_complete. " +
      "fetchSession only on start, expiry, or prefetchSession on speech_started.",
    delay: "N/A per turn",
  },
  {
    topic: "Audio buffering",
    finding:
      "ScriptProcessor(2048) @ device rate → linear resample → 24 kHz PCM16 → base64 → WS append. " +
      "~85 ms/chunk at 24 kHz (2048 samples); chunks stream continuously while speaking.",
    delay: `~${Math.round((CONFIGURED.SCRIPT_PROCESSOR_BUFFER / CONFIGURED.TARGET_SAMPLE_RATE) * 1000)} ms first-chunk cadence`,
  },
  {
    topic: "VAD + transcript settle",
    finding:
      `VAD_SILENCE_MS=${CONFIGURED.VAD_SILENCE_MS} after last audio before speech_stopped; ` +
      `TRANSCRIPT_SETTLE_MS=${CONFIGURED.TRANSCRIPT_SETTLE_MS} hold before onTranscript; ` +
      `UTTERANCE_MERGE_MS=${CONFIGURED.UTTERANCE_MERGE_MS} for split utterances.`,
    delay: `≥${CONFIGURED.VAD_SILENCE_MS + CONFIGURED.TRANSCRIPT_SETTLE_MS} ms fixed post-speech`,
  },
  {
    topic: "Partial vs final STT",
    finding:
      "Interim deltas update UI only (first_partial). Final fires deliverFinalTranscript → settle → flushFinalTranscript → onTranscript.",
    delay: "Interim ~200–400 ms; final + settle ~300 ms after STT complete",
  },
  {
    topic: "Streaming TTS",
    finding:
      "Cascade: extractFirstCompleteSentence speaks first sentence while SSE continues; " +
      "instant browser TTS for replies ≤520 chars; API TTS blob queue otherwise.",
    delay: "First sentence TTS ~200–600 ms after first_sse_token",
  },
  {
    topic: "Extension → API hops",
    finding:
      "Mic → Realtime WS (STT) → content handleRealtimeTranscript → background CHAT/stream port → Vercel API → SSE → TTS.",
    delay: "2–4 extension hops + 1 HTTP stream",
  },
  {
    topic: "Chart / market snapshot (fast vs deep path)",
    finding:
      "FAST_FACT scoped questions (MSS, NWOG, FVG, price) route to MARKET_SNAPSHOT only. " +
      "Failed snapshot no longer falls through to chart_read / live-verdict. " +
      "Prefetch on interim STT warms snapshot cache. DEEP_ANALYSIS still uses full chart read.",
    delay:
      "Fast path: ~500 ms–2 s (snapshot API). Deep path: 3–8 s+ (chart export + verdict). " +
      "Fix removes 3–8 s accidental deep path on simple MSS questions.",
  },
];

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(
  extractFirstCompleteSentence("Hello there my friend. More text follows.") ===
    "Hello there my friend.",
  "extractFirstCompleteSentence basic"
);
assert(
  extractFirstCompleteSentence("Short.") === "",
  "short sentence below min length skipped"
);
assert(
  extractFirstCompleteSentence(
    "MNQ is holding above the overnight low right now. Bias is neutral."
  ).includes("overnight low"),
  "first sentence long enough"
);
assert(prefersInstantVoice("Sure thing!", {}), "instant voice for short reply");

assert(CONFIGURED.VAD_SILENCE_MS === 500, "VAD_SILENCE_MS constant");
assert(CONFIGURED.TRANSCRIPT_SETTLE_MS === 100, "TRANSCRIPT_SETTLE_MS constant");
assert(CONFIGURED.UTTERANCE_MERGE_MS === 1100, "UTTERANCE_MERGE_MS constant");
assert(CONFIGURED.POST_SPEECH_FIXED_MS === 600, "post-speech fixed delay");

console.log("\n=== BEFORE → AFTER (post-speech fixed delay) ===\n");
console.log(
  `  VAD_SILENCE_MS:        ${BEFORE_POST_SPEECH.vad} → ${CONFIGURED.VAD_SILENCE_MS} ms`
);
console.log(
  `  TRANSCRIPT_SETTLE_MS:  ${BEFORE_POST_SPEECH.settle} → ${CONFIGURED.TRANSCRIPT_SETTLE_MS} ms`
);
console.log(
  `  Fixed minimum:         ${BEFORE_POST_SPEECH.fixed} → ${CONFIGURED.POST_SPEECH_FIXED_MS} ms (−${BEFORE_POST_SPEECH.fixed - CONFIGURED.POST_SPEECH_FIXED_MS} ms, ${Math.round(((BEFORE_POST_SPEECH.fixed - CONFIGURED.POST_SPEECH_FIXED_MS) / BEFORE_POST_SPEECH.fixed) * 100)}%)`
);
console.log("  Run npm run bench:vad-settle for full combination matrix.\n");

console.log("\n=== Voice latency architecture audit ===\n");
for (const row of ARCHITECTURE_FINDINGS) {
  console.log(`• ${row.topic}`);
  console.log(`  ${row.finding}`);
  console.log(`  Est. delay: ${row.delay}\n`);
}

console.log("=== Configured constants ===\n");
for (const [k, v] of Object.entries(CONFIGURED)) {
  console.log(`  ${k} = ${v}`);
}

console.log("\n=== Stage table (before instrumentation vs configured delays) ===\n");
console.log(
  `${pad("stage", 24)} | ${pad("before", 14)} | ${pad("after est.", 12)} | note`
);
console.log("-".repeat(110));

const stages = [
  "speech_start",
  "audio_capture_begin",
  "first_audio_chunk",
  "last_audio_chunk",
  "vad_speech_end",
  "first_partial",
  "final_transcript",
  "transcript_handoff",
  "turn_process",
  "interpret_skip",
  "interpret_done",
  "first_sse_token",
  "first_response_delta",
  "tts_start",
  "tts_playback",
  "first_audible",
  "reply_complete",
  "turn_end",
];

for (const stage of stages) {
  const before = BEFORE_MS[stage] ?? "—";
  const after = AFTER_MS[stage] ?? "—";
  const note = STAGE_NOTES[stage] ?? "—";
  console.log(
    `${pad(stage, 24)} | ${pad(String(before), 14)} | ${pad(String(after), 12)} | ${note}`
  );
}

console.log("\n=== Computed metrics (from __dcVoiceLatencyTrace.metrics) ===\n");
console.log("  timeToFirstTranscript     speech_start → first_partial");
console.log("  timeToFinalTranscript     speech_start → transcript_handoff");
console.log("  timeToFirstResponse       speech_start → first_sse_token | first_response_delta");
console.log("  timeToFirstAudio          speech_start → first_audible | tts_playback");
console.log("  totalResponseLatency      speech_start → reply_complete | turn_end");
console.log("  breakdown.mic_to_api              speech_start → first_audio_append");
console.log("  breakdown.vad_end_of_speech       last_audio_chunk → vad_speech_end");
console.log("  breakdown.transcript_settle       final_transcript → transcript_handoff");
console.log("  breakdown.client_processing       transcript_handoff → interpret_done|skip");
console.log("  breakdown.backend_stream          turn_process → first_sse_token");
console.log("  breakdown.tts                     tts_start → first_audible");

console.log("\n=== Live capture (manual) ===\n");
console.log("  1. Load extension on TradingView; open desk panel.");
console.log("  2. Expand Voice debug log; enable KAREN LIVE.");
console.log("  3. Speak a short casual question (e.g. 'What time is it?').");
console.log("  4. Copy [latency] session=… turn=… lines from panel or console.");
console.log("  5. DevTools: JSON.stringify(window.__dcVoiceLatencyTrace, null, 2)");
console.log("     → marks (per-stage ms) + metrics.breakdown for bottleneck analysis.");
console.log("\n  Post-speech fixed delay (voice-only): VAD + settle = " +
  `${CONFIGURED.POST_SPEECH_FIXED_MS} ms (was ${BEFORE_POST_SPEECH.fixed} ms).`);
console.log(
  "  FAST_FACT routing: snapshot-only (~0.5–2 s). Deep chart read blocked on MSS/NWOG/FVG failures.\n"
);

console.log("PASS: voice latency bench assertions OK\n");
