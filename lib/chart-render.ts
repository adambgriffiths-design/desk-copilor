import sharp from "sharp";
import type { Bar } from "./types";
import type { MarketContext } from "./types";
import { assignStaggeredLabelAlign, labelYOffsetPx, type DrawingLevel, type LabelAlign } from "./drawing-levels";

const W = 960;
const H = 540;
const PAD = { top: 48, right: 120, bottom: 36, left: 16 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function priceScale(min: number, max: number, price: number): number {
  const range = max - min || 1;
  return PAD.top + PLOT_H - ((price - min) / range) * PLOT_H;
}

type LevelLine = {
  price: number;
  color: string;
  label: string;
  dash?: string;
  labelAlign?: LabelAlign;
  labelLane?: number;
  showLabel?: boolean;
};

function applyLabelStagger(lines: LevelLine[], yMin: number, yMax: number): void {
  const stubs: DrawingLevel[] = lines.map((l, i) => ({
    id: String(i),
    label: l.label,
    price: l.price,
    color: l.color,
    dash: l.dash ?? "4 3",
    group: "structure",
  }));
  assignStaggeredLabelAlign(stubs, [], {
    priceMin: yMin,
    priceMax: yMax,
    plotHeightPx: PLOT_H,
    yOffsetPx: PAD.top,
  });
  for (let i = 0; i < lines.length; i++) {
    lines[i].labelAlign = stubs[i].labelAlign;
    lines[i].labelLane = stubs[i].labelLane;
    lines[i].showLabel = stubs[i].showLabel !== false;
  }
}

function buildLevels(ctx: MarketContext): LevelLine[] {
  const levels: LevelLine[] = [];
  const pdIds = new Set(["pdh", "pdl", "pdc", "pdeq", "ndog_top", "ndog_bot"]);
  for (const pd of ctx.htfPdArrays.levels) {
    if (!pdIds.has(pd.id)) continue;
    levels.push({
      price: pd.price,
      color: "#cbd5e1",
      label: pd.label.replace(/ \(.*\)/, ""),
      dash: pd.id === "pdc" ? "4 2" : "2 3",
    });
  }
  if (ctx.org) {
    levels.push(
      { price: ctx.org.top, color: "#22d3ee", label: "ORG top", dash: "4 3" },
      { price: ctx.org.bottom, color: "#22d3ee", label: "ORG bot", dash: "4 3" },
      { price: ctx.org.ce, color: "#e879f9", label: "ORG 50%", dash: "6 4" },
      { price: ctx.org.level25, color: "#64748b", label: "ORG 25%", dash: "2 4" }
    );
  }
  if (ctx.nwog) {
    levels.push(
      { price: ctx.nwog.top, color: "#ef4444", label: "NWOG top", dash: "4 3" },
      { price: ctx.nwog.bottom, color: "#ef4444", label: "NWOG bot", dash: "4 3" }
    );
  }
  levels.push(
    { price: ctx.daily.equilibrium, color: "#a78bfa", label: "D EQ", dash: "2 3" },
    { price: ctx.sessions.nyPreHigh, color: "#94a3b8", label: "NY pre H", dash: "2 3" },
    { price: ctx.sessions.nyPreLow, color: "#94a3b8", label: "NY pre L", dash: "2 3" }
  );
  return levels;
}

function buildSvg(bars: Bar[], ctx: MarketContext, chartTimeEst: string): string {
  const recent = bars.slice(-60);
  if (recent.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0f172a"/><text x="24" y="48" fill="#94a3b8" font-family="monospace" font-size="16">No bars</text></svg>`;
  }

  const levelLines = buildLevels(ctx);
  const allPrices = [
    ...recent.flatMap((b) => [b.high, b.low]),
    ...levelLines.map((l) => l.price),
  ];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const pad = (maxP - minP) * 0.06 || 5;
  const yMin = minP - pad;
  const yMax = maxP + pad;

  const visibleLevels = levelLines.filter((l) => l.price >= yMin && l.price <= yMax && l.showLabel !== false);
  applyLabelStagger(visibleLevels, yMin, yMax);

  const tagEntries: Array<{ y: number; text: string; color: string }> = [];
  const addTag = (line: LevelLine, lineY: number) => {
    if (line.showLabel === false) return;
    const align = line.labelAlign === "bottom" ? "bottom" : "top";
    const lane = line.labelLane ?? 0;
    tagEntries.push({
      y: labelYOffsetPx(lineY, align, lane),
      text: `${line.label} ${line.price.toFixed(1)}`,
      color: line.color,
    });
  };

  const slot = PLOT_W / recent.length;
  const bodyW = Math.max(2, slot * 0.55);

  const candles = recent
    .map((b, i) => {
      const x = PAD.left + i * slot + slot / 2;
      const yO = priceScale(yMin, yMax, b.open);
      const yC = priceScale(yMin, yMax, b.close);
      const yH = priceScale(yMin, yMax, b.high);
      const yL = priceScale(yMin, yMax, b.low);
      const bull = b.close >= b.open;
      const color = bull ? "#22c55e" : "#ef4444";
      const top = Math.min(yO, yC);
      const h = Math.max(1, Math.abs(yC - yO));
      return `<line x1="${x}" y1="${yH}" x2="${x}" y2="${yL}" stroke="${color}" stroke-width="1"/>
<rect x="${x - bodyW / 2}" y="${top}" width="${bodyW}" height="${h}" fill="${color}"/>`;
    })
    .join("\n");

  const hLines = visibleLevels
    .map((l) => {
      const y = priceScale(yMin, yMax, l.price);
      addTag(l, y);
      return `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="${l.color}" stroke-width="1" stroke-dasharray="${l.dash ?? "4 3"}" opacity="0.85"/>`;
    })
    .join("\n");

  tagEntries.sort((a, b) => a.y - b.y);

  const priceTags = tagEntries
    .map(
      (t) =>
        `<text x="${W - PAD.right + 6}" y="${t.y}" fill="${t.color}" font-family="monospace" font-size="11">${esc(t.text)}</text>`
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="100%" height="100%" fill="#0f172a"/>
<text x="${PAD.left}" y="28" fill="#e2e8f0" font-family="monospace" font-size="18" font-weight="bold">MNQ 1m — ${esc(chartTimeEst)} EST</text>
<text x="${PAD.left}" y="44" fill="#64748b" font-family="monospace" font-size="12">1m execution only · HTF PD arrays in JSON · cyan=ORG · fuchsia=CE · red=NWOG</text>
<rect x="${PAD.left}" y="${PAD.top}" width="${PLOT_W}" height="${PLOT_H}" fill="#1e293b" stroke="#334155"/>
${hLines}
${priceTags}
${candles}
</svg>`;
}

export async function renderM1ChartPng(input: {
  bars: Bar[];
  ctx: MarketContext;
  chartTimeEst: string;
  barCount?: number;
}): Promise<{ base64: string; mimeType: "image/png" }> {
  const bars = input.barCount ? input.bars.slice(-input.barCount) : input.bars.slice(-60);
  const svg = buildSvg(bars, input.ctx, input.chartTimeEst);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return { base64: png.toString("base64"), mimeType: "image/png" };
}
