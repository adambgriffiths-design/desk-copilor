import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadTickstreamApiKey } from "../../tickstream/quote";
import { RESEARCH_FIXTURES_DIR } from "../paths";
import { loadDatasetFromTickstream } from "./loader";
import { toBuildReport } from "./build";
import { readDataset, writeDataset, writeFixtureBundle } from "./store";
import type { ResearchCandleDataset } from "./types";

export const AUG12_CME_FIXTURE_ID = "nq-aug12-2026-cme";

export const AUG12_CME_SESSION = {
  fixtureId: AUG12_CME_FIXTURE_ID,
  symbol: "NQ",
  start: "2026-08-11T22:00:00Z",
  end: "2026-08-12T22:00:00Z",
  sessionDate: "2026-08-12",
  label: "NQ Aug 12 2026 CME Globex session",
} as const;

function fixtureBundleDir(): string {
  return path.join(RESEARCH_FIXTURES_DIR, AUG12_CME_FIXTURE_ID);
}

/** Load cached Aug 12 bundle from research-fixtures if present. */
export function findCachedAug12Dataset(): ResearchCandleDataset | null {
  const dir = fixtureBundleDir();
  const manifestPath = path.join(dir, "manifest.json");
  const candlesPath = path.join(dir, "candles.json");
  const validationPath = path.join(dir, "validation.json");

  if (existsSync(manifestPath) && existsSync(candlesPath) && existsSync(validationPath)) {
    const metadata = JSON.parse(readFileSync(manifestPath, "utf8"));
    const candles = JSON.parse(readFileSync(candlesPath, "utf8"));
    const validation = JSON.parse(readFileSync(validationPath, "utf8"));
    return { metadata, candles, validation };
  }

  return null;
}

export type EnsureAug12Options = {
  apiKey?: string;
  /** When true, re-fetch even if cached bundle exists. */
  force?: boolean;
};

/**
 * Returns Aug 12 CME session dataset — reuses on-disk bundle when available.
 * Fetches from TickStream once when cache is missing (requires API key).
 */
export async function ensureAug12ResearchDataset(
  opts: EnsureAug12Options = {}
): Promise<ResearchCandleDataset> {
  if (!opts.force) {
    const cached = findCachedAug12Dataset();
    if (cached) return cached;
  }

  const apiKey = opts.apiKey ?? loadTickstreamApiKey();
  if (!apiKey) {
    throw new Error("TICKSTREAM_API_KEY required to build Aug 12 research dataset");
  }

  const dataset = await loadDatasetFromTickstream({
    apiKey,
    symbol: AUG12_CME_SESSION.symbol,
    start: AUG12_CME_SESSION.start,
    end: AUG12_CME_SESSION.end,
  });

  writeDataset(dataset);
  writeFixtureBundle(dataset, AUG12_CME_FIXTURE_ID, toBuildReport(dataset));

  return dataset;
}

/** Resolve dataset by id or Aug 12 fixture alias. */
export function loadResearchDatasetById(datasetIdOrAlias: string): ResearchCandleDataset {
  if (datasetIdOrAlias === AUG12_CME_FIXTURE_ID) {
    const cached = findCachedAug12Dataset();
    if (cached) return cached;
  }
  return readDataset(datasetIdOrAlias);
}
