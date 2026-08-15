import type { Bar, FvgZone } from "./types";
import type { SessionId } from "./sessions";
import {
  barsInCmeSession,
  barsInEstWindow,
  barTimeSec,
  cmeSessionDateKeyFromDate,
  estTimeOnDateKey,
  formatEst,
  getEstDateKey,
  getEstMinutes,
  priorEstDateKey,
  RTH_OPEN_MIN,
} from "./market-data";
import {
  detectFirstPresentedFvgs,
  detectFirstPresentedFvgsIncremental,
  detectUnfilledIntradayFvgs,
  isFvgInverted,
} from "./gap-zones";
import {
  classifyLevelInteraction,
  classifyReferenceCloseInteraction,
} from "./level-interaction";

export type MssEvent = {
  direction: "bullish" | "bearish";
  level: number;
  at: string;
  atTime: number;
  description: string;
};

export type LiquiditySweep = {
  levelId: string;
  label: string;
  price: number;
  side: "buy_side" | "sell_side";
  at: string;
  atTime: number;
};

export type RelativeEqualPool = {
  price: number;
  type: "reh" | "rel";
  startTime: number;
  endTime?: number;
  barCount: number;
};

type Swing = { type: "high" | "low"; price: number; index: number; time: number };

function findSwings(bars: Bar[], wing = 2): Swing[] {
  const swings: Swing[] = [];
  for (let i = wing; i < bars.length - wing; i++) {
    const bar = bars[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= wing; j++) {
      if (bars[i - j].high >= bar.high || bars[i + j].high >= bar.high) isHigh = false;
      if (bars[i - j].low <= bar.low || bars[i + j].low <= bar.low) isLow = false;
    }
    const time = barTimeSec(bar);
    if (isHigh) swings.push({ type: "high", price: bar.high, index: i, time });
    if (isLow) swings.push({ type: "low", price: bar.low, index: i, time });
  }
  return swings;
}

function mssFromBar(
  bar: Bar,
  swingHighs: Swing[],
  swingLows: Swing[],
  barIndex: number
): MssEvent | null {
  const priorHighs = swingHighs.filter((s) => s.index < barIndex - 1);
  const priorLows = swingLows.filter((s) => s.index < barIndex - 1);
  const sh = priorHighs.at(-1);
  const sl = priorLows.at(-1);

  if (sh && bar.close > sh.price) {
    const at = formatEst(bar.time);
    return {
      direction: "bullish",
      level: sh.price,
      at,
      atTime: Math.floor(bar.time.getTime() / 1000),
      description: `Bullish MSS — body close above swing high ${sh.price.toFixed(2)} at ${at}`,
    };
  }

  if (sl && bar.close < sl.price) {
    const at = formatEst(bar.time);
    return {
      direction: "bearish",
      level: sl.price,
      at,
      atTime: Math.floor(bar.time.getTime() / 1000),
      description: `Bearish MSS — body close below swing low ${sl.price.toFixed(2)} at ${at}`,
    };
  }

  return null;
}

/** Most recent 1m market structure shift (body close through swing, not CHoCH). */
export function detectMss(m1: Bar[], lookback = 80): MssEvent | null {
  const bars = m1.slice(-lookback);
  if (bars.length < 10) return null;

  const swings = findSwings(bars, 2);
  const swingHighs = swings.filter((s) => s.type === "high");
  const swingLows = swings.filter((s) => s.type === "low");

  for (let i = bars.length - 1; i >= Math.max(0, bars.length - 12); i--) {
    const event = mssFromBar(bars[i], swingHighs, swingLows, i);
    if (event) return event;
  }

  return null;
}

/** Body close beyond session / PD liquidity levels. */
export function detectLiquiditySweeps(
  m1: Bar[],
  levels: Array<{ id: string; label: string; price: number }>,
  lookback = 40
): LiquiditySweep[] {
  const recent = m1.slice(-lookback);
  const sweeps: LiquiditySweep[] = [];

  for (const level of levels) {
    for (let i = recent.length - 1; i >= 0; i--) {
      const bar = recent[i];
      if (bar.close < level.price && bar.low <= level.price) {
        sweeps.push({
          levelId: level.id,
          label: level.label,
          price: level.price,
          side: "sell_side",
          at: formatEst(bar.time),
          atTime: Math.floor(bar.time.getTime() / 1000),
        });
        break;
      }
      if (bar.close > level.price && bar.high >= level.price) {
        sweeps.push({
          levelId: level.id,
          label: level.label,
          price: level.price,
          side: "buy_side",
          at: formatEst(bar.time),
          atTime: Math.floor(bar.time.getTime() / 1000),
        });
        break;
      }
    }
  }

  return sweeps.slice(0, 10);
}

