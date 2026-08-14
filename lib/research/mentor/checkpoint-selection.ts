/**
 * Research-only checkpoint selection for mentor evaluation.
 *
 * **Mode A — Framework validation** (`selectFrameworkCheckpoints`):
 * ~12 session-phase anchors per CME day. Answers: "Does Karen's reasoning
 * framework function correctly?" High rubric fidelity; low directional-rate power.
 *
 * **Mode B — Responsiveness coverage** (`selectResponsivenessCheckpoints`):
 * Denser, regime- and structure-stratified sample. Answers: "How responsive is
 * Karen across changing market conditions?" No verdict/outcome filtering.
 *
 * Both modes use only bars ≤ cutoff — no future lookahead, no cherry-picking.
 */
import { getEstDateKey, RTH_OPEN_MIN } from "../../market-data";
import { detectMss } from "../../structure";
import { cmeSessionDateKey } from "../../tickstream/htf-aggregate";
import type { Bar } from "../../types";

export type SessionPhase =
  | "globex_open"
  | "overnight"
  | "early_globex"
  | "pre_market"
  | "pre_ny_open"
  | "ny_open"
  | "post_open"
  | "mid_morning"
  | "lunch"
  | "pm_session"
  | "session_end"
  | "late_globex";

export type RegimeProxy = "trend_up" | "trend_down" | "range" | "volatile" | "quiet";

export type CheckpointCandidate = {
  asOf: string;
  barIndex: number;
  sessionDate: string;
  sessionPhase: SessionPhase;
  regimeProxy: RegimeProxy;
  label: string;
  rationale: string;
  /** Selection stratum — for coverage audit, not scoring. */
  stratum: string;
};

export type MentorEvalMode = "framework" | "responsiveness";

export type CheckpointPlanOptions = {
  /** Minimum bars before a cutoff is eligible. */
  minWarmupBars?: number;
  /** Max checkpoints per CME session day (default 12). */
  maxPerSession?: number;
  /** Include adaptive regime-shift candidates (default true). */
  includeRegimeShifts?: boolean;
  /** Seed for deterministic tie-breaking within strata. */
  seed?: number;
};

export type ResponsivenessPlanOptions = {
  minWarmupBars?: number;
  /**
   * RTH temporal grid step in minutes (default 20).
   * 20 min balances coverage vs runtime: ~16 RTH samples/session vs Wilson 95% CI
   * width ~6% on directional rates (vs ~16% at n=12). Range 15–30 min is acceptable.
   */
  rthIntervalMinutes?: number;
  /** Max structure-change candidates per session (default 6). */
  maxStructureChangesPerSession?: number;
  /** Max conflicting-setup candidates per session (default 4). */
  maxConflictingPerSession?: number;
  seed?: number;
};

/** Benchmark p50 ms/checkpoint from Aug 12 pilot (scripts/research-mentor-checkpoint-benchmark.ts). */
export const CHECKPOINT_MS_P50 = 10_793;

/** Fixed session-phase anchors — UTC hour:minute on each session day. */
const SESSION_ANCHORS: Array<{ phase: SessionPhase; utcHour: number; utcMinute: number; label: string; rationale: string }> = [
  { phase: "globex_open", utcHour: 22, utcMinute: 0, label: "Globex open", rationale: "CME session open — minimal RTH context" },
  { phase: "overnight", utcHour: 2, utcMinute: 0, label: "Overnight mid", rationale: "Low-liquidity overnight" },
  { phase: "early_globex", utcHour: 6, utcMinute: 0, label: "Early morning", rationale: "Pre-London globex" },
  { phase: "pre_market", utcHour: 11, utcMinute: 0, label: "Pre-market", rationale: "Pre-RTH PD context" },
  { phase: "pre_ny_open", utcHour: 13, utcMinute: 0, label: "Pre-NY open", rationale: "Final pre-open" },
  { phase: "ny_open", utcHour: 14, utcMinute: 30, label: "NY open", rationale: "Canonical NY RTH anchor" },
  { phase: "post_open", utcHour: 15, utcMinute: 30, label: "Post-open hour", rationale: "First hour displacement" },
  { phase: "mid_morning", utcHour: 16, utcMinute: 30, label: "Mid-morning RTH", rationale: "Trend vs range" },
  { phase: "lunch", utcHour: 17, utcMinute: 30, label: "Lunch", rationale: "Liquidity dip" },
  { phase: "pm_session", utcHour: 19, utcMinute: 0, label: "PM session", rationale: "Afternoon continuation" },
  { phase: "session_end", utcHour: 20, utcMinute: 59, label: "Session end", rationale: "Last RTH minute" },
  { phase: "late_globex", utcHour: 21, utcMinute: 45, label: "Late globex", rationale: "Near session boundary" },
];

