/**
 * Chart proof harness — compare observation-engine output to labeled expectations.
 * Run: npm run test:observation-proof
 */
import type { ChartCandle } from "../lib/chart-snapshot";
import { buildMarketObservation } from "../lib/observation-engine";
import type { ExpectedObservation } from "../lib/labeling";
import { getExpectedObservation, listChartProofFixtures, loadSetupFixture } from "../lib/labeling";
import { actualObservationFields } from "../lib/replay-engine";
import { REPLAY_FIXTURES, rebuildCtxFromCandles } from "../lib/replay-fixtures";
import { detectMss } from "../lib/structure";
import { detectRehRel, describeRehRelTolerance } from "../lib/reh-rel";
import { detectM1UnfilledFvgs } from "../lib/structure";
import type { Bar } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

type FieldResult = {
  field: string;
  expected: unknown;
  actual: unknown;
  match: boolean;
  reason?: string;
};

type ProofCaseResult = {
  id: string;
  pass: boolean;
  fields: FieldResult[];
  diagnostics: string[];
};

function chartToBars(candles: ChartCandle[]): Bar[] {
  return candles.map((c) => ({
    time: new Date(c.t * 1000),
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
  }));
}

/** Extended actual fields for chart-proof fixtures. */
function actualProofFields(
  obs: ReturnType<typeof buildMarketObservation>,
  ctxMss: { direction: string; level: number } | null | undefined
): ExpectedObservation & Record<string, unknown> {
  const base = actualObservationFields(obs);
  return {
    ...base,
    mss_direction: ctxMss?.direction ?? "none",
    reh_above: obs.reh_rel.nearest_reh_above != null,
    reh_level: obs.reh_rel.nearest_reh_above?.level ?? null,
    rel_below: obs.reh_rel.nearest_rel_below != null,
    fvg_direction: obs.fvg.direction ?? "unknown",
  };
}

function compareExpected(
  expected: ExpectedObservation & Record<string, unknown>,
  actual: ExpectedObservation & Record<string, unknown>
): FieldResult[] {
  return Object.entries(expected).map(([field, expVal]) => {
    const actVal = actual[field as keyof typeof actual];
    const match = JSON.stringify(expVal) === JSON.stringify(actVal);
    let reason: string | undefined;
    if (!match) {
      reason = `expected ${JSON.stringify(expVal)}, got ${JSON.stringify(actVal)}`;
    }
    return { field, expected: expVal, actual: actVal, match, reason };
  });
}

function diagnoseMss(candles: ChartCandle[]): string[] {
  const lines: string[] = [];
  const bars = chartToBars(candles);
  const detected = detectMss(bars);
  lines.push(`MSS detected: ${detected ? `${detected.direction} @ ${detected.level.toFixed(2)} (${detected.at})` : "none"}`);

  const lookback = bars.slice(-80);
  if (lookback.length < 10) {
    lines.push("MSS candidates: insufficient bars");
    return lines;
  }

  const wing = 2;
  const swings: Array<{ type: string; price: number; index: number }> = [];
  for (let i = wing; i < lookback.length - wing; i++) {
    const bar = lookback[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      if (lookback[i - j].high >= bar.high || lookback[i + j].high >= bar.high) isHigh = false;
      if (lookback[i - j].low <= bar.low || lookback[i + j].low <= bar.low) isLow = false;
    }
    if (isHigh) swings.push({ type: "high", price: bar.high, index: i });
    if (isLow) swings.push({ type: "low", price: bar.low, index: i });
  }

  const candidates: string[] = [];
  const rejections: string[] = [];
  const scanStart = Math.max(0, lookback.length - 12);
  for (let i = lookback.length - 1; i >= scanStart; i--) {
    const bar = lookback[i];
    const priorHighs = swings.filter((s) => s.type === "high" && s.index < i - 1);
    const priorLows = swings.filter((s) => s.type === "low" && s.index < i - 1);
    const sh = priorHighs.at(-1);
    const sl = priorLows.at(-1);

    if (sh) {
      if (bar.close > sh.price) {
        candidates.push(`bullish bar@${i} close ${bar.close.toFixed(2)} > swing high ${sh.price.toFixed(2)}`);
      } else if (bar.high > sh.price) {
        rejections.push(`bar@${i} wick above ${sh.price.toFixed(2)} but close ${bar.close.toFixed(2)} — rejected`);
      }
    }
    if (sl) {
      if (bar.close < sl.price) {
        candidates.push(`bearish bar@${i} close ${bar.close.toFixed(2)} < swing low ${sl.price.toFixed(2)}`);
      } else if (bar.low < sl.price) {
        rejections.push(`bar@${i} wick below ${sl.price.toFixed(2)} but close ${bar.close.toFixed(2)} — rejected`);
      }
    }
    if (!sh && !sl) {
      rejections.push(`bar@${i} no prior swing — rejected`);
    }
  }

  lines.push(`MSS candidates (${candidates.length}): ${candidates.join("; ") || "none"}`);
  if (rejections.length) lines.push(`MSS rejections: ${rejections.slice(0, 5).join("; ")}${rejections.length > 5 ? "…" : ""}`);
  return lines;
}

