/**
 * Request-current vs event-current IMPACT STUDY (measurement only).
 * Does NOT build a tick engine, change architecture-v1, trading logic, ICT, live reuse, or SSE.
 * No OpenAI. No next-dev. No commit/deploy.
 *
 * Run: npx tsx scripts/research-request-vs-event-impact.ts
 * Out:  data/research/karen-request-vs-event-impact.md
 */
import { performance } from "perf_hooks";
import { writeFileSync } from "fs";
import { join } from "path";
import { getEstDateKey, getEstMinutes } from "../lib/market-data";
import { buildDecisionEnvelope, type DecisionEnvelope, type DecisionStance } from "../lib/decision-envelope";
import { evaluateAnalysisQualityGate, resetQualityGateCache } from "../lib/analysis-quality-gate";
import { assembleDeskMarketIntelligenceFromEngine } from "../lib/market-intelligence";
import { runDeskPipeline } from "../lib/desk-pipeline";
import {
  createIncrementalMarketEngine,
  type IncrementalMarketEngine,
  type MarketFeed,
} from "../lib/incremental-market-engine";
import { prefixFeedAtBarIndex } from "../lib/research/replay/incremental-context";
import { buildHtfIndexMaps, sliceBarsThroughIndex } from "../lib/research/replay/fast-slice";
import {
  ensureResearchFixtures,
  loadResearchDatasetFixture,
  loadReplayFixture,
} from "../lib/research/replay/fixtures";
import type { Bar } from "../lib/types";
import type { ReplayMarketData } from "../lib/research/replay/types";
import { buildResearchChartSnapshotFromBars } from "../lib/research/chart-snapshot-from-bars";

const REPORT_PATH = join(process.cwd(), "data", "research", "karen-request-vs-event-impact.md");
const WARMUP = 60;
const LOOKAHEAD = 20; // bars after scenario for crude outcome
const MAX_SCENARIOS = 20; // hard cap — keep wall time reasonable on 8GB
const SYNTHETIC_CAP = 12;
const AUG12_CAP = 8;
const WEEK_CAP = 0; // skip week load this pass (6880 bars) — document as limit
const LIVE_EPS = 0.25;

type ArmSnap = {
  label: string;
  stance: DecisionStance;
  pipelineVerdict: string;
  entry: string | null;
  target: number | null;
  invalidation: number | null;
  thesisComplete: boolean;
  canDeliverVerdict: boolean;
  pdhStatus: string | null;
  pdlStatus: string | null;
  formingHigh: number | null;
  formingLow: number | null;
  lastPrice: number;
  envelopeFp: string;
  tradeDirection: string;
};

type LayerFlags = {
  stateDiff: boolean;
  decisionDiff: boolean;
  tradeOutcomeDiff: boolean;
  highQuality: boolean;
  reasons: string[];
};

type ScenarioRow = {
  source: string;
  barIndex: number;
  asOf: string;
  pickReason: string;
  control: ArmSnap;
  treatment: ArmSnap;
  layers: LayerFlags;
};

function memMb() {
  const m = process.memoryUsage();
  return { rss: Math.round(m.rss / 1024 / 1024), heap: Math.round(m.heapUsed / 1024 / 1024) };
}

function pdStatus(ctx: { structureFacts: { levelInteractions: Array<{ levelId: string; status: string }> } }, id: string) {
  return ctx.structureFacts.levelInteractions.find((x) => x.levelId === id)?.status ?? null;
}

function stableEnvFp(env: DecisionEnvelope): string {
  return [
    env.stance,
    env.read.tradeDirection,
    env.thesis.toward ?? "",
    env.thesis.fromWhere ?? "",
    env.thesis.invalidates ?? "",
    env.invalidation.price,
    env.citedConcepts.join(","),
  ].join("|");
}

function isHighQuality(arm: ArmSnap): boolean {
  // Documented definition used for go/no-go subset:
  // high-quality = canDeliverVerdict OR (non-WAIT directional with entry) OR (WAIT with numeric entry zone).
  if (arm.canDeliverVerdict) return true;
  if ((arm.stance === "long" || arm.stance === "short") && arm.entry) return true;
  if (arm.stance === "wait" && arm.entry && /\d/.test(arm.entry)) return true;
  return false;
}

function directional(stance: DecisionStance): boolean {
  return stance === "long" || stance === "short";
}

