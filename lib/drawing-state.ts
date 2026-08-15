/**
 * Drawing fingerprint — skip full chart redraw when structure objects are unchanged.
 * Native TV text + colors stay on the existing shapes; ticks must not rebuild the set.
 */
import type { DrawingLevel, DrawingZone } from "./drawing-levels";
import type { MarketContext } from "./types";
import type { LiquidityArea } from "./research/eqh-eql-liquidity";

export function drawingPayloadFingerprint(
  levels: Array<Pick<DrawingLevel, "id" | "price" | "label" | "color">>,
  zones: Array<Pick<DrawingZone, "id" | "top" | "bottom" | "label">>
): string {
  const lv = levels
    .map((l) => `${l.id}:${l.price.toFixed(2)}:${l.label}:${l.color}`)
    .sort()
    .join("|");
  const zn = zones
    .map((z) => `${z.id}:${z.top.toFixed(2)}:${z.bottom.toFixed(2)}:${z.label}`)
    .sort()
    .join("|");
  return `${lv}#${zn}`;
}

export function structureDrawingFingerprint(
  ctx: MarketContext,
  areas: LiquidityArea[] = []
): string {
  const mss = ctx.structureFacts.mss;
  const fvg = ctx.structureFacts.m1UnfilledFvgs
    .map((z) => `${z.type}:${z.top.toFixed(2)}:${z.bottom.toFixed(2)}`)
    .join(",");
  const pools = ctx.structureFacts.relativeEqualPools
    .map((p) => `${p.type}:${p.price.toFixed(2)}:${p.startTime}`)
    .join(",");
  const liq = areas
    .map(
      (a) =>
        `${a.type}:${a.representativeLevel.toFixed(2)}:${a.priceLow.toFixed(2)}-${a.priceHigh.toFixed(2)}:${a.status}`
    )
    .join(",");
  const sess = `${ctx.activeSession.id}:${ctx.sessions.nyRthHigh}:${ctx.sessions.nyRthLow}:${ctx.sessions.nyPreHigh}:${ctx.sessions.nyPreLow}`;
  const pd = `${ctx.htfPdArrays.previousDay.high}:${ctx.htfPdArrays.previousDay.low}:${ctx.htfPdArrays.currentDay.high}:${ctx.htfPdArrays.currentDay.low}`;
  return `mss=${mss ? `${mss.direction}:${mss.level}` : "none"}|fvg=${fvg}|reh=${pools}|liq=${liq}|sess=${sess}|pd=${pd}`;
}

export function shouldRedrawDrawings(input: {
  prevFingerprint: string | null;
  nextFingerprint: string;
  reason: "tick" | "structure_event" | "user" | "reconnect" | "toggle";
}): boolean {
  if (input.reason === "tick") return false;
  if (input.reason === "user" || input.reason === "reconnect" || input.reason === "toggle") return true;
  return input.prevFingerprint !== input.nextFingerprint;
}
