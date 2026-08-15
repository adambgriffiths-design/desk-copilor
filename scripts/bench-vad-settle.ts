/**
 * Controlled benchmark for VAD_SILENCE_MS × TRANSCRIPT_SETTLE_MS combinations.
 * Simulates post-speech pipeline timing — no live mic required.
 *
 * Run: npx tsx scripts/bench-vad-settle.ts
 */
import {
  UTTERANCE_MERGE_MS,
  sttTranscriptsRelated,
} from "../lib/voice-quick-reply";

const VAD_CANDIDATES = [300, 400, 500, 600] as const;
const SETTLE_CANDIDATES = [50, 100, 150, 200] as const;

const BEFORE = { vad: 1000, settle: 300, fixed: 1300 };

/** Typical Whisper final lag after speech_stopped (ms). */
const STT_FINAL_BASE_MS = 180;

type SpeechScenario = {
  id: string;
  /** Pause durations (ms) between spoken segments within one intended utterance. */
  midPausesMs: number[];
  /** STT finals relative to first speech_stopped (ms) and text. */
  finals: Array<{ afterSpeechStoppedMs: number; text: string }>;
  /** If user resumes after a false VAD cutoff, ms after that speech_stopped. */
  resumeAfterFalseStopMs?: number;
  resumeText?: string;
};

/** Natural trading-desk utterance patterns. */
const SCENARIOS: SpeechScenario[] = [
  {
    id: "clean_short",
    midPausesMs: [],
    finals: [{ afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "where is the last mss" }],
  },
  {
    id: "clean_verdict",
    midPausesMs: [],
    finals: [{ afterSpeechStoppedMs: STT_FINAL_BASE_MS + 40, text: "give me the full ict verdict" }],
  },
  {
    id: "mid_pause_350",
    midPausesMs: [350],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "where is the last mss" },
    ],
    resumeAfterFalseStopMs: 400,
    resumeText: "where is the last mss",
  },
  {
    id: "mid_pause_450",
    midPausesMs: [450],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "where is the last mss" },
    ],
    resumeAfterFalseStopMs: 520,
    resumeText: "where is the last mss",
  },
  {
    id: "mid_pause_550",
    midPausesMs: [550],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "where is the" },
    ],
    resumeAfterFalseStopMs: 650,
    resumeText: "where is the last mss",
  },
  {
    id: "mid_pause_700",
    midPausesMs: [700],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "give me the" },
    ],
    resumeAfterFalseStopMs: 850,
    resumeText: "give me the read",
  },
  {
    id: "late_stt_extension_80",
    midPausesMs: [],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "what is the bias on m" },
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS + 80, text: "what is the bias on mnq" },
    ],
  },
  {
    id: "late_stt_extension_160",
    midPausesMs: [],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "where is the last m" },
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS + 160, text: "where is the last mss" },
    ],
  },
  {
    id: "late_stt_extension_240",
    midPausesMs: [],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "mark levels on the" },
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS + 240, text: "mark levels on the chart" },
    ],
  },
  {
    id: "double_breath_merge",
    midPausesMs: [900],
    finals: [
      { afterSpeechStoppedMs: STT_FINAL_BASE_MS, text: "give me the read" },
    ],
    resumeAfterFalseStopMs: 1100,
    resumeText: "for mnq",
  },
];

type SimResult = {
  scenarioId: string;
  falseCutoff: boolean;
  incompleteTranscript: boolean;
  accidentalTurn: boolean;
  handoffMs: number;
  deliveredText: string;
};

function pickLonger(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  if (!x) return y;
  if (!y) return x;
  if (!sttTranscriptsRelated(x, y)) return x;
  return y.length >= x.length ? y : x;
}

