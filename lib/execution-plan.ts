import type { FvgZone, MarketContext } from "./types";
import { nearestPdLevels, type PdLevel } from "./pd-arrays";

const ENTRY_PAD = 2;
/** Max MNQ points below/above price for a "shallow" FVG retrace — deeper = different structure. */
const SHALLOW_RETRACE_MAX = 35;
/** Max MNQ points from last price to entry zone — avoid PD/session levels far away. */
const MAX_ENTRY_FROM_PRICE = 28;
/** Minimum MNQ points from entry anchor to Target 1 — skip micro PD levels (PDO/PDC) when too tight. */
const MIN_TARGET1_POINTS = 45;
/** Minimum additional MNQ points beyond Target 1 for Target 2. */
const MIN_TARGET2_BEYOND_T1 = 40;

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

function fvgMid(f: FvgZone): number {
  return roundMnq((f.top + f.bottom) / 2);
}

function fvgBounds(f: FvgZone): { lo: number; hi: number } {
  return {
    lo: roundMnq(Math.min(f.top, f.bottom)),
    hi: roundMnq(Math.max(f.top, f.bottom)),
  };
}

type Mss = MarketContext["structureFacts"]["mss"];

function fvgRecency(f: FvgZone): number {
  return f.startTime ?? 0;
}

function sortNewestFirst(fvgs: FvgZone[]): FvgZone[] {
  return [...fvgs].sort((a, b) => fvgRecency(b) - fvgRecency(a));
}

/** Long: bullish FVG (support) or inverted bearish FVG. Short: bearish FVG or inverted bullish FVG. */
function fvgEligibleForEntry(fvg: FvgZone, isLong: boolean): boolean {
  if (isLong) {
    return (fvg.type === "bullish" && !fvg.inverted) || (fvg.type === "bearish" && !!fvg.inverted);
  }
  return (fvg.type === "bearish" && !fvg.inverted) || (fvg.type === "bullish" && !!fvg.inverted);
}

function fvgEntryLabel(fvg: FvgZone, ce: number, isLong: boolean): string {
  const recencyNote = `older ${isLong ? "lower" : "higher"} gaps may not fill`;
  if (fvg.inverted) {
    const role = isLong ? "inverted bearish fair value gap (now support)" : "inverted bullish fair value gap (now resistance)";
    return `most recent one-minute ${role} CE ${ce.toFixed(2)} (${recencyNote})`;
  }
  return `most recent one-minute ${fvg.type} fair value gap CE ${ce.toFixed(2)} (${recencyNote})`;
}

/** Bullish FVG must not sit entirely below active bullish MSS — that retrace implies bearish shift first. */
function fvgConsistentWithMss(fvg: FvgZone, isLong: boolean, mss: Mss): boolean {
  if (!mss) return true;
  const { lo, hi } = fvgBounds(fvg);
  if (isLong && mss.direction === "bullish") {
    return hi >= mss.level - 0.5;
  }
  if (!isLong && mss.direction === "bearish") {
    return lo <= mss.level + 0.5;
  }
  return true;
}

/**
 * Entry FVG — bias + structure + recency:
 * - When multiple gaps exist, use the **most recently formed** only (older lower bullish / higher bearish gaps often never fill)
 * - Prefer inside the newest gap now
 * - Else shallow retrace to newest qualifying gap (not a deep older gap below bullish MSS)
 */
function pickEntryFvg(
  fvgs: FvgZone[],
  isLong: boolean,
  price: number,
  mss: Mss
): FvgZone | null {
  const matching = fvgs.filter((f) => fvgEligibleForEntry(f, isLong));

  const inside = sortNewestFirst(
    matching.filter((f) => {
      const { lo, hi } = fvgBounds(f);
      return price >= lo && price <= hi;
    })
  ).find((f) => fvgConsistentWithMss(f, isLong, mss));
  if (inside) return inside;

  if (isLong) {
    const candidates = sortNewestFirst(
      matching.filter((f) => {
        const { hi } = fvgBounds(f);
        if (hi >= price) return false;
        if (price - hi > SHALLOW_RETRACE_MAX) return false;
        return fvgConsistentWithMss(f, true, mss);
      })
    );
    return candidates[0] ?? null;
  }

  const candidates = sortNewestFirst(
    matching.filter((f) => {
      const { lo } = fvgBounds(f);
      if (lo <= price) return false;
      if (lo - price > SHALLOW_RETRACE_MAX) return false;
      return fvgConsistentWithMss(f, false, mss);
    })
  );
  return candidates[0] ?? null;
}

