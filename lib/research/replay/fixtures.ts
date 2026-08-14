import fs from "fs";
import path from "path";
import {
  AUG12_CME_FIXTURE_ID,
  findCachedAug12Dataset,
  loadResearchDatasetById,
  readFixtureBundle,
  researchDatasetToReplayMarketData,
} from "../dataset";
import type { Bar } from "../../types";
import type { ReplayFixture, ReplayMarketData, SerializedBar } from "./types";

const FIXTURES_DIR = path.join(process.cwd(), "data", "replay-fixtures");
const RESEARCH_FIXTURES_DIR = path.join(process.cwd(), "data", "research-fixtures");

function deserializeBar(b: SerializedBar): Bar {
  return { ...b, time: new Date(b.time) };
}

function deserializeFixture(raw: ReplayFixture): ReplayMarketData & { id: string; label: string; sessionDate: string } {
  return {
    id: raw.id,
    label: raw.label,
    sessionDate: raw.sessionDate,
    symbol: raw.symbol,
    daily: raw.daily.map(deserializeBar),
    m15: raw.m15.map(deserializeBar),
    m5: raw.m5.map(deserializeBar),
    m1: raw.m1.map(deserializeBar),
  };
}

/** Build deterministic synthetic session for tests + offline replay. */
export function buildSyntheticFixture(): ReplayMarketData & {
  id: string;
  label: string;
  sessionDate: string;
} {
  const base = new Date("2026-08-12T13:30:00.000Z");
  const m1: Bar[] = [];
  let price = 25000;

  for (let i = 0; i < 120; i++) {
    const time = new Date(base.getTime() + i * 60_000);
    const drift = i < 30 ? 0.3 : i < 60 ? -0.1 : i === 60 ? 8 : 0.2;
    const open = price;
    const close = price + drift + (i % 3 === 0 ? 1 : -0.5);
    const high = Math.max(open, close) + (i === 60 ? 12 : 2);
    const low = Math.min(open, close) - (i === 61 ? 8 : 1.5);
    m1.push({ time, open, high, low, close });
    price = close;
  }

  m1[58] = { ...m1[58], high: 25010, low: 25005, close: 25008 };
  m1[59] = { ...m1[59], open: 25020, high: 25022, low: 25018, close: 25021 };
  m1[60] = { ...m1[60], open: 25035, high: 25045, low: 25033, close: 25040 };

  const m5 = aggregateBars(m1, 5);
  const m15 = aggregateBars(m1, 15);

  const daily: Bar[] = [];
  for (let d = 0; d < 5; d++) {
    const day = new Date("2026-08-08T00:00:00.000Z");
    day.setUTCDate(day.getUTCDate() + d);
    daily.push({
      time: day,
      open: 24800 + d * 50,
      high: 24900 + d * 50,
      low: 24750 + d * 50,
      close: 24850 + d * 50,
    });
  }
  daily.push({
    time: new Date("2026-08-12T00:00:00.000Z"),
    open: 25000,
    high: 25100,
    low: 24900,
    close: 25050,
  });

  return {
    id: "synthetic-ny-am",
    label: "Synthetic NY AM Mini (Aug 12 2026)",
    sessionDate: "2026-08-12",
    symbol: "MNQ=F",
    daily,
    m15,
    m5,
    m1,
  };
}

function aggregateBars(m1: Bar[], factor: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < m1.length; i += factor) {
    const chunk = m1.slice(i, i + factor);
    if (!chunk.length) continue;
    out.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk.at(-1)!.close,
    });
  }
  return out;
}

function serializeBar(b: Bar): SerializedBar {
  return {
    time: b.time.toISOString(),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  };
}

export function writeSyntheticFixtureToDisk(): string {
  const synth = buildSyntheticFixture();
  const fixture: ReplayFixture = {
    id: synth.id,
    label: synth.label,
    symbol: synth.symbol,
    sessionDate: synth.sessionDate,
    daily: synth.daily.map(serializeBar),
    m15: synth.m15.map(serializeBar),
    m5: synth.m5.map(serializeBar),
    m1: synth.m1.map(serializeBar),
  };
  if (!fs.existsSync(FIXTURES_DIR)) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const filepath = path.join(FIXTURES_DIR, `${synth.id}.json`);
  fs.writeFileSync(filepath, JSON.stringify(fixture, null, 2), "utf8");
  return filepath;
}

/** Write same synthetic fixture to research-fixtures for isolated research module. */
export function writeResearchFixtureToDisk(): string {
  const synth = buildSyntheticFixture();
  const fixture: ReplayFixture = {
    id: synth.id,
    label: synth.label,
    symbol: synth.symbol,
    sessionDate: synth.sessionDate,
    daily: synth.daily.map(serializeBar),
    m15: synth.m15.map(serializeBar),
    m5: synth.m5.map(serializeBar),
    m1: synth.m1.map(serializeBar),
  };
  if (!fs.existsSync(RESEARCH_FIXTURES_DIR)) fs.mkdirSync(RESEARCH_FIXTURES_DIR, { recursive: true });
  const filepath = path.join(RESEARCH_FIXTURES_DIR, `${synth.id}.json`);
  fs.writeFileSync(filepath, JSON.stringify(fixture, null, 2), "utf8");
  return filepath;
}

