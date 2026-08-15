import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import { isMarketStateUsable } from "./market-state";
import { extractFeatures } from "./ict-rules-engine";
import type {
  DataQualityFlag,
  DisplacementStatus,
  MarketObservation,
  ObservationStructure,
  OrderBlockRelevance,
  PremiumDiscountZone,
  SessionBucket,
} from "./desk-schema";
import { freezeObservation } from "./desk-schema";
import { detectRehRel } from "./reh-rel";
import { classifyLevelSide, describeSweptLevel } from "./session-liquidity";
import {
  canProvePdhTaken,
  isQualifyingTaken,
  type NamedLevelStatus,
} from "./level-interaction";

function isUnknownQuality(q: DataQualityFlag): boolean {
  return q === "missing" || q === "stale";
}

function mapSession(ctx: MarketContext, quality: DataQualityFlag): SessionBucket {
  if (isUnknownQuality(quality)) return "unknown";
  const id = ctx.activeSession.id;
  if (id === "london") return "london";
  if (id === "asia") return "asia";
  if (id === "ny_pre" || id === "ny_am" || id === "ny_pm") return "ny";
  return "off_hours";
}

function mapStructure(
  mssDirection: "bullish" | "bearish" | undefined,
  tradeableBias: string,
  quality: DataQualityFlag
): ObservationStructure {
  if (isUnknownQuality(quality)) return "unknown";
  if (mssDirection === "bullish") return "bullish";
  if (mssDirection === "bearish") return "bearish";
  if (tradeableBias === "bullish" || tradeableBias === "bearish") {
    return tradeableBias as ObservationStructure;
  }
  return "unclear";
}

function detectDisplacement(state: MarketState, quality: DataQualityFlag): {
  status: DisplacementStatus;
  points: number | null;
} {
  if (isUnknownQuality(quality) || state.candles.length < 5) {
    return { status: "unknown", points: null };
  }
  const candles = state.candles.slice(-12);
  const bodies = candles.map((c) => Math.abs(c.c - c.o));
  const avgBody = bodies.slice(0, -3).reduce((a, b) => a + b, 0) / Math.max(1, bodies.length - 3);
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    if (bodies[i] > avgBody * 1.5) {
      const pts = Math.round(Math.abs(candles[i].c - candles[i].o) * 4) / 4;
      return { status: "present", points: pts };
    }
  }
  return { status: "absent", points: null };
}

function mapFvg(ctx: MarketContext, quality: DataQualityFlag): MarketObservation["fvg"] {
  if (isUnknownQuality(quality)) return { status: "unknown", direction: "unknown" };
  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  const inverted = ctx.structureFacts.m1InvertedFvgs;
  if (inverted.length > 0 && fvgs.length === 0) {
    const f = inverted[inverted.length - 1];
    return { status: "invalidated", top: f.top, bottom: f.bottom, direction: f.type };
  }
  if (fvgs.length === 0) return { status: "absent" };
  const f = fvgs[fvgs.length - 1];
  return { status: "present", top: f.top, bottom: f.bottom, direction: f.type };
}

function mapPremiumZone(v: string, quality: DataQualityFlag): PremiumDiscountZone {
  if (isUnknownQuality(quality)) return "unknown";
  if (v === "premium" || v === "discount" || v === "equilibrium") return v;
  return "equilibrium";
}