const LOOKBACK = 60;

function seededHash(seed: number, key: string): number {
  let h = seed;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function barRange(b: Bar): number {
  return b.high - b.low;
}

function atr(bars: Bar[], endIndex: number, period = 14): number {
  if (endIndex < 0 || endIndex >= bars.length) return 1;
  const start = Math.max(0, endIndex - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= endIndex; i++) {
    const b = bars[i];
    if (!b) continue;
    sum += barRange(b);
    count++;
  }
  return count > 0 ? sum / count : 1;
}

/** Point-in-time regime proxy — uses only bars[0..index]. */
export function classifyRegimeAt(bars: Bar[], index: number): RegimeProxy {
  if (index < 10 || index >= bars.length) return "quiet";
  const start = Math.max(0, index - LOOKBACK + 1);
  const slice = bars.slice(start, index + 1);
  if (slice.length < 5) return "quiet";
  const ranges = slice.map(barRange);
  const avgRange = ranges.reduce((s, r) => s + r, 0) / ranges.length;
  const recentRange = ranges.slice(-10).reduce((s, r) => s + r, 0) / Math.min(10, ranges.length);
  const localAtr = atr(bars, index);
  const base = bars[start];
  const cur = bars[index];
  if (!base || !cur) return "quiet";
  const drift = cur.close - base.close;
  const driftNorm = Math.abs(drift) / (localAtr * Math.sqrt(LOOKBACK) || 1);

  const volRatio = recentRange / (avgRange || 1);
  if (volRatio >= 1.5) return "volatile";
  if (volRatio <= 0.6) return "quiet";
  if (driftNorm >= 1.2 && drift > 0) return "trend_up";
  if (driftNorm >= 1.2 && drift < 0) return "trend_down";
  return "range";
}

function findBarAtOrBefore(bars: Bar[], targetMs: number, minIndex: number): number | null {
  let best: number | null = null;
  for (let i = minIndex; i < bars.length; i++) {
    const t = bars[i]!.time.getTime();
    if (t > targetMs) break;
    best = i;
    if (t === targetMs) break;
  }
  return best;
}

function sessionDatesInData(bars: Bar[]): string[] {
  const dates = new Set<string>();
  for (const b of bars) dates.add(cmeSessionDateKey(Math.floor(b.time.getTime() / 1000)));
  return [...dates].sort();
}

function anchorMsForSession(sessionDate: string, utcHour: number, utcMinute: number): number {
  // Session date key is ET calendar date; anchors are UTC wall-clock on prior calendar day for 22:00 open.
  const [y, m, d] = sessionDate.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!, utcHour, utcMinute, 0, 0));
  // Globex open is previous UTC calendar day at 22:00 for same session
  if (utcHour >= 22) base.setUTCDate(base.getUTCDate() - 1);
  return base.getTime();
}

function detectRegimeShiftIndices(bars: Bar[], minIndex: number): number[] {
  const shifts: number[] = [];
  if (minIndex >= bars.length) return shifts;
  let prev = classifyRegimeAt(bars, minIndex);
  for (let i = minIndex + 15; i < bars.length; i += 15) {
    const cur = classifyRegimeAt(bars, i);
    if (cur !== prev) {
      shifts.push(i);
      prev = cur;
    }
  }
  return shifts;
}

