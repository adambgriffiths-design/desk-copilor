/**
 * Voice layer — translate structured analysis contract into natural mentor speech.
 * Narrates the decision envelope (same object as panel). Not a second brain.
 */

import type { MarketAnalysisContract } from "./analysis-contract";
import { expandTradingAbbreviations } from "./plain-language";
import { capSpokenVoice } from "./voice-speak-sync";
import {
  buildSpokenEqhEqlBrief,
  type SpokenEqhEqlPool,
} from "./voice-eqh-eql";
import { compactChainForVoice } from "./decision-envelope";
import {
  formatMentorTradeSpoken,
  unavailableDecisionText,
  waitForLine,
  resolveUserPresentationMode,
} from "./decision-contract-output";

function envelopeOpener(c: MarketAnalysisContract): string {
  const env = c.decision;
  if (!env) return "";
  return formatMentorTradeSpoken(env, { mode: resolveUserPresentationMode() });
}

function biasOpener(c: MarketAnalysisContract): string {
  if (c.decision) return "";
  if (c.htf_bias === "bullish") {
    return "MENTOR VIEW: higher-timeframe context is bullish — that is not the trade.";
  }
  if (c.htf_bias === "bearish") {
    return "MENTOR VIEW: higher-timeframe context is bearish — that is not the trade.";
  }
  if (c.htf_bias === "neutral") return "MENTOR VIEW: higher-timeframe bias is neutral.";
  return "MENTOR VIEW: I don't have a clear higher-timeframe lean.";
}

function mtfClause(c: MarketAnalysisContract): string {
  if (c.decision) return "";
  if (!c.mtf?.short) return "";
  return `Short term: ${c.mtf.short}`;
}

function liquidityClause(
  c: MarketAnalysisContract,
  eqhEqlRows?: SpokenEqhEqlPool[]
): string {
  if (eqhEqlRows?.length) {
    const spoken = buildSpokenEqhEqlBrief(eqhEqlRows);
    if (spoken) return spoken;
  }
  const liq = c.why.liquidity.toLowerCase();
  if (liq.includes("unknown")) return "";
  if (liq.split(";").length > 2) return "";
  if (liq.includes("was taken") || liq.includes("swept") || liq.includes("both sides")) {
    return c.why.liquidity.replace(/;/g, ",") + ".";
  }
  return "";
}

function missingConfirmationClause(c: MarketAnalysisContract): string {
  if (c.decision?.stance === "wait") {
    return waitForLine(c.decision);
  }
  const parts: string[] = [];
  if (c.why.displacement.includes("absent")) {
    parts.push("I don't have the displacement confirmation I'd want");
  } else if (c.why.displacement.includes("unknown")) {
    parts.push("displacement is unclear");
  }
  if (c.verdict === "WAIT" && /wait for entry/i.test(c.entry) && !/\d/.test(c.entry)) {
    parts.push(c.wait_reason || "WAIT FOR: a named trigger — not a generic entry");
  } else if (c.verdict === "WAIT" && /wait/i.test(c.entry) && /\d/.test(c.entry)) {
    parts.push(`WAIT FOR: retrace into ${c.entry}`);
  }
  if (c.setup !== "none identified" && c.verdict === "WAIT") {
    parts.push(`for your ${c.setup.replace(/ \(.*\)/, "").toLowerCase()}`);
  }
  return parts.length ? parts.join(", ") + "." : "";
}

function chainClause(c: MarketAnalysisContract): string {
  if (!c.decision) return "";
  const compact = compactChainForVoice(c.decision);
  return compact ? `Chain: ${compact}.` : "";
}

function invalidationClause(c: MarketAnalysisContract): string {
  if (c.decision?.invalidation.condition) {
    return `Invalidation: ${c.decision.invalidation.condition}`;
  }
  return "";
}

/** Natural voice narration from contract — never more bullish/bearish than the stance. */
export function narrateAnalysisContractForVoice(
  c: MarketAnalysisContract,
  opts?: { eqhEqlRows?: SpokenEqhEqlPool[] }
): string {
  if (c.data_quality === "INSUFFICIENT" || c.verdict === "NO_TRADE") {
    if (c.decision) {
      return capSpokenVoice(
        expandTradingAbbreviations(
          [envelopeOpener(c), chainClause(c), invalidationClause(c)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
        )
      );
    }
    return expandTradingAbbreviations(
      c.final_reasoning ||
        "I don't have enough reliable chart data to make a call right now — no trade until that improves."
    );
  }

  if (c.decision) {
    return capSpokenVoice(expandTradingAbbreviations(envelopeOpener(c)));
  }

  if (c.verdict === "WAIT") {
    const stay = String(c.wait_reason || c.final_reasoning || "").trim();
    if (/^stay flat/i.test(stay)) {
      return expandTradingAbbreviations(
        `MENTOR VIEW: ${stay} TRADE DECISION: FLAT — no trade justified.`
      );
    }
    const parts = [
      biasOpener(c),
      mtfClause(c),
      "TRADE DECISION: WAIT.",
      missingConfirmationClause(c) ||
        `WAIT FOR: ${c.final_reasoning.slice(0, 120)}`,
    ].filter(Boolean);
    return capSpokenVoice(expandTradingAbbreviations(parts.join(" ").replace(/\s+/g, " ").trim()));
  }

  if (c.verdict === "LONG" || c.verdict === "SHORT") {
    const dir = c.verdict === "LONG" ? "long" : "short";
    const parts = [
      biasOpener(c),
      liquidityClause(c, opts?.eqhEqlRows),
      `TRADE DECISION: ${dir} on the execution horizon provided price respects ${c.entry}.`,
    ].filter(Boolean);
    return capSpokenVoice(expandTradingAbbreviations(parts.join(" ").replace(/\s+/g, " ").trim()));
  }

  return capSpokenVoice(expandTradingAbbreviations(unavailableDecisionText()));
}