function flatish(stance: DecisionStance): boolean {
  return stance === "flat" || stance === "wait" || stance === "monitor";
}

function parseNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const m = String(s).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function engineAt(data: ReplayMarketData, barIndex: number, htfMaps: ReturnType<typeof buildHtfIndexMaps>): IncrementalMarketEngine {
  const eng = createIncrementalMarketEngine();
  const bar = data.m1[barIndex]!;
  eng.initialize({
    data: prefixFeedAtBarIndex(data, barIndex, htfMaps),
    asOf: bar.time,
    lastPrice: bar.close,
  });
  return eng;
}

function decideArm(
  engine: IncrementalMarketEngine,
  data: ReplayMarketData,
  barIndex: number,
  lastPrice: number,
  label: string
): ArmSnap {
  resetQualityGateCache();
  const snap = engine.snapshot("tick");
  const m1 = sliceBarsThroughIndex(data.m1, barIndex).map((b) => ({
    ...b,
    time: new Date(b.time),
  }));
  // Overlay forming OHLC from engine feed (may differ from closed historical bar).
  const feedLast = (engine as unknown as { feed: MarketFeed }).feed.m1.at(-1);
  if (feedLast && m1.length) {
    const t = feedLast.time.getTime();
    const idx = m1.findIndex((b) => b.time.getTime() === t);
    if (idx >= 0) {
      m1[idx] = { ...feedLast, time: new Date(feedLast.time) };
    } else if (feedLast.time.getTime() > (m1.at(-1)?.time.getTime() ?? 0)) {
      m1.push({ ...feedLast, time: new Date(feedLast.time) });
    }
  }
  const chartSnapshot = buildResearchChartSnapshotFromBars({
    bars: m1,
    symbol: data.symbol,
    asOf: data.m1[barIndex]!.time,
    timeframe: "1",
  });
  const intel = assembleDeskMarketIntelligenceFromEngine(snap, {
    chartLastPrice: lastPrice,
    chartLastPriceSource: "research",
    chartSnapshot,
  });
  const gate = evaluateAnalysisQualityGate(intel, "DEEP_ANALYSIS");
  const pipeline = runDeskPipeline(intel.ctx, intel.state);
  const env = buildDecisionEnvelope(pipeline, intel.ctx, intel.state);
  const last = feedLast ?? null;
  return {
    label,
    stance: env.stance,
    pipelineVerdict: pipeline.decision.verdict,
    entry: pipeline.decision.entry_zone ?? env.thesis.fromWhere,
    target: pipeline.decision.target,
    invalidation: pipeline.decision.invalidation,
    thesisComplete: env.thesis.complete,
    canDeliverVerdict: gate.canDeliverVerdict,
    pdhStatus: pdStatus(intel.ctx, "pdh"),
    pdlStatus: pdStatus(intel.ctx, "pdl"),
    formingHigh: last?.high ?? null,
    formingLow: last?.low ?? null,
    lastPrice,
    envelopeFp: stableEnvFp(env),
    tradeDirection: env.read.tradeDirection,
  };
}

/** Control: request-current at bar close (full closed OHLC in structural snapshot). */
function runControlClose(data: ReplayMarketData, barIndex: number, htfMaps: ReturnType<typeof buildHtfIndexMaps>): ArmSnap {
  const eng = engineAt(data, barIndex, htfMaps);
  return decideArm(eng, data, barIndex, data.m1[barIndex]!.close, "control_bar_close");
}

/**
 * Treatment: from prior closed bar, applyTick to the decision-relevant extreme only
 * (no full rebuild). Decision is taken *at* that extreme — before a close retrace —
 * which is the event-current moment bar-close request-current can miss.
 */
function pickExtreme(bar: Bar, data: ReplayMarketData, barIndex: number): { price: number; side: "high" | "low" } {
  const lv = dailyLevels(data, barIndex);
  if (lv && crossesLevel(bar, lv.pdh) && bar.high >= lv.pdh) return { price: bar.high, side: "high" };
  if (lv && crossesLevel(bar, lv.pdl) && bar.low <= lv.pdl) return { price: bar.low, side: "low" };
  const up = bar.high - bar.open;
  const down = bar.open - bar.low;
  if (up >= down) return { price: bar.high, side: "high" };
  return { price: bar.low, side: "low" };
}