/**
 * Build stratified checkpoint plan across all CME sessions in m1 data.
 * Algorithm:
 * 1. Fixed session-phase anchors per session day (coverage guarantee).
 * 2. Optional regime-shift candidates (max 2/session) when proxy changes.
 * 3. Dedupe by bar index; sort chronologically.
 * No filtering by pipeline verdict or post-hoc outcome.
 */
export function buildStratifiedCheckpointPlan(
  bars: Bar[],
  opts: CheckpointPlanOptions = {}
): CheckpointCandidate[] {
  const minWarmup = opts.minWarmupBars ?? 30;
  const maxPerSession = opts.maxPerSession ?? 12;
  const includeRegimeShifts = opts.includeRegimeShifts ?? true;
  const seed = opts.seed ?? 42;

  if (bars.length <= minWarmup) return [];

  const sessions = sessionDatesInData(bars);
  const candidates: CheckpointCandidate[] = [];
  const usedIndices = new Set<number>();

  for (const sessionDate of sessions) {
    let sessionCount = 0;

    for (const anchor of SESSION_ANCHORS) {
      if (sessionCount >= maxPerSession) break;
      const targetMs = anchorMsForSession(sessionDate, anchor.utcHour, anchor.utcMinute);
      const idx = findBarAtOrBefore(bars, targetMs, minWarmup);
      if (idx == null || usedIndices.has(idx)) continue;
      if (cmeSessionDateKey(Math.floor(bars[idx]!.time.getTime() / 1000)) !== sessionDate) continue;

      const regime = classifyRegimeAt(bars, idx);
      candidates.push({
        asOf: bars[idx]!.time.toISOString(),
        barIndex: idx,
        sessionDate,
        sessionPhase: anchor.phase,
        regimeProxy: regime,
        label: anchor.label,
        rationale: anchor.rationale,
        stratum: `session_phase:${anchor.phase}`,
      });
      usedIndices.add(idx);
      sessionCount++;
    }

    if (includeRegimeShifts && sessionCount < maxPerSession) {
      const sessionStartIdx = bars.findIndex(
        (b) => cmeSessionDateKey(Math.floor(b.time.getTime() / 1000)) === sessionDate
      );
      if (sessionStartIdx >= 0) {
        const sessionEndIdx = bars.findIndex((b, i) => {
          if (i <= sessionStartIdx) return false;
          return cmeSessionDateKey(Math.floor(b.time.getTime() / 1000)) !== sessionDate;
        });
        const end = sessionEndIdx === -1 ? bars.length - 1 : sessionEndIdx - 1;
        const shifts = detectRegimeShiftIndices(bars, Math.max(sessionStartIdx + minWarmup, minWarmup)).filter(
          (i) => i <= end
        );

        // Deterministic subsample if >2 shifts per session
        const ranked = shifts
          .map((i) => ({ i, h: seededHash(seed, `${sessionDate}:${i}`) }))
          .sort((a, b) => a.h - b.h)
          .slice(0, 2);

        for (const { i } of ranked) {
          if (sessionCount >= maxPerSession || usedIndices.has(i)) continue;
          const regime = classifyRegimeAt(bars, i);
          candidates.push({
            asOf: bars[i]!.time.toISOString(),
            barIndex: i,
            sessionDate,
            sessionPhase: "pm_session",
            regimeProxy: regime,
            label: `Regime shift → ${regime}`,
            rationale: "Adaptive candidate on regime proxy change (no outcome filter)",
            stratum: `regime_shift:${regime}`,
          });
          usedIndices.add(i);
          sessionCount++;
        }
      }
    }
  }

  candidates.sort((a, b) => a.barIndex - b.barIndex);
  return candidates;
}

/** Mode A — framework validation (~12 session anchors / day). */
export const selectFrameworkCheckpoints = buildStratifiedCheckpointPlan;

