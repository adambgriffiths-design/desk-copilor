import fs from "fs";
import path from "path";
import type { ReplayResultRecord } from "./types";
import { RESEARCH_RUNS_DIR, ensureResearchDataRoot } from "../paths";

export function ensureResultsDir(): void {
  ensureResearchDataRoot();
}

export function saveReplayResult(record: ReplayResultRecord): string {
  ensureResultsDir();
  const filename = `${record.id}.json`;
  const filepath = path.join(RESEARCH_RUNS_DIR, "replay", filename);
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(record, null, 2), "utf8");
  return filepath;
}

export function listReplayResults(): ReplayResultRecord[] {
  ensureResultsDir();
  const replayDir = path.join(RESEARCH_RUNS_DIR, "replay");
  if (!fs.existsSync(replayDir)) return [];
  const files = fs.readdirSync(replayDir).filter((f) => f.endsWith(".json"));
  const results: ReplayResultRecord[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(replayDir, file), "utf8");
      results.push(JSON.parse(raw) as ReplayResultRecord);
    } catch {
      /* skip corrupt */
    }
  }
  return results.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
