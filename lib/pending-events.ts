/**
 * Pending vs confirmed events — intrabar detection, close confirmation.
 */
import type { MarketContext } from "./types";
import type { ConfirmationType } from "./confirmation-policy";
import { policyFor } from "./confirmation-policy";

export type EventStatus = "pending" | "confirmed" | "rejected";

export type TrackerEvent = {
  id: string;
  concept: string;
  label: string;
  status: EventStatus;
  confirmation: ConfirmationType;
  detected_at: string;
  confirmed_at?: string;
  price?: number;
  level?: number;
  detail: string;
  evidence_key?: string;
};

export type ClosedBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
};

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

function priceInZone(price: number, bottom: number, top: number): boolean {
  const lo = Math.min(bottom, top);
  const hi = Math.max(bottom, top);
  return price >= lo && price <= hi;
}

/** Intrabar hints — amber panel only; do not update official verdict. */
export function detectPendingEvents(
  ctx: MarketContext,
  livePrice: number | null
): TrackerEvent[] {
  const now = new Date().toISOString();
  const events: TrackerEvent[] = [];
  const px = livePrice ?? ctx.daily.lastClose;

  for (const sweep of ctx.structureFacts.liquiditySweeps) {
    const policy = policyFor("liquidity_sweep");
    events.push({
      id: `pending.sweep.${sweep.levelId}`,
      concept: "liquidity_sweep",
      label: `${sweep.label} sweep`,
      status: "pending",
      confirmation: policy.confirmation,
      detected_at: sweep.at,
      price: roundMnq(sweep.price),
      detail: `${sweep.side.replace("_", "-")} liquidity at ${sweep.price.toFixed(2)} — awaiting candle close confirm`,
      evidence_key: `liquidity.${sweep.levelId}`,
    });
  }

  const mss = ctx.structureFacts.mss;
  if (mss) {
    const policy = policyFor("mss");
    const invalidated =
      (mss.direction === "bullish" && px < mss.level) ||
      (mss.direction === "bearish" && px > mss.level);
    events.push({
      id: "pending.mss",
      concept: invalidated ? "invalidation" : "mss",
      label: invalidated ? "MSS invalidation watch" : "MSS",
      status: "pending",
      confirmation: policy.confirmation,
      detected_at: mss.at,
      price: roundMnq(mss.level),
      detail: invalidated
        ? `Price ${px.toFixed(2)} through MSS ${mss.level.toFixed(2)} — confirm on body close`
        : `${mss.direction} MSS at ${mss.level.toFixed(2)} — structure holds until close through level`,
      evidence_key: "structure.mss_level",
    });
  }

  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  const lastFvg = fvgs[fvgs.length - 1];
  if (lastFvg && Number.isFinite(px)) {
    const inZone = priceInZone(px, lastFvg.bottom, lastFvg.top);
    if (inZone) {
      const policy = policyFor("fvg_entry");
      events.push({
        id: "pending.fvg_entry",
        concept: "fvg_entry",
        label: "FVG entry zone touch",
        status: "pending",
        confirmation: policy.confirmation,
        detected_at: now,
        price: roundMnq(px),
        detail: `Live print in ${lastFvg.type} FVG ${lastFvg.bottom.toFixed(2)}–${lastFvg.top.toFixed(2)} — execution signal (intrabar wick OK)`,
        evidence_key: "structure.fvg.status",
      });
    }
  }

  const pdh = ctx.htfPdArrays.previousDay.high;
  const distToPdh = Math.abs(px - pdh);
  if (distToPdh < 8 && !ctx.structureFacts.liquiditySweeps.some((s) => s.levelId === "pdh")) {
    events.push({
      id: "pending.approach_pdh",
      concept: "liquidity_sweep",
      label: "Approaching PDH",
      status: "pending",
      confirmation: policyFor("liquidity_sweep").confirmation,
      detected_at: now,
      level: pdh,
      detail: `Within ${distToPdh.toFixed(1)} pts of PDH ${pdh.toFixed(2)} — watching for sweep`,
    });
  }

  return events;
}

/** Promote pending → confirmed on candle close using closed bar OHLC. */
export function confirmEventsOnBarClose(
  pending: TrackerEvent[],
  ctx: MarketContext,
  bar: ClosedBar | null
): { confirmed: TrackerEvent[]; stillPending: TrackerEvent[]; rejected: TrackerEvent[] } {
  const confirmed: TrackerEvent[] = [];
  const stillPending: TrackerEvent[] = [];
  const rejected: TrackerEvent[] = [];
  const now = new Date().toISOString();

  if (!bar) {
    return { confirmed, stillPending: pending, rejected };
  }

  const mss = ctx.structureFacts.mss;
  for (const ev of pending) {
    if (ev.concept === "mss" && mss) {
      const bodyConfirmed =
        (mss.direction === "bullish" && bar.c > mss.level) ||
        (mss.direction === "bearish" && bar.c < mss.level);
      if (bodyConfirmed) {
        confirmed.push({
          ...ev,
          status: "confirmed",
          confirmed_at: now,
          detail: `${mss.direction} MSS confirmed on close at ${bar.c.toFixed(2)}`,
        });
      } else if (
        (mss.direction === "bullish" && bar.c < mss.level) ||
        (mss.direction === "bearish" && bar.c > mss.level)
      ) {
        rejected.push({ ...ev, status: "rejected", confirmed_at: now, detail: "Close invalidated MSS" });
      } else {
        stillPending.push(ev);
      }
      continue;
    }

    if (ev.concept === "invalidation" && mss) {
      const inv =
        (mss.direction === "bullish" && bar.c < mss.level) ||
        (mss.direction === "bearish" && bar.c > mss.level);
      if (inv) {
        confirmed.push({
          ...ev,
          status: "confirmed",
          confirmed_at: now,
          detail: `MSS invalidated on close ${bar.c.toFixed(2)} through ${mss.level.toFixed(2)}`,
        });
      } else {
        stillPending.push(ev);
      }
      continue;
    }

    if (ev.concept === "liquidity_sweep" && ev.level != null) {
      const swept = bar.h >= ev.level || bar.l <= ev.level;
      if (swept && bar.c !== bar.o) {
        confirmed.push({
          ...ev,
          status: "confirmed",
          confirmed_at: now,
          detail: `Liquidity event confirmed on bar close ${bar.c.toFixed(2)}`,
        });
      } else {
        stillPending.push(ev);
      }
      continue;
    }

    if (ev.concept === "fvg_entry") {
      stillPending.push(ev);
      continue;
    }

    stillPending.push(ev);
  }

  return { confirmed, stillPending, rejected };
}

/** Intrabar execution — does not confirm market state. */
export function intrabarExecutionSignal(
  ctx: MarketContext,
  livePrice: number
): { met: boolean; detail: string } | null {
  const fvgs = ctx.structureFacts.m1UnfilledFvgs;
  const fvg = fvgs[fvgs.length - 1];
  if (!fvg) return null;
  if (!priceInZone(livePrice, fvg.bottom, fvg.top)) return null;
  return {
    met: true,
    detail: `Entry criteria met — wick/live print ${livePrice.toFixed(2)} in ${fvg.type} FVG (intrabar; thesis unchanged until close)`,
  };
}
