import { NextResponse } from "next/server";
import { fetchAllTimeframes, buildFvgDailyBars } from "@/lib/market-data";
import { buildMarketContext } from "@/lib/levels";
import { formatPdArrayBrief } from "@/lib/pd-arrays";
import {
  buildDrawingLevels,
  buildDrawingZones,
  formatLevelsForClipboard,
  formatLevelsForPineInputs,
} from "@/lib/drawing-levels";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET() {
  try {
    const data = await fetchAllTimeframes();
    const ctx = buildMarketContext(data);
    const levels = buildDrawingLevels(ctx);
    const fvgDaily = buildFvgDailyBars(data.daily, data.m1);
    const zones = buildDrawingZones(ctx, data.m1, fvgDaily);

    const levelPrices = [
      ...levels.map((l) => l.price),
      ...zones.flatMap((z) => [z.top, z.bottom]),
    ];
    const priceMin = Math.min(...levelPrices, ctx.daily.currentDayLow, ctx.daily.previousDayLow);
    const priceMax = Math.max(...levelPrices, ctx.daily.currentDayHigh, ctx.daily.previousDayHigh);
    const pad = Math.max((priceMax - priceMin) * 0.06, 8);

    return NextResponse.json(
      {
        symbol: ctx.symbol,
        fetchedAt: ctx.fetchedAt,
        chartTimeEst: ctx.chartTimeEst,
        amdPhase: ctx.amdPhaseHint,
        activeSession: ctx.activeSession,
        structureFacts: ctx.structureFacts,
        tradeableBias: ctx.biasStack.tradeableBias,
        biasConflict: ctx.biasStack.biasConflict,
        htfPdArrays: ctx.htfPdArrays,
        premiumDiscount: ctx.premiumDiscount,
        pdArrayBrief: formatPdArrayBrief(ctx),
        priceSource: "1m",
        lastPrice1m: ctx.daily.lastClose,
        priceHint: {
          last: ctx.daily.lastClose,
          visibleMin: priceMin - pad,
          visibleMax: priceMax + pad,
        },
        levels,
        zones,
        clipboardText: formatLevelsForClipboard(levels, zones),
        pineJson: formatLevelsForPineInputs(levels),
      },
      { headers: cors }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
