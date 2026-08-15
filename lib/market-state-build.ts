import type { MarketContext } from "./types";
import {
  buildCandleHash,
  buildStateHash,
  type MarketState,
  type MarketStateDrawing,
  type MarketStateFvg,
} from "./market-state";
import {
  parseChartSnapshotInput,
  scoreChartQuality,
  type ChartSnapshotPayload,
} from "./chart-snapshot";
import { nearestPdLevels } from "./pd-arrays";
import {
  isLiveTvPriceSource,
  isTickstreamLiveSource,
  resolveAuthoritativePrice,
  type AuthoritativePrice,
  type LivePriceSource,
} from "./chart-live-price";

export function buildMarketState(input: {
  ctx: MarketContext;
  chartSnapshot?: ChartSnapshotPayload | null;
  chartLastPrice?: number | null;
  chartLastPriceSource?: LivePriceSource | string | null;
  chartLastPriceTs?: number | null;
  authoritativePrice?: AuthoritativePrice | null;
  symbol?: string;
  timeframe?: string;
}): MarketState {
  const snap = input.chartSnapshot;
  const candles = snap?.candles?.length ? snap.candles : [];
  const qualityMeta = snap
    ? snap.qualityMeta || scoreChartQuality(snap)
    : scoreChartQuality({
        ok: false,
        candles: [],
        drawings: [],
        source: "none",
        reason: "no_chart_export",
      });

  const requireTvLive = input.chartLastPrice != null || snap != null;
  const auth =
    input.authoritativePrice ??
    resolveAuthoritativePrice({
      chartLastPrice: input.chartLastPrice,
      chartLastPriceSource: input.chartLastPriceSource,
      chartLastPriceTs: input.chartLastPriceTs,
      barClose: input.ctx.daily.lastClose,
      snapLastPrice: snap?.lastPrice,
      requireTvLive,
    });
  const lastPrice = auth?.value ?? 0;
  const lastPriceSource: MarketState["lastPriceSource"] = auth
    ? isLiveTvPriceSource(auth.source)
      ? "tradingview"
      : isTickstreamLiveSource(auth.source)
        ? "tickstream"
        : "yahoo"
    : "yahoo";

  const pd = input.ctx.htfPdArrays.previousDay;
  const { support, resistance } = nearestPdLevels(lastPrice, input.ctx.htfPdArrays.levels ?? []);

  const drawings: MarketStateDrawing[] = (snap?.drawings || []).map((d) => ({
    type: d.type,
    ...(d.price != null ? { price: d.price } : {}),
    ...(d.top != null ? { top: d.top } : {}),
    ...(d.bottom != null ? { bottom: d.bottom } : {}),
    ...(d.label ? { label: d.label } : {}),
  }));

  const m1Fvgs = input.ctx.structureFacts.m1UnfilledFvgs ?? [];
  const dailyFvgs = input.ctx.htfPdArrays.unfilledDailyFvgs ?? [];
  const fvg: MarketStateFvg[] = [
    ...m1Fvgs.slice(-4).map((z) => ({
      top: z.top,
      bottom: z.bottom,
      direction: z.type,
      timeframe: z.timeframe,
      inverted: z.inverted,
    })),
    ...dailyFvgs.slice(-2).map((z) => ({
      top: z.top,
      bottom: z.bottom,
      direction: z.type,
      timeframe: z.timeframe,
    })),
  ];

  const mss = input.ctx.structureFacts.mss;
  const candleHash = buildCandleHash(candles);
  const state: MarketState = {
    symbol: input.symbol || input.ctx.symbol || snap?.symbol || "MNQ1!",
    timeframe: input.timeframe || snap?.timeframe || "1",
    lastPrice,
    lastPriceSource,
    updatedAt: new Date().toISOString(),
    candles,
    session: {
      id: input.ctx.activeSession?.id ?? "unknown",
      label: input.ctx.activeSession?.label ?? "—",
      high: input.ctx.sessions.nyRthHigh,
      low: input.ctx.sessions.nyRthLow,
      open: input.ctx.htfPdArrays.currentDay?.open,
      nyRthHigh: input.ctx.sessions.nyRthHigh,
      nyRthLow: input.ctx.sessions.nyRthLow,
    },
    structure: {
      bias: input.ctx.biasStack.dominantBias,
      tradeableBias: input.ctx.biasStack.tradeableBias,
      ...(mss
        ? {
            mss: mss.direction,
            mssLevel: mss.level,
            summary: mss.description,
          }
        : { summary: input.ctx.structureFacts.summary }),
    },
    levels: {
      pdh: pd?.high,
      pdl: pd?.low,
      pdc: pd?.close,
      pdcSource: input.ctx.daily.pdhSource,
      pdcFormedAt: input.ctx.daily.pdcFormedAt,
      ...(support
        ? {
            nearestSupport: support.price,
            nearestSupportLabel: support.label,
          }
        : {}),
      ...(resistance
        ? {
            nearestResistance: resistance.price,
            nearestResistanceLabel: resistance.label,
          }
        : {}),
      ...(input.ctx.org
        ? {
            orgTop: input.ctx.org.top,
            orgBottom: input.ctx.org.bottom,
            orgCe: input.ctx.org.ce,
          }
        : {}),
    },
    drawings,
    fvg,
    quality: {
      flag: qualityMeta.quality,
      reasons: qualityMeta.reasons,
      timestampDriftSec: qualityMeta.timestampDriftSec,
      lastBarTime: qualityMeta.lastBarTime,
    },
    candleHash,
    stateHash: "",
    snapshotId: "",
  };
  state.stateHash = buildStateHash(state);
  state.snapshotId = `ms_${state.stateHash}_${Date.parse(state.updatedAt) || 0}`;
  const backendClose = input.ctx.daily.m1BarClose ?? input.ctx.daily.lastClose;
  const tvPx = input.chartLastPrice;
  const diff =
    tvPx != null && Number.isFinite(tvPx) && Number.isFinite(backendClose)
      ? Math.abs(tvPx - backendClose)
      : 0;
  const agree = tvPx == null || !Number.isFinite(backendClose) || diff <= 0.25;
  if (!agree) {
    state.quality.reasons = [...(state.quality.reasons || []), "tv_backend_price_disagree"];
  }
  state.priceAgreement = {
    ...(tvPx != null
      ? {
          tv: {
            value: tvPx,
            timestamp: input.chartLastPriceTs ?? null,
            source: String(input.chartLastPriceSource || "tradingview"),
          },
        }
      : {}),
    backend: { value: backendClose, source: "m1_close" },
    marketState: { value: lastPrice, source: lastPriceSource },
    agree,
    difference: diff,
  };
  return state;
}

export function buildMarketStateFromPayload(input: {
  ctx: MarketContext;
  chartSnapshot?: unknown;
  symbol?: string;
  timeframe?: string;
}): MarketState {
  const snap = parseChartSnapshotInput(input.chartSnapshot);
  return buildMarketState({
    ctx: input.ctx,
    chartSnapshot: snap,
    symbol: input.symbol,
    timeframe: input.timeframe,
  });
}