function runTreatmentExtreme(
  data: ReplayMarketData,
  barIndex: number,
  htfMaps: ReturnType<typeof buildHtfIndexMaps>
): ArmSnap {
  if (barIndex < 1) return runControlClose(data, barIndex, htfMaps);
  const bar = data.m1[barIndex]!;
  const eng = engineAt(data, barIndex - 1, htfMaps);
  const ext = pickExtreme(bar, data, barIndex);
  eng.applyTick({ price: bar.open, time: bar.time });
  eng.applyTick({ price: ext.price, time: bar.time });
  return decideArm(eng, data, barIndex, ext.price, `treatment_at_${ext.side}`);
}

function outcomeFromArm(
  arm: ArmSnap,
  future: Bar[]
): "no_trade" | "taken" | "missed" | "stopped" | "target" | "open" {
  if (flatish(arm.stance) && !(arm.stance === "wait" && arm.entry && /\d/.test(arm.entry))) {
    return "no_trade";
  }
  const entry = parseNum(arm.entry);
  const stop = arm.invalidation;
  const target = arm.target;
  if (entry == null && !directional(arm.stance)) return "no_trade";

  const isLong = arm.stance === "long" || arm.tradeDirection === "LONG" || arm.pipelineVerdict === "LONG";
  const isShort = arm.stance === "short" || arm.tradeDirection === "SHORT" || arm.pipelineVerdict === "SHORT";
  if (!isLong && !isShort && entry == null) return "no_trade";

  let taken = entry == null; // directional without zone ≈ "at market" for outcome proxy
  for (const b of future) {
    if (!taken && entry != null) {
      if (isLong && b.low <= entry && b.high >= entry) taken = true;
      if (isShort && b.low <= entry && b.high >= entry) taken = true;
    }
    if (!taken) continue;
    if (isLong) {
      if (stop != null && b.low <= stop) return "stopped";
      if (target != null && b.high >= target) return "target";
    }
    if (isShort) {
      if (stop != null && b.high >= stop) return "stopped";
      if (target != null && b.low <= target) return "target";
    }
  }
  if (!taken && entry != null) return "missed";
  if (taken) return "open";
  return "no_trade";
}

function classify(control: ArmSnap, treatment: ArmSnap, future: Bar[]): LayerFlags {
  const reasons: string[] = [];
  const stateDiff =
    control.pdhStatus !== treatment.pdhStatus ||
    control.pdlStatus !== treatment.pdlStatus ||
    (control.formingHigh != null &&
      treatment.formingHigh != null &&
      Math.abs(control.formingHigh - treatment.formingHigh) >= LIVE_EPS) ||
    (control.formingLow != null &&
      treatment.formingLow != null &&
      Math.abs(control.formingLow - treatment.formingLow) >= LIVE_EPS) ||
    control.envelopeFp !== treatment.envelopeFp;

  const stanceFlip =
    control.stance !== treatment.stance ||
    control.tradeDirection !== treatment.tradeDirection ||
    control.pipelineVerdict !== treatment.pipelineVerdict;
  const entryDiff = (control.entry ?? "") !== (treatment.entry ?? "");
  const stopDiff =
    control.invalidation != null &&
    treatment.invalidation != null &&
    Math.abs(control.invalidation - treatment.invalidation) >= LIVE_EPS;
  const stopAppear = (control.invalidation == null) !== (treatment.invalidation == null);
  const targetDiff =
    control.target != null &&
    treatment.target != null &&
    Math.abs(control.target - treatment.target) >= LIVE_EPS;
  const targetAppear = (control.target == null) !== (treatment.target == null);

  const decisionDiff = stanceFlip || entryDiff || stopDiff || stopAppear || targetDiff || targetAppear;
  if (stanceFlip) reasons.push(`stance ${control.stance}/${control.pipelineVerdict}→${treatment.stance}/${treatment.pipelineVerdict}`);
  if (entryDiff) reasons.push("entry");
  if (stopDiff || stopAppear) reasons.push("stop/invalidation");
  if (targetDiff || targetAppear) reasons.push("target");
  if (control.pdhStatus !== treatment.pdhStatus) reasons.push(`pdh ${control.pdhStatus}→${treatment.pdhStatus}`);
  if (control.pdlStatus !== treatment.pdlStatus) reasons.push(`pdl ${control.pdlStatus}→${treatment.pdlStatus}`);

  const cOut = outcomeFromArm(control, future);
  const tOut = outcomeFromArm(treatment, future);

  // Layer 3: tradable change — stance polarity / entry availability / stop / target / taken-missed-stopped-target
  const tradableStance =
    (directional(control.stance) && flatish(treatment.stance)) ||
    (flatish(control.stance) && directional(treatment.stance)) ||
    (directional(control.stance) &&
      directional(treatment.stance) &&
      control.stance !== treatment.stance);
  const entryAvailability =
    (!!parseNum(control.entry) || directional(control.stance)) !==
    (!!parseNum(treatment.entry) || directional(treatment.stance));
  const tradeOutcomeDiff =
    tradableStance ||
    entryAvailability ||
    ((stopDiff || stopAppear || targetDiff || targetAppear) && (directional(control.stance) || directional(treatment.stance))) ||
    (cOut !== tOut && (cOut !== "no_trade" || tOut !== "no_trade"));

  if (tradeOutcomeDiff) {
    reasons.push(`outcome ${cOut}→${tOut}`);
  }

  // State-only: differences that do not flip decision fields above
  const stateOnly = stateDiff && !decisionDiff;

  return {
    stateDiff: stateDiff || stateOnly,
    decisionDiff,
    tradeOutcomeDiff,
    highQuality: isHighQuality(control) || isHighQuality(treatment),
    reasons,
  };
}