export function detectM1UnfilledFvgs(m1: Bar[], maxCount = 5): FvgZone[] {
  return detectUnfilledIntradayFvgs(m1, "1m", 80, maxCount);
}

/** MNQ tolerance: 2–4 pts or 0.1% of price — ICT relative equal high/low clustering. */
export function rehRelTolerance(referencePrice: number): number {
  const pct = referencePrice * 0.001;
  return Math.max(2, Math.min(4, pct));
}

function sessionScopeBars(
  m1: Bar[],
  sessionId: SessionId,
  todayKey: string,
  yesterdayKey: string
): Bar[] {
  switch (sessionId) {
    case "asia":
      return [
        ...barsInEstWindow(m1, 18 * 60, 24 * 60, yesterdayKey),
        ...barsInEstWindow(m1, 0, 60, todayKey),
      ];
    case "london":
      return barsInEstWindow(m1, 2 * 60, 5 * 60, todayKey);
    case "ny_pre":
      return barsInEstWindow(m1, 7 * 60, 9 * 60 + 30, todayKey);
    case "ny_am":
      return barsInEstWindow(m1, 9 * 60 + 30, 11 * 60, todayKey);
    case "ny_pm":
      return barsInEstWindow(m1, 13 * 60 + 30, 16 * 60, todayKey);
    default:
      return m1.slice(-120);
  }
}

function mergeBarsByTime(...groups: Bar[][]): Bar[] {
  const seen = new Set<number>();
  const out: Bar[] = [];
  for (const group of groups) {
    for (const bar of group) {
      const t = bar.time.getTime();
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(bar);
    }
  }
  out.sort((a, b) => a.time.getTime() - b.time.getTime());
  return out;
}

/** Classic 3-bar swing (wing=1): center bar extreme beats left and right neighbors. */
function findSwings3Bar(bars: Bar[]): Swing[] {
  return findSwings(bars, 1);
}

/**
 * REH / REL from paired 3-bar swings: left swing first in time, right swing later and
 * slightly lower in price (within tolerance). Classic ICT equal lows often have the
 * right swing *higher* (shallower); this desk uses the user's spec — right lower than left.
 */
function pairRelativeEqualSwings(
  swings: Swing[],
  type: "reh" | "rel",
  maxPools: number
): RelativeEqualPool[] {
  const sorted = [...swings].sort((a, b) => a.time - b.time);
  const pools: RelativeEqualPool[] = [];
  const usedRight = new Set<number>();

  for (let j = 1; j < sorted.length; j++) {
    if (usedRight.has(j)) continue;
    const right = sorted[j];

    for (let i = j - 1; i >= 0; i--) {
      const left = sorted[i];
      if (right.price >= left.price) continue;

      const ref = (left.price + right.price) / 2;
      if (Math.abs(left.price - right.price) > rehRelTolerance(ref)) continue;

      pools.push({
        type,
        price: type === "reh" ? left.price : right.price,
        startTime: left.time,
        endTime: right.time,
        barCount: 2,
      });
      usedRight.add(j);
      break;
    }
  }

  return pools
    .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))
    .slice(0, maxPools);
}

function barInEstWindow(
  bar: Bar,
  startMinutes: number,
  endMinutes: number,
  dateKey: string
): boolean {
  if (getEstDateKey(bar.time) !== dateKey) return false;
  const m = getEstMinutes(bar.time);
  if (startMinutes <= endMinutes) return m >= startMinutes && m < endMinutes;
  return m >= startMinutes || m < endMinutes;
}

function barBelongsNyPre(bar: Bar, dateKey: string): boolean {
  return barInEstWindow(bar, 7 * 60, 9 * 60 + 30, dateKey);
}