/** Minimal model of deliverFinalTranscript + utterance merge. */
function simulateScenario(
  scenario: SpeechScenario,
  vadMs: number,
  settleMs: number
): SimResult {
  let falseCutoff = false;
  let incompleteTranscript = false;
  let accidentalTurn = false;

  // First (possibly false) speech_stopped from longest mid-pause vs VAD.
  const maxMidPause = scenario.midPausesMs.length
    ? Math.max(...scenario.midPausesMs)
    : 0;
  if (maxMidPause >= vadMs && scenario.resumeAfterFalseStopMs != null) {
    falseCutoff = true;
  }

  // If false cutoff but user resumes within UTTERANCE_MERGE_MS, merge saves the turn.
  let merged = false;
  if (
    falseCutoff &&
    scenario.resumeAfterFalseStopMs != null &&
    scenario.resumeAfterFalseStopMs - maxMidPause < UTTERANCE_MERGE_MS
  ) {
    merged = true;
  }

  // Effective speech_stopped for final timing: after user truly finishes.
  const trueEndMs =
    scenario.resumeAfterFalseStopMs != null && falseCutoff && merged
      ? scenario.resumeAfterFalseStopMs + vadMs
      : maxMidPause + vadMs;

  // Accidental turn: false cutoff without successful merge → early handoff path.
  if (falseCutoff && !merged) {
    accidentalTurn = true;
  }

  // Model settle timer from last final.
  const finals = [...scenario.finals].sort(
    (a, b) => a.afterSpeechStoppedMs - b.afterSpeechStoppedMs
  );
  if (falseCutoff && merged && scenario.resumeText) {
    finals.push({
      afterSpeechStoppedMs: scenario.resumeAfterFalseStopMs! + vadMs + STT_FINAL_BASE_MS,
      text: scenario.resumeText,
    });
  }

  const lastFinal = finals[finals.length - 1];
  const handoffMs = trueEndMs + lastFinal.afterSpeechStoppedMs + settleMs;

  // Incomplete if an extension final arrives after settle would have fired from prior final.
  for (let i = 1; i < finals.length; i++) {
    const prev = finals[i - 1];
    const cur = finals[i];
    const gap = cur.afterSpeechStoppedMs - prev.afterSpeechStoppedMs;
    if (gap > settleMs) {
      incompleteTranscript = true;
    }
  }

  let delivered = lastFinal.text;
  if (incompleteTranscript && finals.length > 1) {
    delivered = finals[finals.length - 2].text;
  }
  if (accidentalTurn && finals[0]) {
    delivered = finals[0].text;
    if (scenario.resumeText && !delivered.includes(scenario.resumeText.split(" ").pop()!)) {
      incompleteTranscript = true;
    }
  }

  const expected =
    scenario.resumeText && merged
      ? pickLonger(scenario.finals.at(-1)?.text || "", scenario.resumeText)
      : scenario.finals.at(-1)?.text || "";

  if (expected && delivered !== expected && !pickLonger(delivered, expected).includes(expected)) {
    incompleteTranscript = true;
  }

  return {
    scenarioId: scenario.id,
    falseCutoff: falseCutoff && !merged,
    incompleteTranscript,
    accidentalTurn,
    handoffMs,
    deliveredText: delivered,
  };
};

type ComboScore = {
  vad: number;
  settle: number;
  fixedMin: number;
  falseCutoffs: number;
  incomplete: number;
  accidentalTurns: number;
  /** Must be zero — premature end-of-utterance or split turn. */
  criticalFailures: number;
  /** Late STT extension finals (>settle gap) — acceptable trade-off at lower settle. */
  sttExtensionRisk: number;
  avgHandoffMs: number;
};

