/**
 * Spoken EQH/EQL — HIGH (then unswept MEDIUM) only.
 * Does not change production reh-rel detectors.
 */

export type SpokenEqhEqlImportance = "LOW" | "MEDIUM" | "HIGH";
export type SpokenEqhEqlSide = "EQH" | "EQL";

export type SpokenEqhEqlPool = {
  price: number;
  liquidityType: SpokenEqhEqlSide;
  importance: SpokenEqhEqlImportance;
  why: string;
  lifecycle?: string;
  status?: string;
  score?: number;
  contributingSwings?: Array<{ price: number; barTime: number; prominence?: number }>;
};

export const EQH_EQL_STAY_FLAT =
  "No meaningful equal-high or equal-low pool — similar wicks aren't liquidity. Stay flat on that.";

const WHY_PREFIX = /^(HIGH|MEDIUM|LOW):\s*/i;

export function isEqhEqlLiquidityQuestion(question: string): boolean {
  const q = String(question || "").trim().toLowerCase();
  if (!q) return false;
  if (/\b(eqh|eql|equal high|equal lows?|relative equal|reh|rel)\b/.test(q)) return true;
  if (/\b(meaningful|resting|real)\b/.test(q) && /\bliquidity\b/.test(q)) return true;
  if (/\bwhere.{0,28}liquidity\b/.test(q) || /\bliquidity.{0,28}(where|pool|equal)\b/.test(q)) {
    return true;
  }
  if (/\b(similar highs|similar lows|random wick)\b/.test(q)) return true;
  return false;
}

export function eqhEqlSideFromQuestion(question: string): SpokenEqhEqlSide | undefined {
  const q = String(question || "").trim().toLowerCase();
  if (/\b(eqh|reh|equal highs?)\b/.test(q) && !/\b(eql|rel|equal lows?)\b/.test(q)) return "EQH";
  if (/\b(eql|rel|equal lows?)\b/.test(q) && !/\b(eqh|reh|equal highs?)\b/.test(q)) return "EQL";
  return undefined;
}

export function isUnsweptEqhEqlPool(pool: SpokenEqhEqlPool): boolean {
  const life = String(pool.lifecycle || "").toUpperCase();
  const status = String(pool.status || "").toLowerCase();
  if (life === "SWEPT" || life === "INVALIDATED") return false;
  if (/\bswept\b|\bclosed_through\b|\binvalid/.test(status)) return false;
  return true;
}

export function pickSpeakableEqhEqlPools(
  rows: SpokenEqhEqlPool[] | undefined,
  opts?: { side?: SpokenEqhEqlSide; max?: number }
): SpokenEqhEqlPool[] {
  const max = opts?.max ?? 1;
  const side = opts?.side;
  const list = (rows || []).filter((p) => {
    if (p.importance !== "HIGH" && p.importance !== "MEDIUM") return false;
    if (side && p.liquidityType !== side) return false;
    return isUnsweptEqhEqlPool(p);
  });
  const high = list.filter((p) => p.importance === "HIGH");
  const medium = list.filter((p) => p.importance === "MEDIUM");
  const ranked = [...high, ...medium].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return ranked.slice(0, max);
}

export function formatSwingClocks(pool: SpokenEqhEqlPool): string {
  const clocks = (pool.contributingSwings || [])
    .map((s) => formatEstClock(s.barTime))
    .filter(Boolean);
  const unique = [...new Set(clocks)];
  if (unique.length < 2) return "";
  if (unique.length === 2) return `from the ${unique[0]} and ${unique[1]} swings`;
  return `from the ${unique.slice(0, 2).join(" and ")} swings`;
}

export function shortenEqhEqlWhy(why: string, maxLen = 140): string {
  let t = String(why || "").replace(WHY_PREFIX, "").trim();
  t = t.replace(/\s+/g, " ");
  if (!t) return "";
  const clauses = t.split(/,\s+/);
  let out = clauses[0] || t;
  if (clauses[1] && (out + ", " + clauses[1]).length <= maxLen) {
    out = `${out}, ${clauses[1]}`;
  }
  if (out.length > maxLen) {
    const cut = out.slice(0, maxLen);
    const sp = cut.lastIndexOf(" ");
    out = (sp > 60 ? cut.slice(0, sp) : cut).trim();
  }
  return out.replace(/[.;]+$/, "");
}

/** One spoken idea. Never lists every REL. Stay-flat when nothing meaningful. */
export function buildSpokenEqhEqlBrief(
  rows: SpokenEqhEqlPool[] | undefined,
  opts?: { side?: SpokenEqhEqlSide; question?: string }
): string {
  const side = opts?.side ?? (opts?.question ? eqhEqlSideFromQuestion(opts.question) : undefined);
  const [pool] = pickSpeakableEqhEqlPools(rows, { side, max: 1 });
  if (!pool) return EQH_EQL_STAY_FLAT;

  const name = pool.liquidityType === "EQL" ? "equal lows" : "equal highs";
  const book = pool.liquidityType === "EQL" ? "sell-side" : "buy-side";
  const clocks = formatSwingClocks(pool);
  const why = shortenEqhEqlWhy(pool.why);
  const loc = clocks
    ? `${name} at ${pool.price.toFixed(2)} ${clocks}`
    : `${name} at ${pool.price.toFixed(2)}`;
  const whyClause = why ? ` — ${why}` : "";
  return `Meaningful ${book} liquidity is ${loc}${whyClause}. Random similar wicks don't count.`;
}

export function formatMeaningfulEqhEqlForPrompt(rows: SpokenEqhEqlPool[] | undefined): string {
  const picks = pickSpeakableEqhEqlPools(rows, { max: 3 });
  if (!picks.length) {
    return [
      "## MEANINGFUL EQH/EQL",
      "None. Do not cite random similar highs/lows as liquidity. Stay flat on that.",
    ].join("\n");
  }
  return [
    "## MEANINGFUL EQH/EQL (HIGH, then unswept MEDIUM — never LOW or random wicks)",
    ...picks.map(
      (p) =>
        `- ${p.liquidityType} ${p.price.toFixed(2)} ${p.importance}: ${shortenEqhEqlWhy(p.why, 180)}`
    ),
    "When speaking, cite at most ONE of these. Do not list every relative equal.",
  ].join("\n");
}

function formatEstClock(unixSec: number): string {
  if (!Number.isFinite(unixSec) || unixSec <= 0) return "";
  const ms = unixSec > 1e12 ? unixSec : unixSec * 1000;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}
