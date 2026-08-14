import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { validateCandles } from "../dataset/validate";
import type { ResearchCandle } from "../dataset/types";
import { RESEARCH_DATASET_DIR, RESEARCH_RECORDS_DIR, ensureResearchDataRoot } from "../paths";
import { ReplayDataCutoff } from "./cutoff";
import { datasetRecordFingerprint, serializeDatasetRecord } from "./dataset";
import { ReplayEngine } from "./engine";
import { buildDeterministicKarenResponse } from "./karen";
import type {
  DataQualityState,
  DatasetRecord,
  MarketStructureSnapshot,
  PointInTimeResearchRecord,
  ReplayMarketData,
  SerializedBar,
} from "./types";
import type { MarketContext } from "../../types";

export function ensureResearchRecordsDir(): void {
  ensureResearchDataRoot();
  if (!fs.existsSync(RESEARCH_RECORDS_DIR)) {
    fs.mkdirSync(RESEARCH_RECORDS_DIR, { recursive: true });
  }
}

export function saveDatasetRecord(record: DatasetRecord): { filepath: string; fingerprint: string } {
  ensureResearchRecordsDir();
  const fingerprint = datasetRecordFingerprint(record);
  const filename = `${fingerprint.slice(0, 16)}.json`;
  const filepath = path.join(RESEARCH_DATASET_DIR, filename);
  fs.writeFileSync(filepath, serializeDatasetRecord(record), "utf8");
  return { filepath, fingerprint };
}

export function listDatasetRecords(): DatasetRecord[] {
  ensureResearchRecordsDir();
  if (!fs.existsSync(RESEARCH_DATASET_DIR)) return [];
  const results: DatasetRecord[] = [];
  for (const file of fs.readdirSync(RESEARCH_DATASET_DIR).filter((f) => f.endsWith(".json"))) {
    try {
      const raw = fs.readFileSync(path.join(RESEARCH_DATASET_DIR, file), "utf8");
      results.push(JSON.parse(raw) as DatasetRecord);
    } catch {
      /* skip corrupt */
    }
  }
  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function serializeBar(b: { time: Date; open: number; high: number; low: number; close: number }): SerializedBar {
  return {
    time: b.time.toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
}

export function buildMarketStructureSnapshot(ctx: MarketContext, structureSummary: string): MarketStructureSnapshot {
  return {
    summary: ctx.structureFacts.summary,
    structureSummary,
    bias: ctx.biasStack?.dominantBias ?? ctx.daily.biasHint,
    mss: ctx.structureFacts.mss
      ? {
          direction: ctx.structureFacts.mss.direction,
          level: ctx.structureFacts.mss.level,
          at: ctx.structureFacts.mss.at,
        }
      : null,
    m1FvgCount: ctx.structureFacts.m1UnfilledFvgs.length,
    pdVsRange: ctx.premiumDiscount?.vsCurrentDayRange ?? "mid",
  };
}

export function buildDataQualityAtCutoff(cutoff: ReplayDataCutoff): DataQualityState {
  const candles: ResearchCandle[] = cutoff.slicedM1().map((b) => ({
    timestamp: Math.floor(b.time.getTime() / 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  const validation = validateCandles(candles);
  return {
    status: validation.status,
    candleCount: validation.candleCount,
    missingMinuteCount: validation.missingMinuteCount,
    duplicateCount: validation.duplicateCount,
    invalidOhlcCount: validation.invalidOhlcCount,
    issueCount: validation.issues.length,
  };
}

/** Build deterministic point-in-time record — no data after timestamp T. */
export function buildPointInTimeRecord(
  fixture: ReplayMarketData & { id: string; symbol: string },
  timestamp: string
): PointInTimeResearchRecord {
  const engine = new ReplayEngine(fixture);
  engine.seekTo(timestamp);
  const snapshot = engine.snapshot();
  const asOf = new Date(snapshot.asOf);
  const cutoff = new ReplayDataCutoff(fixture, asOf);
  cutoff.assertNoFutureLeak();
  const ctx = cutoff.buildContext();
  const karen = buildDeterministicKarenResponse(ctx, fixture, asOf);
  const m1 = cutoff.slicedM1().map(serializeBar);

  return {
    schemaVersion: "1.0",
    datasetId: snapshot.datasetId,
    symbol: snapshot.symbol,
    timestamp: snapshot.asOf,
    currentPrice: snapshot.currentPrice,
    barCountAtCutoff: snapshot.barCountAtCutoff,
    availableCandleRange: snapshot.availableCandleRange,
    m1,
    features: snapshot.features,
    marketStructure: buildMarketStructureSnapshot(ctx, snapshot.structureSummary),
    karen,
    dataQuality: buildDataQualityAtCutoff(cutoff),
  };
}

export function pointInTimeRecordFingerprint(record: PointInTimeResearchRecord): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export function serializePointInTimeRecord(record: PointInTimeResearchRecord): string {
  return JSON.stringify(record, null, 2);
}

export function recordFilename(datasetId: string, timestamp: string): string {
  const slug = timestamp.replace(/:/g, "-");
  return `${datasetId}__${slug}.json`;
}

export function savePointInTimeRecord(
  record: PointInTimeResearchRecord,
  datasetId?: string
): { filepath: string; fingerprint: string } {
  ensureResearchRecordsDir();
  const id = datasetId ?? record.datasetId;
  const dir = path.join(RESEARCH_RECORDS_DIR, id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = recordFilename(id, record.timestamp);
  const filepath = path.join(dir, filename);
  const fingerprint = pointInTimeRecordFingerprint(record);
  fs.writeFileSync(filepath, serializePointInTimeRecord(record), "utf8");
  return { filepath, fingerprint };
}

export function validatePointInTimeRecord(raw: unknown): raw is PointInTimeResearchRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  return (
    r.schemaVersion === "1.0" &&
    typeof r.datasetId === "string" &&
    typeof r.symbol === "string" &&
    typeof r.timestamp === "string" &&
    typeof r.currentPrice === "number" &&
    typeof r.barCountAtCutoff === "number" &&
    Array.isArray(r.m1) &&
    typeof r.features === "object" &&
    r.features != null &&
    typeof r.marketStructure === "object" &&
    r.marketStructure != null &&
    typeof r.karen === "object" &&
    r.karen != null &&
    typeof r.dataQuality === "object" &&
    r.dataQuality != null
  );
}

export function loadPointInTimeRecord(filepath: string): PointInTimeResearchRecord {
  const raw = JSON.parse(fs.readFileSync(filepath, "utf8")) as unknown;
  if (!validatePointInTimeRecord(raw)) {
    throw new Error(`Invalid point-in-time research record: ${filepath}`);
  }
  return raw;
}

/** Assert no m1 bar in record exceeds the record timestamp. */
export function assertNoFutureBarsInRecord(record: PointInTimeResearchRecord): void {
  const t = new Date(record.timestamp).getTime();
  for (const bar of record.m1) {
    if (new Date(bar.time).getTime() > t) {
      throw new Error(`Future bar leak in record: ${bar.time} > ${record.timestamp}`);
    }
  }
  if (record.m1.length !== record.barCountAtCutoff) {
    throw new Error(
      `Bar count mismatch: m1.length=${record.m1.length} barCountAtCutoff=${record.barCountAtCutoff}`
    );
  }
}
