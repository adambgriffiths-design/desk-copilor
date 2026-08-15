import fs from "fs";
import path from "path";
import {
  classifyInProgress,
  extractReportText,
  extractUserTask,
  mapTurnStatus,
  parseTranscriptLine,
  type ParsedTranscriptLine,
} from "./parser";
import { defaultCursorTranscriptsDir } from "./paths";
import type { DetectionResult, TranscriptRef } from "./types";

export interface DetectFromTranscriptOptions {
  /** When true, treat in-progress transcript (no turn_ended) as WAITING. */
  allowWaiting?: boolean;
}

export interface TranscriptAnalysis {
  lines: ParsedTranscriptLine[];
  lastTurnEndedIndex: number;
  lastAssistantBeforeTurn: ParsedTranscriptLine | undefined;
  firstUserTask: string;
  transcriptId: string;
  transcriptKind: "parent" | "subagent";
}

function transcriptMeta(filePath: string): {
  transcriptId: string;
  transcriptKind: "parent" | "subagent";
} {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("/subagents/")) {
    const base = path.basename(filePath, ".jsonl");
    return { transcriptId: base, transcriptKind: "subagent" };
  }
  const base = path.basename(filePath, ".jsonl");
  return { transcriptId: base, transcriptKind: "parent" };
}

export function analyzeTranscriptLines(
  rawLines: string[],
  filePath: string
): TranscriptAnalysis {
  const lines = rawLines.map(parseTranscriptLine);
  const meta = transcriptMeta(filePath);

  let lastTurnEndedIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.kind === "turn_ended") {
      lastTurnEndedIndex = i;
      break;
    }
  }

  let lastAssistantBeforeTurn: ParsedTranscriptLine | undefined;
  const searchEnd = lastTurnEndedIndex >= 0 ? lastTurnEndedIndex : lines.length;
  for (let i = searchEnd - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.kind === "message" && line.role === "assistant") {
      lastAssistantBeforeTurn = line;
      break;
    }
  }

  let firstUserTask = "";
  for (const line of lines) {
    if (line.kind === "message" && line.role === "user") {
      firstUserTask = extractUserTask(line.textParts);
      if (firstUserTask) break;
    }
  }

  return {
    lines,
    lastTurnEndedIndex,
    lastAssistantBeforeTurn,
    firstUserTask,
    ...meta,
  };
}

export function buildDetectionFromAnalysis(
  analysis: TranscriptAnalysis,
  filePath: string,
  options: DetectFromTranscriptOptions = {}
): DetectionResult {
  const limitations: string[] = [];
  const detectedAt = new Date().toISOString();
  const { lines, lastTurnEndedIndex, lastAssistantBeforeTurn, firstUserTask } = analysis;

  if (lines.length === 0 || lines.every((l) => l.kind === "empty")) {
    return {
      status: "UNKNOWN",
      source: "transcript",
      reportText: "",
      taskText: "",
      limitations: ["Transcript file is empty"],
      detectedAt,
    };
  }

  const malformedCount = lines.filter((l) => l.kind === "malformed").length;
  if (malformedCount > 0) {
    limitations.push(`${malformedCount} malformed JSONL line(s) skipped`);
  }

  if (lastTurnEndedIndex < 0) {
    const lastNonEmpty = [...lines].reverse().find((l) => l.kind === "message");
    const status = options.allowWaiting
      ? classifyInProgress(lastNonEmpty)
      : "UNKNOWN";
    limitations.push(
      "No turn_ended marker found — agent may still be running or transcript format changed"
    );
    const reportText = lastNonEmpty
      ? extractReportText(lastNonEmpty.textParts)
      : "";
    if (reportText.includes("[REDACTED]") || !reportText) {
      limitations.push("Report text may be incomplete (REDACTED or tool-only assistant turn)");
    }
    return {
      status,
      source: "transcript",
      reportText,
      taskText: firstUserTask,
      limitations,
      detectedAt,
    };
  }

  const turnLine = lines[lastTurnEndedIndex]!;
  const status = mapTurnStatus(turnLine.turnStatus, turnLine.turnError);
  const reportText = lastAssistantBeforeTurn
    ? extractReportText(lastAssistantBeforeTurn.textParts)
    : "";

  if (!reportText) {
    limitations.push("Final assistant report text unavailable (REDACTED or tool-only turn)");
  }
  limitations.push(
    "Detection reads local agent-transcripts JSONL only — not Cursor UI state"
  );

  const transcriptRef: TranscriptRef = {
    filePath,
    lineNumber: lastTurnEndedIndex + 1,
    transcriptKind: analysis.transcriptKind,
    transcriptId: analysis.transcriptId,
  };

  return {
    status,
    source: "transcript",
    reportText,
    taskText: firstUserTask,
    errorMessage: turnLine.turnError,
    transcriptRef,
    limitations,
    detectedAt,
  };
}

export function detectFromTranscriptFile(
  filePath: string,
  options: DetectFromTranscriptOptions = {}
): DetectionResult {
  if (!fs.existsSync(filePath)) {
    return {
      status: "UNKNOWN",
      source: "none",
      reportText: "",
      taskText: "",
      limitations: [`Transcript not found: ${filePath}`],
      detectedAt: new Date().toISOString(),
    };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const rawLines = raw.split("\n");
  const analysis = analyzeTranscriptLines(rawLines, filePath);
  return buildDetectionFromAnalysis(analysis, filePath, options);
}

export function detectFromTranscriptLines(
  rawLines: string[],
  filePath: string,
  options: DetectFromTranscriptOptions = {}
): DetectionResult {
  const analysis = analyzeTranscriptLines(rawLines, filePath);
  return buildDetectionFromAnalysis(analysis, filePath, options);
}

/** Find the most recently modified transcript JSONL under agent-transcripts. */
export function findLatestTranscriptFile(transcriptsDir: string): string | null {
  if (!fs.existsSync(transcriptsDir)) return null;

  let bestPath: string | null = null;
  let bestMtime = 0;

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > bestMtime) {
          bestMtime = stat.mtimeMs;
          bestPath = full;
        }
      }
    }
  }

  walk(transcriptsDir);
  return bestPath;
}

export function eventFingerprint(detection: DetectionResult): string {
  const ref = detection.transcriptRef;
  if (ref) {
    return `${ref.filePath}:${ref.lineNumber}:${detection.status}`;
  }
  return `${detection.detectedAt}:${detection.status}:${detection.reportText.slice(0, 80)}`;
}

export interface CursorDetectorOptions {
  workspacePath?: string;
  transcriptsDir?: string;
  allowWaiting?: boolean;
}

/** Detect completion from latest local Cursor agent transcript (best-effort). */
export function detectFromCursorTranscripts(
  options: CursorDetectorOptions = {}
): DetectionResult {
  const dir =
    options.transcriptsDir ??
    defaultCursorTranscriptsDir(options.workspacePath ?? process.cwd());

  const latest = findLatestTranscriptFile(dir);
  if (!latest) {
    return {
      status: "UNKNOWN",
      source: "none",
      reportText: "",
      taskText: "",
      limitations: [
        `No agent transcripts found under ${dir}`,
        "Real Cursor detection requires local agent-transcripts JSONL files",
      ],
      detectedAt: new Date().toISOString(),
    };
  }

  return detectFromTranscriptFile(latest, { allowWaiting: options.allowWaiting });
}