function buildLiquidityLevels(
  ctx: MarketContext,
  quality: DataQualityFlag
): MarketObservation["liquidity"]["levels"] {
  if (isUnknownQuality(quality)) return [];
  const sweeps = ctx.structureFacts.liquiditySweeps;
  const interactions = ctx.structureFacts.levelInteractions ?? [];
  const interactionById = new Map(interactions.map((i) => [i.levelId.toLowerCase(), i]));
  const pdhSource = ctx.daily.pdhSource;
  const pdhFormedAt = ctx.daily.pdhFormedAt;
  const pdcFormedAt = ctx.daily.pdcFormedAt;

  const makeLevel = (
    id: string,
    label: string,
    price: number,
    side?: "buy_side" | "sell_side"
  ): MarketObservation["liquidity"]["levels"][number] => {
    const ix = interactionById.get(id.toLowerCase());
    const status = (ix?.status as NamedLevelStatus | undefined) ?? "UNTOUCHED";
    const prove = canProvePdhTaken({
      status,
      pdhSource: id === "pdh" || id === "pdl" || id === "pdc" ? pdhSource : "cme_session_1m",
      qualifyingTick: ix?.atTime != null && ix.tickPrice != null && ix.candleId
        ? { timestamp: ix.atTime, price: ix.tickPrice, candleId: ix.candleId, atLabel: "" }
        : undefined,
      dataQuality: quality,
    });
    const sweepHit = sweeps.some(
      (s) => s.levelId.toLowerCase() === id.toLowerCase() || s.label.toLowerCase() === label.toLowerCase()
    );
    let taken: boolean | "unknown" = false;
    if (quality === "stale") taken = "unknown";
    else if ((id === "pdh" || id === "pdl" || id === "pdc") && pdhSource !== "cme_session_1m") {
      taken = isQualifyingTaken(status) || sweepHit ? "unknown" : false;
    } else if (id === "pdh" || id === "pdl" || id === "pdc") {
      taken = prove;
    } else if (ix) {
      taken = sweepHit && isQualifyingTaken(status);
    } else {
      taken = sweepHit;
    }
    const formedAt =
      id === "pdc" ? pdcFormedAt : id === "pdh" || id === "pdl" ? pdhFormedAt : undefined;
    return {
      id,
      label,
      price,
      taken,
      status,
      side,
      source: id === "pdh" || id === "pdl" || id === "pdc" ? pdhSource : "session_1m",
      formedAt,
      qualifyingTickAt: ix?.atTime,
      qualifyingTickPrice: ix?.tickPrice,
      candleId: ix?.candleId,
      why: ix?.why,
    };
  };

  const levels: MarketObservation["liquidity"]["levels"] = [
    makeLevel("pdh", "PDH", ctx.htfPdArrays.previousDay.high, "buy_side"),
    makeLevel("pdl", "PDL", ctx.htfPdArrays.previousDay.low, "sell_side"),
    makeLevel("pdc", "PDC", ctx.htfPdArrays.previousDay.close),
    makeLevel("asia_high", "Asia high", ctx.sessions.asiaHigh, "buy_side"),
    makeLevel("asia_low", "Asia low", ctx.sessions.asiaLow, "sell_side"),
    makeLevel("london_high", "London high", ctx.sessions.londonHigh, "buy_side"),
    makeLevel("london_low", "London low", ctx.sessions.londonLow, "sell_side"),
    makeLevel("ny_rth_high", "NY RTH High", ctx.sessions.nyRthHigh, "buy_side"),
    makeLevel("ny_rth_low", "NY RTH Low", ctx.sessions.nyRthLow, "sell_side"),
  ];
  return levels.filter((l) => Number.isFinite(l.price));
}

function inferOrderBlock(ctx: MarketContext, quality: DataQualityFlag): OrderBlockRelevance {
  if (isUnknownQuality(quality)) return "unknown";
  const mss = ctx.structureFacts.mss;
  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  if (mss && fvgs.length > 0) return "relevant";
  if (mss) return "relevant";
  if (fvgs.length > 0) return "unclear";
  return "irrelevant";
}

function buildTimeContext(ctx: MarketContext, quality: DataQualityFlag): string {
  if (isUnknownQuality(quality)) return "unknown — data quality insufficient";
  const s = ctx.activeSession;
  const parts = [s.label];
  if (s.killZone) parts.push("kill zone");
  if (s.macroWindow) parts.push(`macro ${s.macroWindow}`);
  parts.push(`AMD ${s.amdPhase}`);
  return parts.join(" · ");
}

function mapDataQuality(state: MarketState, ok: boolean): DataQualityFlag {
  const flag = state.quality.flag;
  if (flag === "good" || flag === "degraded" || flag === "stale" || flag === "missing") {
    if (!ok && flag === "good") return "degraded";
    return flag;
  }
  return ok ? "good" : "missing";
}

function mapRehRel(state: MarketState, quality: DataQualityFlag) {
  if (isUnknownQuality(quality) || state.candles.length < 5) {
    return {
      status: "unknown" as const,
      nearest_reh_above: null,
      nearest_rel_below: null,
      reh_levels: [],
      rel_levels: [],
      all_levels: [],
    };
  }
  // state.lastPrice is authoritative (TradingView live when extension attached).
  const currentPrice = state.lastPrice;
  return detectRehRel({
    candles: state.candles,
    currentPrice,
    timeframe: state.timeframe || "1m",
  });
}

