/**
 * TickStream live price fallback when TradingView bridge is broken.
 * Server-side only — uses TICKSTREAM_API_KEY from env / .env.local.
 */

import { Stream } from "@tickstream/client";
import type { ChartSnapshotPayload } from "../chart-snapshot";
import {
  LIVE_PRICE_MAX_AGE_MS,
  isAuthoritativeLiveAvailable,
  isLiveTvPriceSource,
  isMnqChartPrice,
  resolveAuthoritativePrice,
  type AuthoritativePrice,
  type LivePriceSource,
} from "../chart-live-price";
import { fetchTickstreamQuote, loadTickstreamApiKey } from "./quote";

const MNQ = "MNQ";
const DEFAULT_STREAM_WAIT_MS = 8_000;

export type TickstreamFallbackInput = {
  chartLastPrice?: number | null;
  chartLastPriceSource?: LivePriceSource | string | null;
  chartLastPriceTs?: number | null;
  chartSnapshot?: ChartSnapshotPayload | null;
  chartExportFailed?: boolean;
  barClose?: number | null;
};

function roundMnq(p: number): number {
  return Math.round(p * 4) / 4;
}

function chartExportFailed(input: TickstreamFallbackInput): boolean {
  if (input.chartExportFailed === true) return true;
  const snap = input.chartSnapshot;
  if (!snap) return false;
  const reasons = snap.qualityMeta?.reasons ?? [];
  if (reasons.includes("export_failed")) return true;
  if (snap.reason === "export_failed") return true;
  if (snap.ok === false && /export/i.test(snap.reason || "")) return true;
  return false;
}

/** True when TV live price is missing and chart bridge signals failure or empty export. */
export function needsTickstreamFallback(input: TickstreamFallbackInput): boolean {
  const snap = input.chartSnapshot;
  const requireTvLive = input.chartLastPrice != null || snap != null;
  const auth = resolveAuthoritativePrice({
    chartLastPrice: input.chartLastPrice,
    chartLastPriceSource: input.chartLastPriceSource,
    chartLastPriceTs: input.chartLastPriceTs,
    barClose: input.barClose,
    snapLastPrice: snap?.lastPrice,
    requireTvLive,
  });
  if (isAuthoritativeLiveAvailable(auth)) return false;

  const noCandles = snap != null && !snap.candles?.length;
  const exportFailed = chartExportFailed(input);
  const noTvLive = input.chartLastPrice == null || !isLiveTvPriceSource(input.chartLastPriceSource || "none");
  const qualityMissing =
    snap != null &&
    (snap.qualityMeta?.quality === "missing" ||
      snap.qualityMeta?.quality === "stale" ||
      noCandles);

  if (input.chartExportFailed === true || exportFailed || qualityMissing || noCandles) {
    return true;
  }

  return noTvLive && snap != null;
}

async function fetchTickstreamStreamTick(
  apiKey: string,
  waitMs: number
): Promise<AuthoritativePrice | null> {
  try {
    const stream = new Stream(apiKey);
    let latest: AuthoritativePrice | null = null;

    stream.on("error", () => {
      /* swallow — REST quote fallback handles failure */
    });

    const iter = stream.subscribe(MNQ);
    const tickLoop = (async () => {
      for await (const tick of iter) {
        if (tick.symbol !== MNQ) continue;
        const price = tick.price;
        const tsSec = tick.ts;
        if (typeof price !== "number" || !Number.isFinite(price) || !isMnqChartPrice(price)) continue;
        if (typeof tsSec !== "number" || !Number.isFinite(tsSec) || tsSec <= 0) continue;
        const tsMs = tsSec * 1000;
        const ageMs = Math.max(0, Date.now() - tsMs);
        if (ageMs > LIVE_PRICE_MAX_AGE_MS) continue;
        latest = {
          value: roundMnq(price),
          source: "tickstream_live",
          timestamp: tsMs,
          ageMs,
        };
      }
    })();

    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    stream.unsubscribe("ticks", MNQ);
    stream.close();
    await tickLoop.catch(() => {});

    return latest;
  } catch {
    /* ws can fail when bundled on serverless — REST quote is the primary path */
    return null;
  }
}

/** Prefer REST /quote (fast); short live stream when quote unavailable. */
export async function resolveTickstreamAuthoritativePrice(opts?: {
  streamWaitMs?: number;
  symbol?: string;
}): Promise<AuthoritativePrice | null> {
  const apiKey = loadTickstreamApiKey();
  if (!apiKey) return null;

  try {
    const q = await fetchTickstreamQuote({ apiKey, symbol: opts?.symbol ?? MNQ });
    if (isMnqChartPrice(q.price)) {
      const tsMs = q.ts * 1000;
      const ageMs = Math.max(0, Date.now() - tsMs);
      if (ageMs <= LIVE_PRICE_MAX_AGE_MS) {
        return {
          value: roundMnq(q.price),
          source: "tickstream_quote",
          timestamp: tsMs,
          ageMs,
        };
      }
    }
  } catch {
    /* try stream */
  }

  if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    /* WebSocket (ws/bufferutil) breaks when bundled on serverless — REST quote above is enough. */
    return null;
  }

  const waitMs = opts?.streamWaitMs ?? DEFAULT_STREAM_WAIT_MS;
  return fetchTickstreamStreamTick(apiKey, waitMs);
}

/** Resolve TickStream price only when TV bridge data is missing or rejected. */
export async function maybeResolveTickstreamFallback(
  input: TickstreamFallbackInput,
  opts?: { streamWaitMs?: number }
): Promise<AuthoritativePrice | null> {
  if (!needsTickstreamFallback(input)) return null;
  return resolveTickstreamAuthoritativePrice(opts);
}