const FHDR_END_MIN = 10 * 60 + 30;
/** RTH window aligned with existing session anchors (UTC wall clock). */
const RTH_START_UTC = { hour: 14, minute: 30 };
const RTH_END_UTC = { hour: 20, minute: 59 };

function rthAnchorMsForSession(sessionDate: string, offsetMinutes: number): number {
  const base = anchorMsForSession(sessionDate, RTH_START_UTC.hour, RTH_START_UTC.minute);
  return base + offsetMinutes * 60_000;
}

function sessionBarRange(
  bars: Bar[],
  sessionDate: string,
  minWarmup: number
): { start: number; end: number } | null {
  const start = bars.findIndex(
    (b) => cmeSessionDateKey(Math.floor(b.time.getTime() / 1000)) === sessionDate
  );
  if (start < 0) return null;
  const endIdx = bars.findIndex((b, i) => {
    if (i <= start) return false;
    return cmeSessionDateKey(Math.floor(b.time.getTime() / 1000)) !== sessionDate;
  });
  const end = endIdx === -1 ? bars.length - 1 : endIdx - 1;
  return { start: Math.max(start, minWarmup), end };
}

function pushCandidate(
  candidates: CheckpointCandidate[],
  usedIndices: Set<number>,
  bars: Bar[],
  idx: number,
  sessionDate: string,
  stratum: string,
  label: string,
  rationale: string,
  sessionPhase: SessionPhase = "pm_session"
): boolean {
  if (usedIndices.has(idx) || idx < 0 || idx >= bars.length) return false;
  if (cmeSessionDateKey(Math.floor(bars[idx]!.time.getTime() / 1000)) !== sessionDate) return false;
  const regime = classifyRegimeAt(bars, idx);
  candidates.push({
    asOf: bars[idx]!.time.toISOString(),
    barIndex: idx,
    sessionDate,
    sessionPhase,
    regimeProxy: regime,
    label,
    rationale,
    stratum,
  });
  usedIndices.add(idx);
  return true;
}

/** EDT minutes from midnight — Aug fixtures are EDT (UTC-4); research-only fast path. */
function getEstMinutesFromBar(bar: Bar): number {
  const utcMin = bar.time.getUTCHours() * 60 + bar.time.getUTCMinutes();
  return ((utcMin - 4 * 60) + 24 * 60) % (24 * 60);
}

/** Detect MSS direction flips (80-bar window, step 15 — O(n) per session). */
function detectMssFlipIndices(bars: Bar[], start: number, end: number): number[] {
  const flips: number[] = [];
  let prevDir: string | null = null;
  for (let i = start; i <= end; i += 15) {
    const windowStart = Math.max(0, i - 79);
    const window = bars.slice(windowStart, i + 1);
    if (window.length < 30) continue;
    const mss = detectMss(window);
    const dir = mss?.direction ?? null;
    if (dir && prevDir && dir !== prevDir) flips.push(i);
    if (dir) prevDir = dir;
  }
  return flips;
}

/** Point-in-time FHDR from bars[0..index] only. */
function fhdrAtIndex(bars: Bar[], index: number): { high: number; low: number; locked: boolean } | null {
  const bar = bars[index];
  if (!bar) return null;
  const today = getEstDateKey(bar.time);
  const estMin = getEstMinutesFromBar(bar);
  if (estMin < FHDR_END_MIN) return null;

  const fhdrBars: Bar[] = [];
  for (let i = index; i >= 0; i--) {
    const b = bars[i]!;
    if (getEstDateKey(b.time) !== today) break;
    if (getEstMinutesFromBar(b) >= RTH_OPEN_MIN && getEstMinutesFromBar(b) <= FHDR_END_MIN) {
      fhdrBars.unshift(b);
    }
  }
  if (fhdrBars.length < 5) return null;
  const high = Math.max(...fhdrBars.map((b) => b.high));
  const low = Math.min(...fhdrBars.map((b) => b.low));
  return { high, low, locked: true };
}

