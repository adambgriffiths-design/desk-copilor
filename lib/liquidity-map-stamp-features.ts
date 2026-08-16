/**
 * PIT-safe full liquidity map stamp for featuresAtT (`liquidity_map_repr_v0`).
 *
 * Additive representation only — does not change detectors, ALS, gates, or trading.
 * Keeps `liquidity_repr_v1` / `liquidityLevels` via `liquidity-stamp-features.ts`.
 *
 * Population (existing engine outputs at asOf only — never invent):
 * 1. obs.liquidity.levels → named_level (detector: obs_levels)
 * 2. structure candidates missing from obs (NY-pre, ORG, NDOG/NWOG edges)
 * 3. optional gap_band rows when both edges exist
 * 4. obs.reh_rel.all_levels → relative_equal (detector: reh_rel)
 * 5. structureFacts.relativeEqualPools → relative_equal (detector: relativeEqualPools)
 * 6. research EQH/EQL areas when provided → equal_area (detector: eqh_eql)
 */
import type {
  ReadonlyMarketObservation,
  RehRelLevelObservation,
} from "./desk-schema";
import { isQualifyingTaken, type NamedLevelStatus } from "./level-interaction";
import {
  LIQUIDITY_REPRESENTATION_VERSION,
  stampLiquidityFeaturesFromObs,
  type LiquidityLevelStamp,
  type LiquidityStampFeatures,
} from "./liquidity-stamp-features";
import type { LiquidityArea } from "./research/eqh-eql-liquidity";
import type { MarketContext } from "./types";

export const LIQUIDITY_MAP_REPRESENTATION_VERSION = "liquidity_map_repr_v0" as const;

export type LiquidityPoolKind =
  | "named_level"
  | "relative_equal"
  | "equal_area"
  | "gap_band";

export type LiquidityPoolDetector =
  | "obs_levels"
  | "structure_candidates"
  | "reh_rel"
  | "relativeEqualPools"
  | "eqh_eql";

export type LiquidityPoolStamp = {
  id: string;
  kind: LiquidityPoolKind;
  label: string;
  side?: "buy_side" | "sell_side";
  price?: number;
  priceLow?: number;
  priceHigh?: number;
  representativeLevel?: number;
  taken?: boolean | "unknown";
  status?: string;
  source?: string;
  detector: LiquidityPoolDetector;
  formedAt?: number;
  qualifyingTickAt?: number;
  qualifyingTickPrice?: number;
  candleId?: string;
  why?: string;
  sweptAt?: number;
};

export type LiquidityMapStampFeatures = LiquidityStampFeatures & {
  liquidityPools: LiquidityPoolStamp[];
  liquidityPoolCount: number;
  /** taken === true only (pools); separate from liquidityTakenCount on levels */
  liquidityPoolTakenCount: number;
  liquidityMapRepresentationVersion: typeof LIQUIDITY_MAP_REPRESENTATION_VERSION;
};

export type LiquidityMapEvidenceFields = {
  liquidityLevels?: LiquidityLevelStamp[] | null;
  liquidityPools?: LiquidityPoolStamp[] | null;
};

/** Named structure ids that exist on context but are dropped by buildLiquidityLevels. */
export const LIQUIDITY_MAP_EXTRA_NAMED_IDS = [
  "ny_pre_high",
  "ny_pre_low",
  "org_top",
  "org_bottom",
  "org_ce",
  "ndog_top",
  "ndog_bot",
  "nwog_top",
  "nwog_bot",
] as const;

function sideForNamedId(id: string): "buy_side" | "sell_side" | undefined {
  if (
    id.endsWith("_high") ||
    id === "pdh" ||
    id === "org_top" ||
    id === "ndog_top" ||
    id === "nwog_top"
  ) {
    return "buy_side";
  }
  if (
    id.endsWith("_low") ||
    id === "pdl" ||
    id === "org_bottom" ||
    id === "ndog_bot" ||
    id === "nwog_bot"
  ) {
    return "sell_side";
  }
  return undefined;
}