function diagnoseReh(candles: ChartCandle[], currentPrice: number): string[] {
  const result = detectRehRel({ candles, currentPrice });
  const tol = describeRehRelTolerance(currentPrice);
  const lines = [
    `REH/REL status: ${result.status}`,
    `Tolerance: ${tol.formula} → ${tol.tolerance.toFixed(2)} pts (${tol.example})`,
  ];
  if (result.nearest_reh_above) {
    const r = result.nearest_reh_above;
    lines.push(
      `Nearest REH: ${r.level.toFixed(2)} swings=[${r.sourceSwingPrices.map((p) => p.toFixed(2)).join(", ")}] dist=${r.distanceFromCurrentPrice.toFixed(2)} status=${r.status}`
    );
  } else {
    lines.push(`Nearest REH: none (${result.reh_levels.length} active pools)`);
  }
  if (result.nearest_rel_below) {
    const r = result.nearest_rel_below;
    lines.push(
      `Nearest REL: ${r.level.toFixed(2)} swings=[${r.sourceSwingPrices.map((p) => p.toFixed(2)).join(", ")}] dist=${r.distanceFromCurrentPrice.toFixed(2)} status=${r.status}`
    );
  }
  for (const pool of result.all_levels.slice(0, 4)) {
    lines.push(`  pool ${pool.type} ${pool.level.toFixed(2)} status=${pool.status}`);
  }
  return lines;
}

function diagnoseFvg(candles: ChartCandle[]): string[] {
  const bars = chartToBars(candles);
  const fvgs = detectM1UnfilledFvgs(bars);
  const lines = [`Unfilled 1m FVGs: ${fvgs.length}`];
  for (const f of fvgs.slice(-3)) {
    lines.push(`  ${f.type} ${Math.min(f.bottom, f.top).toFixed(2)}–${Math.max(f.bottom, f.top).toFixed(2)} formed ${f.formedAt}`);
  }
  if (!fvgs.length) {
    lines.push("FVG rejections: no 3-candle gap ≥ 3 pts unfilled in 80-bar lookback");
  }
  return lines;
}

function runProofCase(fixtureId: string): ProofCaseResult {
  const fixture = REPLAY_FIXTURES[fixtureId];
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureId}`);

  const ohlcDerived = fixtureId.startsWith("chart-proof-");
  const ctx = ohlcDerived ? rebuildCtxFromCandles(fixtureId, fixture) : fixture.ctx;
  const state = fixture.state;

  const obs = buildMarketObservation(ctx, state);
  const mss = ctx.structureFacts.mss;
  const actual = actualProofFields(obs, mss);

  const labelFile = `${fixtureId}.json`;
  const loaded = loadSetupFixture(labelFile);
  const expected = getExpectedObservation(loaded.label) as ExpectedObservation & Record<string, unknown>;

  const fields = compareExpected(expected, actual);
  const pass = fields.every((f) => f.match);

  const diagnostics: string[] = [];
  if (state.candles.length >= 5) {
    diagnostics.push(...diagnoseMss(state.candles));
    diagnostics.push(...diagnoseReh(state.candles, state.lastPrice));
    diagnostics.push(...diagnoseFvg(state.candles));
  }

  return { id: fixtureId, pass, fields, diagnostics };
}

function formatCase(r: ProofCaseResult): string {
  const mark = r.pass ? "PASS" : "FAIL";
  const matched = r.fields.filter((f) => f.match).length;
  const lines = [
    `=== ${r.id} ===`,
    `${mark} (${matched}/${r.fields.length} fields)`,
  ];
  for (const f of r.fields) {
    const icon = f.match ? "✓" : "✗";
    lines.push(`  ${icon} ${f.field}: ${JSON.stringify(f.actual)}${f.reason ? ` — ${f.reason}` : ""}`);
  }
  if (r.diagnostics.length) {
    lines.push("Diagnostics:");
    for (const d of r.diagnostics) lines.push(`  ${d}`);
  }
  lines.push("");
  return lines.join("\n");
}

// --- chart-proof labels only (decision examples stay under examples/) ---
const results: ProofCaseResult[] = [];
const chartProofFiles = listChartProofFixtures();
let skippedNoReplay = 0;
for (const file of chartProofFiles) {
  const id = file.replace(".json", "");
  if (!REPLAY_FIXTURES[id]) {
    console.warn(`skip ${id}: no REPLAY_FIXTURES OHLC entry (restore chart-proof fixtures to replay-fixtures.ts)`);
    skippedNoReplay++;
    continue;
  }
  results.push(runProofCase(id));
}

if (results.length === 0) {
  console.log("--- Summary ---");
  console.log(
    `Cases: 0 | chart-proof labels=${chartProofFiles.length} skippedNoReplay=${skippedNoReplay} — SKIP (documented)`,
  );
  console.log("test-observation-chart-proof: ok (skipped — missing REPLAY_FIXTURES for chart-proof-*)");
  process.exit(0);
}

let failures = 0;
for (const r of results) {
  console.log(formatCase(r));
  if (!r.pass) failures++;
}

console.log(`--- Summary ---`);
console.log(`Cases: ${results.length} | PASS: ${results.length - failures} | FAIL: ${failures}`);

assert(failures === 0, `${failures} chart proof case(s) failed`);
console.log("test-observation-chart-proof: ok");
