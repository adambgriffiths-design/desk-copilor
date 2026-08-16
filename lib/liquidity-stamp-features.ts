/**
 * PIT-safe liquidity level stamp fields for featuresAtT / EvidenceAtT.
 *
 * Measurement plumbing only — does not change ALS / gates / trading behavior.
 * Vocabulary is the engine's NamedLevelStatus / buy_side|sell_side — do not invent.
 * Keeps sweepPresent as a separate back-compat field on the stamp surface.
 *
 * Version history:
 * - liquidity_repr_v0: label, price, side, taken, status, source, why, id
 * - liquidity_repr_v1: + formedAt, qualifyingTickAt, qualifyingTickPrice, candleId
 */
import type { ReadonlyMarketObservation } from "./desk-schema";
import type { NamedLevelStatus } from "./level-interaction";

export const LIQUIDITY_REPRESENTATION_VERSION = "liquidity_repr_v1" as const;

export type LiquidityLevelStamp = {
  id?: string;
  label: string;
  price: number;
  side?: "buy_side" | "sell_side";
  taken: boolean | "unknown";
  status?: NamedLevelStatus;
  source?: string;
  formedAt?: number;
  qualifyingTickAt?: number;
  qualifyingTickPrice?: number;
  candleId?: string;
  why?: string;
};

export type LiquidityStampFeatures = {
  liquidityLevels: LiquidityLevelStamp[];
  liquidityLevelCount: number;
  liquidityTakenCount: number;
  liquidityRepresentationVersion: typeof LIQUIDITY_REPRESENTATION_VERSION;
};

export type LiquidityEvidenceFields = {
  liquidityLevels?: LiquidityLevelStamp[] | null;
};

function toLevelStamp(
  level: ReadonlyMarketObservation["liquidity"]["levels"][number]
): LiquidityLevelStamp {
  const row: LiquidityLevelStamp = {
    label: level.label,
    price: level.price,
    taken: level.taken,
  };
  if (level.id != null) row.id = level.id;
  if (level.side != null) row.side = level.side;
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

function summarize(levels: LiquidityLevelStamp[]): LiquidityStampFeatures {
  return {
    liquidityLevels: levels,
    liquidityLevelCount: levels.length,
    liquidityTakenCount: levels.filter((l) => l.taken === true).length,
    liquidityRepresentationVersion: LIQUIDITY_REPRESENTATION_VERSION,
  };
}

/** Full path: observation available (desk / DV replay parity). */
export function stampLiquidityFeaturesFromObs(
  obs: ReadonlyMarketObservation
): LiquidityStampFeatures {
  const levels = (obs.liquidity?.levels ?? []).map(toLevelStamp);
  return summarize(levels);
}

/** DV / stamp path when EvidenceAtT carries liquidityLevels. */
export function stampLiquidityFeaturesFromEvidence(
  e: LiquidityEvidenceFields
): LiquidityStampFeatures {
  const levels = [...(e.liquidityLevels ?? [])];
  return summarize(levels);
}

/** Derive sweepPresent from stamped levels when confounder note is absent. */
export function sweepPresentFromLiquidityLevels(
  levels: LiquidityLevelStamp[] | null | undefined
): boolean | null {
  if (!levels || levels.length === 0) return null;
  return levels.some((l) => l.taken === true);
}