function finitePrice(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function takenForNamedFromStructure(
  id: string,
  label: string,
  ctx: MarketContext,
  quality: ReadonlyMarketObservation["data_quality"]
): {
  taken: boolean | "unknown";
  status?: NamedLevelStatus;
  qualifyingTickAt?: number;
  qualifyingTickPrice?: number;
  candleId?: string;
  why?: string;
} {
  const sweeps = ctx.structureFacts.liquiditySweeps ?? [];
  const interactions = ctx.structureFacts.levelInteractions ?? [];
  const ix = interactions.find((i) => i.levelId.toLowerCase() === id.toLowerCase());
  const status = (ix?.status as NamedLevelStatus | undefined) ?? "UNTOUCHED";
  const sweepHit = sweeps.some(
    (s) =>
      s.levelId.toLowerCase() === id.toLowerCase() ||
      s.label.toLowerCase() === label.toLowerCase()
  );
  let taken: boolean | "unknown" = false;
  if (quality === "stale" || quality === "missing") taken = "unknown";
  else if (ix) taken = sweepHit && isQualifyingTaken(status);
  else taken = sweepHit;
  return {
    taken,
    status,
    qualifyingTickAt: ix?.atTime,
    qualifyingTickPrice: ix?.tickPrice,
    candleId: ix?.candleId,
    why: ix?.why,
  };
}

function namedFromObsLevel(
  level: ReadonlyMarketObservation["liquidity"]["levels"][number]
): LiquidityPoolStamp {
  const id = level.id ?? `label:${level.label}:${level.price}`;
  const row: LiquidityPoolStamp = {
    id,
    kind: "named_level",
    label: level.label,
    price: level.price,
    taken: level.taken,
    detector: "obs_levels",
  };
  if (level.side != null) row.side = level.side;
  else {
    const inferred = level.id ? sideForNamedId(level.id) : undefined;
    if (inferred) row.side = inferred;
  }
  if (level.status != null) row.status = level.status;
  if (level.source != null) row.source = level.source;
  if (level.formedAt != null) row.formedAt = level.formedAt;
  if (level.qualifyingTickAt != null) row.qualifyingTickAt = level.qualifyingTickAt;
  if (level.qualifyingTickPrice != null) {
    row.qualifyingTickPrice = level.qualifyingTickPrice;
  }
  if (level.candleId != null) row.candleId = level.candleId;
  if (level.why != null) row.why = level.why;
  return row;
}

function collectExtraNamedCandidates(
  ctx: MarketContext
): Array<{ id: string; label: string; price: number; formedAt?: number; source?: string }> {
  const out: Array<{
    id: string;
    label: string;
    price: number;
    formedAt?: number;
    source?: string;
  }> = [];
  const s = ctx.sessions;
  if (finitePrice(s.nyPreHigh)) {
    out.push({
      id: "ny_pre_high",
      label: "NY pre high",
      price: s.nyPreHigh,
      formedAt: s.nyPreHighTime,
      source: "session_1m",
    });
  }
  if (finitePrice(s.nyPreLow)) {
    out.push({
      id: "ny_pre_low",
      label: "NY pre low",
      price: s.nyPreLow,
      formedAt: s.nyPreLowTime,
      source: "session_1m",
    });
  }
  if (ctx.org) {
    const o = ctx.org;
    if (finitePrice(o.top)) {
      out.push({
        id: "org_top",
        label: "ORG top",
        price: o.top,
        formedAt: o.formedAtTime,
        source: "org",
      });
    }
    if (finitePrice(o.bottom)) {
      out.push({
        id: "org_bottom",
        label: "ORG bottom",
        price: o.bottom,
        formedAt: o.formedAtTime,
        source: "org",
      });
    }
    if (finitePrice(o.ce)) {
      out.push({
        id: "org_ce",
        label: "ORG CE",
        price: o.ce,
        formedAt: o.formedAtTime,
        source: "org",
      });
    }
  }
  const ndog = ctx.htfPdArrays.ndog;
  if (ndog) {
    if (finitePrice(ndog.top)) {
      out.push({
        id: "ndog_top",
        label: "New Day Opening Gap Top",
        price: ndog.top,
        source: "htf_pd_arrays",
      });
    }
    if (finitePrice(ndog.bottom)) {
      out.push({
        id: "ndog_bot",
        label: "New Day Opening Gap Bottom",
        price: ndog.bottom,
        source: "htf_pd_arrays",
      });
    }
  }
  if (ctx.nwog) {
    const w = ctx.nwog;
    if (finitePrice(w.top)) {
      out.push({
        id: "nwog_top",
        label: "New Week Opening Gap Top",
        price: w.top,
        formedAt: w.startTime,
        source: "nwog",
      });
    }
    if (finitePrice(w.bottom)) {
      out.push({
        id: "nwog_bot",
        label: "New Week Opening Gap Bottom",
        price: w.bottom,
        formedAt: w.startTime,
        source: "nwog",
      });
    }
  }
  return out;
}

function gapBandRows(ctx: MarketContext): LiquidityPoolStamp[] {
  const bands: LiquidityPoolStamp[] = [];
  const ndog = ctx.htfPdArrays.ndog;
  if (ndog && finitePrice(ndog.top) && finitePrice(ndog.bottom)) {
    bands.push({
      id: "ndog_band",
      kind: "gap_band",
      label: "NDOG",
      priceLow: Math.min(ndog.bottom, ndog.top),
      priceHigh: Math.max(ndog.bottom, ndog.top),
      detector: "structure_candidates",
      source: "htf_pd_arrays",
    });
  }
  if (ctx.nwog && finitePrice(ctx.nwog.top) && finitePrice(ctx.nwog.bottom)) {
    bands.push({
      id: "nwog_band",
      kind: "gap_band",
      label: "NWOG",
      priceLow: Math.min(ctx.nwog.bottom, ctx.nwog.top),
      priceHigh: Math.max(ctx.nwog.bottom, ctx.nwog.top),
      detector: "structure_candidates",
      source: "nwog",
      formedAt: ctx.nwog.startTime,
    });
  }
  if (ctx.org && finitePrice(ctx.org.top) && finitePrice(ctx.org.bottom)) {
    bands.push({
      id: "org_band",
      kind: "gap_band",
      label: "ORG",
      priceLow: Math.min(ctx.org.bottom, ctx.org.top),
      priceHigh: Math.max(ctx.org.bottom, ctx.org.top),
      detector: "structure_candidates",
      source: "org",
      formedAt: ctx.org.formedAtTime,
    });
  }
  return bands;
}

function poolFromRehRel(level: RehRelLevelObservation): LiquidityPoolStamp {
  const side: "buy_side" | "sell_side" =
    level.type === "reh" ? "buy_side" : "sell_side";
  const row: LiquidityPoolStamp = {
    id: level.id,
    kind: "relative_equal",
    label: level.type.toUpperCase(),
    side,
    price: level.level,
    priceLow: level.range.low,
    priceHigh: level.range.high,
    representativeLevel: level.level,
    status: level.status,
    detector: "reh_rel",
    source: "observation.reh_rel",
  };
  if (level.sourceSwingTimestamps?.length) {
    row.formedAt = Math.min(...level.sourceSwingTimestamps);
  }
  if (level.status === "swept") row.taken = true;
  else if (level.status === "active") row.taken = false;
  else row.taken = "unknown";
  return row;
}

function poolFromRelativeEqualPool(
  p: MarketContext["structureFacts"]["relativeEqualPools"][number],
  index: number
): LiquidityPoolStamp {
  const id = `relpool_${p.type}_${p.price.toFixed(2)}_${p.startTime}_${index}`;
  return {
    id,
    kind: "relative_equal",
    label: p.type.toUpperCase(),
    side: p.type === "reh" ? "buy_side" : "sell_side",
    price: p.price,
    representativeLevel: p.price,
    status: "active",
    taken: false,
    detector: "relativeEqualPools",
    source: "structureFacts.relativeEqualPools",
    formedAt: p.startTime,
  };
}

function poolFromEqhArea(a: LiquidityArea): LiquidityPoolStamp {
  const kindLabel = a.type === "BUY_SIDE" ? "EQH" : "EQL";
  const side: "buy_side" | "sell_side" =
    a.type === "BUY_SIDE" ? "buy_side" : "sell_side";
  const taken =
    a.status === "swept" || a.status === "closed_through"
      ? true
      : a.status === "invalidated"
        ? "unknown"
        : false;
  const row: LiquidityPoolStamp = {
    id: a.id,
    kind: "equal_area",
    label: kindLabel,
    side,
    priceLow: a.priceLow,
    priceHigh: a.priceHigh,
    representativeLevel: a.representativeLevel,
    status: a.status,
    taken,
    detector: "eqh_eql",
    source: "research_eqh_eql",
    formedAt: a.formationTime,
    why: a.whyMeaningful,
  };
  if (a.sweptAt != null) row.sweptAt = a.sweptAt;
  return row;
}

export type LiquidityMapStampInput = {
  obs: ReadonlyMarketObservation;
  ctx?: MarketContext | null;
  /** Research EQH/EQL snapshot at asOf — omit when not computed (do not invent). */
  eqhAreas?: LiquidityArea[] | null;
};

/**
 * Full PIT path: observation + optional MarketContext + optional EQH areas.
 */
export function stampLiquidityMapFromObsAndContext(
  input: LiquidityMapStampInput
): LiquidityMapStampFeatures {
  const { obs, ctx, eqhAreas } = input;
  const levelStamp = stampLiquidityFeaturesFromObs(obs);
  const pools: LiquidityPoolStamp[] = [];
  const seenIds = new Set<string>();

  const push = (row: LiquidityPoolStamp) => {
    if (seenIds.has(row.id)) return;
    seenIds.add(row.id);
    pools.push(row);
  };

  for (const level of obs.liquidity?.levels ?? []) {
    push(namedFromObsLevel(level));
  }

  if (ctx) {
    for (const c of collectExtraNamedCandidates(ctx)) {
      if (seenIds.has(c.id)) continue;
      if (!finitePrice(c.price)) continue;
      const state = takenForNamedFromStructure(c.id, c.label, ctx, obs.data_quality);
      const row: LiquidityPoolStamp = {
        id: c.id,
        kind: "named_level",
        label: c.label,
        price: c.price,
        taken: state.taken,
        detector: "structure_candidates",
      };
      const side = sideForNamedId(c.id);
      if (side) row.side = side;
      if (state.status != null) row.status = state.status;
      if (c.source != null) row.source = c.source;
      if (c.formedAt != null) row.formedAt = c.formedAt;
      if (state.qualifyingTickAt != null) row.qualifyingTickAt = state.qualifyingTickAt;
      if (state.qualifyingTickPrice != null) {
        row.qualifyingTickPrice = state.qualifyingTickPrice;
      }
      if (state.candleId != null) row.candleId = state.candleId;
      if (state.why != null) row.why = state.why;
      push(row);
    }

    for (const band of gapBandRows(ctx)) push(band);

    for (const p of ctx.structureFacts.relativeEqualPools ?? []) {
      push(poolFromRelativeEqualPool(p, pools.length));
    }
  }

  if (obs.reh_rel?.status === "known") {
    for (const level of obs.reh_rel.all_levels ?? []) {
      push(poolFromRehRel(level));
    }
  }

  if (eqhAreas?.length) {
    for (const a of eqhAreas) push(poolFromEqhArea(a));
  }

  return {
    ...levelStamp,
    liquidityPools: pools,
    liquidityPoolCount: pools.length,
    liquidityPoolTakenCount: pools.filter((p) => p.taken === true).length,
    liquidityMapRepresentationVersion: LIQUIDITY_MAP_REPRESENTATION_VERSION,
  };
}

/** DV / stamp path when EvidenceAtT already carries pools (and optionally levels). */
export function stampLiquidityMapFromEvidence(
  e: LiquidityMapEvidenceFields
): LiquidityMapStampFeatures {
  const levels = [...(e.liquidityLevels ?? [])];
  const pools = [...(e.liquidityPools ?? [])];
  return {
    liquidityLevels: levels,
    liquidityLevelCount: levels.length,
    liquidityTakenCount: levels.filter((l) => l.taken === true).length,
    liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
    liquidityPools: pools,
    liquidityPoolCount: pools.length,
    liquidityPoolTakenCount: pools.filter((p) => p.taken === true).length,
    liquidityMapRepresentationVersion: LIQUIDITY_MAP_REPRESENTATION_VERSION,
  };
}

/** Outcome-blind coverage helpers for smoke reports. */
export function liquidityMapStructureCoverage(pools: LiquidityPoolStamp[]): {
  ny_pre: boolean;
  org: boolean;
  gaps: boolean;
  reh_rel: boolean;
  relativeEqualPools: boolean;
  eqh_eql: boolean;
  ids: string[];
} {
  const ids = pools.map((p) => p.id);
  return {
    ny_pre: pools.some((p) => p.id === "ny_pre_high" || p.id === "ny_pre_low"),
    org: pools.some(
      (p) =>
        p.id === "org_top" ||
        p.id === "org_bottom" ||
        p.id === "org_ce" ||
        p.id === "org_band"
    ),
    gaps: pools.some(
      (p) =>
        p.id.startsWith("ndog_") ||
        p.id.startsWith("nwog_") ||
        p.kind === "gap_band"
    ),
    reh_rel: pools.some((p) => p.detector === "reh_rel"),
    relativeEqualPools: pools.some((p) => p.detector === "relativeEqualPools"),
    eqh_eql: pools.some((p) => p.detector === "eqh_eql"),
    ids,
  };
}
