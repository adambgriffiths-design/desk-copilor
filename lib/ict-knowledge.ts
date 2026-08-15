import type { SessionId } from "@/lib/sessions";
import { getEstMinutes } from "@/lib/market-data";

export type IctConfidence = "ict_stated" | "inferred" | "user_verified";

export type IctStatRule = {
  id: string;
  concept: string;
  rule: string;
  stat?: string;
  timeWindow?: string;
  source: { videoId: string; title: string; timestampSec?: number };
  confidence: IctConfidence;
};

/** Sourced ICT rules approved for desk-copilot prompts (Aug 2026). */
export const ICT_STAT_RULES: IctStatRule[] = [
  {
    id: "org-half-gap-70pct",
    concept: "ORG / CE",
    rule:
      "When an opening range gap exists at the 9:30 bell, anticipate an attempt toward half gap (50% ORG / consequent encroachment) in the first 30 minutes — not necessarily full gap closure.",
    stat: "~70%",
    timeWindow: "9:31–10:00 ET",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 370,
    },
    confidence: "ict_stated",
  },
  {
    id: "opening-range-30m",
    concept: "Opening range",
    rule:
      "Opening range = first 30 minutes after the New York 9:30 bell (9:30–10:00). Not a 15-minute ORB — ICT treats this as algorithmic.",
    timeWindow: "9:30–10:00 ET",
    source: {
      videoId: "uwFJ0t7SAOU",
      title: "ICT Gems — Opening Range Gaps",
      timestampSec: 104,
    },
    confidence: "ict_stated",
  },
  {
    id: "org-quadrants",
    concept: "ORG",
    rule:
      "Opening range gap subdivided into quadrants: 25%, 50% (consequent encroachment), 75%, and settlement anchor. CE is the primary reaction level.",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 454,
    },
    confidence: "ict_stated",
  },
  {
    id: "org-settlement-note",
    concept: "ORG",
    rule:
      "ICT sometimes cites prior RTH settlement at 4:14 PM ET on RTH charts; desk levels use 4:15 PM close — treat as equivalent settlement anchor unless chart is RTH-only.",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 189,
    },
    confidence: "ict_stated",
  },
  {
    id: "premium-gap-short-lean",
    concept: "ORG / bias",
    rule:
      "Premium gap at open (above prior RTH settlement) → lean short in the first 30 minutes with half gap (CE) as a primary draw.",
    timeWindow: "9:30–10:00 ET",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 3321,
    },
    confidence: "ict_stated",
  },
  {
    id: "discount-gap-willingness",
    concept: "ORG / bias",
    rule:
      "Gap down at open: in the first 30 minutes, measure willingness to reprice back toward prior session close. No willingness → extremely bearish; shift to deeper discount objectives on higher timeframes.",
    timeWindow: "9:30–10:00 ET",
    source: {
      videoId: "uwFJ0t7SAOU",
      title: "ICT Gems — Opening Range Gaps",
      timestampSec: 117,
    },
    confidence: "ict_stated",
  },
  {
    id: "gap-target-ladder",
    concept: "ORG",
    rule:
      "After half-gap attempt, best-case gap-fill ladder: 75% (three-quarter gap) → full gap closure toward prior settlement.",
    timeWindow: "9:30–10:00 ET",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 3327,
    },
    confidence: "inferred",
  },
  {
    id: "first-30m-morning-tone",
    concept: "Opening range",
    rule:
      "The first 30 minutes after 9:30 highly sets the rhyme and reason for the entire NY morning session.",
    timeWindow: "9:30–10:00 ET",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 3481,
    },
    confidence: "ict_stated",
  },
  {
    id: "open-bell-patience",
    concept: "Opening range",
    rule: "Give the opening bell the first couple of minutes before judging retrace behavior.",
    timeWindow: "9:30–9:35 ET",
    source: {
      videoId: "uwFJ0t7SAOU",
      title: "ICT Gems — Opening Range Gaps",
      timestampSec: 220,
    },
    confidence: "ict_stated",
  },
  {
    id: "fhdr-vs-opening-range",
    concept: "First hour dealing range",
    rule:
      "First hour dealing range (9:30–10:30 high/low) is NOT the 30-minute opening range (9:30–10:00). Lock FHDR at 10:30; use separately for continuation entries.",
    timeWindow: "9:30–10:30 ET",
    source: {
      videoId: "6DuByzKLDsc",
      title: "ICT 1st Hour Dealing Range",
      timestampSec: 2631,
    },
    confidence: "ict_stated",
  },
  {
    id: "premarket-range",
    concept: "Pre-market range",
    rule:
      "Pre-market range windows (7:00–7:30, 8:00–8:30, or 9:00–9:30 NY) are NOT the opening range. Mark REL equal highs/lows and inefficiencies before the bell.",
    source: {
      videoId: "2K1IcVvq9z8",
      title: "ICT Gems — Pre-Market Range",
      timestampSec: 1538,
    },
    confidence: "ict_stated",
  },
  {
    id: "fpfvg-ny-opening",
    concept: "First presented FVG",
    rule:
      "On the 1m chart, after the 9:30 NY bell, wait for the first presented fair value gap inside the opening range (9:30–10:00). If price shares ranges with no 1m FVG forming, wait until 10:00 before forcing a read.",
    timeWindow: "9:30–10:00 ET",
    source: {
      videoId: "eft9_3ekDCY",
      title: "ICT 2026 Entries & Drills Part 2",
      timestampSec: 632,
    },
    confidence: "ict_stated",
  },
  {
    id: "fpfvg-post-fhdr",
    concept: "First presented FVG",
    rule:
      "On the 1m chart, on a trending day, after the first hour dealing range (9:30–10:30) is broken (body close outside, not wick only), the first presented 1m fair value gap beyond that break is the primary retrace entry.",
    timeWindow: "after 10:30 ET break",
    source: {
      videoId: "6DuByzKLDsc",
      title: "ICT 1st Hour Dealing Range",
      timestampSec: 4205,
    },
    confidence: "ict_stated",
  },
  {
    id: "fpfvg-qualification",
    concept: "First presented FVG",
    rule:
      "First presented FVG on the 1m chart: middle candle of the three-candle gap should not be the 9:30 bar (earliest 9:31). Post-FHDR variant: entire 1m gap should sit beyond the broken FHDR boundary with displacement.",
    source: {
      videoId: "-DMKLrUJvfg",
      title: "ICT First Presented FVG Model",
    },
    confidence: "inferred",
  },
  {
    id: "fvg-polarity-entry",
    concept: "Fair value gap / IFVG",
    rule:
      "Never anchor potential sell on an unfilled bullish fair value gap (support) unless it has inverted (body close below gap — inverse fair value gap acts as resistance). Mirror: never anchor potential buy on an unfilled bearish fair value gap unless inverted (body close above gap — now support).",
    source: {
      videoId: "user-approved",
      title: "Desk copilot trader rule (Aug 2026)",
    },
    confidence: "user_verified",
  },
  {
    id: "london-asia-high-bsl-raid",
    concept: "Session liquidity / London",
    rule:
      "Taking Asia session high during London is a raid on buy-side liquidity, not a bullish continuation. Typical ICT: London takes ASH, then look for displacement / continuation lower, or stay flat until 1m structure confirms. Do not flip bullish because a high was taken or price is above Asia. Do not auto-force a short from the raid alone.",
    timeWindow: "London (2–5am ET)",
    source: {
      videoId: "user-approved",
      title: "Desk copilot trader rule (Aug 2026) — London ASH raid",
    },
    confidence: "user_verified",
  },
  {
    id: "fpfvg-per-session",
    concept: "First presented FVG",
    rule:
      "On the 1m chart, apply first presented FVG logic at each session open: Asia (~8 PM ET), London (~3 AM), NY AM (9:30), NY PM (~1:30) — first qualifying 1m FVG in the first ~30 minutes after displacement at that session open.",
    source: {
      videoId: "user-approved",
      title: "Desk copilot session model (trader extension)",
    },
    confidence: "user_verified",
  },
];