function barBelongsSession(
  bar: Bar,
  sessionId: SessionId,
  todayKey: string,
  yesterdayKey: string
): boolean {
  switch (sessionId) {
    case "asia":
      return (
        barInEstWindow(bar, 18 * 60, 24 * 60, yesterdayKey) ||
        barInEstWindow(bar, 0, 60, todayKey)
      );
    case "london":
      return barInEstWindow(bar, 2 * 60, 5 * 60, todayKey);
    case "ny_pre":
      return barInEstWindow(bar, 7 * 60, 9 * 60 + 30, todayKey);
    case "ny_am":
      return barInEstWindow(bar, 9 * 60 + 30, 11 * 60, todayKey);
    case "ny_pm":
      return barInEstWindow(bar, 13 * 60 + 30, 16 * 60, todayKey);
    default:
      return false;
  }
}

function buildRehScopedBars(
  m1: Bar[],
  asOf: Date,
  activeSessionId: SessionId
): { scoped: Bar[]; dateKey: string; yesterdayKey: string } {
  const dateKey = getEstDateKey(asOf);
  const yesterdayKey = priorEstDateKey(m1, dateKey) ?? dateKey;
  const nyPre = barsInEstWindow(m1, 7 * 60, 9 * 60 + 30, dateKey);
  const sessionBars = sessionScopeBars(m1, activeSessionId, dateKey, yesterdayKey);
  const scoped = mergeBarsByTime(nyPre, sessionBars, m1.slice(-120));
  return { scoped, dateKey, yesterdayKey };
}

function poolsFromRehScoped(scoped: Bar[], maxPools = 3): RelativeEqualPool[] {
  const wing = 1;
  if (scoped.length < wing * 2 + 3) return [];
  const swings = findSwings3Bar(scoped);
  const reh = pairRelativeEqualSwings(
    swings.filter((s) => s.type === "high"),
    "reh",
    maxPools
  );
  const rel = pairRelativeEqualSwings(
    swings.filter((s) => s.type === "low"),
    "rel",
    maxPools
  );
  return [...reh, ...rel].sort((a, b) => b.price - a.price);
}

/**
 * Relative equal highs (REH) / lows (REL) — pairs of 3-bar swing points where the
 * right swing is lower than the left (within MNQ tolerance). Scope: NY pre-market,
 * active session window, plus last 120 bars fallback.
 */
export function detectRelativeEqualPools(
  m1: Bar[],
  asOf: Date = new Date(),
  activeSessionId: SessionId = "ny_am",
  opts?: { maxPoolsPerSide?: number }
): RelativeEqualPool[] {
  const maxPools = opts?.maxPoolsPerSide ?? 3;
  const wing = 1;
  if (m1.length < wing * 2 + 3) return [];
  const { scoped } = buildRehScopedBars(m1, asOf, activeSessionId);
  if (scoped.length < wing * 2 + 3) return [];
  return poolsFromRehScoped(scoped, maxPools);
}

/** Opaque incremental state for closed-bar structure updates (not a general cache). */
export type StructureFactsIncState = {
  m1Length: number;
  lastBarTimeMs: number;
  dateKey: string;
  sessionId: SessionId;
  yesterdayKey: string;
  cmeSessionKey: string;
  rehScoped: Bar[];
  sessionM1: Bar[];
};

function advanceRehScoped(
  prev: StructureFactsIncState,
  m1: Bar[],
  dateKey: string,
  sessionId: SessionId
): Bar[] | null {
  const last = m1.at(-1);
  if (!last) return null;

  // Same-length tick / HL update: refresh last bar reference inside scoped set.
  if (prev.m1Length === m1.length) {
    if (prev.lastBarTimeMs !== last.time.getTime()) return null;
    if (prev.dateKey !== dateKey || prev.sessionId !== sessionId) return null;
    const lastT = last.time.getTime();
    return prev.rehScoped.map((b) => (b.time.getTime() === lastT ? last : b));
  }

  // Forward +1 closed bar only.
  if (prev.m1Length !== m1.length - 1) return null;
  if (prev.dateKey !== dateKey || prev.sessionId !== sessionId) return null;
  if (last.time.getTime() <= prev.lastBarTimeMs) return null;

  let scoped = prev.rehScoped;

  if (m1.length > 120) {
    const dropped = m1[m1.length - 121]!;
    const dropT = dropped.time.getTime();
    const stillNy = barBelongsNyPre(dropped, dateKey);
    const stillSess = barBelongsSession(dropped, sessionId, dateKey, prev.yesterdayKey);
    if (!stillNy && !stillSess) {
      scoped = scoped.filter((b) => b.time.getTime() !== dropT);
    }
  }

  const newT = last.time.getTime();
  if (!scoped.some((b) => b.time.getTime() === newT)) {
    scoped = [...scoped, last];
  }

  return scoped;
}

