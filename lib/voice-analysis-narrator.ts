/**
 * Voice layer — translate structured analysis contract into natural mentor speech.
 * Decisive when setup is there; disciplined on WAIT / NO TRADE.
 */

import type { MarketAnalysisContract } from "./analysis-contract";
import { expandTradingAbbreviations } from "./plain-language";

function biasOpener(c: MarketAnalysisContract): string {
  if (c.htf_bias === "bullish") return "I'm leaning bullish here.";
  if (c.htf_bias === "bearish") return "I'm bearish here.";
  if (c.htf_bias === "neutral") return "Higher-timeframe bias is neutral.";
  return "I don't have a clear higher-timeframe lean.";
}

function liquidityClause(c: MarketAnalysisContract): string {
  const liq = c.why.liquidity.toLowerCase();
  if (liq.includes("was taken") || liq.includes("swept")) {
    return c.why.liquidity.replace(/;/g, ", and") + ".";
  }
  if (liq.includes("unknown")) return "";
  return c.why.liquidity + ".";
}

function missingConfirmationClause(c: MarketAnalysisContract): string {
  const parts: string[] = [];
  if (c.why.displacement.includes("absent")) {
    parts.push("I don't have the displacement confirmation I'd want");
  } else if (c.why.displacement.includes("unknown")) {
    parts.push("displacement is unclear");
  }
  if (c.verdict === "WAIT" && c.entry.includes("wait")) {
    parts.push("I'm waiting for the retrace into the entry zone");
  }
  if (c.setup !== "none identified" && c.verdict === "WAIT") {
    parts.push(`for your ${c.setup.replace(/ \(.*\)/, "").toLowerCase()}`);
  }
  return parts.length ? parts.join(", ") + "." : "";
}

/** Natural voice narration from contract — never more bullish/bearish than the verdict. */
export function narrateAnalysisContractForVoice(c: MarketAnalysisContract): string {
  if (c.data_quality === "INSUFFICIENT" || c.verdict === "NO_TRADE") {
    return expandTradingAbbreviations(
      c.final_reasoning ||
        "I don't have enough reliable chart data to make a call right now — no trade until that improves."
    );
  }

  if (c.verdict === "WAIT") {
    const parts = [
      biasOpener(c),
      liquidityClause(c),
      missingConfirmationClause(c) ||
        `I'm waiting rather than forcing an entry — ${c.final_reasoning.slice(0, 160)}`,
    ].filter(Boolean);
    if (c.contradictions.length) {
      parts.push(`Headwinds: ${c.contradictions.slice(0, 2).join("; ")}.`);
    }
    return expandTradingAbbreviations(parts.join(" ").replace(/\s+/g, " ").trim());
  }

  if (c.verdict === "LONG" || c.verdict === "SHORT") {
    const dir = c.verdict === "LONG" ? "long" : "short";
    const parts = [
      biasOpener(c),
      liquidityClause(c),
      c.setup !== "none identified" ? `This fits ${c.setup}.` : "",
      `I'm taking the ${dir} side provided price respects ${c.entry}.`,
      c.invalidation !== "unknown" ? `Invalidation at ${c.invalidation}.` : "",
      c.target !== "unknown" ? `Target ${c.target}.` : "",
      c.rejected_alternative ? c.rejected_alternative.split(":")[0] + "." : "",
    ].filter(Boolean);
    return expandTradingAbbreviations(parts.join(" ").replace(/\s+/g, " ").trim());
  }

  return expandTradingAbbreviations(c.final_reasoning);
}
