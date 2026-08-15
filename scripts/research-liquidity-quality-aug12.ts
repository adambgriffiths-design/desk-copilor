/**
 * PIT liquidity-quality audit on real NQ Aug 12 CME 1m.
 * Research overlay only (detectEqhEqlLiquidity / hierarchy v2).
 * Does not modify production lib/reh-rel.ts or trading.
 *
 * Run: npx tsx scripts/research-liquidity-quality-aug12.ts
 */
import fs from "fs";
import path from "path";
import type { Bar } from "../lib/types";
import {
  barsInEstWindow,
  formatEst,
  getEstDateKey,
  getEstMinutes,
} from "../lib/market-data";
import { resolveSessionContext } from "../lib/sessions";
import {
  detectEqhEqlLiquidity,
  isDisplayedLiquidityRole,
  sameRecognizableArea,
  visualAreaPad,
  type EqhEqlLiquidity,
  type EqhEqlPool,
  type EqhEqlSwing,
  type LiquidityRole,
  type RejectedEqhEql,
} from "../lib/research/eqh-eql-liquidity";
import { RESEARCH_DATA_ROOT, RESEARCH_FIXTURES_DIR } from "../lib/research/paths";

const FIXTURE_ID = "nq-aug12-2026-cme";
const LOOKBACK = 720; // live incremental-market-engine overlay
const LIVE_MAX_PER_SIDE = 8;
const AUDIT_MAX_PER_SIDE = 32;
const AUDIT_MAX_REJECTED = 80;
const LIVE_CLUSTER_NOTE = {
  prices: [30218, 30221, 30224, 30227],
  instrument: "MNQU2026",
  asOf: "2026-08-14",
  source: "data/research/eqh-eql-mnqu2026-4rel-cluster.json",
};

const OUT_DIR = path.join(RESEARCH_DATA_ROOT, "liquidity-quality-aug12");
const SNAP_PATH = path.join(OUT_DIR, "snapshots.jsonl");
const SUMMARY_PATH = path.join(OUT_DIR, "summary.json");
const REPORT_PATH = path.join(
  process.cwd(),
  "data",
  "supervisor",
  "results",
  "research-liquidity-quality-aug12.md"
);

type SnapSwing = {
  id: string;
  type: "high" | "low";
  price: number;
  ts: number;
  confirmTs: number;
  confirmDelayBars: number;
  prominence: number;
  prominenceTicks: number;
};

type SnapCandidate = {
  id: string;
  kind: "eqh" | "eql";
  layer: string;
  role: LiquidityRole | "REJECTED";
  status: string;
  lifecycle: string;
  level: number;
  range: { low: number; high: number };
  drawn: boolean;
  liveDrawn: boolean;
  swingIds: string[];
  swingPrices: number[];
  formationTs: number;
  confirmationTs: number;
  why: string;
  whyImportant: string;
  whyNotNearby: string;
  whyDetection: string;
  visualClass: string;
  structuralPriority: number;
  importance: string;
  failedTests: string[];
};

type NamedExternal = { name: string; kind: "high" | "low"; price: number };

type FailCounts = {
  overlappingDisplayedSameArea: number;
  duplicateDisplayedLevels: number;
  minorPromoted: number;
  majorIgnored: number;
  externalCoincidence: number;
  sweptStillActive: number;
  staleActive: number;
  roleChangeNoNewSwingNoInteract: number;
  pitLeak: number;
  noExplanation: number;
};

const ZERO_FAIL: FailCounts = {
  overlappingDisplayedSameArea: 0,
  duplicateDisplayedLevels: 0,
  minorPromoted: 0,
  majorIgnored: 0,
  externalCoincidence: 0,
  sweptStillActive: 0,
  staleActive: 0,
  roleChangeNoNewSwingNoInteract: 0,
  pitLeak: 0,
  noExplanation: 0,
};