function advanceSessionM1(
  prev: StructureFactsIncState,
  m1: Bar[],
  cmeSessionKey: string
): Bar[] | null {
  const last = m1.at(-1);
  if (!last) return null;
  if (prev.cmeSessionKey !== cmeSessionKey) return null;

  if (prev.m1Length === m1.length) {
    if (prev.lastBarTimeMs !== last.time.getTime()) return null;
    const lastT = last.time.getTime();
    return prev.sessionM1.map((b) => (b.time.getTime() === lastT ? last : b));
  }

  if (prev.m1Length !== m1.length - 1) return null;
  if (last.time.getTime() <= prev.lastBarTimeMs) return null;

  if (cmeSessionDateKeyFromDate(last.time) === cmeSessionKey) {
    return [...prev.sessionM1, last];
  }
  return prev.sessionM1;
}

function assembleStructureFacts(input: {
  m1: Bar[];
  liquidityLevels: Array<{ id: string; label: string; price: number }>;
  asOf: Date;
  activeSessionId: SessionId;
  relativeEqualPools: RelativeEqualPool[];
  firstPresentedFvg: ReturnType<typeof detectFirstPresentedFvgs>;
  sessionM1: Bar[];
}) {
  const { m1, liquidityLevels, relativeEqualPools, firstPresentedFvg, sessionM1, asOf } = input;
  const mss = detectMss(m1);
  const m1UnfilledFvgs = detectM1UnfilledFvgs(m1);
  const m1InvertedFvgs = m1UnfilledFvgs.filter((f) => f.inverted);

  const FHDR_END_MIN = 10 * 60 + 30;
  const fhdrDateKey = getEstDateKey(asOf);
  const fhdrBars = barsInEstWindow(m1, RTH_OPEN_MIN, FHDR_END_MIN, fhdrDateKey);
  const fhdr =
    fhdrBars.length > 0
      ? {
          high: Math.max(...fhdrBars.map((b) => b.high)),
          low: Math.min(...fhdrBars.map((b) => b.low)),
          locked: getEstMinutes(asOf) >= FHDR_END_MIN,
          startTime: estTimeOnDateKey(fhdrDateKey, 9, 30),
          endTime: estTimeOnDateKey(fhdrDateKey, 10, 30),
        }
      : null;

  for (const key of ["nyOpening", "postFhdr", "activeSession"] as const) {
    const fp = firstPresentedFvg[key];
    if (fp?.fvg && fp.fvg.inverted == null) {
      fp.fvg.inverted = isFvgInverted(m1, fp.fvg);
    }
  }

  const fpSummary = firstPresentedFvg.nyOpening
    ? `NY opening first presented 1m FVG at ${firstPresentedFvg.nyOpening.fvg.formedAt}`
    : "No NY opening first presented 1m FVG yet";

  const rehRelSummary = relativeEqualPools.length
    ? `${relativeEqualPools.filter((p) => p.type === "reh").length} REH, ${relativeEqualPools.filter((p) => p.type === "rel").length} REL pool(s)`
    : "No relative equal high/low pools in scope";

  const pdIds = new Set(["pdh", "pdl"]);
  const highIds = new Set([
    "pdh",
    "asia_high",
    "london_high",
    "ny_pre_high",
    "ny_rth_high",
    "org_top",
    "ndog_top",
    "nwog_top",
  ]);
  const levelInteractions = liquidityLevels.map((level) => {
    if (isReferenceInteractionLevel(level.id)) {
      const interaction = classifyReferenceCloseInteraction(sessionM1, level);
      return {
        levelId: level.id,
        status: interaction.status,
        why: interaction.why,
        atTime: interaction.qualifyingTick?.timestamp,
        candleId: interaction.qualifyingTick?.candleId,
        tickPrice: interaction.qualifyingTick?.price,
      };
    }
    if (!isSweepableLiquidityId(level.id)) {
      return {
        levelId: level.id,
        status: "UNTOUCHED" as const,
        why: `${level.id} is a reference price, not a PDH/PDL liquidity pool.`,
      };
    }
    const side = highIds.has(level.id) || /high|top/i.test(level.label) ? "high" : "low";
    const bars = pdIds.has(level.id) ? sessionM1 : m1;
    const interaction = classifyLevelInteraction(bars, level, side === "high" ? "high" : "low");
    return {
      levelId: level.id,
      status: interaction.status,
      why: interaction.why,
      atTime: interaction.qualifyingTick?.timestamp,
      candleId: interaction.qualifyingTick?.candleId,
      tickPrice: interaction.qualifyingTick?.price,
    };
  });

  const interactionById = new Map(levelInteractions.map((i) => [i.levelId, i]));
  const rawSweeps = detectLiquiditySweeps(
    m1,
    liquidityLevels.filter((l) => isSweepableLiquidityId(l.id))
  );
  const liquiditySweeps = rawSweeps.filter((sweep) => {
    if (sweep.levelId !== "pdh" && sweep.levelId !== "pdl") return true;
    return interactionById.get(sweep.levelId)?.status === "CLOSED_BEYOND";
  });

  return {
    mss,
    liquiditySweeps,
    levelInteractions,
    relativeEqualPools,
    m1UnfilledFvgs,
    m1InvertedFvgs,
    fhdr,
    firstPresentedFvg,
    summary: [
      mss?.description ?? "No recent 1m MSS",
      liquiditySweeps.length
        ? `${liquiditySweeps.length} liquidity sweep(s) detected`
        : "No recent liquidity sweeps",
      m1UnfilledFvgs.length
        ? `${m1UnfilledFvgs.length} unfilled 1m FVG(s)${m1InvertedFvgs.length ? ` (${m1InvertedFvgs.length} inverted / IFVG)` : ""}`
        : "No unfilled 1m FVGs in lookback",
      fhdr
        ? `FHDR ${fhdr.low.toFixed(2)}–${fhdr.high.toFixed(2)}${fhdr.locked ? " (locked)" : " (forming)"}`
        : "No FHDR bars in 9:30–10:30 ET window",
      fpSummary,
      rehRelSummary,
    ].join("; "),
  };
}

