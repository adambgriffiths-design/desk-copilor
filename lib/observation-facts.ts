/**
 * Queryable fact registry — Layer 1 only. Every fact has a stable id and evidence path.
 */
import type { MarketContext } from "./types";
import type { MarketState } from "./market-state";
import type { ReadonlyMarketObservation } from "./desk-schema";

export type FactStatus = "active" | "invalidated" | "swept" | "absent" | "unknown";

export type ObservationFact = {
  /** Stable query id — e.g. structure.mss, gaps.nwog */
  id: string;
  category: "structure" | "liquidity" | "gap" | "session" | "bias" | "price" | "time";
  label: string;
  value: string;
  price?: number;
  price_high?: number;
  price_low?: number;
  status: FactStatus;
  observed_at?: string;
  /** Maps to observation.evidence key when present */
  evidence_key: string;
};

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

function mssStatus(
  mss: NonNullable<MarketContext["structureFacts"]["mss"]>,
  lastPrice: number
): FactStatus {
  if (mss.direction === "bullish" && lastPrice < mss.level) return "invalidated";
  if (mss.direction === "bearish" && lastPrice > mss.level) return "invalidated";
  return "active";
}

function pushFact(
  facts: ObservationFact[],
  fact: ObservationFact
): void {
  facts.push(fact);
}