const CONFIDENCE_LABEL: Record<IctConfidence, string> = {
  ict_stated: "ICT stated",
  inferred: "inferred",
  user_verified: "user-verified extension",
};

export type IctKnowledgePromptOptions = {
  sessionId?: SessionId;
  includeUserVerified?: boolean;
};

/** Compact ICT knowledge block for system prompts. */
export function formatIctKnowledgeForPrompt(
  options: IctKnowledgePromptOptions = {}
): string {
  const { sessionId, includeUserVerified = true } = options;
  const rules = ICT_STAT_RULES.filter(
    (r) => includeUserVerified || r.confidence !== "user_verified"
  );

  const lines = rules.map((r) => {
    const parts = [`- **[${r.concept}]** ${r.rule}`];
    if (r.stat) parts.push(`Stat: ${r.stat}`);
    if (r.timeWindow) parts.push(`Window: ${r.timeWindow}`);
    parts.push(`(${CONFIDENCE_LABEL[r.confidence]})`);
    return parts.join(" — ");
  });

  const sessionNote =
    sessionId === "ny_am"
      ? "\n\n**Active NY AM session:** prioritize ORG CE window 9:31–10:00 and first presented 1m FVG 9:30–10:00 rules."
      : sessionId === "london"
        ? "\n\n**Active London session:** taking Asia high is a buy-side liquidity raid — not a bullish continuation. Stay flat or wait for displacement lower."
        : "";

  return `## ICT STATED PROBABILITIES & SESSION RULES (sourced — apply in context; do not recite verbatim)

${lines.join("\n")}

**First presented FVG priority:** all first presented FVG variants are identified on the 1m chart — prefer first presented 1m FVG after session open over generic "most recent" 1m FVG when entry scaffolding. NY 9:30–10:00 model and post-FHDR model are distinct — label which applies.${sessionNote}`;
}

