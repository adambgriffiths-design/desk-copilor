import {
  formatChartSnapshotForPrompt,
  hasStructuredChartData,
  hydrateChartSnapshotFromBars,
  isChartQualityUsable,
  parseChartSnapshotInput,
  scoreChartQuality,
} from "../lib/chart-snapshot";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const sample = parseChartSnapshotInput({
  ok: true,
  symbol: "MNQ1!",
  timeframe: "1",
  lastPrice: 25100.25,
  source: "tv_export",
  visibleRange: { from: 1700000000, to: 1700002000 },
  candles: Array.from({ length: 30 }, (_, i) => ({
    t: 1700000000 + i * 60,
    o: 25090 + i * 0.25,
    h: 25105 + i * 0.25,
    l: 25085 + i * 0.25,
    c: 25100 + i * 0.25,
    v: 1200,
  })),
  drawings: [{ type: "horizontal_line", price: 25120, label: "resistance" }],
  quality: "good",
  qualityMeta: { quality: "good", reasons: [], candleCount: 30, drawingCount: 1 },
});

assert(sample != null, "parses snapshot");
assert(hasStructuredChartData(sample), "30 candles qualifies");
assert(sample!.candles.length === 30, "candles preserved");
assert(sample!.drawings.length === 1, "drawings preserved");

const prompt = formatChartSnapshotForPrompt(sample!);
assert(prompt.includes("STRUCTURED CHART DATA"), "prompt header");
assert(prompt.includes("Step-by-step"), "reasoning instruction");
assert(prompt.includes("25120"), "drawing price in prompt");

const weak = parseChartSnapshotInput({ ok: false, candles: [{ t: 1, o: 1, h: 1, l: 1, c: 1 }] });
assert(!hasStructuredChartData(weak), "bad prices rejected");
assert(isChartQualityUsable({ quality: "partial", reasons: [], candleCount: 25, drawingCount: 0 }), "partial usable");

const emptySnap = parseChartSnapshotInput({
  ok: false,
  source: "none",
  reason: "widget_not_found",
  candles: [],
  drawings: [{ type: "horizontal_line", price: 30210, label: "Relative Equal Lows" }],
  lastPrice: 30216.5,
});
const bars = Array.from({ length: 40 }, (_, i) => ({
  time: new Date((1_700_000_000 + i * 60) * 1000),
  open: 30100 + i,
  high: 30110 + i,
  low: 30090 + i,
  close: 30105 + i,
}));
const hydrated = hydrateChartSnapshotFromBars(emptySnap, bars, { lastPrice: 30216.5 });
assert(hydrated != null && hasStructuredChartData(hydrated), "yahoo hydrate qualifies structured");
assert(hydrated!.source === "yahoo_fallback", "hydrate source yahoo_fallback");
assert(hydrated!.lastPrice === 30216.5, "keeps live last");
assert(hydrated!.drawings.some((d) => /equal lows/i.test(d.label || "")), "keeps overlay REL");
assert(scoreChartQuality(hydrated!).quality === "degraded", "hydrated quality degraded");

console.log("test-chart-snapshot: ok");