function loadBars(): { bars: Bar[]; manifest: Record<string, unknown> } {
  const dir = path.join(RESEARCH_FIXTURES_DIR, FIXTURE_ID);
  const candlesPath = path.join(dir, "candles.json");
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(candlesPath)) {
    throw new Error(`Aug 12 dataset missing: ${candlesPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(candlesPath, "utf8")) as Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }>;
  const bars: Bar[] = raw.map((b) => ({
    time: new Date(b.timestamp * 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  return { bars, manifest };
}

function unixSec(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function fmtTs(sec: number): string {
  return formatEst(new Date(sec * 1000));
}

function prevDateKey(key: string): string {
  const d = new Date(`${key}T12:00:00-04:00`);
  d.setDate(d.getDate() - 1);
  return getEstDateKey(d);
}

function hl(windowBars: Bar[]): { high: number; low: number } | null {
  if (!windowBars.length) return null;
  return {
    high: Math.max(...windowBars.map((b) => b.high)),
    low: Math.min(...windowBars.map((b) => b.low)),
  };
}

/** Named session extremes from bars ≤ T only. Not PDH-taken logic. */
function namedExternalsAt(bars: Bar[], asOfIndex: number): NamedExternal[] {
  const slice = bars.slice(0, asOfIndex + 1);
  const asOf = slice[asOfIndex]!.time;
  const today = getEstDateKey(asOf);
  const yesterday = prevDateKey(today);
  const asia = [
    ...barsInEstWindow(slice, 18 * 60, 24 * 60, yesterday),
    ...barsInEstWindow(slice, 0, 60, today),
  ];
  const london = barsInEstWindow(slice, 2 * 60, 5 * 60, today);
  const nyPre = barsInEstWindow(slice, 7 * 60, 9 * 60 + 30, today);
  const nyRth = barsInEstWindow(slice, 9 * 60 + 30, 16 * 60, today);
  const nyPm = barsInEstWindow(slice, 13 * 60, 16 * 60, today);
  const out: NamedExternal[] = [];
  const add = (name: string, w: Bar[]) => {
    const x = hl(w);
    if (!x) return;
    out.push({ name: `${name} High`, kind: "high", price: x.high });
    out.push({ name: `${name} Low`, kind: "low", price: x.low });
  };
  add("Asia", asia);
  add("London", london);
  add("NY Pre", nyPre);
  add("NY RTH", nyRth);
  add("NY PM", nyPm);
  return out;
}

function scopedBars(bars: Bar[], asOfIndex: number): Bar[] {
  const start = Math.max(0, asOfIndex - LOOKBACK + 1);
  return bars.slice(start, asOfIndex + 1);
}

function compactSwing(s: EqhEqlSwing): SnapSwing {
  return {
    id: s.id,
    type: s.type,
    price: s.price,
    ts: s.barTime,
    confirmTs: s.confirmationTime,
    confirmDelayBars: s.confirmationDelayBars,
    prominence: s.prominence,
    prominenceTicks: s.prominenceTicks,
  };
}

function liveDrawnIds(liq: EqhEqlLiquidity): Set<string> {
  const eqh = liq.displayed.filter((p) => p.kind === "eqh").slice(0, LIVE_MAX_PER_SIDE);
  const eql = liq.displayed.filter((p) => p.kind === "eql").slice(0, LIVE_MAX_PER_SIDE);
  return new Set([...eqh, ...eql].map((p) => p.id));
}

function fromPool(
  p: EqhEqlPool,
  live: Set<string>,
  roleOverride?: LiquidityRole
): SnapCandidate {
  const role = roleOverride ?? p.liquidityRole;
  const drawn = isDisplayedLiquidityRole(role);
  return {
    id: p.id,
    kind: p.kind,
    layer: p.liquidityLayer,
    role,
    status: p.status,
    lifecycle: p.lifecycle,
    level: p.level,
    range: p.range,
    drawn,
    liveDrawn: live.has(p.id) && drawn,
    swingIds: p.swings.map((s) => s.id),
    swingPrices: p.swings.map((s) => s.price),
    formationTs: p.formationTime,
    confirmationTs: p.confirmationTime,
    why: p.why || "",
    whyImportant: p.whyImportant || "",
    whyNotNearby: p.whyNotNearby || "",
    whyDetection: p.whyDetection || "",
    visualClass: p.visualClass,
    structuralPriority: p.structuralPriority,
    importance: p.importance,
    failedTests: [],
  };
}

function fromRejected(r: RejectedEqhEql, i: number): SnapCandidate {
  const prices = r.prices.length ? r.prices : r.swings.map((s) => s.price);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  return {
    id: `rejected_${r.kind}_${i}_${low.toFixed(2)}`,
    kind: r.kind,
    layer: "NOISE",
    role: "REJECTED",
    status: "rejected",
    lifecycle: "INVALIDATED",
    level: r.kind === "eql" ? low : high,
    range: { low, high },
    drawn: false,
    liveDrawn: false,
    swingIds: r.swings.map((s) => `rej_${s.barTime}_${s.price}`),
    swingPrices: r.swings.map((s) => s.price),
    formationTs: r.swings[1]?.confirmationTime ?? r.swings[0]?.confirmationTime ?? 0,
    confirmationTs: Math.max(0, ...r.swings.map((s) => s.confirmationTime || 0)),
    why: r.why || "",
    whyImportant: "",
    whyNotNearby: "",
    whyDetection: "",
    visualClass: r.visualClass,
    structuralPriority: 0,
    importance: "LOW",
    failedTests: r.failedTests ?? [],
  };
}

function allCandidates(liq: EqhEqlLiquidity): SnapCandidate[] {
  const live = liveDrawnIds(liq);
  const out: SnapCandidate[] = [];
  for (const p of liq.pools) out.push(fromPool(p, live));
  for (const p of liq.internal) out.push(fromPool(p, live, "INTERNAL"));
  for (let i = 0; i < liq.rejected.length; i++) {
    out.push(fromRejected(liq.rejected[i]!, i));
  }
  return out;
}

function pitLeak(liq: EqhEqlLiquidity, cutoffSec: number): boolean {
  const swings = [...liq.rawSwings.highs, ...liq.rawSwings.lows];
  if (swings.some((s) => s.confirmationTime > cutoffSec + 1)) return true;
  if (liq.pools.some((p) => p.swings.some((s) => s.confirmationTime > cutoffSec + 1))) {
    return true;
  }
  return false;
}

function independentlySwept(
  kind: "eqh" | "eql",
  level: number,
  bars: Bar[],
  fromTs: number,
  asOfIndex: number
): boolean {
  for (let i = 0; i <= asOfIndex; i++) {
    const b = bars[i]!;
    if (unixSec(b.time) <= fromTs) continue;
    if (kind === "eqh" && b.high > level + 1e-9) return true;
    if (kind === "eql" && b.low < level - 1e-9) return true;
  }
  return false;
}

function overlappingSameAreaPairs(
  displayed: EqhEqlPool[],
  scoped: Bar[],
  liq: EqhEqlLiquidity
): Array<[EqhEqlPool, EqhEqlPool]> {
  const pairs: Array<[EqhEqlPool, EqhEqlPool]> = [];
  for (const kind of ["eqh", "eql"] as const) {
    const side = displayed.filter((p) => p.kind === kind);
    const opposite = kind === "eql" ? liq.rawSwings.highs : liq.rawSwings.lows;
    for (let i = 0; i < side.length; i++) {
      for (let j = i + 1; j < side.length; j++) {
        if (
          sameRecognizableArea({
            kind,
            a: side[i]!,
            b: side[j]!,
            bars: scoped,
            atr: liq.atr,
            tickSize: liq.tickSize,
            opposite,
          })
        ) {
          pairs.push([side[i]!, side[j]!]);
        }
      }
    }
  }
  return pairs;
}

function clusterByPrice(
  cands: SnapCandidate[],
  kind: "eqh" | "eql",
  atr: number,
  tickSize: number
): SnapCandidate[][] {
  const side = cands.filter((c) => c.kind === kind);
  if (side.length < 2) return side.map((c) => [c]);
  const parent = side.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!];
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < side.length; i++) {
    for (let j = i + 1; j < side.length; j++) {
      const a = side[i]!;
      const b = side[j]!;
      const gap =
        a.range.high < b.range.low
          ? b.range.low - a.range.high
          : b.range.high < a.range.low
            ? a.range.low - b.range.high
            : 0;
      const span = Math.max(
        a.range.high,
        b.range.high
      ) - Math.min(a.range.low, b.range.low);
      const pad = visualAreaPad(atr, tickSize, Math.max(span, tickSize));
      if (gap <= pad + 1e-9) union(i, j);
    }
  }
  const groups = new Map<number, SnapCandidate[]>();
  for (let i = 0; i < side.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(side[i]!);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function findBar(bars: Bar[], dateKey: string, hh: number, mm: number): number {
  const target = hh * 60 + mm;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < bars.length; i++) {
    if (getEstDateKey(bars[i]!.time) !== dateKey) continue;
    const d = Math.abs(getEstMinutes(bars[i]!.time) - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

function mdEsc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

type TMetrics = {
  i: number;
  ts: number;
  label: string;
  session: string;
  last: number;
  atr: number;
  tolerance: number;
  rawHighs: number;
  rawLows: number;
  pending: number;
  displayed: number;
  liveDisplayed: number;
  primary: number;
  secondary: number;
  internal: number;
  rejected: number;
  eqhDisplayed: number;
  eqlDisplayed: number;
  noExplanation: number;
  duplicates: number;
  overlapPairs: number;
  pitLeak: boolean;
  sweptStillActive: number;
  staleActive: number;
  externalCoincidence: number;
  minorPromoted: number;
  majorIgnored: number;
  densestEqlCluster: number;
  densestEqhCluster: number;
};

function analyzeT(
  bars: Bar[],
  i: number,
  liq: EqhEqlLiquidity,
  cands: SnapCandidate[],
  scoped: Bar[]
): Omit<TMetrics, "i" | "ts" | "label" | "session" | "last"> & {
  overlapExamples: Array<{ a: string; b: string; kind: string }>;
  coincidenceExamples: string[];
} {
  const cutoff = unixSec(bars[i]!.time);
  const displayedPools = liq.displayed;
  const live = liveDrawnIds(liq);
  const overlap = overlappingSameAreaPairs(displayedPools, scoped, liq);
  const liveDisplayed = displayedPools.filter((p) => live.has(p.id));
  const levels = new Map<string, number>();
  let duplicates = 0;
  for (const p of liveDisplayed) {
    const k = `${p.kind}:${p.level.toFixed(2)}`;
    levels.set(k, (levels.get(k) ?? 0) + 1);
  }
  for (const v of levels.values()) if (v > 1) duplicates += v - 1;

  let noExplanation = 0;
  for (const c of cands) {
    if (!c.why.trim()) noExplanation += 1;
  }

  let sweptStillActive = 0;
  let staleActive = 0;
  for (const p of displayedPools) {
    if (p.status === "active" || p.status === "touched") {
      if (independentlySwept(p.kind, p.level, bars, p.confirmationTime, i)) {
        sweptStillActive += 1;
      }
    }
    if (p.lifecycle === "ACTIVE") {
      const ageH = (cutoff - p.confirmationTime) / 3600;
      const dist = Math.abs(bars[i]!.close - p.level);
      if (ageH >= 6 && dist > 2 * liq.atr) staleActive += 1;
    }
  }

  const externals = namedExternalsAt(bars, i);
  let externalCoincidence = 0;
  const coincidenceExamples: string[] = [];
  const tick = liq.tickSize;
  for (const p of liveDisplayed) {
    const want = p.kind === "eqh" ? "high" : "low";
    const hit = externals.find(
      (e) => e.kind === want && Math.abs(e.price - p.level) <= tick + 1e-9
    );
    if (hit) {
      externalCoincidence += 1;
      if (coincidenceExamples.length < 6) {
        coincidenceExamples.push(
          `${p.kind.toUpperCase()} ${p.level.toFixed(2)} coincides with ${hit.name}`
        );
      }
    }
  }

  let minorPromoted = 0;
  for (const p of liveDisplayed) {
    const insideInternalParent = liq.internal.some((inn) => {
      if (inn.kind !== p.kind) return false;
      return (
        p.range.low >= inn.range.low - tick &&
        p.range.high <= inn.range.high + tick &&
        inn.swings.length > p.swings.length
      );
    });
    const weak =
      p.swings.length <= 2 &&
      p.structuralPriority <= 0 &&
      p.visualClass === "A";
    const swallowed = displayedPools.some(
      (o) =>
        o.id !== p.id &&
        o.kind === p.kind &&
        o.swings.length >= 3 &&
        p.range.low >= o.range.low - 2 &&
        p.range.high <= o.range.high + 2
    );
    if ((weak && swallowed) || insideInternalParent) minorPromoted += 1;
  }

  let majorIgnored = 0;
  for (const kind of ["eqh", "eql"] as const) {
    const prim = liveDisplayed
      .filter((p) => p.kind === kind && p.liquidityRole === "PRIMARY")
      .sort((a, b) => b.structuralPriority - a.structuralPriority)[0];
    const strongInternal = liq.internal.filter(
      (p) =>
        p.kind === kind &&
        (p.structuralPriority >= 2 || p.swings.length >= 3)
    );
    if (prim) {
      for (const inn of strongInternal) {
        if (
          inn.structuralPriority > prim.structuralPriority ||
          inn.swings.length > prim.swings.length + 1
        ) {
          majorIgnored += 1;
        }
      }
    }
    for (const r of liq.rejected) {
      if (r.kind !== kind) continue;
      if (r.visualClass !== "A") continue;
      const avgProm =
        r.swings.reduce((s, x) => s + x.prominence, 0) / Math.max(1, r.swings.length);
      if (avgProm >= liq.atr && (!prim || prim.structuralPriority <= 0)) {
        majorIgnored += 1;
      }
    }
  }

  const eqlClusters = clusterByPrice(cands, "eql", liq.atr, liq.tickSize);
  const eqhClusters = clusterByPrice(cands, "eqh", liq.atr, liq.tickSize);

  return {
    atr: liq.atr,
    tolerance: liq.tolerance,
    rawHighs: liq.rawSwings.highs.length,
    rawLows: liq.rawSwings.lows.length,
    pending: liq.pendingSwings.length,
    displayed: displayedPools.length,
    liveDisplayed: liveDisplayed.length,
    primary: cands.filter((c) => c.role === "PRIMARY").length,
    secondary: cands.filter((c) => c.role === "SECONDARY").length,
    internal: cands.filter((c) => c.role === "INTERNAL").length,
    rejected: cands.filter((c) => c.role === "REJECTED").length,
    eqhDisplayed: liveDisplayed.filter((p) => p.kind === "eqh").length,
    eqlDisplayed: liveDisplayed.filter((p) => p.kind === "eql").length,
    noExplanation: noExplanation,
    duplicates,
    overlapPairs: overlap.length,
    pitLeak: pitLeak(liq, cutoff),
    sweptStillActive,
    staleActive,
    externalCoincidence,
    minorPromoted,
    majorIgnored,
    densestEqlCluster: eqlClusters[0]?.length ?? 0,
    densestEqhCluster: eqhClusters[0]?.length ?? 0,
    overlapExamples: overlap.slice(0, 8).map(([a, b]) => ({
      a: `${a.id}@${a.level.toFixed(2)}`,
      b: `${b.id}@${b.level.toFixed(2)}`,
      kind: a.kind,
    })),
    coincidenceExamples,
  };
}

function poolFingerprint(liq: EqhEqlLiquidity): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of [...liq.pools, ...liq.internal]) {
    m.set(p.id, `${p.liquidityRole}|${p.status}|${p.lifecycle}`);
  }
  return m;
}

function swingSet(liq: EqhEqlLiquidity): string {
  return [...liq.rawSwings.highs, ...liq.rawSwings.lows]
    .map((s) => s.id)
    .sort()
    .join(",");
}

function interacted(bar: Bar, liq: EqhEqlLiquidity): boolean {
  for (const a of [...liq.areas, ...liq.internal.map((p) => p.liquidityArea)]) {
    if (!a) continue;
    if (a.type === "BUY_SIDE") {
      if (bar.high + 1e-9 >= a.priceLow) return true;
      if (bar.close > a.representativeLevel + 1e-9) return true;
    } else {
      if (bar.low - 1e-9 <= a.priceHigh) return true;
      if (bar.close < a.representativeLevel - 1e-9) return true;
    }
  }
  return false;
}

function candidateTable(cands: SnapCandidate[], title: string): string[] {
  const lines = [
    `#### ${title}`,
    ``,
    `| ID | Kind | Range | Role | DRAWN? | Status | Swings | Reason |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
  ];
  const sorted = [...cands].sort((a, b) => b.level - a.level);
  for (const c of sorted) {
    const swings = c.swingPrices.map((p) => p.toFixed(2)).join(", ") || "—";
    const reason = mdEsc(c.why || c.failedTests.join(", ") || "(empty)");
    lines.push(
      `| \`${c.id}\` | ${c.kind.toUpperCase()} | ${c.range.low.toFixed(2)}–${c.range.high.toFixed(2)} | ${c.role} | ${c.liveDrawn ? "YES" : "no"} | ${c.status} | ${swings} | ${reason} |`
    );
  }
  if (!sorted.length) lines.push(`| — | — | — | — | — | — | — | none |`);
  lines.push(``);
  return lines;
}

