/** Structured chart data from TradingView exportData + user drawings. */

export type ChartCandle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

export type ChartDrawing = {
  type: "horizontal_line" | "rectangle" | "trend_line" | "ray" | "other";
  label?: string;
  price?: number;
  top?: number;
  bottom?: number;
  points?: Array<{ t: number; p: number }>;
  source?: string;
};

export type ChartQuality = "good" | "degraded" | "stale" | "missing";

export type ChartQualityMeta = {
  quality: ChartQuality;
  reasons: string[];
  timestampDriftSec?: number;
  lastBarAgeSec?: number;
  lastBarTime?: number;
  candleCount: number;
  drawingCount: number;
  exportPartial?: boolean;
  drawingExportFailed?: boolean;
  timestampSyncOk?: boolean;
};

export type ChartSnapshotPayload = {
  ok: boolean;
  symbol?: string;
  timeframe?: string;
  visibleRange?: { from: number; to: number } | null;
  lastPrice?: number | null;
  candles: ChartCandle[];
  drawings: ChartDrawing[];
  source: "tv_export" | "yahoo_fallback" | "none";
  reason?: string;
  exportedAt?: string;
  quality?: ChartQuality;
  qualityMeta?: ChartQualityMeta;
  /** Bridge-reported sync hints (optional). */
  sync?: {
    lastBarTime?: number;
    timestampDriftSec?: number;
    drawingExportFailed?: boolean;
    exportPartial?: boolean;
  };
};

export type ChartReasoningLog = {
  ts: string;
  input: {
    quality: ChartQuality;
    reasons: string[];
    candleCount: number;
    candleHash: string;
    drawingCount: number;
    lastBarTime?: number;
    lastPrice?: number | null;
    visibleRange?: { from: number; to: number } | null;
    timestampDriftSec?: number;
    keyLevels?: string[];
    source?: string;
  };
  output?: {
    confidence?: string;
    call?: string;
    tradeableBias?: string;
    reasoningSnippet?: string;
    panelLineCount?: number;
  };
};

export const CHART_NO_CALL_MESSAGE =
  "No call — couldn't read the chart data right now.";

export const MIN_CANDLES_FOR_STRUCTURED = 20;
const STALE_BAR_SEC = 120;
const TIMESTAMP_DRIFT_WARN_SEC = 180;

export function isMnqChartPrice(n: number): boolean {
  return Number.isFinite(n) && n >= 20000 && n <= 45000;
}

function parseOptionalPrice(value: unknown): number | null {
  const n = Number(value);
  return isMnqChartPrice(n) ? Math.round(n * 4) / 4 : null;
}

function parseVisibleRange(value: unknown): { from: number; to: number } | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const from = Number(r.from);
  const to = Number(r.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from: Math.floor(from), to: Math.floor(to) };
}