function captureIncState(
  m1: Bar[],
  _asOf: Date,
  activeSessionId: SessionId,
  rehScoped: Bar[],
  dateKey: string,
  yesterdayKey: string,
  sessionM1: Bar[],
  cmeSessionKey: string
): StructureFactsIncState {
  const last = m1.at(-1);
  return {
    m1Length: m1.length,
    lastBarTimeMs: last ? last.time.getTime() : 0,
    dateKey,
    sessionId: activeSessionId,
    yesterdayKey,
    cmeSessionKey,
    rehScoped,
    sessionM1,
  };
}

/** PDH/PDL/session H/L/ORG/NDOG are sweepable pools. PDC/PDO/EQ/daily FVG mids are not PDH raids. */
function isSweepableLiquidityId(id: string): boolean {
  if (id.startsWith("d_fvg")) return false;
  return !["pdc", "pdo", "cdo", "cdeq", "pdeq"].includes(id);
}

/** Reference closes get body-close interaction status but stay out of liquiditySweeps. */
function isReferenceInteractionLevel(id: string): boolean {
  return id === "pdc";
}

export function buildStructureFacts(
  m1: Bar[],
  liquidityLevels: Array<{ id: string; label: string; price: number }>,
  asOf: Date = new Date(),
  activeSessionId: SessionId = "ny_am"
) {
  const relativeEqualPools = detectRelativeEqualPools(m1, asOf, activeSessionId);
  const firstPresentedFvg = detectFirstPresentedFvgs(m1, asOf, activeSessionId);
  const currentSessionKey = cmeSessionDateKeyFromDate(asOf);
  const sessionM1 = barsInCmeSession(m1, currentSessionKey);
  return assembleStructureFacts({
    m1,
    liquidityLevels,
    asOf,
    activeSessionId,
    relativeEqualPools,
    firstPresentedFvg,
    sessionM1,
  });
}