function dailyLevels(data: ReplayMarketData, barIndex: number): { pdh: number; pdl: number } | null {
  const asOf = data.m1[barIndex]!.time.getTime();
  const daily = data.daily.filter((b) => b.time.getTime() <= asOf);
  if (daily.length < 2) return null;
  const prev = daily.at(-2)!;
  return { pdh: prev.high, pdl: prev.low };
}

function wickBeyondOc(bar: Bar): boolean {
  const ocHigh = Math.max(bar.open, bar.close);
  const ocLow = Math.min(bar.open, bar.close);
  return bar.high > ocHigh + LIVE_EPS || bar.low < ocLow - LIVE_EPS;
}

function crossesLevel(bar: Bar, level: number): boolean {
  return bar.low <= level && bar.high >= level;
}

function pickAug12Indices(data: ReplayMarketData): Array<{ barIndex: number; reason: string }> {
  const out: Array<{ barIndex: number; reason: string }> = [];
  const rth: number[] = [];
  // Prefer NY AM — smaller prefixes when walking early, denser structure events.
  for (let i = WARMUP; i < data.m1.length; i++) {
    const b = data.m1[i]!;
    if (getEstDateKey(b.time) !== "2026-08-12") continue;
    const m = getEstMinutes(b.time);
    if (m < 9 * 60 + 30 || m >= 11 * 60) continue;
    rth.push(i);
  }
  const sparseN = 12;
  for (let i = 0; i < sparseN && rth.length; i++) {
    const idx = rth[Math.floor(((i + 0.5) / sparseN) * rth.length)]!;
    out.push({ barIndex: idx, reason: "sparse_ny_am" });
  }
  for (const i of rth) {
    const bar = data.m1[i]!;
    const lv = dailyLevels(data, i);
    const near = lv
      ? crossesLevel(bar, lv.pdh) ||
        crossesLevel(bar, lv.pdl) ||
        Math.abs(bar.high - lv.pdh) <= 8 ||
        Math.abs(bar.low - lv.pdl) <= 8
      : false;
    if (near && wickBeyondOc(bar)) {
      out.push({ barIndex: i, reason: "pdh_pdl_wick" });
    } else if (near) {
      out.push({ barIndex: i, reason: "pdh_pdl_touch" });
    }
    if (wickBeyondOc(bar) && bar.high - bar.low >= 6) {
      out.push({ barIndex: i, reason: "wide_wick" });
    } else if (bar.high - bar.low >= 15) {
      out.push({ barIndex: i, reason: "wide_range" });
    }
  }
  const seen = new Set<number>();
  const dedup: typeof out = [];
  for (const r of out) {
    if (seen.has(r.barIndex)) continue;
    seen.add(r.barIndex);
    dedup.push(r);
  }
  return dedup;
}