function normalizeUnixSec(t: unknown): number | null {
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

function normalizeCandles(value: unknown): ChartCandle[] {
  if (!Array.isArray(value)) return [];
  const out: ChartCandle[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const c = row as Record<string, unknown>;
    const t = normalizeUnixSec(c.t ?? c.time);
    const o = Number(c.o ?? c.open);
    const h = Number(c.h ?? c.high);
    const l = Number(c.l ?? c.low);
    const close = Number(c.c ?? c.close);
    if (t == null || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(close)) {
      continue;
    }
    if (!isMnqChartPrice(close) && !isMnqChartPrice(h) && !isMnqChartPrice(l)) continue;
    const v = Number(c.v ?? c.volume);
    out.push({
      t,
      o,
      h,
      l,
      c: close,
      ...(Number.isFinite(v) ? { v } : {}),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function normalizeDrawings(value: unknown): ChartDrawing[] {
  if (!Array.isArray(value)) return [];
  const out: ChartDrawing[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const d = row as Record<string, unknown>;
    const type = normalizeDrawingType(d.type);
    const price = Number(d.price);
    const top = Number(d.top);
    const bottom = Number(d.bottom);
    const points = normalizePoints(d.points);
    out.push({
      type,
      label: typeof d.label === "string" ? d.label.slice(0, 80) : undefined,
      ...(typeof d.source === "string" ? { source: d.source } : {}),
      ...(Number.isFinite(price) ? { price } : {}),
      ...(Number.isFinite(top) ? { top } : {}),
      ...(Number.isFinite(bottom) ? { bottom } : {}),
      ...(points.length ? { points } : {}),
    });
  }
  return out.slice(0, 50);
}

function normalizeDrawingType(value: unknown): ChartDrawing["type"] {
  const t = String(value || "other").toLowerCase();
  if (t.includes("horizontal") || t === "hline" || t === "horizontal_ray") return "horizontal_line";
  if (t.includes("rectangle") || t === "box") return "rectangle";
  if (t.includes("trend")) return "trend_line";
  if (t.includes("ray")) return "ray";
  return "other";
}

function normalizePoints(value: unknown): Array<{ t: number; p: number }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ t: number; p: number }> = [];
  for (const pt of value) {
    if (!pt || typeof pt !== "object") continue;
    const p = pt as Record<string, unknown>;
    const t = normalizeUnixSec(p.t ?? p.time);
    const price = Number(p.p ?? p.price);
    if (t == null || !Number.isFinite(price)) continue;
    out.push({ t, p: price });
  }
  return out;
}

function timeframeSec(tf?: string | null): number {
  if (!tf) return 60;
  const s = String(tf).trim().toLowerCase();
  if (/^\d+$/.test(s)) return Math.max(60, parseInt(s, 10) * 60);
  if (s === "1" || s === "1m") return 60;
  if (s === "5" || s === "5m") return 300;
  if (s === "15" || s === "15m") return 900;
  if (s === "60" || s === "1h") return 3600;
  return 60;
}

function candleHasMissingOhlc(c: ChartCandle): boolean {
  return !Number.isFinite(c.o) || !Number.isFinite(c.h) || !Number.isFinite(c.l) || !Number.isFinite(c.c);
}

/** Score export quality + timestamp sync vs visible range / live print. */
export function scoreChartQuality(
  snap: Omit<ChartSnapshotPayload, "quality" | "qualityMeta">,
  nowSec = Math.floor(Date.now() / 1000)
): ChartQualityMeta {
  const reasons: string[] = [];
  const candles = snap.candles || [];
  const candleCount = candles.length;
  const drawingCount = (snap.drawings || []).length;
  const lastBarTime = candles.length ? candles[candles.length - 1].t : snap.sync?.lastBarTime;
  const tfSec = timeframeSec(snap.timeframe);

  if (snap.source === "yahoo_fallback") reasons.push("yahoo_fallback_used");
  if (snap.source === "none" || snap.reason === "widget_not_found" || snap.reason === "timeout") {
    reasons.push("export_failed");
  }
  if (candleCount < MIN_CANDLES_FOR_STRUCTURED) reasons.push("insufficient_candles");

  let exportPartial = snap.sync?.exportPartial === true;
  let missingOhlc = 0;
  for (const c of candles) {
    if (candleHasMissingOhlc(c)) missingOhlc += 1;
  }
  if (missingOhlc > 0) {
    exportPartial = true;
    reasons.push("missing_ohlc_fields");
  }
  if (exportPartial) reasons.push("export_partial_failure");

  const drawingExportFailed = snap.sync?.drawingExportFailed === true;
  if (drawingExportFailed) reasons.push("drawing_export_failed");

  let timestampDriftSec = snap.sync?.timestampDriftSec;
  let timestampSyncOk = true;
  if (lastBarTime != null && snap.visibleRange) {
    const driftFromVisibleEnd = Math.abs(snap.visibleRange.to - lastBarTime);
    if (timestampDriftSec == null) timestampDriftSec = driftFromVisibleEnd;
    if (driftFromVisibleEnd > tfSec * 3) {
      timestampSyncOk = false;
      reasons.push("timestamp_drift");
    }
    const firstBar = candles[0]?.t;
    if (firstBar != null && firstBar > snap.visibleRange.from + tfSec * 5) {
      timestampSyncOk = false;
      reasons.push("candles_miss_visible_start");
    }
  }

  let lastBarAgeSec: number | undefined;
  if (lastBarTime != null) {
    lastBarAgeSec = Math.max(0, nowSec - lastBarTime);
    if (lastBarAgeSec > STALE_BAR_SEC) reasons.push("stale_last_bar");
  }

  let quality: ChartQuality = "good";
  if (
    candleCount < MIN_CANDLES_FOR_STRUCTURED ||
    snap.source === "none" ||
    snap.source === "yahoo_fallback" ||
    reasons.includes("export_failed")
  ) {
    quality = "missing";
  } else if (reasons.includes("stale_last_bar")) {
    quality = "stale";
  } else if (
    reasons.includes("timestamp_drift") ||
    reasons.includes("candles_miss_visible_start") ||
    reasons.includes("export_partial_failure") ||
    reasons.includes("missing_ohlc_fields") ||
    reasons.includes("drawing_export_failed")
  ) {
    quality = "degraded";
  }

  return {
    quality,
    reasons: [...new Set(reasons)],
    timestampDriftSec,
    lastBarAgeSec,
    lastBarTime,
    candleCount,
    drawingCount,
    exportPartial,
    drawingExportFailed,
    timestampSyncOk,
  };
}

export function isChartQualityUsable(meta: ChartQualityMeta | undefined): boolean {
  if (!meta) return false;
  return meta.quality === "good" || meta.quality === "degraded";
}

export function parseChartSnapshotInput(value: unknown): ChartSnapshotPayload | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const candles = normalizeCandles(raw.candles);
  const drawings = normalizeDrawings(raw.drawings);
  const lastPrice = parseOptionalPrice(raw.lastPrice);
  const source =
    raw.source === "tv_export" || raw.source === "yahoo_fallback" || raw.source === "none"
      ? raw.source
      : candles.length
        ? "tv_export"
        : "none";

  const syncRaw = raw.sync as Record<string, unknown> | undefined;
  const sync = syncRaw
    ? {
        lastBarTime: normalizeUnixSec(syncRaw.lastBarTime) ?? undefined,
        timestampDriftSec: Number.isFinite(Number(syncRaw.timestampDriftSec))
          ? Number(syncRaw.timestampDriftSec)
          : undefined,
        drawingExportFailed: syncRaw.drawingExportFailed === true,
        exportPartial: syncRaw.exportPartial === true,
      }
    : undefined;

  const base: ChartSnapshotPayload = {
    ok: raw.ok === true || candles.length >= MIN_CANDLES_FOR_STRUCTURED,
    symbol: typeof raw.symbol === "string" ? raw.symbol : undefined,
    timeframe: typeof raw.timeframe === "string" ? raw.timeframe : undefined,
    visibleRange: parseVisibleRange(raw.visibleRange),
    lastPrice,
    candles,
    drawings,
    source,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : undefined,
    sync,
  };

  const qualityMeta =
    raw.qualityMeta && typeof raw.qualityMeta === "object"
      ? (raw.qualityMeta as ChartQualityMeta)
      : scoreChartQuality(base);

  base.quality = qualityMeta.quality;
  base.qualityMeta = qualityMeta;
  base.ok = isChartQualityUsable(qualityMeta) && candles.length >= MIN_CANDLES_FOR_STRUCTURED;

  return base;
}

export function hasStructuredChartData(snap: ChartSnapshotPayload | null | undefined): boolean {
  return Boolean(
    snap?.ok &&
      snap.candles.length >= MIN_CANDLES_FOR_STRUCTURED &&
      isChartQualityUsable(snap.qualityMeta)
  );
}

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildCandleHash(candles: ChartCandle[]): string {
  if (!candles.length) return "empty";
  const first = candles[0];
  const last = candles[candles.length - 1];
  return simpleHash(`${candles.length}|${first.t}|${last.t}|${last.c.toFixed(2)}`);
}

export function extractKeyLevels(snap: ChartSnapshotPayload): string[] {
  const levels: string[] = [];
  for (const d of snap.drawings.slice(0, 12)) {
    if (d.price != null) levels.push(`${d.label || d.type}@${d.price.toFixed(1)}`);
    else if (d.top != null && d.bottom != null) {
      levels.push(`${d.label || d.type}@${d.bottom.toFixed(1)}-${d.top.toFixed(1)}`);
    }
  }
  if (snap.lastPrice != null) levels.unshift(`last@${snap.lastPrice.toFixed(2)}`);
  return levels.slice(0, 8);
}

export function buildReasoningLogInput(snap: ChartSnapshotPayload): ChartReasoningLog["input"] {
  const meta = snap.qualityMeta || scoreChartQuality(snap);
  return {
    quality: meta.quality,
    reasons: meta.reasons,
    candleCount: snap.candles.length,
    candleHash: buildCandleHash(snap.candles),
    drawingCount: snap.drawings.length,
    lastBarTime: meta.lastBarTime,
    lastPrice: snap.lastPrice,
    visibleRange: snap.visibleRange,
    timestampDriftSec: meta.timestampDriftSec,
    keyLevels: extractKeyLevels(snap),
    source: snap.source,
  };
}

export function buildReasoningLogOutput(raw: string, parsed: { verdict: string; spokenBrief: string }): ChartReasoningLog["output"] {
  const metaMatch = raw.match(/^META:\s*(.+)$/im);
  const meta = metaMatch?.[1] || "";
  const confidence = meta.match(/confidence=(\w+)/i)?.[1];
  const call = meta.match(/call=([^|]+)/i)?.[1]?.trim();
  const tradeableBias = meta.match(/tradeableBias=(\w+)/i)?.[1];
  const reasoningLine =
    parsed.verdict
      .split("\n")
      .find((l) => /^reasoning:/i.test(l.trim())) ||
    parsed.verdict
      .split("\n")
      .find((l) => /structure|displacement|fair value gap/i.test(l)) ||
    "";
  return {
    confidence,
    call,
    tradeableBias,
    reasoningSnippet: reasoningLine.trim().slice(0, 240) || parsed.spokenBrief.slice(0, 240),
    panelLineCount: parsed.verdict.split("\n").filter((l) => l.trim()).length,
  };
}

/** Format structured chart JSON for the reasoning model. */
export function formatChartSnapshotForPrompt(snap: ChartSnapshotPayload): string {
  const recent = snap.candles.slice(-80);
  const meta = snap.qualityMeta || scoreChartQuality(snap);
  const lines = [
    "=== STRUCTURED CHART DATA (primary source — analyze ONLY this + JSON market context) ===",
    `Symbol: ${snap.symbol || "unknown"} | Timeframe: ${snap.timeframe || "unknown"} | Bars: ${recent.length} | Source: ${snap.source} | Quality: ${meta.quality}`,
  ];
  if (meta.reasons.length) lines.push(`Quality notes: ${meta.reasons.join(", ")}`);
  if (snap.lastPrice != null) lines.push(`Chart last price: ${snap.lastPrice.toFixed(2)}`);
  if (snap.visibleRange) {
    lines.push(`Visible window: ${snap.visibleRange.from} – ${snap.visibleRange.to} (unix sec)`);
  }
  if (meta.lastBarTime != null) lines.push(`Last bar time: ${meta.lastBarTime} (unix sec)`);
  lines.push("Candles (oldest→newest, t=unix sec):");
  lines.push(JSON.stringify(recent));
  if (snap.drawings.length) {
    lines.push(`Drawings (${snap.drawings.length}):`);
    lines.push(JSON.stringify(snap.drawings.slice(0, 40)));
  }
  lines.push(
    "Step-by-step: (1) recent price action from candles ONLY (2) structure/displacement (3) nearest levels from JSON + drawings (4) bias (5) call with confidence. Cite ONLY prices present in candles, drawings, or JSON — never invent levels."
  );
  return lines.join("\n");
}

export function buildNoCallVerdictResult(input: {
  id?: string;
  quality?: ChartQuality;
  reasons?: string[];
  reasoningLog?: ChartReasoningLog;
}): {
  id: string;
  verdict: string;
  spokenBrief: string;
  scoped: boolean;
  structured: boolean;
  noCall: true;
  quality?: ChartQuality;
  qualityReasons?: string[];
  reasoningLog?: ChartReasoningLog;
} {
  return {
    id: input.id || crypto.randomUUID(),
    verdict: CHART_NO_CALL_MESSAGE,
    spokenBrief: CHART_NO_CALL_MESSAGE,
    scoped: false,
    structured: true,
    noCall: true,
    quality: input.quality || "missing",
    qualityReasons: input.reasons,
    reasoningLog: input.reasoningLog,
  };
}
