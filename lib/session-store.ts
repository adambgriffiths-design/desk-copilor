import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SESSION_FILE = path.join(DATA_DIR, "session-log.jsonl");

export type SessionLogEntry = {
  id: string;
  createdAt: string;
  symbol?: string;
  chartTime?: string;
  verdict: string;
  source: "live" | "web";
  rating?: "up" | "down";
  marketContext?: unknown;
};

export async function appendSessionLog(entry: SessionLogEntry): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  try {
    await readFile(SESSION_FILE, "utf-8");
    await appendFile(SESSION_FILE, line, "utf-8");
  } catch {
    await writeFile(SESSION_FILE, line, "utf-8");
  }
}

export async function readSessionLogs(): Promise<SessionLogEntry[]> {
  try {
    const raw = await readFile(SESSION_FILE, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as SessionLogEntry);
  } catch {
    return [];
  }
}

export function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function getTodayStats() {
  const logs = await readSessionLogs();
  const today = todayKey();
  const todayLogs = logs.filter(
    (l) =>
      new Date(l.createdAt).toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }) === today
  );
  return {
    date: today,
    total: todayLogs.length,
    up: todayLogs.filter((l) => l.rating === "up").length,
    down: todayLogs.filter((l) => l.rating === "down").length,
    pending: todayLogs.filter((l) => !l.rating).length,
  };
}

export async function rateSessionVerdict(
  id: string,
  rating: "up" | "down"
): Promise<boolean> {
  const logs = await readSessionLogs();
  const entry = logs.find((l) => l.id === id);
  if (!entry) return false;

  entry.rating = rating;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    SESSION_FILE,
    logs.map((l) => JSON.stringify(l)).join("\n") + "\n",
    "utf-8"
  );

  if (rating === "down") {
    const { appendFeedback, createFeedbackEntry } = await import("@/lib/feedback-store");
    await appendFeedback(
      createFeedbackEntry({
        rating: "partial",
        predictMode: false,
        chartTime: entry.chartTime,
        verdict: entry.verdict,
        correction: "Trader marked this live verdict wrong — revise similar setups.",
        marketContext: entry.marketContext,
      })
    );
  }

  return true;
}