function tradeDirection(ctx: MarketContext): "long" | "short" | null {
  const tb = ctx.biasStack.tradeableBias;
  if (tb === "bullish") return "long";
  if (tb === "bearish") return "short";
  if (tb === "conflicted" && ctx.biasStack.dominantBias !== "neutral") {
    return ctx.biasStack.dominantBias === "bullish" ? "long" : "short";
  }
  return null;
}

type EntryPlan = {
  lo: number;
  hi: number;
  label: string;
  inZone: boolean;
  /** Price ran away — don't chase deep opposite-structure retrace */
  extended?: boolean;
};

/** Entry zone must sit on the correct side of price and within shallow retrace distance. */
function zoneReachableFromPrice(
  isLong: boolean,
  price: number,
  lo: number,
  hi: number
): boolean {
  if (isLong) {
    if (hi > price + ENTRY_PAD) return false;
    return price - hi <= MAX_ENTRY_FROM_PRICE;
  }
  if (lo < price - ENTRY_PAD) return false;
  return lo - price <= MAX_ENTRY_FROM_PRICE;
}

function buildNearPriceEntry(price: number, isLong: boolean, mss: Mss): EntryPlan {
  if (isLong) {
    const hi = roundMnq(price - 2);
    let lo = roundMnq(price - MAX_ENTRY_FROM_PRICE);
    if (mss?.direction === "bullish") {
      lo = roundMnq(Math.max(lo, mss.level - ENTRY_PAD));
    }
    if (lo >= hi) lo = roundMnq(hi - 6);
    const inZone = price >= lo && price <= hi;
    return {
      lo,
      hi,
      label: `shallow pullback ${lo.toFixed(2)}–${hi.toFixed(2)} below last ${price.toFixed(2)}`,
      inZone,
      extended: !inZone && price > hi + 8,
    };
  }

  const lo = roundMnq(price + 2);
  let hi = roundMnq(price + MAX_ENTRY_FROM_PRICE);
  if (mss?.direction === "bearish") {
    hi = roundMnq(Math.min(hi, mss.level + ENTRY_PAD));
  }
  if (lo >= hi) hi = roundMnq(lo + 6);
  const inZone = price >= lo && price <= hi;
  return {
    lo,
    hi,
    label: `shallow retrace ${lo.toFixed(2)}–${hi.toFixed(2)} above last ${price.toFixed(2)}`,
    inZone,
    extended: !inZone && price < lo - 8,
  };
}

function buildEntryPlan(
  ctx: MarketContext,
  price: number,
  isLong: boolean,
  entryFvg: FvgZone | null,
  support: { label: string; price: number } | null,
  resistance: { label: string; price: number } | null,
  mss: Mss
): EntryPlan {
  const org = ctx.org;

  if (entryFvg) {
    const { lo, hi } = fvgBounds(entryFvg);
    const ce = fvgMid(entryFvg);
    const zoneLo = isLong ? lo : ce;
    const zoneHi = isLong ? ce : hi;
    if (zoneReachableFromPrice(isLong, price, zoneLo, zoneHi)) {
      return {
        lo: zoneLo,
        hi: zoneHi,
        label: fvgEntryLabel(entryFvg, ce, isLong),
        inZone: price >= zoneLo && price <= zoneHi,
      };
    }
  }

  if (isLong && mss?.direction === "bullish") {
    const lo = roundMnq(mss.level);
    const hi = roundMnq(mss.level + ENTRY_PAD * 3);
    if (zoneReachableFromPrice(true, price, lo, hi)) {
      const inZone = price >= lo - ENTRY_PAD && price <= hi + ENTRY_PAD;
      return {
        lo,
        hi,
        label: `shallow pullback to bullish MSS ${mss.level.toFixed(2)} — not a deep lower fair value gap`,
        inZone,
        extended: !inZone && price > hi + SHALLOW_RETRACE_MAX / 2,
      };
    }
  }

  if (!isLong && mss?.direction === "bearish") {
    const hi = roundMnq(mss.level);
    const lo = roundMnq(mss.level - ENTRY_PAD * 3);
    if (zoneReachableFromPrice(false, price, lo, hi)) {
      const inZone = price <= hi + ENTRY_PAD && price >= lo - ENTRY_PAD;
      return {
        lo,
        hi,
        label: `shallow retrace to bearish MSS ${mss.level.toFixed(2)} — not a deep higher fair value gap`,
        inZone,
        extended: !inZone && price < lo - SHALLOW_RETRACE_MAX / 2,
      };
    }
  }

  if (isLong && support) {
    const lo = roundMnq(support.price - ENTRY_PAD);
    const hi = roundMnq(support.price + ENTRY_PAD);
    if (zoneReachableFromPrice(true, price, lo, hi)) {
      return {
        lo,
        hi,
        label: support.label,
        inZone: price >= lo && price <= hi,
      };
    }
  }
  if (!isLong && resistance) {
    const lo = roundMnq(resistance.price - ENTRY_PAD);
    const hi = roundMnq(resistance.price + ENTRY_PAD);
    if (zoneReachableFromPrice(false, price, lo, hi)) {
      return {
        lo,
        hi,
        label: resistance.label,
        inZone: price >= lo && price <= hi,
      };
    }
  }
  if (org) {
    const lo = roundMnq(org.ce - ENTRY_PAD);
    const hi = roundMnq(org.ce + ENTRY_PAD);
    if (zoneReachableFromPrice(isLong, price, lo, hi)) {
      return {
        lo,
        hi,
        label: `opening range gap CE ${org.ce.toFixed(2)}`,
        inZone: price >= lo && price <= hi,
      };
    }
  }
  return buildNearPriceEntry(price, isLong, mss);
}

