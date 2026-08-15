/**
 * Last-turn category — routing layer only.
 * Sticky mentor intent from an earlier market read must not override a general reply.
 */

import { repairConversationalStt } from "@/lib/conversational-normalize";

export type TurnCategory = "MARKET" | "GENERAL_KNOWLEDGE" | "GENERAL_CHAT" | "UNKNOWN";

export type HistoryMsg = { role: string; content: string };

const INTERROGATIVE_OPENER =
  /^(what(?:'?s)?|who(?:'?s)?|where(?:'?s)?|when(?:'?s)?|why|how(?:'?s)?|which|tell me|explain|describe|define|can you|could you|do you know|is there|are there)\b/i;

const VERDICT_MARKERS =
  /\b(verdict|wait|no trade|long|short|stand aside|bias|entry zone|invalidation)\b/i;

function normalize(text: string): string {
  return repairConversationalStt(text)
    .toLowerCase()
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the assistant reply is a market / desk read (not general knowledge). */
export function assistantLooksLikeMarket(text: string): boolean {
  const a = String(text || "");
  if (!a.trim()) return false;
  if (/\[(structure|gaps|liquidity|session|bias|market_state)\./i.test(a)) return true;
  if (/\[[a-z0-9_.]+\]/i.test(a) && VERDICT_MARKERS.test(a)) return true;
  if (
    /\b(right now i(?:'m| am) seeing|i(?:'m| am) waiting because|what would change my mind|here(?:'s| is) what i(?:'d| would) watch)\b/i.test(
      a
    )
  ) {
    return true;
  }
  if (VERDICT_MARKERS.test(a) && /\b(VERDICT|Bias|Entry|Wait|Long|Short)\b/i.test(a)) return true;
  if (
    /\b(MSS|NWOG|NDOG|FVG|market structure shift)\b/i.test(a) &&
    /\b\d{4,5}(?:\.\d+)?\b/.test(a)
  ) {
    return true;
  }
  if (
    /\b(wait(?:ing)?|stay flat|stand aside|no trade|sweep|bias|mss|verdict|nasdaq|structure|invalidat|fair value|equal high|liquidity|right now i(?:'m| am) seeing)\b/i.test(
      a
    )
  ) {
    return true;
  }
  if (/\b(trade decision|overall stance|long rejected|short rejected)\b/i.test(a)) return true;
  return false;
}

function lastExchange(messages: HistoryMsg[]): { assistant: string; priorUser: string } {
  let assistant = "";
  let priorUser = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && !assistant) {
      assistant = msg.content || "";
    } else if (msg.role === "user" && assistant && !priorUser) {
      priorUser = msg.content || "";
      break;
    }
  }
  return { assistant, priorUser };
}

/** Infer category of the most recent completed assistant turn. */
export function inferLastTurnCategory(messages?: HistoryMsg[]): TurnCategory {
  if (!messages?.length) return "UNKNOWN";
  const { assistant, priorUser } = lastExchange(messages);
  if (!assistant) return "UNKNOWN";
  if (assistantLooksLikeMarket(assistant)) return "MARKET";

  if (priorUser) {
    const qu = normalize(priorUser);
    if (/\b(tell me a joke|say a joke|make me laugh)\b/.test(qu)) return "GENERAL_CHAT";
    if (/^(hi|hello|hey|how are you|thanks|thank you)\b/.test(qu)) return "GENERAL_CHAT";
    if (INTERROGATIVE_OPENER.test(qu)) return "GENERAL_KNOWLEDGE";
    if (/\d+\s*[x×*+/÷-]\s*\d+/.test(qu)) return "GENERAL_KNOWLEDGE";
  }

  // Non-market assistant with no market envelope — follow-ups stay general.
  return "GENERAL_KNOWLEDGE";
}

export function lastTurnWasMarketCategory(category?: TurnCategory): boolean {
  return category === "MARKET";
}

export function lastTurnWasGeneralCategory(category?: TurnCategory): boolean {
  return category === "GENERAL_KNOWLEDGE" || category === "GENERAL_CHAT";
}