/** First body-close break of locked FHDR high/low after 10:30 ET. */
function detectFhdrBreakIndices(bars: Bar[], start: number, end: number): number[] {
  const breaks: number[] = [];
  let fhdr: { high: number; low: number } | null = null;
  let lockIdx = -1;
  for (let i = start; i <= end; i++) {
    if (getEstMinutesFromBar(bars[i]!) >= FHDR_END_MIN) {
      lockIdx = i;
      break;
    }
  }
  if (lockIdx < 0) return breaks;
  const computed = fhdrAtIndex(bars, lockIdx);
  if (!computed?.locked) return breaks;
  fhdr = { high: computed.high, low: computed.low };
  for (let i = lockIdx + 1; i <= end; i++) {
    const close = bars[i]!.close;
    if (close > fhdr.high || close < fhdr.low) {
      breaks.push(i);
      break;
    }
  }
  return breaks;
}

/** Conflicting bull/bear evidence from structure at T (no pipeline). */
export function detectConflictingSetupAt(bars: Bar[], index: number): boolean {
  if (index < 30) return false;
  const windowStart = Math.max(0, index - 79);
  const window = bars.slice(windowStart, index + 1);
  const mss = detectMss(window);
  const regime = classifyRegimeAt(bars, index);
  const start = Math.max(0, index - LOOKBACK + 1);
  const base = bars[start];
  const cur = bars[index];
  if (!base || !cur) return false;
  const drift = cur.close - base.close;
  const localAtr = atr(bars, index);
  const driftNorm = Math.abs(drift) / (localAtr * Math.sqrt(LOOKBACK) || 1);

  const bullEvidence =
    mss?.direction === "bullish" || regime === "trend_up" || (drift > 0 && driftNorm >= 0.8);
  const bearEvidence =
    mss?.direction === "bearish" || regime === "trend_down" || (drift < 0 && driftNorm >= 0.8);

  return bullEvidence && bearEvidence;
}

function detectConflictingIndices(bars: Bar[], start: number, end: number): number[] {
  const hits: number[] = [];
  for (let i = start; i <= end; i += 20) {
    if (detectConflictingSetupAt(bars, i)) hits.push(i);
  }
  return hits;
}

function subsampleBySeed(
  indices: number[],
  sessionDate: string,
  max: number,
  seed: number,
  prefix: string
): number[] {
  return indices
    .map((i) => ({ i, h: seededHash(seed, `${prefix}:${sessionDate}:${i}`) }))
    .sort((a, b) => a.h - b.h)
    .slice(0, max)
    .map((x) => x.i);
}

/**
 * Mode B — responsiveness coverage.
 *
 * Algorithm (all point-in-time, no verdict/outcome filter):
 * 1. Session transition anchors (same as Mode A) — globex/NY/lunch/PM/end boundaries.
 * 2. RTH temporal grid every `rthIntervalMinutes` (default 20) — density during active session.
 * 3. Structure-change candidates: MSS flips, FHDR body-close breaks (max per session).
 * 4. Regime-shift points when classifyRegimeAt changes (deduped).
 * 5. Conflicting-setup periods when bull AND bear evidence present at T.
 * Dedupe by bar index; sort chronologically.
 */