export function ensureResearchFixtures(): string {
  const filepath = path.join(RESEARCH_FIXTURES_DIR, "synthetic-ny-am.json");
  if (fs.existsSync(filepath)) return filepath;
  return writeResearchFixtureToDisk();
}

const fixtureCache = new Map<string, ReplayMarketData & { id: string; label: string; sessionDate: string }>();

function cacheAndReturn(
  id: string,
  loaded: ReplayMarketData & { id: string; label: string; sessionDate: string }
) {
  fixtureCache.set(id, loaded);
  return loaded;
}

/** Load research candle dataset (by dataset id or fixture alias) as replay market data. */
export function loadResearchDatasetFixture(
  datasetIdOrAlias: string
): ReplayMarketData & { id: string; label: string; sessionDate: string } {
  if (fixtureCache.has(datasetIdOrAlias)) return fixtureCache.get(datasetIdOrAlias)!;

  let dataset;
  if (datasetIdOrAlias === AUG12_CME_FIXTURE_ID) {
    dataset = findCachedAug12Dataset();
    if (!dataset) {
      dataset = readFixtureBundle(datasetIdOrAlias);
    }
  } else {
    try {
      dataset = loadResearchDatasetById(datasetIdOrAlias);
    } catch {
      dataset = readFixtureBundle(datasetIdOrAlias);
    }
  }

  const loaded = researchDatasetToReplayMarketData(dataset);
  return cacheAndReturn(datasetIdOrAlias, loaded);
}

export function loadReplayFixture(id: string): ReplayMarketData & {
  id: string;
  label: string;
  sessionDate: string;
} {
  if (fixtureCache.has(id)) return fixtureCache.get(id)!;

  if (id === AUG12_CME_FIXTURE_ID || id.length === 20) {
    try {
      return loadResearchDatasetFixture(id);
    } catch {
      /* fall through to legacy JSON fixtures */
    }
  }

  if (id === "synthetic-ny-am") {
    const filepath = path.join(FIXTURES_DIR, "synthetic-ny-am.json");
    if (fs.existsSync(filepath)) {
      const raw = JSON.parse(fs.readFileSync(filepath, "utf8")) as ReplayFixture;
      const loaded = deserializeFixture(raw);
      return cacheAndReturn(id, loaded);
    }
    const synth = buildSyntheticFixture();
    return cacheAndReturn(id, synth);
  }

  const bundlePath = path.join(RESEARCH_FIXTURES_DIR, id);
  if (fs.existsSync(path.join(bundlePath, "manifest.json"))) {
    return loadResearchDatasetFixture(id);
  }

  const filepath = path.join(FIXTURES_DIR, `${id}.json`);
  const researchPath = path.join(RESEARCH_FIXTURES_DIR, `${id}.json`);
  const resolved = fs.existsSync(filepath)
    ? filepath
    : fs.existsSync(researchPath)
      ? researchPath
      : null;
  if (!resolved) {
    throw new Error(`Replay fixture not found: ${id}`);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, "utf8")) as ReplayFixture;
  const loaded = deserializeFixture(raw);
  return cacheAndReturn(id, loaded);
}

export function listReplayFixtures(): Array<{ id: string; label: string; sessionDate: string; barCount: number }> {
  const fixtures: Array<{ id: string; label: string; sessionDate: string; barCount: number }> = [];

  if (fs.existsSync(FIXTURES_DIR)) {
    for (const file of fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), "utf8")) as ReplayFixture;
        fixtures.push({
          id: raw.id,
          label: raw.label,
          sessionDate: raw.sessionDate,
          barCount: raw.m1.length,
        });
      } catch {
        /* skip */
      }
    }
  }

  if (!fixtures.some((f) => f.id === "synthetic-ny-am")) {
    const synth = buildSyntheticFixture();
    fixtures.push({
      id: synth.id,
      label: synth.label,
      sessionDate: synth.sessionDate,
      barCount: synth.m1.length,
    });
  }

  return fixtures;
}

export function availableTimestamps(data: ReplayMarketData, step = 5): string[] {
  const out: string[] = [];
  for (let i = step; i < data.m1.length - 1; i += step) {
    out.push(data.m1[i].time.toISOString());
  }
  if (data.m1.length > 1) {
    const last = data.m1.at(-2)!.time.toISOString();
    if (!out.includes(last)) out.push(last);
  }
  return out;
}