export type StructureFactsResult = ReturnType<typeof buildStructureFacts>;

export type StructureFactsUpdateResult = {
  facts: StructureFactsResult;
  state: StructureFactsIncState;
  mode: "full" | "incremental";
  leaf: {
    reh: "full_scope" | "advanced_scope";
    firstPresented: { nyOpening: boolean; postFhdr: boolean; activeSession: boolean };
  };
};

/**
 * Incremental structure facts for the closed-bar / tick path.
 * Avoids full-history EST window rescans for REH/REL scope and skips first-presented
 * re-detection once formations are set. Output must match buildStructureFacts.
 */
export function updateStructureFacts(
  // Only firstPresentedFvg is read on the incremental path; accept MarketContext.structureFacts
  // which may omit/widen levelInteractions relative to StructureFactsResult.
  prevFacts: Pick<StructureFactsResult, "firstPresentedFvg"> | null | undefined,
  prevState: StructureFactsIncState | null | undefined,
  m1: Bar[],
  liquidityLevels: Array<{ id: string; label: string; price: number }>,
  asOf: Date = new Date(),
  activeSessionId: SessionId = "ny_am"
): StructureFactsUpdateResult {
  const dateKey = getEstDateKey(asOf);
  const cmeSessionKey = cmeSessionDateKeyFromDate(asOf);
  const last = m1.at(-1);
  const canAdvance =
    !!prevState &&
    !!prevFacts &&
    !!last &&
    prevState.dateKey === dateKey &&
    prevState.sessionId === activeSessionId &&
    prevState.cmeSessionKey === cmeSessionKey &&
    (prevState.m1Length === m1.length || prevState.m1Length === m1.length - 1);

  const fullUpdate = (): StructureFactsUpdateResult => {
    const built = buildRehScopedBars(m1, asOf, activeSessionId);
    const relativeEqualPools = poolsFromRehScoped(built.scoped);
    const firstPresentedFvg = detectFirstPresentedFvgs(m1, asOf, activeSessionId);
    const sessionM1 = barsInCmeSession(m1, cmeSessionKey);
    const facts = assembleStructureFacts({
      m1,
      liquidityLevels,
      asOf,
      activeSessionId,
      relativeEqualPools,
      firstPresentedFvg,
      sessionM1,
    });
    return {
      facts,
      state: captureIncState(
        m1,
        asOf,
        activeSessionId,
        built.scoped,
        built.dateKey,
        built.yesterdayKey,
        sessionM1,
        cmeSessionKey
      ),
      mode: "full",
      leaf: {
        reh: "full_scope",
        firstPresented: { nyOpening: false, postFhdr: false, activeSession: false },
      },
    };
  };

  if (!canAdvance) return fullUpdate();

  const rehScoped = advanceRehScoped(prevState!, m1, dateKey, activeSessionId);
  const sessionM1 = advanceSessionM1(prevState!, m1, cmeSessionKey);
  if (!rehScoped || !sessionM1) return fullUpdate();

  const relativeEqualPools = poolsFromRehScoped(rehScoped);
  const fpInc = detectFirstPresentedFvgsIncremental(m1, asOf, activeSessionId, {
    dateKey: prevState!.dateKey,
    sessionId: prevState!.sessionId,
    result: prevFacts!.firstPresentedFvg,
  });
  const firstPresentedFvg = {
    nyOpening: fpInc.nyOpening,
    postFhdr: fpInc.postFhdr,
    activeSession: fpInc.activeSession,
  };
  const facts = assembleStructureFacts({
    m1,
    liquidityLevels,
    asOf,
    activeSessionId,
    relativeEqualPools,
    firstPresentedFvg,
    sessionM1,
  });

  return {
    facts,
    state: captureIncState(
      m1,
      asOf,
      activeSessionId,
      rehScoped,
      dateKey,
      prevState!.yesterdayKey,
      sessionM1,
      cmeSessionKey
    ),
    mode: "incremental",
    leaf: {
      reh: "advanced_scope",
      firstPresented: fpInc.reused,
    },
  };
}