function scoreCombo(vad: number, settle: number): ComboScore {
  const results = SCENARIOS.map((s) => simulateScenario(s, vad, settle));
  const falseCutoffs = results.filter((r) => r.falseCutoff).length;
  const incomplete = results.filter((r) => r.incompleteTranscript).length;
  const accidentalTurns = results.filter((r) => r.accidentalTurn).length;
  const criticalFailures = falseCutoffs + accidentalTurns;
  const sttExtensionRisk = results.filter(
    (r) => r.incompleteTranscript && r.scenarioId.startsWith("late_stt_extension")
  ).length;
  const avgHandoffMs = Math.round(
    results.reduce((a, r) => a + r.handoffMs, 0) / results.length
  );
  return {
    vad,
    settle,
    fixedMin: vad + settle,
    falseCutoffs,
    incomplete,
    accidentalTurns,
    criticalFailures,
    sttExtensionRisk,
    avgHandoffMs,
  };
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

console.log("\n=== VAD × Transcript settle benchmark ===\n");
console.log(`BEFORE: VAD=${BEFORE.vad}ms + settle=${BEFORE.settle}ms = ${BEFORE.fixed}ms fixed post-speech\n`);
console.log(`Scenarios: ${SCENARIOS.length} (mid-pause, late STT, merge)`);
console.log(`Utterance merge window: ${UTTERANCE_MERGE_MS}ms (unchanged)\n`);

const scores: ComboScore[] = [];
for (const vad of VAD_CANDIDATES) {
  for (const settle of SETTLE_CANDIDATES) {
    scores.push(scoreCombo(vad, settle));
  }
}

scores.sort((a, b) => {
  if (a.criticalFailures !== b.criticalFailures) return a.criticalFailures - b.criticalFailures;
  if (a.fixedMin !== b.fixedMin) return a.fixedMin - b.fixedMin;
  if (a.sttExtensionRisk !== b.sttExtensionRisk) return a.sttExtensionRisk - b.sttExtensionRisk;
  return a.avgHandoffMs - b.avgHandoffMs;
});

console.log(
  `${pad("VAD", 5)} | ${pad("settle", 7)} | ${pad("fixed", 6)} | ${pad("crit", 5)} | ${pad("cutoff", 7)} | ${pad("accTurn", 8)} | ${pad("sttRisk", 8)} | avg handoff`
);
console.log("-".repeat(78));

for (const s of scores) {
  console.log(
    `${pad(String(s.vad), 5)} | ${pad(String(s.settle), 7)} | ${pad(String(s.fixedMin), 6)} | ${pad(String(s.criticalFailures), 5)} | ${pad(String(s.falseCutoffs), 7)} | ${pad(String(s.accidentalTurns), 8)} | ${pad(String(s.sttExtensionRisk), 8)} | ${s.avgHandoffMs}ms`
  );
}

/** Production floor — brief phrase pauses are often 350–450ms; merge window is backup only. */
const PRODUCTION_MIN_VAD_MS = 500;
const PRODUCTION_MIN_SETTLE_MS = 100;

const safe = scores.filter(
  (s) =>
    s.criticalFailures === 0 &&
    s.vad >= PRODUCTION_MIN_VAD_MS &&
    s.settle >= PRODUCTION_MIN_SETTLE_MS
);
const pick = safe[0] ?? scores.filter((s) => s.criticalFailures === 0)[0] ?? scores[0];

console.log("\n=== Selected configuration ===\n");
if (safe.length === 0) {
  console.log("WARNING: no combo passed critical scenarios — using lowest critical failure count.");
}
console.log(`  VAD_SILENCE_MS = ${pick.vad}`);
console.log(`  TRANSCRIPT_SETTLE_MS = ${pick.settle}`);
console.log(`  Fixed post-speech minimum: ${pick.fixedMin}ms (was ${BEFORE.fixed}ms)`);
console.log(
  `  Savings: ${BEFORE.fixed - pick.fixedMin}ms (${Math.round(((BEFORE.fixed - pick.fixedMin) / BEFORE.fixed) * 100)}%)`
);
console.log(
  `  Critical failures: ${pick.criticalFailures} (cutoff=${pick.falseCutoffs}, accTurn=${pick.accidentalTurns})`
);
console.log(
  `  STT extension risk (late refinement >${pick.settle}ms): ${pick.sttExtensionRisk} synthetic scenario(s)`
);

export const SELECTED_VAD_MS = pick.vad;
export const SELECTED_SETTLE_MS = pick.settle;
export const SELECTED_FIXED_MS = pick.fixedMin;

if (pick.criticalFailures > 0) {
  console.error("\nFAIL: best combo still has critical scenario failures");
  process.exit(1);
}

console.log("\nPASS: vad/settle benchmark OK\n");