/** Layer 1 — deterministic facts only. No meaning, no scores, no verdict. */
export function buildMarketObservation(ctx: MarketContext, state: MarketState) {
  const features = extractFeatures(ctx, state);
  const dataQuality = mapDataQuality(state, isMarketStateUsable(state) && features.data_quality_ok);
  const mss = ctx.structureFacts.mss;
  const fvg = mapFvg(ctx, dataQuality);
  const pd = ctx.premiumDiscount;
  const displacement = detectDisplacement(state, dataQuality);
  const levels = buildLiquidityLevels(ctx, dataQuality);
  const rehRel = mapRehRel(state, dataQuality);

  const evidence: Record<string, string> = {
    "market_state.last_price": state.lastPrice.toFixed(2),
    "market_state.quality.flag": state.quality.flag,
    "bias_stack.daily": ctx.biasStack.daily,
    "bias_stack.m15": ctx.biasStack.m15,
    "bias_stack.m5": ctx.biasStack.m5,
    "bias_stack.tradeable_bias": ctx.biasStack.tradeableBias,
    "premium_discount.vs_current_day_range": pd.vsCurrentDayRange,
    "premium_discount.vs_previous_day_range": pd.vsPreviousDayRange,
    "structure.displacement": displacement.status,
    "structure.fvg.status": fvg.status,
    "active_session.id": ctx.activeSession.id,
    "active_session.kill_zone": String(ctx.activeSession.killZone),
  };

  if (mss && !isUnknownQuality(dataQuality)) {
    evidence["structure.mss_direction"] = mss.direction;
    evidence["structure.mss_level"] = mss.level.toFixed(2);
  }
  if (fvg.top != null) evidence["structure.fvg.top"] = fvg.top.toFixed(2);
  if (fvg.bottom != null) evidence["structure.fvg.bottom"] = fvg.bottom.toFixed(2);
  if (displacement.points != null) {
    evidence["structure.displacement_points"] = displacement.points.toFixed(2);
  }
  const fhdr = ctx.structureFacts.fhdr;
  if (fhdr && !isUnknownQuality(dataQuality)) {
    evidence["structure.fhdr.high"] = fhdr.high.toFixed(2);
    evidence["structure.fhdr.low"] = fhdr.low.toFixed(2);
    evidence["structure.fhdr.locked"] = String(fhdr.locked);
  }
  if (ctx.structureFacts.m1InvertedFvgs.length > 0 && !isUnknownQuality(dataQuality)) {
    evidence["structure.ifvg.count"] = String(ctx.structureFacts.m1InvertedFvgs.length);
  }
  for (const level of levels) {
    evidence[`liquidity.${level.label.toLowerCase().replace(/\s+/g, "_")}`] =
      `${level.price.toFixed(2)} status=${level.status ?? "UNTOUCHED"} taken=${level.taken}` +
      (level.candleId ? ` candle=${level.candleId}` : "") +
      (level.why ? ` why=${level.why}` : "");
  }
  evidence["market_state.snapshot_id"] = state.snapshotId || state.stateHash;
  evidence["market_state.updated_at"] = state.updatedAt;

  if (rehRel.nearest_reh_above) {
    const r = rehRel.nearest_reh_above;
    evidence["liquidity.nearest_reh_above"] =
      `${r.level.toFixed(2)} dist=${r.distanceFromCurrentPrice.toFixed(2)} status=${r.status}`;
  }
  if (rehRel.nearest_rel_below) {
    const r = rehRel.nearest_rel_below;
    evidence["liquidity.nearest_rel_below"] =
      `${r.level.toFixed(2)} dist=${r.distanceFromCurrentPrice.toFixed(2)} status=${r.status}`;
  }
  for (let i = 0; i < rehRel.all_levels.length; i++) {
    const r = rehRel.all_levels[i];
    evidence[`liquidity.${r.type}_${i}`] =
      `${r.level.toFixed(2)} range=${r.range.low.toFixed(2)}–${r.range.high.toFixed(2)} status=${r.status}`;
  }

  if (ctx.nwog && !isUnknownQuality(dataQuality)) {
    evidence["gaps.nwog"] = `${ctx.nwog.bottom.toFixed(2)}–${ctx.nwog.top.toFixed(2)}`;
  }
  if (ctx.htfPdArrays.ndog && !isUnknownQuality(dataQuality)) {
    const n = ctx.htfPdArrays.ndog;
    evidence["gaps.ndog"] = `${n.bottom.toFixed(2)}–${n.top.toFixed(2)}`;
  }
  if (ctx.org && !isUnknownQuality(dataQuality)) {
    evidence["gaps.org"] = `${ctx.org.bottom.toFixed(2)}–${ctx.org.top.toFixed(2)}`;
    evidence["gaps.org_ce"] = ctx.org.ce.toFixed(2);
  }

  const raw: MarketObservation = {
    market_structure: mapStructure(mss?.direction, ctx.biasStack.tradeableBias, dataQuality),
    liquidity: { levels },
    displacement: displacement.status,
    displacement_points: displacement.points,
    fvg,
    order_block: inferOrderBlock(ctx, dataQuality),
    premium_discount: {
      zone: mapPremiumZone(pd.vsCurrentDayRange, dataQuality),
      price_location: isUnknownQuality(dataQuality)
        ? "unknown"
        : pd.summary || `${pd.vsCurrentDayRange} of current day, ${pd.vsPreviousDayRange} of previous day`,
    },
    htf_bias: {
      daily: isUnknownQuality(dataQuality) ? "unknown" : ctx.biasStack.daily,
      m15: isUnknownQuality(dataQuality) ? "unknown" : ctx.biasStack.m15,
      m5: isUnknownQuality(dataQuality) ? "unknown" : ctx.biasStack.m5,
      aligned: isUnknownQuality(dataQuality) ? "unknown" : ctx.biasStack.alignedCount >= 2,
      tradeable_bias: isUnknownQuality(dataQuality) ? "unknown" : ctx.biasStack.tradeableBias,
    },
    session: mapSession(ctx, dataQuality),
    time_context: buildTimeContext(ctx, dataQuality),
    data_quality: dataQuality,
    reh_rel: rehRel,
    evidence,
    state_hash: state.stateHash,
  };

  return freezeObservation(raw);
}