function main(): void {
  const t0 = Date.now();
  const { bars, manifest } = loadBars();
  if (!bars.length) throw new Error("empty Aug 12 candles");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const snapFd = fs.openSync(SNAP_PATH, "w");

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const sessionHigh = Math.max(...highs);
  const sessionLow = Math.min(...lows);
  const first = bars[0]!;
  const lastBar = bars.at(-1)!;

  const cfg = {
    symbol: "NQ" as const,
    lookback: LOOKBACK,
    maxPoolsPerSide: AUDIT_MAX_PER_SIDE,
    maxRejected: AUDIT_MAX_REJECTED,
  };

  const plannedIdx = [
    { name: "Globex open", i: 0 },
    { name: "Asia 21:00", i: findBar(bars, "2026-08-11", 21, 0) },
    { name: "London open 02:00", i: findBar(bars, "2026-08-12", 2, 0) },
    { name: "London KZ 04:00", i: findBar(bars, "2026-08-12", 4, 0) },
    { name: "NY pre 08:00", i: findBar(bars, "2026-08-12", 8, 0) },
    { name: "NY open 09:30", i: findBar(bars, "2026-08-12", 9, 30) },
    { name: "NY AM 10:00", i: findBar(bars, "2026-08-12", 10, 0) },
    { name: "Midday 12:00", i: findBar(bars, "2026-08-12", 12, 0) },
    { name: "NY PM 14:00", i: findBar(bars, "2026-08-12", 14, 0) },
    { name: "RTH close 16:00", i: findBar(bars, "2026-08-12", 16, 0) },
    { name: "Session last bar", i: bars.length - 1 },
  ];

  const startI = 8; // wing=2 needs a few bars
  const metrics: TMetrics[] = [];
  const failTotals: FailCounts = { ...ZERO_FAIL };
  let prevLiq: EqhEqlLiquidity | null = null;
  let prevFp = new Map<string, string>();
  let prevSwings = "";
  let roleChanges = 0;
  let maxOverlapT = startI;
  let maxOverlapN = -1;
  let maxEqlClusterT = startI;
  let maxEqlClusterN = -1;
  let maxInternalT = startI;
  let maxInternalN = -1;
  const visualStore = new Map<
    number,
    { liq: EqhEqlLiquidity; cands: SnapCandidate[]; metrics: TMetrics }
  >();

  let sumDisplayed = 0;
  let sumLive = 0;
  let sumPrimary = 0;
  let sumSecondary = 0;
  let sumInternal = 0;
  let sumRejected = 0;
  let sumRaw = 0;
  let nTs = 0;

  for (let i = startI; i < bars.length; i++) {
    const bar = bars[i]!;
    const liq = detectEqhEqlLiquidity(bars, {
      ...cfg,
      asOfIndex: i,
      currentPrice: bar.close,
    });
    const scoped = scopedBars(bars, i);
    const cands = allCandidates(liq);
    const extra = analyzeT(bars, i, liq, cands, scoped);
    const session = resolveSessionContext(bar.time);
    const m: TMetrics = {
      i,
      ts: unixSec(bar.time),
      label: `${getEstDateKey(bar.time)} ${fmtTs(unixSec(bar.time))}`,
      session: session.id,
      last: bar.close,
      ...extra,
    };
    metrics.push(m);
    nTs += 1;
    sumDisplayed += m.displayed;
    sumLive += m.liveDisplayed;
    sumPrimary += m.primary;
    sumSecondary += m.secondary;
    sumInternal += m.internal;
    sumRejected += m.rejected;
    sumRaw += m.rawHighs + m.rawLows;

    if (m.overlapPairs > maxOverlapN) {
      maxOverlapN = m.overlapPairs;
      maxOverlapT = i;
    }
    if (m.densestEqlCluster > maxEqlClusterN) {
      maxEqlClusterN = m.densestEqlCluster;
      maxEqlClusterT = i;
    }
    if (m.internal > maxInternalN) {
      maxInternalN = m.internal;
      maxInternalT = i;
    }

    failTotals.overlappingDisplayedSameArea += m.overlapPairs;
    failTotals.duplicateDisplayedLevels += m.duplicates;
    failTotals.minorPromoted += m.minorPromoted;
    failTotals.majorIgnored += m.majorIgnored;
    failTotals.externalCoincidence += m.externalCoincidence;
    failTotals.sweptStillActive += m.sweptStillActive;
    failTotals.staleActive += m.staleActive;
    failTotals.pitLeak += m.pitLeak ? 1 : 0;
    failTotals.noExplanation += m.noExplanation;

    if (prevLiq) {
      const sw = swingSet(liq);
      const newSwing = sw !== prevSwings;
      const touch = interacted(bar, prevLiq);
      if (!newSwing && !touch) {
        const fp = poolFingerprint(liq);
        for (const [id, state] of fp) {
          const prev = prevFp.get(id);
          if (prev && prev !== state) {
            roleChanges += 1;
            failTotals.roleChangeNoNewSwingNoInteract += 1;
          }
        }
      }
      prevFp = poolFingerprint(liq);
      prevSwings = sw;
    } else {
      prevFp = poolFingerprint(liq);
      prevSwings = swingSet(liq);
    }
    prevLiq = liq;

    const snap = {
      t: m.ts,
      tLabel: m.label,
      i,
      last: m.last,
      session: m.session,
      atr: Number(liq.atr.toFixed(4)),
      tolerance: liq.tolerance,
      pitLeak: m.pitLeak,
      rawSwings: {
        highs: liq.rawSwings.highs.map(compactSwing),
        lows: liq.rawSwings.lows.map(compactSwing),
      },
      pendingSwings: liq.pendingSwings.map((p) => ({
        type: p.type,
        price: p.price,
        ts: p.barTime,
        confirmAtBarIndex: p.confirmAtBarIndex,
      })),
      candidates: cands,
      counts: {
        rawHighs: m.rawHighs,
        rawLows: m.rawLows,
        PRIMARY: m.primary,
        SECONDARY: m.secondary,
        INTERNAL: m.internal,
        REJECTED: m.rejected,
        displayed: m.displayed,
        liveDisplayed: m.liveDisplayed,
      },
    };
    fs.writeSync(snapFd, `${JSON.stringify(snap)}\n`);

    if (i % 200 === 0) {
      console.log(`… ${i}/${bars.length - 1} ${m.label} last=${m.last} liveDrawn=${m.liveDisplayed}`);
    }
  }
  fs.closeSync(snapFd);

  const dataDriven = [
    { name: "Max overlap-failure T", i: maxOverlapT },
    { name: "Densest EQL cluster T", i: maxEqlClusterT },
    { name: "Max INTERNAL T", i: maxInternalT },
  ];
  const visualPlan = [...plannedIdx, ...dataDriven];
  const visualIdx = [...new Map(visualPlan.map((x) => [x.i, x])).values()].sort(
    (a, b) => a.i - b.i
  );

  for (const v of visualIdx) {
    const bar = bars[v.i]!;
    const liq = detectEqhEqlLiquidity(bars, {
      ...cfg,
      asOfIndex: v.i,
      currentPrice: bar.close,
    });
    const cands = allCandidates(liq);
    const scoped = scopedBars(bars, v.i);
    const extra = analyzeT(bars, v.i, liq, cands, scoped);
    const session = resolveSessionContext(bar.time);
    visualStore.set(v.i, {
      liq,
      cands,
      metrics: {
        i: v.i,
        ts: unixSec(bar.time),
        label: `${getEstDateKey(bar.time)} ${fmtTs(unixSec(bar.time))}`,
        session: session.id,
        last: bar.close,
        ...extra,
      },
    });
  }

  const clusterT = visualStore.get(maxEqlClusterT)!;
  const eqlClusters = clusterByPrice(
    clusterT.cands,
    "eql",
    clusterT.liq.atr,
    clusterT.liq.tickSize
  );
  const topEqlCluster = eqlClusters[0] ?? [];

  const avg = (n: number) => (nTs ? n / nTs : 0);
  const tsWithOverlap = metrics.filter((m) => m.overlapPairs > 0).length;
  const tsWithLeak = metrics.filter((m) => m.pitLeak).length;
  const tsWithSweptActive = metrics.filter((m) => m.sweptStillActive > 0).length;
  const tsNoWhy = metrics.filter((m) => m.noExplanation > 0).length;
  const maxLive = Math.max(...metrics.map((m) => m.liveDisplayed), 0);
  const minLive = Math.min(...metrics.map((m) => m.liveDisplayed), 0);

  const livePricesInAug12 = LIVE_CLUSTER_NOTE.prices.filter(
    (p) => p >= sessionLow - 1 && p <= sessionHigh + 1
  );
  const liveChartIsDifferentDay = livePricesInAug12.length === 0;

  const overlapRate = avg(failTotals.overlappingDisplayedSameArea);
  const leakRate = tsWithLeak / nTs;
  const whyRate = avg(failTotals.noExplanation);
  const sweptRate = tsWithSweptActive / nTs;

  let overall: "STRONG" | "PROMISING" | "INCONCLUSIVE" | "WEAK" | "FAILED" =
    "INCONCLUSIVE";
  if (tsWithLeak > 0) overall = "FAILED";
  else if (overlapRate > 1.5 && avg(failTotals.minorPromoted) > 0.5) overall = "WEAK";
  else if (overlapRate > 0.25 || avg(failTotals.minorPromoted) > 0.2) overall = "PROMISING";
  else if (
    overlapRate === 0 &&
    whyRate === 0 &&
    failTotals.roleChangeNoNewSwingNoInteract === 0 &&
    failTotals.sweptStillActive === 0
  ) {
    overall = "STRONG";
  } else overall = "PROMISING";

  if (nTs < 200) overall = "INCONCLUSIVE";

  const summary = {
    dataset: FIXTURE_ID,
    manifest,
    bars: bars.length,
    sampled: nTs,
    startI,
    sessionHigh,
    sessionLow,
    firstTs: unixSec(first.time),
    lastTs: unixSec(lastBar.time),
    lookback: LOOKBACK,
    overall,
    failTotals,
    roleChanges,
    tsWithOverlap,
    tsWithLeak,
    averages: {
      displayed: avg(sumDisplayed),
      liveDisplayed: avg(sumLive),
      PRIMARY: avg(sumPrimary),
      SECONDARY: avg(sumSecondary),
      INTERNAL: avg(sumInternal),
      REJECTED: avg(sumRejected),
      rawSwings: avg(sumRaw),
    },
    liveChartIsDifferentDay,
    maxOverlapT,
    maxEqlClusterT,
    maxInternalT,
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  const md: string[] = [];
  const push = (...lines: string[]) => md.push(...lines);

  push(
    `# Research: Liquidity quality — NQ Aug 12 2026`,
    ``,
    `**Detector:** research \`detectEqhEqlLiquidity\` + hierarchy v2 (\`lib/research/eqh-eql-liquidity.ts\`, \`lib/research/eqh-eql-importance.ts\`).`,
    `**Production:** \`lib/reh-rel.ts\` / \`lib/structure.ts\` trading detectors were **not** read for decisions and were **not** modified.`,
    `**Out of scope:** conversation turn-2, PDH false-taken, edge/profit, algorithm redesign.`,
    ``,
    `## OVERALL`,
    ``,
    `**${overall}** — one NQ Globex session only. This is an internal-quality audit of whether the research overlay distinguishes meaningful relative liquidity from internals/noise **using only information at T**. It is not an edge study and does not generalize.`,
    ``,
    `## Scope and limits`,
    ``,
    `- Real NQ Aug 12 dataset only (\`${FIXTURE_ID}\`). No synthetic labels, no live Yahoo tape, no future bars.`,
    `- We do **not** have enough history to prove generalization. One session cannot do that.`,
    `- Later sweeps are recorded as **outcomes** at later T. They are never used to decide that a pool was “good” at an earlier T.`,
    `- EXTERNAL named session/PD levels are a separate drawing path. This detector must not emit them as REL/REH.`,
    `- Config matches the live research overlay: \`lookback=${LOOKBACK}\` (incremental engine). Audit keeps up to ${AUDIT_MAX_PER_SIDE} pools/side so classification is visible; **liveDrawn** applies the live cap of ${LIVE_MAX_PER_SIDE}/side.`,
    `- Default rejected cap is 40; audit uses ${AUDIT_MAX_REJECTED} so “why filtered” is not truncated as often.`,
    ``,
    `## Dataset`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Fixture | \`${FIXTURE_ID}\` |`,
    `| dataset_id | \`${String(manifest.dataset_id ?? "")}\` |`,
    `| Source | ${String(manifest.source ?? "")} ${String(manifest.source_version ?? "")} |`,
    `| Symbol | NQ (MNQ-equivalent 0.25 tick) |`,
    `| Bars | ${bars.length} × 1m |`,
    `| Window | ${getEstDateKey(first.time)} ${fmtTs(unixSec(first.time))} → ${getEstDateKey(lastBar.time)} ${fmtTs(unixSec(lastBar.time))} ET |`,
    `| Session high / low (this file) | ${sessionHigh.toFixed(2)} / ${sessionLow.toFixed(2)} |`,
    `| Last close | ${lastBar.close.toFixed(2)} |`,
    `| Validation | 60-minute CME session-boundary gap (WARNING, last bar jumps to 18:00 ET) |`,
    ``,
    `## Methodology (existing — not invented ICT)`,
    ``,
    `Process at T, from hierarchy v2 / liquidity-first code:`,
    ``,
    `1. Confirmed 5-bar (wing=2) swings only after the right wing has **closed**.`,
    `2. Meaningful vs surrounding PA (prominence floor).`,
    `3. Genuine return after leaving the area.`,
    `4. Visual recognition of one horizontal (class A). Classes B/C/D → NOISE (\`rejected[]\`).`,
    `5. Relative equality is a **supporting** component of “same visible area,” not “two prices are close.”`,
    `6. Same-side class-A pairs in one consolidation → one RELATIVE area; internals preserved, not drawn.`,
    `7. PRIMARY only if a trader would notice the horizontal without a label; otherwise SECONDARY. INTERNAL hidden. REJECTED not presented as liquidity.`,
    `8. Sweep / close-through is lifecycle. Distance-to-last is not ICT invalidation.`,
    `9. RAW swings are kept even when a candidate is filtered.`,
    ``,
    `Layers are not mixed: EXTERNAL (session/PD, other path) · RELATIVE (PRIMARY/SECONDARY) · INTERNAL · NOISE.`,
    ``,
    `## Question`,
    ``,
    `Does Karen distinguish meaningful **external / EQH-REH / EQL-REL / secondary-internal / noise** using **only info at T** on this Aug 12 tape?`,
    ``,
    `Not asked: did it detect more REH/REL? Did a later sweep prove the pool was important? Would this print money?`,
    ``,
    `## Sampling`,
    ``,
    `- Full session walk: every 1m bar from index ${startI} → ${bars.length - 1} (**${nTs} timestamps**). Not 12 checkpoints.`,
    `- PIT: \`asOfIndex = i\`, \`currentPrice = close[i]\`, bars after T never passed in.`,
    `- No cherry-pick: planned session landmarks **and** data-driven worst/densest timestamps come from the same full walk.`,
    ``,
    `## Machine-readable exports`,
    ``,
    `| File | Contents |`,
    `| --- | --- |`,
    `| \`${path.relative(process.cwd(), SNAP_PATH)}\` | One JSONL record per T: raw swings (id, type, ts, price, confirmation, prominence) + every candidate (EQH/EQL, external/internal/relative/noise role, status, primary/secondary/internal/rejected, contributing IDs, range, formation/confirmation, why filtered, DRAWN?) |`,
    `| \`${path.relative(process.cwd(), SUMMARY_PATH)}\` | Totals, averages, failure counters, overall |`,
    ``,
    `## RAW → CLASSIFIED → DISPLAYED`,
    ``,
    `Filtering display does not delete swings. Per-T averages over ${nTs} minutes:`,
    ``,
    `| Stage | What | Avg / T |`,
    `| --- | --- | ---: |`,
    `| RAW | Confirmed swing highs+lows in lookback | ${avg(sumRaw).toFixed(2)} |`,
    `| CLASSIFIED PRIMARY | RELATIVE, strongest noticeable | ${avg(sumPrimary).toFixed(2)} |`,
    `| CLASSIFIED SECONDARY | RELATIVE, distinct lesser shelf | ${avg(sumSecondary).toFixed(2)} |`,
    `| CLASSIFIED INTERNAL | Same recognizable area, hidden | ${avg(sumInternal).toFixed(2)} |`,
    `| CLASSIFIED REJECTED / NOISE | Failed structural gates | ${avg(sumRejected).toFixed(2)} |`,
    `| DISPLAYED (classified) | PRIMARY+SECONDARY before live cap | ${avg(sumDisplayed).toFixed(2)} |`,
    `| DISPLAYED liveDrawn | Overlay cap ${LIVE_MAX_PER_SIDE}/side | ${avg(sumLive).toFixed(2)} |`,
    ``,
    `LiveDrawn range: min ${minLive} · max ${maxLive} · avg ${avg(sumLive).toFixed(2)}.`,
    ``,
    `## Candidate reasons`,
    ``,
    `Every accepted/internal pool carries \`why\` from market-state gates (confirmed swing, meaningful vs PA, genuine return, visual class, structure, sweep state, relative-equality-as-support). Rejected rows carry \`why\` + \`failedTests\`.`,
    ``,
    `- Timestamps with ≥1 empty why: **${tsNoWhy} / ${nTs}**`,
    `- Empty-why instances (sum over T): **${failTotals.noExplanation}** (avg ${whyRate.toFixed(3)} / T)`,
    ``,
    `## Overlapping magenta REL cluster (live chart vs Aug 12)`,
    ``,
    `Recent screenshots (~${LIVE_CLUSTER_NOTE.prices.join("–")}) are documented as **${LIVE_CLUSTER_NOTE.instrument} as-of ${LIVE_CLUSTER_NOTE.asOf}** in \`${LIVE_CLUSTER_NOTE.source}\`.`,
    ``,
    liveChartIsDifferentDay
      ? `**Those prices are not on this Aug 12 NQ file.** Aug 12 session range in-sample is **${sessionLow.toFixed(2)}–${sessionHigh.toFixed(2)}** (last ${lastBar.close.toFixed(2)}). ~30218–30227 sits ~400 pts above this session. The live MNQ chart is a **different day**. This audit still runs on Aug 12; it does not treat the screenshot as Aug 12 structure and does not hard-code those prices into classification.`
      : `Unexpected: some screenshot prices fall inside the Aug 12 range. See cluster table below.`,
    ``,
    `Hierarchy v2 was designed against that Aug 14 MNQU four-line over-detect (BEFORE 4 REL → AFTER 1 PRIMARY at the structural low). That fixture is **not** used as Aug 12 evidence.`,
    ``,
    `## Aug 12 overlapping REL/EQH clusters (derived from structure)`,
    ``,
    `Densest EQL price-proximity cluster on the full walk (union of candidates whose ranges sit within \`visualAreaPad\`, not a hard-coded print):`,
    ``,
    `- **T:** ${clusterT.metrics.label} ET · last=${clusterT.metrics.last.toFixed(2)} · session=${clusterT.metrics.session} · ATR=${clusterT.liq.atr.toFixed(2)}`,
    `- **Cluster size:** ${topEqlCluster.length} EQL candidates (all roles)`,
    `- **Live-drawn in cluster:** ${topEqlCluster.filter((c) => c.liveDrawn).length}`,
    `- **INTERNAL in cluster:** ${topEqlCluster.filter((c) => c.role === "INTERNAL").length}`,
    `- **REJECTED in cluster:** ${topEqlCluster.filter((c) => c.role === "REJECTED").length}`,
    `- **Price span:** ${
      topEqlCluster.length
        ? `${Math.min(...topEqlCluster.map((c) => c.range.low)).toFixed(2)}–${Math.max(...topEqlCluster.map((c) => c.range.high)).toFixed(2)}`
        : "n/a"
    }`,
    ``,
    ...candidateTable(topEqlCluster, "EQL cluster members at densest-T (derived)"),
    `Which one area / secondary / reject is in the **Role** and **DRAWN?** columns. Merge quality: if several rows are liveDrawn YES inside one pad, hierarchy failed to collapse a recognizable area at that T. If one PRIMARY/SECONDARY is drawn and the rest are INTERNAL or REJECTED, collapse did what v2 specified.`,
    ``,
    `Max \`sameRecognizableArea\` pairs still both displayed (collapse-failure count) on the walk: **${maxOverlapN}** at ${metrics.find((x) => x.i === maxOverlapT)?.label ?? maxOverlapT}.`,
    ``,
    `## Cross-timestamp measurements`,
    ``,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Timestamps sampled | ${nTs} |`,
    `| Avg liveDrawn / T | ${avg(sumLive).toFixed(2)} |`,
    `| Avg PRIMARY / T | ${avg(sumPrimary).toFixed(2)} |`,
    `| Avg SECONDARY / T | ${avg(sumSecondary).toFixed(2)} |`,
    `| Avg INTERNAL / T | ${avg(sumInternal).toFixed(2)} |`,
    `| Avg REJECTED / T | ${avg(sumRejected).toFixed(2)} |`,
    `| Duplicate liveDrawn levels (sum) | ${failTotals.duplicateDisplayedLevels} |`,
    `| Empty-why count (sum) | ${failTotals.noExplanation} |`,
    `| PIT leak timestamps | ${tsWithLeak} |`,
    `| T with displayed same-area overlap | ${tsWithOverlap} |`,
    `| Classification change, no new swing, no interaction (sum id-state flips) | ${failTotals.roleChangeNoNewSwingNoInteract} |`,
    ``,
    `## Failure patterns (measured, not fixed)`,
    ``,
    `No redesign in this pass. Counts are **sums across timestamps** (a persistent defect is counted every minute it is visible).`,
    ``,
    `| Pattern | Sum over T | T with >0 | Notes |`,
    `| --- | ---: | ---: | --- |`,
    `| Overlapping REL/EQH that \`sameRecognizableArea\` would merge | ${failTotals.overlappingDisplayedSameArea} | ${tsWithOverlap} | Collapse miss vs hierarchy v2 |`,
    `| Duplicate liveDrawn same kind+level | ${failTotals.duplicateDisplayedLevels} | ${metrics.filter((m) => m.duplicates > 0).length} | Dupes |`,
    `| Minor promoted (weak 2-swing drawn inside a stronger same-side area) | ${failTotals.minorPromoted} | ${metrics.filter((m) => m.minorPromoted > 0).length} | |`,
    `| Major ignored (strong INTERNAL/class-A reject vs weaker PRIMARY) | ${failTotals.majorIgnored} | ${metrics.filter((m) => m.majorIgnored > 0).length} | Heuristic; inspect examples |`,
    `| EXTERNAL coincidence (liveDrawn level = named session H/L ±1 tick) | ${failTotals.externalCoincidence} | ${metrics.filter((m) => m.externalCoincidence > 0).length} | Detector never labels EXTERNAL; coincidence ≠ it hid PDH/Asia High |`,
    `| Swept still active (status active/touched but later bar already through level, PIT) | ${failTotals.sweptStillActive} | ${tsWithSweptActive} | Lifecycle bug if >0 |`,
    `| Stale active (ACTIVE, ≥6h old, >2 ATR from last) | ${failTotals.staleActive} | ${metrics.filter((m) => m.staleActive > 0).length} | Distance is **not** ICT invalidation; measured only |`,
    `| Classification change without new swing and without area interaction | ${failTotals.roleChangeNoNewSwingNoInteract} | — | Lookback slide / ATR can still change state |`,
    `| PIT leak | ${failTotals.pitLeak} | ${tsWithLeak} | confirmationTime > T |`,
    `| No explanation | ${failTotals.noExplanation} | ${tsNoWhy} | Empty \`why\` |`,
    ``,
    `Lookback=${LOOKBACK} means structure older than 12h **falls out of the window**. That is existing overlay behavior, not a future-leak. It can look like “classification changed without a new swing” when the oldest swing drops.`
  );

  push(``, `## Visual debug — systematic timestamps`, ``);
  for (const v of visualIdx) {
    const packed = visualStore.get(v.i);
    if (!packed) continue;
    const { liq, cands, metrics: mm } = packed;
    const drawn = cands.filter((c) => c.liveDrawn);
    const internal = cands.filter((c) => c.role === "INTERNAL");
    const rejected = cands.filter((c) => c.role === "REJECTED").slice(0, 12);
    push(
      `### ${v.name} — ${mm.label} ET`,
      ``,
      `| Field | Value |`,
      `| --- | --- |`,
      `| last | ${mm.last.toFixed(2)} |`,
      `| session | ${mm.session} |`,
      `| ATR / equality band | ${liq.atr.toFixed(2)} / ${liq.tolerance.toFixed(2)} (${liq.toleranceTicks} ticks) |`,
      `| RAW highs / lows / pending | ${mm.rawHighs} / ${mm.rawLows} / ${mm.pending} |`,
      `| PRIMARY / SECONDARY / INTERNAL / REJECTED | ${mm.primary} / ${mm.secondary} / ${mm.internal} / ${mm.rejected} |`,
      `| liveDrawn | ${mm.liveDisplayed} (EQH ${mm.eqhDisplayed} · EQL ${mm.eqlDisplayed}) |`,
      `| PIT leak | ${mm.pitLeak ? "LEAK" : "none"} |`,
      `| same-area overlap pairs | ${mm.overlapPairs} |`,
      `| swept-still-active | ${mm.sweptStillActive} |`,
      `| EXTERNAL coincidence | ${mm.externalCoincidence} |`,
      ``
    );
    if (mm.coincidenceExamples.length) {
      push(`EXTERNAL coincidences: ${mm.coincidenceExamples.join("; ")}`, ``);
    }
    if (mm.overlapExamples.length) {
      push(
        `Overlap examples: ${mm.overlapExamples.map((o) => `${o.kind} ${o.a} ~ ${o.b}`).join("; ")}`,
        ``
      );
    }
    push(...candidateTable(drawn, "DISPLAYED (liveDrawn)"));
    push(...candidateTable(internal, "INTERNAL (hidden, swings preserved)"));
    push(...candidateTable(rejected, "REJECTED / NOISE (sample, max 12)"));
  }

  const distinguishNotes: string[] = [];
  distinguishNotes.push(
    `EXTERNAL: this overlay emitted **0** \`liquidityLayer=EXTERNAL\` rows (by design). Named Asia/London/NY H/L are computed separately for coincidence checks only. Coincidences (liveDrawn sitting on a named extreme): sum ${failTotals.externalCoincidence} across minutes — not proof it stole the EXTERNAL drawing path.`
  );
  distinguishNotes.push(
    `EQH-REH vs EQL-REL: sides stay type-pure in accepted pools (mixed-side groups are rejected with \`swingType\`).`
  );
  distinguishNotes.push(
    `SECONDARY vs INTERNAL: INTERNAL avg ${avg(sumInternal).toFixed(2)}/T vs SECONDARY ${avg(sumSecondary).toFixed(2)}/T. Collapse-failure overlap pairs avg ${overlapRate.toFixed(3)}/T across ${tsWithOverlap} minutes.`
  );
  distinguishNotes.push(
    `NOISE: rejected avg ${avg(sumRejected).toFixed(2)}/T with structural-gate reasons. Empty why avg ${whyRate.toFixed(3)}/T.`
  );

  push(
    `## Does Karen distinguish layers using only info at T?`,
    ``,
    ...distinguishNotes.map((s) => `- ${s}`),
    ``,
    tsWithLeak
      ? `- PIT: **LEAK on ${tsWithLeak} timestamps** — state at T used confirmation after T. That fails the question.`
      : `- PIT: **no confirmationTime > T** on ${nTs} samples.`,
    ``,
    `Sensible on Aug 12? **${
      overall === "STRONG" || overall === "PROMISING"
        ? "Partially / mostly at the overlay layer, with the measured defects above. Not proven beyond this tape."
        : overall === "FAILED"
          ? "No — PIT or systematic quality failure on this tape."
          : "Not enough to call the distinction reliable, even on this one day."
    }**`,
    ``,
    `## What this does NOT claim`,
    ``,
    `- No edge, expectancy, win rate, or profit.`,
    `- No generalization past this single NQ Globex session.`,
    `- A later sweep does **not** mean the pool was important at T.`,
    `- Screenshot prices ~30218–30227 are **not** this dataset.`,
    `- Production REH/REL observation-engine quality is **not** measured here.`,
    ``,
    `## Follow-up research tasks (not implemented)`,
    ``
  );

  const follow: string[] = [];
  if (tsWithOverlap > 0) {
    follow.push(
      `- **Collapse misses:** ${tsWithOverlap} minutes still display multiple same-side pools that \`sameRecognizableArea\` treats as one area. Research task: replay those T’s with hierarchy v2 tracing (which pad/leave test failed) — do not retune from this report alone.`
    );
  }
  if (failTotals.sweptStillActive > 0) {
    follow.push(
      `- **Swept still active:** ${failTotals.sweptStillActive} instances where PIT bars already traded through a liveDrawn level but status stayed active/touched. Research task: lifecycle vs scoped-window start (lookback may omit the sweep bar).`
    );
  }
  if (failTotals.roleChangeNoNewSwingNoInteract > 0) {
    follow.push(
      `- **State flips without new swing/interaction:** ${failTotals.roleChangeNoNewSwingNoInteract} id-state changes. Research task: separate lookback-slide vs ATR-band vs non-deterministic rank.`
    );
  }
  if (failTotals.minorPromoted > 0) {
    follow.push(
      `- **Minor promoted:** ${failTotals.minorPromoted} weak 2-swing lines drawn inside a stronger same-side area. Research task: is SECONDARY-cap or collapse gap causing magenta-style stacks on this tape?`
    );
  }
  if (failTotals.majorIgnored > 0) {
    follow.push(
      `- **Major ignored (heuristic):** ${failTotals.majorIgnored} counts. Research task: manual chart check at max-INTERNAL T ${metrics.find((x) => x.i === maxInternalT)?.label} before treating as a defect.`
    );
  }
  if (liveChartIsDifferentDay) {
    follow.push(
      `- **Live magenta cluster:** replay ${LIVE_CLUSTER_NOTE.instrument} ${LIVE_CLUSTER_NOTE.asOf} (or that session’s TickStream day) with this same PIT exporter. Aug 12 cannot confirm or deny the 30218–30227 stack.`
    );
  }
  if (LOOKBACK < bars.length) {
    follow.push(
      `- **Lookback 720 vs full session:** HTF equal highs/lows older than 12h disappear. If Karen should speak to Asia EQH at NY PM, that is a separate research question — not a silent lookback bump.`
    );
  }
  if (!follow.length) {
    follow.push(
      `- No clear implementation defect isolated beyond one-day noise. Next evidence: a second real NQ session with the same exporter, still no redesign.`
    );
  }
  push(...follow);

  push(
    ``,
    `## Runtime`,
    ``,
    `- Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    `- Snapshots: ${nTs} lines in \`${path.relative(process.cwd(), SNAP_PATH)}\``,
    ``,
    `---`,
    ``,
    `Limitation restated: **one NQ day.** OVERALL **${overall}**.`
  );

  fs.writeFileSync(REPORT_PATH, md.join("\n"), "utf8");
  console.log(`wrote ${REPORT_PATH}`);
  console.log(`wrote ${SNAP_PATH}`);
  console.log(`OVERALL ${overall} nTs=${nTs} liveDrawnAvg=${avg(sumLive).toFixed(2)}`);
}

main();
