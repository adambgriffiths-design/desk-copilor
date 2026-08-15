#!/usr/bin/env npx tsx
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import { getEstDateKey, getEstMinutes } from "../lib/market-data";
import { majorLevelInteraction, shouldRunKarenAnalysis } from "../lib/analysis-triggers";
import { createIncrementalMarketEngine } from "../lib/incremental-market-engine";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import type { Bar } from "../lib/types";
import type { ReplayMarketData } from "../lib/research/replay/types";

const spec = { dateKey: "2026-08-12", startMin: 9 * 60 + 30, endMin: 11 * 60 };
const warmup = 60;

function pick(data: ReplayMarketData): number[] {
  const out: number[] = [];
  for (let i = warmup; i < data.m1.length; i++) {
    const bar = data.m1[i]!;
    if (getEstDateKey(bar.time) !== spec.dateKey) continue;
    const m = getEstMinutes(bar.time);
    if (m < spec.startMin || m >= spec.endMin) continue;
    out.push(i);
  }
  return out;
}

function dailyLevelsAt(data: ReplayMarketData, barIndex: number) {
  const asOf = data.m1[barIndex]!.time.getTime();
  const daily = data.daily.filter((b) => b.time.getTime() <= asOf);
  if (daily.length < 2) return null;
  const prev = daily.at(-2)!;
  return { pdh: prev.high, pdl: prev.low, pdc: prev.close };
}

function nearLevel(price: number, level: number, t = 8) {
  return Math.abs(price - level) <= t;
}

function cheapBarAnatomy(prev: Bar | null, bar: Bar) {
  if (!prev) return true;
  const range = bar.high - bar.low;
  const closeMove = Math.abs(bar.close - prev.close);
  return range >= 6 || closeMove >= 4 || bar.high > prev.high + 0.5 || bar.low < prev.low - 0.5;
}

ensureResearchFixtures();
const data = loadResearchDatasetFixture("nq-aug12-2026-cme");
const idxs = pick(data);
const engine = createIncrementalMarketEngine();
const prefixEnd = idxs[0]! - 1;
const prefix = {
  ...data,
  m1: data.m1.slice(0, prefixEnd + 1).map((b) => ({ ...b, time: new Date(b.time) })),
};
engine.initialize({ data: prefix, asOf: prefix.m1.at(-1)!.time, lastPrice: prefix.m1.at(-1)!.close });

const t0 = performance.now();
const eventsBy = new Map<number, ReturnType<typeof engine.applyClosedBar>["events"]>();
for (const barIndex of idxs) {
  const bar = data.m1[barIndex]!;
  const snap = engine.applyClosedBar({ ...bar, time: new Date(bar.time) });
  eventsBy.set(barIndex, snap.events);
}
const engineMs = performance.now() - t0;

const counts = { engine_events: 0, daily_proximity: 0, bar_anatomy: 0, price_cross: 0, composite: 0, wait_compression_skip: 0 };

for (let i = 0; i < idxs.length; i++) {
  const barIndex = idxs[i]!;
  const bar = data.m1[barIndex]!;
  const prev = i > 0 ? data.m1[idxs[i - 1]!]! : null;
  const ev = eventsBy.get(barIndex) ?? [];
  const lv = dailyLevelsAt(data, barIndex);

  if (shouldRunKarenAnalysis("bar_close", ev)) counts.engine_events++;
  if (lv && (nearLevel(bar.close, lv.pdh) || nearLevel(bar.close, lv.pdl) || nearLevel(bar.close, lv.pdc))) {
    counts.daily_proximity++;
  }
  if (cheapBarAnatomy(prev, bar)) counts.bar_anatomy++;
  if (prev && lv && majorLevelInteraction(prev.close, bar.close, [lv.pdh, lv.pdl, lv.pdc], 8)) counts.price_cross++;

  const inputChanged =
    shouldRunKarenAnalysis("bar_close", ev) ||
    cheapBarAnatomy(prev, bar) ||
    (prev && lv ? majorLevelInteraction(prev.close, bar.close, [lv.pdh, lv.pdl, lv.pdc], 8) : false);

  const composite =
    shouldRunKarenAnalysis("bar_close", ev) ||
    (lv && (nearLevel(bar.close, lv.pdh) || nearLevel(bar.close, lv.pdl) || nearLevel(bar.close, lv.pdc))) ||
    cheapBarAnatomy(prev, bar) ||
    (prev && lv ? majorLevelInteraction(prev.close, bar.close, [lv.pdh, lv.pdl, lv.pdc], 8) : false);
  if (composite) counts.composite++;
  if (!inputChanged) counts.wait_compression_skip++;
}

const out = {
  bars: idxs.length,
  engineMs: Math.round(engineMs),
  avgEngineMs: Math.round((engineMs / idxs.length) * 100) / 100,
  candidatePct: Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, Math.round((v / idxs.length) * 1000) / 10])
  ),
  estimatedFullEvalReductionPct: {
    composite: Math.round((1 - counts.composite / idxs.length) * 1000) / 10,
    wait_compression: Math.round((counts.wait_compression_skip / idxs.length) * 1000) / 10,
  },
};

const path = join(process.cwd(), "data", "research", "karen-candidate-scan-only.json");
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