export function summarizeObservation(obs: MarketObservation): string {
  const swept = obs.liquidity.levels.filter((l) => l.taken === true);
  const parts = [
    `structure=${obs.market_structure}`,
    `bias=${obs.htf_bias.tradeable_bias}`,
    `fvg=${obs.fvg.status}`,
    `displacement=${obs.displacement}`,
    `session=${obs.session}`,
    `quality=${obs.data_quality}`,
  ];
  if (swept.length) {
    parts.push(`swept=${swept.map((l) => `${l.label}@${l.price.toFixed(0)}`).join(",")}`);
  }
  return parts.join(" | ");
}

/** Plain-language observation block — facts only, no meaning. */
export function formatObservationNarrative(obs: MarketObservation): string {
  const lines: string[] = [];
  const swept = obs.liquidity.levels.filter((l) => l.taken === true);
  for (const s of swept) {
    const side = classifyLevelSide(s.label, s.side);
    lines.push(`${describeSweptLevel(s.label, side)} at ${s.price.toFixed(2)}.`);
  }
  if (obs.displacement === "present" && obs.displacement_points != null) {
    lines.push(`Price displaced by ${obs.displacement_points.toFixed(2)} points.`);
  } else if (obs.displacement === "absent") {
    lines.push("No impulsive displacement detected in lookback.");
  } else if (obs.displacement === "unknown") {
    lines.push("Displacement: unknown — insufficient data.");
  }
  if (obs.fvg.status === "present" && obs.fvg.top != null && obs.fvg.bottom != null) {
    lines.push(
      `A ${obs.fvg.direction || "unknown"} FVG exists between ${Math.min(obs.fvg.bottom, obs.fvg.top).toFixed(2)}–${Math.max(obs.fvg.bottom, obs.fvg.top).toFixed(2)}.`
    );
  } else if (obs.fvg.status === "invalidated" && obs.fvg.top != null && obs.fvg.bottom != null) {
    lines.push(
      `An inverse fair value gap (IFVG) — ${obs.fvg.direction || "unknown"} gap ${Math.min(obs.fvg.bottom, obs.fvg.top).toFixed(2)}–${Math.max(obs.fvg.bottom, obs.fvg.top).toFixed(2)} inverted by body close.`
    );
  } else if (obs.fvg.status === "absent") {
    lines.push("No unfilled FVG in lookback.");
  } else if (obs.fvg.status === "unknown") {
    lines.push("FVG status: unknown.");
  }
  if (obs.reh_rel.status !== "unknown") {
    if (obs.reh_rel.nearest_reh_above) {
      const r = obs.reh_rel.nearest_reh_above;
      lines.push(
        `Nearest relative equal highs above at ${r.level.toFixed(2)} (${r.distanceFromCurrentPrice.toFixed(2)} points).`
      );
    }
    if (obs.reh_rel.nearest_rel_below) {
      const r = obs.reh_rel.nearest_rel_below;
      lines.push(
        `Nearest relative equal lows below at ${r.level.toFixed(2)} (${r.distanceFromCurrentPrice.toFixed(2)} points).`
      );
    }
  }
  const pdh = obs.liquidity.levels.find((l) => l.label === "PDH");
  const pdl = obs.liquidity.levels.find((l) => l.label === "PDL");
  if (pdh && pdl) {
    const pdhNote =
      pdh.taken === "unknown" || (pdh.status && pdh.status !== "CLOSED_BEYOND" && pdh.taken !== true)
        ? `Previous day high ${pdh.price.toFixed(2)} (${pdh.status ?? "UNTOUCHED"} — not confirmed swept)`
        : `Previous day high ${pdh.price.toFixed(2)}`;
    lines.push(`${pdhNote}, previous day low ${pdl.price.toFixed(2)}.`);
  }
  return lines.join(" ") || "Insufficient observable structure.";
}