/** Deterministic fact registry from live context + state + frozen observation. */
export function buildObservationFacts(
  ctx: MarketContext,
  state: MarketState,
  obs: ReadonlyMarketObservation
): ObservationFact[] {
  const facts: ObservationFact[] = [];
  const lastPrice = state.lastPrice;
  const quality = obs.data_quality;

  pushFact(facts, {
    id: "market_state.last_price",
    category: "price",
    label: "Last price",
    value: roundMnq(lastPrice).toFixed(2),
    price: roundMnq(lastPrice),
    status: quality === "missing" || quality === "stale" ? "unknown" : "active",
    evidence_key: "market_state.last_price",
  });

  pushFact(facts, {
    id: "market_state.data_quality",
    category: "time",
    label: "Data quality",
    value: obs.data_quality,
    status: obs.data_quality === "good" ? "active" : "unknown",
    evidence_key: "market_state.quality.flag",
  });

  pushFact(facts, {
    id: "session.active",
    category: "session",
    label: "Active session",
    value: ctx.activeSession.label,
    status: obs.session === "unknown" ? "unknown" : "active",
    evidence_key: "active_session.id",
  });

  if (ctx.activeSession.killZone) {
    pushFact(facts, {
      id: "session.kill_zone",
      category: "session",
      label: "Kill zone",
      value: "active",
      status: "active",
      evidence_key: "active_session.kill_zone",
    });
  }

  pushFact(facts, {
    id: "time.context",
    category: "time",
    label: "Time context",
    value: obs.time_context,
    status: obs.time_context.startsWith("unknown") ? "unknown" : "active",
    evidence_key: "active_session.id",
  });

  pushFact(facts, {
    id: "bias.tradeable",
    category: "bias",
    label: "Tradeable bias",
    value: obs.htf_bias.tradeable_bias,
    status: obs.htf_bias.tradeable_bias === "unknown" ? "unknown" : "active",
    evidence_key: "bias_stack.tradeable_bias",
  });

  for (const key of ["daily", "m15", "m5"] as const) {
    pushFact(facts, {
      id: `bias.${key}`,
      category: "bias",
      label: `${key.toUpperCase()} bias`,
      value: obs.htf_bias[key],
      status: obs.htf_bias[key] === "unknown" ? "unknown" : "active",
      evidence_key: `bias_stack.${key}`,
    });
  }

  const mss = ctx.structureFacts.mss;
  if (mss && quality !== "missing" && quality !== "stale") {
    const status = mssStatus(mss, lastPrice);
    pushFact(facts, {
      id: "structure.mss",
      category: "structure",
      label: "Market structure shift",
      value: `${mss.direction} at ${roundMnq(mss.level).toFixed(2)} (${mss.at})`,
      price: roundMnq(mss.level),
      status,
      observed_at: mss.at,
      evidence_key: "structure.mss_level",
    });
  } else {
    pushFact(facts, {
      id: "structure.mss",
      category: "structure",
      label: "Market structure shift",
      value: "none detected in lookback",
      status: mss ? "unknown" : "absent",
      evidence_key: "structure.mss_level",
    });
  }

  if (obs.fvg.status === "present" && obs.fvg.top != null && obs.fvg.bottom != null) {
    pushFact(facts, {
      id: "structure.fvg",
      category: "structure",
      label: "Unfilled 1m FVG",
      value: `${obs.fvg.direction || "unknown"} ${Math.min(obs.fvg.bottom, obs.fvg.top).toFixed(2)}–${Math.max(obs.fvg.bottom, obs.fvg.top).toFixed(2)}`,
      price_low: Math.min(obs.fvg.bottom, obs.fvg.top),
      price_high: Math.max(obs.fvg.bottom, obs.fvg.top),
      status: "active",
      evidence_key: "structure.fvg.status",
    });
  } else if (obs.fvg.status === "invalidated") {
    pushFact(facts, {
      id: "structure.fvg",
      category: "structure",
      label: "Unfilled 1m FVG",
      value: "invalidated — gap filled or inverted",
      status: "invalidated",
      evidence_key: "structure.fvg.status",
    });
  } else {
    pushFact(facts, {
      id: "structure.fvg",
      category: "structure",
      label: "Unfilled 1m FVG",
      value: obs.fvg.status === "unknown" ? "unknown" : "none in lookback",
      status: obs.fvg.status === "unknown" ? "unknown" : "absent",
      evidence_key: "structure.fvg.status",
    });
  }

  if (obs.displacement === "present" && obs.displacement_points != null) {
    pushFact(facts, {
      id: "structure.displacement",
      category: "structure",
      label: "Displacement",
      value: `${obs.displacement_points.toFixed(2)} points`,
      status: "active",
      evidence_key: "structure.displacement",
    });
  }

  const fpfvg = ctx.structureFacts.firstPresentedFvg.activeSession;
  if (fpfvg?.fvg) {
    pushFact(facts, {
      id: "structure.first_presented_fvg",
      category: "structure",
      label: "First presented 1m FVG (active session)",
      value: `${fpfvg.fvg.type} ${fpfvg.fvg.bottom.toFixed(2)}–${fpfvg.fvg.top.toFixed(2)} at ${fpfvg.fvg.formedAt || "session open"}`,
      price_low: fpfvg.fvg.bottom,
      price_high: fpfvg.fvg.top,
      status: "active",
      evidence_key: "structure.fvg.status",
    });
  }

  if (ctx.nwog && Number.isFinite(ctx.nwog.top) && Number.isFinite(ctx.nwog.bottom)) {
    pushFact(facts, {
      id: "gaps.nwog",
      category: "gap",
      label: "NWOG",
      value: `${roundMnq(ctx.nwog.bottom).toFixed(2)}–${roundMnq(ctx.nwog.top).toFixed(2)}`,
      price_low: roundMnq(ctx.nwog.bottom),
      price_high: roundMnq(ctx.nwog.top),
      status: "active",
      evidence_key: "gaps.nwog",
    });
  } else {
    pushFact(facts, {
      id: "gaps.nwog",
      category: "gap",
      label: "NWOG",
      value: "unknown",
      status: "unknown",
      evidence_key: "gaps.nwog",
    });
  }

  const ndog = ctx.htfPdArrays.ndog;
  if (ndog && Number.isFinite(ndog.top) && Number.isFinite(ndog.bottom)) {
    pushFact(facts, {
      id: "gaps.ndog",
      category: "gap",
      label: "NDOG",
      value: `${roundMnq(ndog.bottom).toFixed(2)}–${roundMnq(ndog.top).toFixed(2)}`,
      price_low: roundMnq(ndog.bottom),
      price_high: roundMnq(ndog.top),
      status: "active",
      evidence_key: "gaps.ndog",
    });
  } else {
    pushFact(facts, {
      id: "gaps.ndog",
      category: "gap",
      label: "NDOG",
      value: "unknown",
      status: "unknown",
      evidence_key: "gaps.ndog",
    });
  }

  if (ctx.org && Number.isFinite(ctx.org.top) && Number.isFinite(ctx.org.bottom)) {
    pushFact(facts, {
      id: "gaps.org",
      category: "gap",
      label: "Opening range gap",
      value: `${roundMnq(ctx.org.bottom).toFixed(2)}–${roundMnq(ctx.org.top).toFixed(2)}`,
      price_low: roundMnq(ctx.org.bottom),
      price_high: roundMnq(ctx.org.top),
      status: "active",
      evidence_key: "gaps.org",
    });
    pushFact(facts, {
      id: "gaps.org_ce",
      category: "gap",
      label: "ORG consequent encroachment (50%)",
      value: roundMnq(ctx.org.ce).toFixed(2),
      price: roundMnq(ctx.org.ce),
      status: "active",
      evidence_key: "gaps.org_ce",
    });
  }

  for (const level of obs.liquidity.levels) {
    const id = `liquidity.${level.label.toLowerCase().replace(/\s+/g, "_")}`;
    pushFact(facts, {
      id,
      category: "liquidity",
      label: level.label,
      value: `${roundMnq(level.price).toFixed(2)}${level.taken === true ? " — swept" : level.taken === false ? " — not swept" : ""}`,
      price: roundMnq(level.price),
      status: level.taken === true ? "swept" : level.taken === "unknown" ? "unknown" : "active",
      evidence_key: id,
    });
  }

  for (const sweep of ctx.structureFacts.liquiditySweeps) {
    pushFact(facts, {
      id: `liquidity.sweep.${sweep.levelId}`,
      category: "liquidity",
      label: `${sweep.label} sweep`,
      value: `${sweep.side.replace("_", "-")} at ${roundMnq(sweep.price).toFixed(2)} (${sweep.at})`,
      price: roundMnq(sweep.price),
      status: "swept",
      observed_at: sweep.at,
      evidence_key: `liquidity.${sweep.levelId}`,
    });
  }

  const sess = ctx.sessions;
  const sessionLevels: Array<[string, string, number]> = [
    ["session.asia_high", "Asia high", sess.asiaHigh],
    ["session.asia_low", "Asia low", sess.asiaLow],
    ["session.london_high", "London high", sess.londonHigh],
    ["session.london_low", "London low", sess.londonLow],
    ["session.ny_pre_high", "NY pre-market high", sess.nyPreHigh],
    ["session.ny_pre_low", "NY pre-market low", sess.nyPreLow],
    ["session.ny_rth_high", "NY RTH high", sess.nyRthHigh],
    ["session.ny_rth_low", "NY RTH low", sess.nyRthLow],
    ["session.ny_pm_high", "NY PM high", sess.nyPmHigh],
    ["session.ny_pm_low", "NY PM low", sess.nyPmLow],
  ];
  for (const [id, label, price] of sessionLevels) {
    if (!Number.isFinite(price)) continue;
    pushFact(facts, {
      id,
      category: "session",
      label,
      value: roundMnq(price).toFixed(2),
      price: roundMnq(price),
      status: "active",
      evidence_key: id,
    });
  }

  pushFact(facts, {
    id: "premium_discount.zone",
    category: "bias",
    label: "Premium / discount",
    value: obs.premium_discount.price_location,
    status: obs.premium_discount.zone === "unknown" ? "unknown" : "active",
    evidence_key: "premium_discount.vs_current_day_range",
  });

  return facts;
}

export function findFact(facts: ObservationFact[], id: string): ObservationFact | undefined {
  return facts.find((f) => f.id === id || f.id.startsWith(`${id}.`));
}

export function factsByCategory(
  facts: ObservationFact[],
  category: ObservationFact["category"]
): ObservationFact[] {
  return facts.filter((f) => f.category === category);
}