export function selectResponsivenessCheckpoints(
  bars: Bar[],
  opts: ResponsivenessPlanOptions = {}
): CheckpointCandidate[] {
  const minWarmup = opts.minWarmupBars ?? 30;
  const rthInterval = opts.rthIntervalMinutes ?? 20;
  const maxStructure = opts.maxStructureChangesPerSession ?? 6;
  const maxConflicting = opts.maxConflictingPerSession ?? 4;
  const seed = opts.seed ?? 42;

  if (bars.length <= minWarmup) return [];

  const sessions = sessionDatesInData(bars);
  const candidates: CheckpointCandidate[] = [];
  const usedIndices = new Set<number>();

  const rthEndMs = (sessionDate: string) =>
    anchorMsForSession(sessionDate, RTH_END_UTC.hour, RTH_END_UTC.minute);
  const rthDurationMin =
    (RTH_END_UTC.hour * 60 + RTH_END_UTC.minute) - (RTH_START_UTC.hour * 60 + RTH_START_UTC.minute);

  for (const sessionDate of sessions) {
    const range = sessionBarRange(bars, sessionDate, minWarmup);
    if (!range) continue;

    // 1. Session transition anchors
    for (const anchor of SESSION_ANCHORS) {
      const targetMs = anchorMsForSession(sessionDate, anchor.utcHour, anchor.utcMinute);
      const idx = findBarAtOrBefore(bars, targetMs, minWarmup);
      if (idx == null) continue;
      pushCandidate(
        candidates,
        usedIndices,
        bars,
        idx,
        sessionDate,
        `session_transition:${anchor.phase}`,
        anchor.label,
        anchor.rationale,
        anchor.phase
      );
    }

    // 2. RTH temporal density grid
    for (let offset = 0; offset <= rthDurationMin; offset += rthInterval) {
      const targetMs = rthAnchorMsForSession(sessionDate, offset);
      if (targetMs > rthEndMs(sessionDate)) break;
      const idx = findBarAtOrBefore(bars, targetMs, minWarmup);
      if (idx == null || idx > range.end) continue;
      pushCandidate(
        candidates,
        usedIndices,
        bars,
        idx,
        sessionDate,
        `rth_temporal:${rthInterval}m`,
        `RTH +${offset}m`,
        `Temporal density sample every ${rthInterval} min during NY RTH (no outcome filter)`,
        offset === 0 ? "ny_open" : offset < 60 ? "post_open" : offset < 120 ? "mid_morning" : offset < 180 ? "lunch" : "pm_session"
      );
    }

    // 3. Structure-change candidates
    const mssFlips = subsampleBySeed(
      detectMssFlipIndices(bars, range.start, range.end),
      sessionDate,
      maxStructure,
      seed,
      "mss_flip"
    );
    for (const idx of mssFlips) {
      const window = bars.slice(Math.max(0, idx - 79), idx + 1);
      const mss = detectMss(window);
      pushCandidate(
        candidates,
        usedIndices,
        bars,
        idx,
        sessionDate,
        `structure_change:mss_flip`,
        `MSS flip → ${mss?.direction ?? "?"}`,
        "MSS direction change detected from bars ≤ T only",
        "post_open"
      );
    }

    for (const idx of subsampleBySeed(
      detectFhdrBreakIndices(bars, range.start, range.end),
      sessionDate,
      2,
      seed,
      "fhdr_break"
    )) {
      pushCandidate(
        candidates,
        usedIndices,
        bars,
        idx,
        sessionDate,
        `structure_change:fhdr_break`,
        "FHDR body-close break",
        "First hour dealing range break (body close outside 9:30–10:30 ET range)",
        "post_open"
      );
    }

    // 4. Regime shifts within session
    const regimeShifts = detectRegimeShiftIndices(bars, range.start).filter((i) => i <= range.end);
    for (const idx of subsampleBySeed(regimeShifts, sessionDate, 3, seed, "regime_shift")) {
      const regime = classifyRegimeAt(bars, idx);
      pushCandidate(
        candidates,
        usedIndices,
        bars,
        idx,
        sessionDate,
        `regime_proxy:${regime}`,
        `Regime → ${regime}`,
        "Regime proxy change (trend/range/volatile/quiet from bars ≤ T)",
        "pm_session"
      );
    }

    // 5. Conflicting-setup periods
    for (const idx of subsampleBySeed(
      detectConflictingIndices(bars, range.start, range.end),
      sessionDate,
      maxConflicting,
      seed,
      "conflicting"
    )) {
      pushCandidate(
        candidates,
        usedIndices,
        bars,
        idx,
        sessionDate,
        `conflicting_setup`,
        "Conflicting bull/bear evidence",
        "Both directional evidence present at T — tests dominant_conflicting_evidence handling",
        "mid_morning"
      );
    }
  }

  candidates.sort((a, b) => a.barIndex - b.barIndex);
  return candidates;
}