function buildWaitFor(
  entry: EntryPlan,
  entryZone: string,
  isLong: boolean,
  mss: Mss
): { status: string; waitFor: string } {
  if (entry.inZone) {
    return {
      status: `ACTIVE — price inside entry zone`,
      waitFor:
        "In zone — need one-minute confirmation (hold + displacement in bias direction) before execution",
    };
  }

  if (entry.extended) {
    const mssLevel = mss?.level.toFixed(2) ?? "structure level";
    return {
      status: "EXTENDED — do not chase deep retrace",
      waitFor: isLong
        ? `Do NOT wait for a lower bullish fair value gap — reaching it likely needs bearish structure first. Hold above ${mssLevel} (bullish MSS) for shallow pullback to ${entryZone}, or wait for fresh bullish displacement + new fair value gap`
        : `Do NOT wait for a higher bearish fair value gap — reaching it likely needs bullish structure first. Hold below ${mssLevel} (bearish MSS) for shallow retrace to ${entryZone}, or wait for fresh bearish displacement`,
    };
  }

  return {
    status: "WAIT — not at entry yet",
    waitFor: isLong
      ? `Shallow retrace only — ${entryZone} while bullish structure holds (no close below bullish MSS)`
      : `Shallow retrace only — ${entryZone} while bearish structure holds (no close above bearish MSS)`,
  };
}

function dedupeLevels(levels: PdLevel[]): PdLevel[] {
  const out: PdLevel[] = [];
  for (const l of levels) {
    if (out.some((o) => Math.abs(o.price - l.price) < 0.5)) continue;
    out.push(l);
  }
  return out;
}

function sessionTargetLevels(ctx: MarketContext): PdLevel[] {
  const s = ctx.sessions;
  return [
    { id: "ny_rth_high", label: "New York regular trading hours high", price: s.nyRthHigh },
    { id: "ny_rth_low", label: "New York regular trading hours low", price: s.nyRthLow },
    { id: "ny_pre_high", label: "New York pre-market high", price: s.nyPreHigh },
    { id: "ny_pre_low", label: "New York pre-market low", price: s.nyPreLow },
    { id: "london_high", label: "London session high", price: s.londonHigh },
    { id: "london_low", label: "London session low", price: s.londonLow },
    { id: "asia_high", label: "Asia session high", price: s.asiaHigh },
    { id: "asia_low", label: "Asia session low", price: s.asiaLow },
    { id: "ny_pm_high", label: "New York afternoon session high", price: s.nyPmHigh },
    { id: "ny_pm_low", label: "New York afternoon session low", price: s.nyPmLow },
  ].filter((l) => l.price > 0);
}

/** Conservative fill reference for reward — long uses top of zone, short uses bottom. */
function entryAnchor(isLong: boolean, entry: EntryPlan): number {
  return roundMnq(isLong ? entry.hi : entry.lo);
}

