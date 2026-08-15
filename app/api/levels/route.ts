import { NextResponse } from "next/server";
import { fetchAllTimeframesCached, buildFvgDailyBars } from "@/lib/market-data";
import { formatPdArrayBrief } from "@/lib/pd-arrays";
import {
  assignStaggeredLabelAlign,
  buildDrawingLevels,
  buildDrawingZones,
  computeFhdr,
  formatFirstPresentedFvgDraw,
  formatLevelsForClipboard,
  formatLevelsForPineInputs,
} from "@/lib/drawing-levels";
import {
  formatEqhEqlClipboard,
  toEqhEqlTrackRows,
  toRelativeEqualPools,
} from "@/lib/research/eqh-eql-liquidity";
import { syncLiveEngineFromFeed } from "@/lib/incremental-market-engine";

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
    const data = await fetchAllTimeframesCached(false);
    const synced = syncLiveEngineFromFeed({
      data,
      asOf: new Date(),
      lastPrice: data.m1.at(-1)?.close ?? null,
    });
    const ctx = synced.ctx;
    const eqhEql = synced.eqhEql;
    const eqhEqlRows = toEqhEqlTrackRows(eqhEql, {
      currentPrice: ctx.daily.lastClose,
      maxRows: 12,
    });
    const overlayPools = toRelativeEqualPools(eqhEql.displayed.length ? eqhEql.displayed : eqhEql.pools);
    const levels = buildDrawingLevels(ctx, data.m1, {
      currentPrice: ctx.daily.lastClose,
      relativeEqualPools: overlayPools,
    });
    const fvgDaily = buildFvgDailyBars(data.daily, data.m1);
    const zones = buildDrawingZones(ctx, data.m1, fvgDaily);
    const fhdr = computeFhdr(data.m1, ctx.fetchedAt);
    const firstPresentedFvg = formatFirstPresentedFvgDraw(
      ctx.structureFacts.firstPresentedFvg?.nyOpening
    );

    const levelPrices = [
      ...levels.map((l) => l.price),
      ...zones.flatMap((z) => [z.top, z.bottom]),
    ];
    const priceMin = Math.min(...levelPrices, ctx.daily.currentDayLow, ctx.daily.previousDayLow);
    const priceMax = Math.max(...levelPrices, ctx.daily.currentDayHigh, ctx.daily.previousDayHigh);
    const pad = Math.max((priceMax - priceMin) * 0.06, 8);
    assignStaggeredLabelAlign(levels, zones, {
      priceMin: priceMin - pad,
      priceMax: priceMax + pad,
    });

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
        fhdr,
        firstPresentedFvg,
        eqhEqlLiquidity: {
          status: eqhEql.status,
          tickSize: eqhEql.tickSize,
          tolerance: eqhEql.tolerance,
          toleranceTicks: eqhEql.toleranceTicks,
          atr: eqhEql.atr,
          confirmationDelayBars: eqhEql.confirmationDelayBars,
          rows: eqhEqlRows,
          pools: eqhEql.pools,
          displayed: eqhEql.displayed,
          internal: eqhEql.internal,
          liquidityAreas: eqhEql.areas,
          rejectedCount: eqhEql.rejected.length,
          hierarchy: {
            rawSwingCount: eqhEql.rawSwings.highs.length + eqhEql.rawSwings.lows.length,
            classifiedCount: eqhEql.pools.length + eqhEql.internal.length,
            displayedCount: overlayPools.length,
            internalCount: eqhEql.internal.length,
            rejectedCount: eqhEql.rejected.length,
          },
        },
        clipboardText: [
          formatLevelsForClipboard(levels, zones),
          formatEqhEqlClipboard(eqhEqlRows),
        ]
          .filter(Boolean)
          .join("\n"),
        pineJson: formatLevelsForPineInputs(levels),
      },
      { headers: cors }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500, headers: cors });
  }
}