function pickSyntheticIndices(data: ReplayMarketData): Array<{ barIndex: number; reason: string }> {
  const out: Array<{ barIndex: number; reason: string }> = [];
  const start = Math.min(20, Math.max(1, data.m1.length - 1));
  for (let i = start; i < data.m1.length; i += 5) {
    out.push({ barIndex: i, reason: "synthetic_sparse" });
  }
  for (let i = start; i < data.m1.length; i++) {
    if (wickBeyondOc(data.m1[i]!)) out.push({ barIndex: i, reason: "synthetic_wick" });
  }
  const seen = new Set<number>();
  return out.filter((r) => (seen.has(r.barIndex) ? false : (seen.add(r.barIndex), true)));
}

function pickWeekSparse(data: ReplayMarketData, n: number): Array<{ barIndex: number; reason: string }> {
  const out: Array<{ barIndex: number; reason: string }> = [];
  const usable = data.m1.length - WARMUP - LOOKAHEAD;
  if (usable < n) return out;
  for (let i = 0; i < n; i++) {
    const idx = WARMUP + Math.floor(((i + 0.5) / n) * usable);
    out.push({ barIndex: idx, reason: "week_sparse" });
  }
  return out;
}

function runDataset(
  source: string,
  data: ReplayMarketData,
  picks: Array<{ barIndex: number; reason: string }>,
  budgetLeft: number
): ScenarioRow[] {
  const htfMaps = buildHtfIndexMaps(data.m1, data.m5, data.m15);
  const rows: ScenarioRow[] = [];
  const take = [...picks]
    .filter((p) => p.barIndex >= 1 && p.barIndex + 1 < data.m1.length)
    .sort((a, b) => a.barIndex - b.barIndex)
    .slice(0, budgetLeft);

  let controlEng: IncrementalMarketEngine | null = null;
  let controlAt = -1;
  let treatEng: IncrementalMarketEngine | null = null;
  let treatAt = -1;

  const ensureEngine = (
    which: "control" | "treat",
    barIndex: number
  ): IncrementalMarketEngine => {
    const existing = which === "control" ? controlEng : treatEng;
    const at = which === "control" ? controlAt : treatAt;
    const bar = data.m1[barIndex]!;
    if (!existing || barIndex < at) {
      const eng = createIncrementalMarketEngine();
      const initIdx = Math.min(WARMUP, barIndex);
      const initBar = data.m1[initIdx]!;
      eng.initialize({
        data: prefixFeedAtBarIndex(data, initIdx, htfMaps),
        asOf: initBar.time,
        lastPrice: initBar.close,
      });
      if (which === "control") {
        controlEng = eng;
        controlAt = initIdx;
      } else {
        treatEng = eng;
        treatAt = initIdx;
      }
    }
    const eng = (which === "control" ? controlEng : treatEng)!;
    let cur = which === "control" ? controlAt : treatAt;
    if (barIndex !== cur) {
      eng.syncSeries({
        data: prefixFeedAtBarIndex(data, barIndex, htfMaps),
        asOf: bar.time,
        lastPrice: bar.close,
      });
      if (which === "control") controlAt = barIndex;
      else treatAt = barIndex;
    }
    return eng;
  };

  for (let i = 0; i < take.length; i++) {
    const { barIndex, reason } = take[i]!;
    const bar = data.m1[barIndex]!;
    const t0 = performance.now();
    try {
      const cEng = ensureEngine("control", barIndex);
      const control = decideArm(cEng, data, barIndex, bar.close, "control_bar_close");

      const tEng = ensureEngine("treat", barIndex - 1);
      const ext = pickExtreme(bar, data, barIndex);
      tEng.applyTick({ price: bar.open, time: bar.time });
      tEng.applyTick({ price: ext.price, time: bar.time });
      const treatment = decideArm(tEng, data, barIndex, ext.price, `treatment_at_${ext.side}`);

      const future = data.m1.slice(barIndex + 1, barIndex + 1 + LOOKAHEAD);
      const layers = classify(control, treatment, future);
      rows.push({
        source,
        barIndex,
        asOf: bar.time.toISOString(),
        pickReason: reason,
        control,
        treatment,
        layers,
      });
      if ((i + 1) % 3 === 0 || i === take.length - 1) {
        const m = memMb();
        console.error(
          `  ${source} ${i + 1}/${take.length} last=${Math.round(performance.now() - t0)}ms rss=${m.rss}MB ` +
            `c=${control.stance}/${control.pipelineVerdict} t=${treatment.stance}/${treatment.pipelineVerdict} ` +
            `hq=${layers.highQuality} state=${layers.stateDiff} dec=${layers.decisionDiff} out=${layers.tradeOutcomeDiff}`
        );
      }
    } catch (e) {
      console.error(
        `  ${source} FAIL bar=${barIndex} ${bar.time.toISOString()}: ${e instanceof Error ? e.message : String(e)}`
      );
      // Reset engines so a poison bar does not cascade.
      controlEng = null;
      controlAt = -1;
      treatEng = null;
      treatAt = -1;
    }
    if (memMb().rss > 7000) {
      console.error(`  RAM guard — stopping ${source} early at ${rows.length}`);
      break;
    }
  }
  return rows;
}