function pickTargetPair(
  isLong: boolean,
  anchor: number,
  levels: PdLevel[],
  pdHigh: number,
  pdLow: number,
  org: MarketContext["org"]
): { target1Price: number; target1Label: string; target2: string } {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const ahead = isLong
    ? sorted.filter((l) => l.price > anchor + 0.25)
    : sorted.filter((l) => l.price < anchor - 0.25);

  let t1: PdLevel | undefined;
  for (const l of ahead) {
    if (Math.abs(l.price - anchor) >= MIN_TARGET1_POINTS) {
      t1 = l;
      break;
    }
  }

  if (!t1) {
    const fallbackPrice = roundMnq(isLong ? pdHigh : pdLow);
    t1 = {
      id: isLong ? "pdh" : "pdl",
      label: isLong ? "previous day high" : "previous day low",
      price: fallbackPrice,
    };
  }

  const t1Price = roundMnq(t1.price);
  let t2: PdLevel | undefined;
  const afterT1 = isLong
    ? ahead.filter((l) => l.price >= t1Price + MIN_TARGET2_BEYOND_T1)
    : ahead.filter((l) => l.price <= t1Price - MIN_TARGET2_BEYOND_T1);

  t2 = afterT1.find((l) => Math.abs(l.price - t1Price) >= 0.5);

  if (!t2) {
    if (isLong && pdHigh >= t1Price + MIN_TARGET2_BEYOND_T1) {
      t2 = { id: "pdh", label: "previous day high", price: pdHigh };
    } else if (!isLong && pdLow <= t1Price - MIN_TARGET2_BEYOND_T1) {
      t2 = { id: "pdl", label: "previous day low", price: pdLow };
    } else if (org) {
      t2 = isLong
        ? { id: "org_top", label: "opening range gap top", price: org.top }
        : { id: "org_bot", label: "opening range gap bottom", price: org.bottom };
    } else {
      t2 = t1;
    }
  }

  return {
    target1Price: t1Price,
    target1Label: t1.label,
    target2: `${roundMnq(t2.price).toFixed(2)} (${t2.label})`,
  };
}

export type ExecutionScaffold = {
  lastPrice: number;
  call: string;
  bias: string;
  entryLo: number;
  entryHi: number;
  entryLabel: string;
  entryZone: string;
  entryStatus: string;
  entryStatusFull: string;
  target1Price: number;
  target1Label: string;
  target1: string;
  target2: string;
  waitFor: string;
  structureNote: string;
};

/** Live JSON prices for voice TTS — never read prices from the chart image. */
export function getExecutionScaffold(ctx: MarketContext): ExecutionScaffold | null {
  const price = roundMnq(ctx.daily.lastClose);
  const dir = tradeDirection(ctx);
  const { support, resistance } = nearestPdLevels(price, ctx.htfPdArrays.levels);
  const mss = ctx.structureFacts.mss;
  const org = ctx.org;
  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  const pdLevels = [...ctx.htfPdArrays.levels].sort((a, b) => a.price - b.price);

  if (!dir) return null;

  const isLong = dir === "long";
  const entryFvg = pickEntryFvg(fvgs, isLong, price, mss);
  const entry = buildEntryPlan(ctx, price, isLong, entryFvg, support, resistance, mss);
  const entryZone = `${entry.lo.toFixed(2)}–${entry.hi.toFixed(2)}`;
  const entryLabel = entry.label;
  const { status: entryStatusRaw, waitFor } = buildWaitFor(
    entry,
    `${entryZone} (${entryLabel})`,
    isLong,
    mss
  );
  const entryStatus = entryStatusRaw.startsWith("ACTIVE")
    ? "ACTIVE"
    : entryStatusRaw.startsWith("EXTENDED")
      ? "EXTENDED"
      : "WAIT";

  const anchor = entryAnchor(isLong, entry);
  const pdHigh = ctx.htfPdArrays.previousDay.high;
  const pdLow = ctx.htfPdArrays.previousDay.low;
  const targetLevels = dedupeLevels([
    ...pdLevels,
    ...sessionTargetLevels(ctx),
    ...(org
      ? [
          { id: "org_top", label: "opening range gap top", price: org.top },
          { id: "org_bot", label: "opening range gap bottom", price: org.bottom },
          { id: "org_ce", label: "opening range gap CE", price: org.ce },
        ]
      : []),
  ]);

  const { target1Price, target1Label, target2 } = pickTargetPair(
    isLong,
    anchor,
    targetLevels,
    pdHigh,
    pdLow,
    org
  );

  const target1 = `${target1Price.toFixed(2)} (${target1Label})`;
  const structureNote = mss
    ? `Active market structure shift: ${mss.description}`
    : "No recent one-minute market structure shift in lookback";

  return {
    lastPrice: price,
    call: isLong ? "potential buy" : "potential sell",
    bias: ctx.biasStack.tradeableBias,
    entryLo: entry.lo,
    entryHi: entry.hi,
    entryLabel,
    entryZone,
    entryStatus,
    entryStatusFull: entryStatusRaw,
    target1Price,
    target1Label,
    target1,
    target2,
    waitFor,
    structureNote,
  };
}