/** Convert checkpoint candidates to eval cutoff specs. */
export function checkpointsToCutoffSpecs(
  candidates: CheckpointCandidate[]
): Array<{ asOf: string; label: string; rationale: string; stratum?: string; regimeProxy?: RegimeProxy }> {
  return candidates.map((c) => ({
    asOf: c.asOf,
    label: c.label,
    rationale: c.rationale,
    stratum: c.stratum,
    regimeProxy: c.regimeProxy,
  }));
}

export type CheckpointModeComparison = {
  modeA: { total: number; summary: ReturnType<typeof summarizeCheckpointPlan> };
  modeB: { total: number; summary: ReturnType<typeof summarizeCheckpointPlan> };
  scaling: {
    checkpointMsP50: number;
    estimates: {
      oneDay: { checkpoints: number; estMinutes: number };
      oneWeek: { checkpoints: number; estMinutes: number };
      oneMonth: { checkpoints: number; estMinutes: number };
    };
  };
};

/** Compare Mode A vs B counts and estimate runtime for 1d / 1w / 1mo. */
export function compareCheckpointModes(
  bars: Bar[],
  opts?: { rthIntervalMinutes?: number; msPerCheckpoint?: number; tradingDaysPerWeek?: number }
): CheckpointModeComparison {
  const modeA = selectFrameworkCheckpoints(bars);
  const modeB = selectResponsivenessCheckpoints(bars, {
    rthIntervalMinutes: opts?.rthIntervalMinutes ?? 20,
  });
  const ms = opts?.msPerCheckpoint ?? CHECKPOINT_MS_P50;
  const perDayA = modeA.length / Math.max(1, new Set(modeA.map((c) => c.sessionDate)).size);
  const perDayB = modeB.length / Math.max(1, new Set(modeB.map((c) => c.sessionDate)).size);
  const tradingDaysWeek = opts?.tradingDaysPerWeek ?? 5;
  const estMin = (n: number) => Math.round(((n * ms) / 60_000) * 10) / 10;

  return {
    modeA: { total: modeA.length, summary: summarizeCheckpointPlan(modeA) },
    modeB: { total: modeB.length, summary: summarizeCheckpointPlan(modeB) },
    scaling: {
      checkpointMsP50: ms,
      estimates: {
        oneDay: { checkpoints: Math.round(perDayA), estMinutes: estMin(perDayA) },
        oneWeek: {
          checkpoints: Math.round(perDayB * tradingDaysWeek),
          estMinutes: estMin(perDayB * tradingDaysWeek),
        },
        oneMonth: {
          checkpoints: Math.round(perDayB * 22),
          estMinutes: estMin(perDayB * 22),
        },
      },
    },
  };
}

/** Summarize coverage for scaling estimates. */
export function summarizeCheckpointPlan(candidates: CheckpointCandidate[]): {
  total: number;
  bySession: Record<string, number>;
  byPhase: Record<string, number>;
  byRegime: Record<string, number>;
  byStratum: Record<string, number>;
} {
  const bySession: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  const byRegime: Record<string, number> = {};
  const byStratum: Record<string, number> = {};
  for (const c of candidates) {
    bySession[c.sessionDate] = (bySession[c.sessionDate] ?? 0) + 1;
    byPhase[c.sessionPhase] = (byPhase[c.sessionPhase] ?? 0) + 1;
    byRegime[c.regimeProxy] = (byRegime[c.regimeProxy] ?? 0) + 1;
    const stratumKey = c.stratum.split(":")[0] ?? c.stratum;
    byStratum[stratumKey] = (byStratum[stratumKey] ?? 0) + 1;
  }
  return { total: candidates.length, bySession, byPhase, byRegime, byStratum };
}
