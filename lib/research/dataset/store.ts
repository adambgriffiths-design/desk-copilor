import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RESEARCH_FIXTURES_DIR } from "../paths";
import type { DatasetBuildReport, ObservationAtT, OutcomeLabel, ResearchCandleDataset } from "./types";

const DATASETS_ROOT = path.join(process.cwd(), "data", "research", "datasets");

export function datasetsRootDir(): string {
  return DATASETS_ROOT;
}

export function datasetDir(datasetId: string): string {
  return path.join(DATASETS_ROOT, datasetId);
}

export function writeDataset(dataset: ResearchCandleDataset): string {
  const dir = datasetDir(dataset.metadata.dataset_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(dataset.metadata, null, 2), "utf8");
  writeFileSync(path.join(dir, "candles.json"), JSON.stringify(dataset.candles, null, 2), "utf8");
  writeFileSync(
    path.join(dir, "validation.json"),
    JSON.stringify(dataset.validation, null, 2),
    "utf8"
  );
  return dir;
}

export function readDataset(datasetId: string): ResearchCandleDataset {
  const dir = datasetDir(datasetId);
  if (!existsSync(dir)) {
    throw new Error(`research dataset not found: ${datasetId}`);
  }
  const metadata = JSON.parse(readFileSync(path.join(dir, "metadata.json"), "utf8"));
  const candles = JSON.parse(readFileSync(path.join(dir, "candles.json"), "utf8"));
  const validation = JSON.parse(readFileSync(path.join(dir, "validation.json"), "utf8"));
  return { metadata, candles, validation };
}

export function writeObservationRecord(datasetId: string, observation: ObservationAtT): string {
  const dir = path.join(datasetDir(datasetId), "observations");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${observation.timestamp}.json`);
  writeFileSync(file, JSON.stringify(observation, null, 2), "utf8");
  return file;
}

export function writeOutcomeRecord(datasetId: string, outcome: OutcomeLabel): string {
  const dir = path.join(datasetDir(datasetId), "outcomes");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${outcome.observation_timestamp}.json`);
  writeFileSync(file, JSON.stringify(outcome, null, 2), "utf8");
  return file;
}

/** Versioned bundle under data/research-fixtures/<fixtureId>/ for replay + audit. */
export function writeFixtureBundle(
  dataset: ResearchCandleDataset,
  fixtureId: string,
  report?: DatasetBuildReport
): string {
  const dir = path.join(RESEARCH_FIXTURES_DIR, fixtureId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(dataset.metadata, null, 2), "utf8");
  writeFileSync(path.join(dir, "candles.json"), JSON.stringify(dataset.candles, null, 2), "utf8");
  writeFileSync(path.join(dir, "validation.json"), JSON.stringify(dataset.validation, null, 2), "utf8");
  if (report) {
    writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  }
  return dir;
}

export function readFixtureBundle(fixtureId: string): ResearchCandleDataset {
  const dir = path.join(RESEARCH_FIXTURES_DIR, fixtureId);
  if (!existsSync(dir)) {
    throw new Error(`research fixture bundle not found: ${fixtureId}`);
  }
  const metadata = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const candles = JSON.parse(readFileSync(path.join(dir, "candles.json"), "utf8"));
  const validation = JSON.parse(readFileSync(path.join(dir, "validation.json"), "utf8"));
  return { metadata, candles, validation };
}