function pct(n: number, d: number): string {
  if (d <= 0) return "n/a";
  return `${((100 * n) / d).toFixed(1)}%`;
}

function formatReport(input: {
  rows: ScenarioRow[];
  mem0: ReturnType<typeof memMb>;
  mem1: ReturnType<typeof memMb>;
  elapsedMs: number;
  limits: string[];
}): string {
  const { rows } = input;
  const n = rows.length;
  const stateN = rows.filter((r) => r.layers.stateDiff).length;
  const decN = rows.filter((r) => r.layers.decisionDiff).length;
  const outN = rows.filter((r) => r.layers.tradeOutcomeDiff).length;
  const hq = rows.filter((r) => r.layers.highQuality);
  const hqOut = hq.filter((r) => r.layers.tradeOutcomeDiff).length;
  const hqDec = hq.filter((r) => r.layers.decisionDiff).length;

  const bySource = new Map<string, number>();
  for (const r of rows) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1);

  const examples = rows
    .filter((r) => r.layers.decisionDiff || r.layers.tradeOutcomeDiff)
    .slice(0, 12);

  const stateOnly = rows.filter((r) => r.layers.stateDiff && !r.layers.decisionDiff && !r.layers.tradeOutcomeDiff);

  // Go/no-go: layer 3 (+ clear layer 2 that implies tradable change). Do not use n=1 PDH probe.
  const meaningfulShare = n > 0 ? outN / n : 0;
  const hqMeaningful = hq.length > 0 ? hqOut / hq.length : 0;
  let goNoGoChat: string;
  let goNoGoAuto: string;
  if (n < 10) {
    goNoGoChat = "INCONCLUSIVE (sample too small) — keep request-current for chat pending larger n.";
    goNoGoAuto = "INCONCLUSIVE — do not build tick/event layer from this sample alone.";
  } else if (meaningfulShare <= 0.02 && hqMeaningful <= 0.05) {
    goNoGoChat = "NO-GO for tick/event layer in chat — keep request-current (trade-outcome diffs ≤ ~2%).";
    goNoGoAuto =
      outN === 0
        ? "NO-GO for automation tick layer from this OHLC sample (0 trade-outcome diffs). Still insufficient for robots as a risk architecture, but this study does not justify building the layer yet."
        : "WEAK evidence only — automation may still want event state for risk, but OHLC sample does not show a significant high-quality flip rate.";
  } else if (hqMeaningful >= 0.15 || meaningfulShare >= 0.1) {
    goNoGoChat =
      "NO-GO for a chat tick/event layer — keep request-current for copilot UX. Layer-3 flips exist, but they are mid-bar vs bar-close timing; a trader who asks at the close already sees closed OHLC. Do not rebuild every tick for chat feel.";
    goNoGoAuto =
      n < 30 || hq.length < 10
        ? "SOFT-GO / provisional — trade-outcome and HQ flip rates are elevated in this small sample, enough to keep an automation event-state layer on the roadmap, not enough to start building without a larger real-CME (week) pass."
        : "GO evidence for automation risk layer (fast tick/event state + structural snapshot) — significant high-quality / trade-outcome share.";
  } else {
    goNoGoChat = "NO-GO for chat tick layer — keep request-current; differences exist but are not a chat-UX mandate.";
    goNoGoAuto = "SOFT-GO / measure more — some trade-outcome diffs; not yet a 'significant share of high-quality setups' clear GO.";
  }

  return `# Karen request-current vs event-current impact study

**Date:** ${new Date().toISOString().slice(0, 10)}  
**Mode:** measurement only — no tick engine, no architecture-v1 / trading-logic / ICT / live-reuse / SSE changes. No OpenAI.  
**Script:** \`scripts/research-request-vs-event-impact.ts\`

---

## Question

Would simulated event-driven intra-bar H/L (and level crosses) change enough **tradable outcomes** vs today’s **request-current** bar-close reads to justify a tick/event layer?

---

## Arms

| Arm | Definition |
|---|---|
| **Control** | Request-current at **1m bar close**: incremental engine initialized on prefix through bar \`i\` (full closed OHLC + last print = close). Fingerprint semantics of live reuse are the product default; this arm is the sparse “ask at the close” checkpoint. |
| **Treatment** | From structural snapshot at \`i-1\`, \`applyTick(open)\` then \`applyTick\` to the decision-relevant extreme (PDH/PDL touch side if any, else larger wick side) on the incremental path (**no** \`initialize\` every event). Decision taken **at** that extreme before close retrace. |

**OHLC limit (labeled):** 1m bars cannot reconstruct ticks that never appear as high/low. Treatment uses bar H/L as the intra-bar extreme — this **overstates** what a last-print overlay might have seen and **understates** a true tick path inside the bar.

**Excluded from go/no-go:** the prior synthetic PDH probe (30214→30217, n=1 state-only) from \`karen-live-decision-freshness.md\`.

---

## High-quality definition

A scenario is **high-quality** if either arm has:

1. \`canDeliverVerdict === true\` (quality gate), **or**
2. stance \`long\`/\`short\` with an entry zone, **or**
3. stance \`wait\` with a numeric entry zone

---

## Layer definitions

| Layer | Counts when |
|---|---|
| **1. STATE** | PDH/PDL status, forming H/L (≥0.25), or non-trade envelope fingerprint fields differ |
| **2. DECISION** | Stance / pipeline verdict / trade direction / entry / stop / target differ |
| **3. TRADE-OUTCOME** | Tradable change: LONG/SHORT vs FLAT/WAIT/MONITOR, entry availability, material stop/target on a directional arm, or lookahead proxy taken/missed/stopped/target differs (\`LOOKAHEAD=${LOOKAHEAD}\` bars) |

Meaningful for go/no-go = **(3)** and/or clear **(2)** that implies tradable change (already folded into layer-3 flags).

---

## Counts (primary result)

| Metric | Count | Share |
|---|---:|---:|
| **Total scenarios** | **${n}** | 100% |
| **State differences** | **${stateN}** | ${pct(stateN, n)} |
| **Decision differences** | **${decN}** | ${pct(decN, n)} |
| **Trade-outcome differences** | **${outN}** | ${pct(outN, n)} |
| **High-quality scenarios** | **${hq.length}** | ${pct(hq.length, n)} |
| **High-quality ∩ decision diff** | **${hqDec}** | ${pct(hqDec, hq.length)} of HQ |
| **High-quality ∩ trade-outcome diff** | **${hqOut}** | ${pct(hqOut, hq.length)} of HQ |
| State-only (no decision/outcome) | ${stateOnly.length} | ${pct(stateOnly.length, n)} |

### By fixture

| Source | n | state | decision | trade-outcome | HQ |
|---|---:|---:|---:|---:|---:|
${[...bySource.entries()]
  .map(([k]) => {
    const rs = rows.filter((r) => r.source === k);
    return `| ${k} | ${rs.length} | ${rs.filter((r) => r.layers.stateDiff).length} | ${rs.filter((r) => r.layers.decisionDiff).length} | ${rs.filter((r) => r.layers.tradeOutcomeDiff).length} | ${rs.filter((r) => r.layers.highQuality).length} |`;
  })
  .join("\n")}

---

## Go / no-go (measurement recommendation)

| Product | Recommendation |
|---|---|
| **Chat copilot** | ${goNoGoChat} |
| **Automation / robots** | ${goNoGoAuto} |

Decision rule from roadmap: ~1–2% trade-outcome → keep request-current for chat; significant high-quality miss/flip → evidence for tick/event layer primarily for automation.

---

## Limits / honesty

${input.limits.map((l) => `- ${l}`).join("\n")}
- Wall time: ${(input.elapsedMs / 1000).toFixed(1)}s; RSS ${input.mem0.rss}→${input.mem1.rss} MB; heap ${input.mem0.heap}→${input.mem1.heap} MB.
- Cap: MAX_SCENARIOS=${MAX_SCENARIOS}, warmup=${WARMUP}.
- Aug12 candidate-filter history: sparse architecture-v1 stance mix can be mostly wait/flat — empty LONG/SHORT must **not** be read as proof intra-bar events never matter.
- No live Yahoo/Tickstream; no full rebuild every minute of the week as a “tick simulation.”

---

## Example diffs (decision or outcome)

${
  examples.length === 0
    ? "_None in this sample._"
    : examples
        .map(
          (r) =>
            `- **${r.source}** \`${r.asOf}\` (${r.pickReason}): control \`${r.control.stance}/${r.control.pipelineVerdict}\` pdh=${r.control.pdhStatus} → treatment \`${r.treatment.stance}/${r.treatment.pipelineVerdict}\` pdh=${r.treatment.pdhStatus}; layers state=${r.layers.stateDiff} dec=${r.layers.decisionDiff} out=${r.layers.tradeOutcomeDiff}; ${r.layers.reasons.join(", ") || "—"}`
        )
        .join("\n")
}

