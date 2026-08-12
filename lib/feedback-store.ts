import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { FeedbackEntry, FeedbackRating, FeedbackStats } from "./feedback-types";
import { tryDataWrite } from "./data-fs";

const DATA_DIR = path.join(process.cwd(), "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.jsonl");

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readAllFeedback(): Promise<FeedbackEntry[]> {
  try {
    const raw = await readFile(FEEDBACK_FILE, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FeedbackEntry);
  } catch {
    return [];
  }
}

export async function appendFeedback(entry: FeedbackEntry): Promise<void> {
  await tryDataWrite("feedback", async () => {
    await ensureDataDir();
    const line = JSON.stringify(entry) + "\n";

    try {
      await readFile(FEEDBACK_FILE, "utf-8");
      await appendFile(FEEDBACK_FILE, line, "utf-8");
    } catch {
      await writeFile(FEEDBACK_FILE, line, "utf-8");
    }
  });
}

export async function writeAllFeedback(entries: FeedbackEntry[]): Promise<void> {
  await tryDataWrite("feedback rewrite", async () => {
    await ensureDataDir();
    const body = entries.map((e) => JSON.stringify(e)).join("\n");
    await writeFile(FEEDBACK_FILE, body ? body + "\n" : "", "utf-8");
  });
}

export function isBacktestEntry(entry: FeedbackEntry): boolean {
  return Boolean(entry.note?.includes("backtest:"));
}

/** Hand-graded only: predict mode or live thumbs — never auto backtest rows. */
export function isHandGradedEntry(entry: FeedbackEntry): boolean {
  return !isBacktestEntry(entry);
}

export function isBacktestWrongEntry(entry: FeedbackEntry): boolean {
  return isBacktestEntry(entry) && entry.rating === "wrong";
}

/** Hand-graded: predict + live. Backtest wrong/miss per env flags. */
export function isLearningEligible(
  entry: FeedbackEntry,
  options: {
    includeBacktestWrong?: boolean;
    includeBacktestMisses?: boolean;
    learnFromMisses?: boolean;
  } = {}
): boolean {
  const {
    includeBacktestWrong = false,
    includeBacktestMisses = false,
    learnFromMisses = true,
  } = options;

  if (entry.rating === "miss" && !learnFromMisses) return false;

  if (isHandGradedEntry(entry)) return true;
  if (includeBacktestWrong && isBacktestWrongEntry(entry)) return true;
  if (
    includeBacktestMisses &&
    entry.rating === "miss" &&
    isBacktestEntry(entry)
  ) {
    return true;
  }
  return false;
}

export async function readFeedbackForLearning(options?: {
  includeBacktestWrong?: boolean;
  includeBacktestMisses?: boolean;
  learnFromMisses?: boolean;
}): Promise<FeedbackEntry[]> {
  const entries = await readAllFeedback();
  return entries.filter((e) => isLearningEligible(e, options ?? {}));
}

/** Keep newest backtest row per chartTime; preserve predict/manual entries. */
export async function dedupeBacktestFeedback(): Promise<{
  before: number;
  after: number;
  removed: number;
}> {
  const entries = await readAllFeedback();
  const before = entries.length;

  const nonBacktest = entries.filter((e) => !isBacktestEntry(e));
  const backtestByTime = new Map<string, FeedbackEntry>();

  for (const entry of entries.filter(isBacktestEntry)) {
    const key = entry.chartTime ?? entry.id;
    const existing = backtestByTime.get(key);
    if (!existing || entry.createdAt > existing.createdAt) {
      backtestByTime.set(key, entry);
    }
  }

  const deduped = [...nonBacktest, ...backtestByTime.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt)
  );

  await writeAllFeedback(deduped);

  return { before, after: deduped.length, removed: before - deduped.length };
}

export function getGradedBacktestTimes(entries: FeedbackEntry[]): Set<string> {
  return new Set(
    entries
      .filter(isBacktestEntry)
      .map((e) => e.chartTime)
      .filter((t): t is string => Boolean(t))
  );
}

export async function clearBacktestFeedback(): Promise<number> {
  const entries = await readAllFeedback();
  const kept = entries.filter((e) => !isBacktestEntry(e));
  const removed = entries.length - kept.length;
  await writeAllFeedback(kept);
  return removed;
}

export async function getFeedbackStats(): Promise<FeedbackStats> {
  const entries = await readAllFeedback();
  const trainingExamples = entries.filter(
    (e) => (e.rating === "wrong" || e.rating === "partial") && e.correction?.trim()
  ).length;

  return {
    total: entries.length,
    correct: entries.filter((e) => e.rating === "correct").length,
    partial: entries.filter((e) => e.rating === "partial").length,
    wrong: entries.filter((e) => e.rating === "wrong").length,
    miss: entries.filter((e) => e.rating === "miss").length,
    trainingExamples,
  };
}

export function getTrainingExamples(entries: FeedbackEntry[], limit = 8): FeedbackEntry[] {
  return entries
    .filter((e) => (e.rating === "wrong" || e.rating === "partial") && e.correction?.trim())
    .slice(-limit);
}

export function createFeedbackEntry(input: {
  rating: FeedbackRating;
  predictMode: boolean;
  chartTime?: string;
  note?: string;
  verdict: string;
  correction?: string;
  failedConcepts?: FeedbackEntry["failedConcepts"];
  failureReason?: string;
  marketContext?: unknown;
}): FeedbackEntry {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
}
