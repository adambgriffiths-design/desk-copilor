import fs from "fs";
import path from "path";
import {
  analyzeTranscriptLines,
  buildDetectionFromAnalysis,
  detectFromTranscriptFile,
  findLatestTranscriptFile,
} from "./detector";
import { defaultCursorTranscriptsDir } from "./paths";
import type { CursorDetectionResult, SupervisorStatus, TranscriptBaseline } from "./types";

export const CURSOR_DETECTION_LIMITATIONS = [
  "No official local Cursor completion webhook — supervisor polls agent transcript JSONL files.",
  "turn_ended marks completion; parent transcripts may reflect unrelated concurrent sessions.",
  "Transcript assistant text may be [REDACTED] — report capture is best-effort.",
  "File outbox writes pending-pickup.json; active Cursor session claims via alwaysApply rule.",
];

export function captureTranscriptBaseline(transcriptRoot?: string): TranscriptBaseline | undefined {
  const root = transcriptRoot ?? defaultCursorTranscriptsDir();
  const latest = findLatestTranscriptFile(root);
  if (!latest) return undefined;
  const lines = fs.readFileSync(latest, "utf8").split("\n").filter(Boolean);
  return {
    rootTranscriptPath: latest,
    lineCount: lines.length,
    mtimeMs: fs.statSync(latest).mtimeMs,
  };
}

export function inferOutcomeFromText(text: string): SupervisorStatus {
  if (/waiting for (your|user)|need (your|user) (input|approval)/i.test(text)) return "WAITING";
  if (/error|failed|✗|exception/i.test(text) && !/pass/i.test(text)) return "ERROR";
  if (/complete|pass|success|report:/i.test(text)) return "COMPLETE";
  return "UNKNOWN";
}

export function detectResultFileCompletion(options: {
  dispatchedAtMs: number;
  resultFilePath?: string;
}): CursorDetectionResult | undefined {
  if (!options.resultFilePath || !fs.existsSync(options.resultFilePath)) return undefined;
  const stat = fs.statSync(options.resultFilePath);
  if (stat.mtimeMs < options.dispatchedAtMs - 1000) return undefined;
  const reportText = fs.readFileSync(options.resultFilePath, "utf8");
  return {
    detected: true,
    method: "outbox_result",
    reliability: "high",
    limitations: CURSOR_DETECTION_LIMITATIONS,
    reportText,
    rawStatus: inferOutcomeFromText(reportText),
  };
}

export function detectCursorCompletion(options: {
  baseline?: TranscriptBaseline;
  dispatchedAtMs: number;
  taskId: string;
  resultFilePath?: string;
  transcriptRoot?: string;
  /**
   * Live autonomous mode: only accept fresh results/{taskId}.md.
   * Transcript polling is skipped — unrelated Cursor sessions cannot complete tasks.
   */
  resultFileOnly?: boolean;
}): CursorDetectionResult {
  const fromFile = detectResultFileCompletion({
    dispatchedAtMs: options.dispatchedAtMs,
    resultFilePath: options.resultFilePath,
  });
  if (fromFile) return fromFile;
  if (options.resultFileOnly) {
    return {
      detected: false,
      method: "none",
      reliability: "low",
      limitations: [
        ...CURSOR_DETECTION_LIMITATIONS,
        "Live autonomous mode — completion requires results/{taskId}.md after dispatch.",
      ],
      reportText: "",
      rawStatus: "WAITING",
    };
  }

  const root = options.transcriptRoot ?? defaultCursorTranscriptsDir();
  const candidates: string[] = [];
  if (options.baseline?.rootTranscriptPath) candidates.push(options.baseline.rootTranscriptPath);
  const latest = findLatestTranscriptFile(root);
  if (latest && !candidates.includes(latest)) candidates.push(latest);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const rawLines = fs.readFileSync(file, "utf8").split("\n");
    const afterLine =
      options.baseline?.rootTranscriptPath === file ? options.baseline.lineCount : 0;
    const slice = rawLines.slice(afterLine);
    if (!slice.some((l) => l.includes("turn_ended"))) {
      const partial = detectFromTranscriptFile(file, { allowWaiting: true });
      if (partial.reportText.length > 80 && afterLine < rawLines.length) {
        return {
          detected: true,
          method: "transcript_assistant",
          reliability: "low",
          limitations: [
            ...CURSOR_DETECTION_LIMITATIONS,
            "No new turn_ended after dispatch — partial assistant text only.",
          ],
          transcriptPath: file,
          reportText: partial.reportText,
          rawStatus: partial.status,
        };
      }
      continue;
    }

    const analysis = analyzeTranscriptLines(slice, file);
    const detection = buildDetectionFromAnalysis(analysis, file, { allowWaiting: false });
    if (detection.status !== "UNKNOWN" || detection.reportText) {
      return {
        detected: true,
        method: "turn_ended",
        reliability: file.includes(`${path.sep}subagents${path.sep}`) ? "medium" : "high",
        limitations: [...CURSOR_DETECTION_LIMITATIONS, ...detection.limitations],
        transcriptPath: file,
        turnEndedStatus: detection.status === "ERROR" ? "error" : "success",
        reportText: detection.reportText,
        rawStatus: detection.status,
      };
    }
  }

  return {
    detected: false,
    method: "none",
    reliability: "low",
    limitations: CURSOR_DETECTION_LIMITATIONS,
    reportText: "",
    rawStatus: "WAITING",
  };
}

/** Live autonomous runs — result file only; never transcript. */
export function detectLiveAutonomousCompletion(options: {
  dispatchedAtMs: number;
  taskId: string;
  resultFilePath?: string;
}): CursorDetectionResult {
  return detectCursorCompletion({ ...options, resultFileOnly: true });
}

export function getDetectionDocumentation(): string {
  return [
    "## Cursor completion detection",
    "",
    "1. data/supervisor/results/{taskId}.md (explicit agent pickup — high reliability)",
    "2. agent-transcripts JSONL turn_ended after dispatch baseline (medium/high)",
    "3. Partial assistant text before turn_ended (low — may still be running)",
    "",
    "Live autonomous mode uses (1) only — transcript polling is disabled to prevent false completions.",
    "",
    "Limitations:",
    ...CURSOR_DETECTION_LIMITATIONS.map((l) => `- ${l}`),
  ].join("\n");
}