/** Pre-computed entry / target scaffold from live JSON — LLM must cite these prices or refine with chart. */
export function formatExecutionPlan(ctx: MarketContext): string {
  const scaffold = getExecutionScaffold(ctx);
  const price = roundMnq(ctx.daily.lastClose);
  const mss = ctx.structureFacts.mss;
  const dir = tradeDirection(ctx);

  const header = [
    "### Execution scaffold (MNQ prices from live JSON — **must appear in your brief**)",
    `Last price: ${price.toFixed(2)}`,
    "Use Entry zone / Target 1 / Target 2 unless the 1m chart clearly invalidates them — then adjust with **exact** prices.",
    `Target 1 must be at least ${MIN_TARGET1_POINTS} MNQ points from entry anchor — skip micro PD levels (PDO/PDC) when too tight; prefer PDH/PDL, session highs/lows, or NDOG/NWOG.`,
    `Entry zone must stay within ${MAX_ENTRY_FROM_PRICE} MNQ points of last price for shallow retrace — do not cite distant PD/session levels as entry.`,
    "**Do NOT recommend stop-loss prices or a Stop: line — trader manages risk.**",
    "**ICT FVG entry rule:** Never anchor potential **sell** on an unfilled **bullish** fair value gap (support) — wait for inversion (body close below gap → inverse fair value gap / resistance) or use a bearish fair value gap. Mirror for potential **buy**: never anchor on unfilled **bearish** fair value gap unless inverted (body close above gap). Inverted gaps may be used for retrace entries in the flipped role.",
    "**ICT entry rule:** For potential buy, never wait for a deep lower bullish fair value gap if that retrace would require bearish market structure shift first. **When two or more fair value gaps form, entry is retrace to the most recent qualifying gap only** — the older lower bullish (or higher bearish) gap may never fill. Mirror for sells. Shallow pullback to displacement fair value gap / MSS level, or EXTENDED — wait for new displacement.",
  ];

  if (!dir || !scaffold) {
    return [
      ...header,
      "Tradeable bias neutral — if Call is still directional, give Wait for: exact shallow retrace aligned with active MSS; targets at named PD levels with prices.",
    ].join("\n");
  }

  const isLong = dir === "long";
  const { support, resistance } = nearestPdLevels(price, ctx.htfPdArrays.levels);
  const entryZone = `${scaffold.entryZone} (${scaffold.entryLabel})`;
  const entryStatus = scaffold.entryStatusFull;
  const waitFor = scaffold.waitFor;
  const target1 = scaffold.target1;
  const target2 = scaffold.target2;
  const structureNote = scaffold.structureNote;

  const exitPlan = isLong
    ? `Scale 50% at Target 1; runner to Target 2 or exit on bearish one-minute market structure shift below ${mss?.direction === "bullish" ? roundMnq(mss.level).toFixed(2) : "structure level"}.`
    : `Scale 50% at Target 1; runner to Target 2 or exit on bullish one-minute market structure shift above ${mss?.direction === "bearish" ? roundMnq(mss.level).toFixed(2) : "structure level"}.`;

  const invalidation = isLong
    ? mss?.direction === "bullish"
      ? `Thesis void on bearish one-minute market structure shift / body close below ${roundMnq(mss.level).toFixed(2)} — not a stop recommendation`
      : support
        ? `Thesis void below ${support.price.toFixed(2)} (${support.label}) — not a stop recommendation`
        : "Bullish structure break — not a stop recommendation"
    : mss?.direction === "bearish"
      ? `Thesis void on bullish one-minute market structure shift / body close above ${roundMnq(mss.level).toFixed(2)} — not a stop recommendation`
      : resistance
        ? `Thesis void above ${resistance.price.toFixed(2)} (${resistance.label}) — not a stop recommendation`
        : "Bearish structure break — not a stop recommendation";

  return [
    ...header,
    structureNote,
    `Bias side: ${isLong ? "long / potential buy" : "short / potential sell"}`,
    `Entry zone: ${entryZone}`,
    `Entry status: ${entryStatus}`,
    `Wait for: ${waitFor}`,
    `Target 1: ${target1}`,
    `Target 2: ${target2}`,
    `Exit plan: ${exitPlan}`,
    `Invalidation (thesis only, not a stop): ${invalidation}`,
  ].join("\n");
}
