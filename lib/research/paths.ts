import fs from "fs";
import path from "path";

/** Root for all internal research artifacts — never mixed with prod state. */
export const RESEARCH_DATA_ROOT = path.join(process.cwd(), "data", "research");

export const RESEARCH_RUNS_DIR = path.join(RESEARCH_DATA_ROOT, "runs");
export const RESEARCH_RECORDS_DIR = path.join(RESEARCH_DATA_ROOT, "records");
export const RESEARCH_BASELINE_RUNS_DIR = path.join(RESEARCH_DATA_ROOT, "baseline-runs");
export const RESEARCH_FIXTURES_DIR = path.join(process.cwd(), "data", "research-fixtures");
export const RESEARCH_DATASET_DIR = path.join(RESEARCH_DATA_ROOT, "datasets");

export function ensureResearchDataRoot(): void {
  for (const dir of [
    RESEARCH_DATA_ROOT,
    RESEARCH_RUNS_DIR,
    RESEARCH_RECORDS_DIR,
    RESEARCH_BASELINE_RUNS_DIR,
    RESEARCH_DATASET_DIR,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function createRunDirectory(runId: string): string {
  ensureResearchDataRoot();
  const dir = path.join(RESEARCH_RUNS_DIR, runId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