---

## Method note

Per scenario the control arm is a **bar-close** request. Treatment evaluates **at** the intra-bar extreme (high or low) via \`applyTick\` from the prior snapshot — not after both extremes and a close fill. When close already matches the extreme print (doji at high/low), arms can still match; provisional mid-bar tags (e.g. forming \`CLOSED_BEYOND\` vs close \`BREACHED\`) are the intended layer-1/2 signal.

The live fingerprint HIT that **skips** applying Yahoo forming high while last print is unchanged is a **different** failure mode (freshness n=1). This study does not re-count that single PDH example as layer-3 evidence.
`;
}

async function main() {
  ensureResearchFixtures();
  const mem0 = memMb();
  const t0 = performance.now();
  const limits: string[] = [];
  const all: ScenarioRow[] = [];

  console.error("Loading fixtures…");
  const synthetic = loadReplayFixture("synthetic-ny-am");
  const aug12 = loadResearchDatasetFixture("nq-aug12-2026-cme");
  limits.push(
    "Week fixture (nq-week-aug05-aug12-2026-cme, 6880×1m) not loaded this pass — WEEK_CAP=0 to bound RAM/time after synthetic+aug12."
  );

  const synPicks = pickSyntheticIndices(synthetic).slice(0, SYNTHETIC_CAP);
  console.error(`synthetic picks ${synPicks.length}`);
  all.push(...runDataset("synthetic-ny-am", synthetic, synPicks, Math.min(SYNTHETIC_CAP, MAX_SCENARIOS - all.length)));
  writeFileSync(
    REPORT_PATH,
    formatReport({ rows: all, mem0, mem1: memMb(), elapsedMs: performance.now() - t0, limits: [...limits, "partial: after synthetic"] }),
    "utf8"
  );

  const augPicks = pickAug12Indices(aug12);
  console.error(`aug12 picks ${augPicks.length} (before cap)`);
  augPicks.sort((a, b) => {
    const rank = (r: string) => (r.startsWith("pdh") ? 0 : r === "wide_wick" || r === "wide_range" ? 1 : 2);
    return rank(a.reason) - rank(b.reason);
  });
  all.push(
    ...runDataset(
      "nq-aug12-2026-cme",
      aug12,
      augPicks.slice(0, AUG12_CAP),
      Math.min(AUG12_CAP, MAX_SCENARIOS - all.length)
    )
  );

  limits.push(
    "Fairness: treatment extremes are bar H/L events, not true ticks; control is bar-close request-current, not mid-bar last-print-only HIT skip."
  );
  if (all.length < 30) {
    limits.push(`Sample n=${all.length} is modest; percentages are descriptive of this sample only — do not invent precision.`);
  }

  const mem1 = memMb();
  const elapsedMs = performance.now() - t0;
  const md = formatReport({ rows: all, mem0, mem1, elapsedMs, limits });
  writeFileSync(REPORT_PATH, md, "utf8");

  const stateN = all.filter((r) => r.layers.stateDiff).length;
  const decN = all.filter((r) => r.layers.decisionDiff).length;
  const outN = all.filter((r) => r.layers.tradeOutcomeDiff).length;
  const hqN = all.filter((r) => r.layers.highQuality).length;
  console.log(
    JSON.stringify(
      {
        total: all.length,
        stateDifferences: stateN,
        decisionDifferences: decN,
        tradeOutcomeDifferences: outN,
        highQuality: hqN,
        report: REPORT_PATH,
        elapsedMs: Math.round(elapsedMs),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
