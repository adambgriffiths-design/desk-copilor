/**
 * Teaching mode — ICT concepts without live chart claims.
 */
import { ICT_STAT_RULES } from "./ict-knowledge";

export type TeachingAnswer = {
  concept: string;
  definition: string;
  source_note: string;
  mode: "teaching";
};

const CONCEPT_DEFS: Record<string, TeachingAnswer> = {
  mss: {
    concept: "MSS (market structure shift)",
    definition:
      "A market structure shift is when price closes a candle body beyond a prior swing point — bullish MSS closes above a swing high; bearish MSS closes below a swing low. ICT uses MSS (not CHoCH) as the execution-timeframe structure break that confirms a directional shift.",
    source_note: "Desk playbook — ICT execution model",
    mode: "teaching",
  },
  nwog: {
    concept: "NWOG (new week opening gap)",
    definition:
      "The gap between the prior week's settlement close and the current week's open. Often drawn as horizontal levels on the chart. Used as a higher-timeframe premium/discount array and liquidity reference.",
    source_note: "Desk playbook — HTF PD arrays",
    mode: "teaching",
  },
  ndog: {
    concept: "NDOG (new day opening gap)",
    definition:
      "The gap between the prior day's close and the current day's open. Part of the daily PD array framework — premium/discount vs NDOG helps frame directional draw toward PDH, PDL, or gap fill.",
    source_note: "Desk playbook — HTF PD arrays",
    mode: "teaching",
  },
  fvg: {
    concept: "FVG (fair value gap)",
    definition:
      "A three-candle imbalance where the middle candle leaves a gap between the wicks of the first and third candles. Bullish FVG acts as support on retrace; bearish FVG acts as resistance. On the 1m chart, FVGs scaffold execution entries after displacement.",
    source_note: "Desk playbook — 1m execution",
    mode: "teaching",
  },
  org: {
    concept: "ORG (opening range gap)",
    definition:
      "The gap at the 9:30 New York open between the prior RTH settlement and the opening print. Subdivided into quadrants — 25%, 50% (consequent encroachment / CE), 75%, and full gap closure. The first 30 minutes after the bell often attempt half gap when an ORG exists.",
    source_note: "ICT sourced — opening range gaps",
    mode: "teaching",
  },
  ce: {
    concept: "CE (consequent encroachment)",
    definition:
      "The 50% level of an opening range gap — the midpoint between ORG top and bottom. A primary reaction level during the 9:31–10:00 window when an ORG is present.",
    source_note: "ICT sourced — ORG quadrants",
    mode: "teaching",
  },
  liquidity: {
    concept: "Liquidity",
    definition:
      "Resting orders above equal highs (buy-side liquidity) or below equal lows (sell-side liquidity). ICT looks for sweeps through PDH, PDL, session highs/lows, and equal pools before a directional move. Sweeping a high takes buy-side liquidity and is not itself a bullish signal; sweeping a low takes sell-side liquidity and is not itself a bearish signal.",
    source_note: "Desk playbook — liquidity model",
    mode: "teaching",
  },
  displacement: {
    concept: "Displacement",
    definition:
      "An impulsive, one-sided move with expanded candle bodies — evidence of institutional delivery after a liquidity sweep. Displacement often leaves a fair value gap that becomes the entry retrace zone.",
    source_note: "Desk playbook — 1m execution",
    mode: "teaching",
  },
  pdh: {
    concept: "PDH / PDL / PDC",
    definition:
      "Previous day high, low, and close — core daily PD arrays. They set the primary directional framework: frame higher toward PDH when bullish, lower toward PDL when bearish, with PDC as equilibrium reference.",
    source_note: "Desk playbook — HTF PD arrays",
    mode: "teaching",
  },
  fpfvg: {
    concept: "First presented FVG",
    definition:
      "On the 1m chart, the first qualifying fair value gap after displacement at a session open — distinct from the most recent gap or daily FVG. Applied at Asia, London, NY AM (9:30), and NY PM opens.",
    source_note: "Desk session model — user-verified extension",
    mode: "teaching",
  },
};

const ALIASES: Record<string, string> = {
  "market structure shift": "mss",
  "structure shift": "mss",
  "new week opening gap": "nwog",
  "new day opening gap": "ndog",
  "fair value gap": "fvg",
  "opening range gap": "org",
  "opening range": "org",
  "consequent encroachment": "ce",
  "first presented fvg": "fpfvg",
  "first presented fair value gap": "fpfvg",
  "liquidity sweep": "liquidity",
  "order block": "fvg",
};

export function detectTeachingConcept(question: string): string | null {
  const q = question.trim().toLowerCase();
  if (!q) return null;

  const teachingCue =
    /\b(what is|what are|what's|what does|explain|define|tell me about|how does)\b/.test(q) &&
    !/\b(our|the|current|right now|today|this chart|on chart|where|price at)\b/.test(q);

  const liveCue = /\b(where|what level|what price|current|right now|on chart|our)\b/.test(q);
  if (liveCue && !/\b(what is|what are|define|explain)\b/.test(q)) return null;

  for (const [alias, key] of Object.entries(ALIASES)) {
    if (q.includes(alias)) {
      if (teachingCue || /\b(mean|work|stand for)\b/.test(q)) return key;
    }
  }

  for (const key of Object.keys(CONCEPT_DEFS)) {
    if (new RegExp(`\\b${key}\\b`).test(q)) {
      if (teachingCue || /\b(mean|work|stand for)\b/.test(q)) return key;
    }
  }

  if (/\bfpfvg\b/.test(q) && teachingCue) return "fpfvg";

  return null;
}

export function teachConcept(conceptKey: string): TeachingAnswer | null {
  const key = ALIASES[conceptKey.toLowerCase()] || conceptKey.toLowerCase();
  const base = CONCEPT_DEFS[key];
  if (!base) return null;

  const related = ICT_STAT_RULES.filter((r) =>
    r.concept.toLowerCase().includes(base.concept.split(" ")[0].toLowerCase())
  );
  const extra =
    related.length > 0
      ? ` Related ICT rule: ${related[0].rule.slice(0, 120)}…`
      : "";

  return {
    ...base,
    definition: base.definition + extra,
  };
}

export function formatTeachingSpoken(t: TeachingAnswer): string {
  return `${t.concept}: ${t.definition}`;
}