/** Time-sensitive hint strings for live market context. */
export function ictSessionHints(now: Date, sessionId: SessionId): string[] {
  const m = getEstMinutes(now);
  const hints: string[] = [];

  if (sessionId === "ny_am") {
    if (m >= 9 * 60 + 30 && m < 10 * 60) {
      hints.push(
        "ORG CE window active (9:31–10:00): ~70% attempt toward half gap when ORG exists.",
        "First presented FVG window (9:30–10:00): wait for first 1m FVG; if chop/no FVG, wait until 10:00.",
        "Opening range = 30 min (9:30–10:00), not 15-min ORB."
      );
    } else if (m >= 10 * 60 && m < 10 * 60 + 30) {
      hints.push(
        "First hour dealing range forming (9:30–10:30) — distinct from 30-min opening range; lock at 10:30.",
        "Post-FHDR first presented 1m FVG applies after body close breaks FHDR."
      );
    }
  }

  if (sessionId === "ny_pre" && m >= 9 * 60 && m < 9 * 60 + 30) {
    hints.push("Pre-market range 9:00–9:30 — not opening range; mark REL highs/lows before bell.");
  }

  if (sessionId === "london") {
    hints.push(
      "London taking Asia session high is a buy-side liquidity raid — not a bullish continuation. Stay flat or wait for displacement lower; do not recommend longs because ASH was swept or price is above Asia."
    );
    if (m >= 3 * 60 && m < 3 * 60 + 30) {
      hints.push("London open: first presented 1m FVG in first ~30 min after displacement (user-verified extension).");
    }
  }

  if (sessionId === "asia" && (m >= 20 * 60 || m < 30)) {
    hints.push("Asia kill zone open: first presented 1m FVG in first ~30 min after displacement (user-verified extension).");
  }

  if (sessionId === "ny_pm" && m >= 13 * 60 + 30 && m < 14 * 60) {
    hints.push("NY PM open: first presented 1m FVG in first ~30 min after displacement (user-verified extension).");
  }

  return hints;
}

/** Formatted block for live verdict market context JSON. */
export function formatSessionIctHints(sessionId: SessionId, now: Date): string {
  const hints = ictSessionHints(now, sessionId);
  if (!hints.length) return "";
  return `ICT session hints:\n${hints.map((h) => `- ${h}`).join("\n")}`;
}

/** Full block for SYSTEM_PROMPT (all rules, no session filter). */
export function formatIctKnowledgeBlock(): string {
  return formatIctKnowledgeForPrompt();
}
