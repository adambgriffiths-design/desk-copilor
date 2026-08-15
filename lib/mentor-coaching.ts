/**
 * Grounded mentor coaching from current market intelligence.
 * Conversational layer only — no new detectors, no order placement.
 */
import type { DeskMarketIntelligence } from "./market-intelligence";
import { findFact } from "./observation-facts";
import { formatObservationNarrative } from "./observation-engine";
import { expandTradingAbbreviations } from "./plain-language";
import { buildTradingDecision } from "./decision-layer";
import { buildDecisionEnvelope, compactChainForVoice } from "./decision-envelope";
import {
  explainBullishEvidenceWithoutConverting,
  formatMentorTradeSpoken,
  formatStructuredInvalidationFollowUp,
  formatStructuredWaitFollowUp,
  formatWhyNotDirectionFollowUp,
  htfBiasMentorLine,
  resolveUserPresentationMode,
  waitForLine,
  type WaitFollowUpContext,
} from "./decision-contract-output";
import { getRunningState } from "./running-state";
import {
  EQH_EQL_STAY_FLAT,
  formatSwingClocks,
  pickSpeakableEqhEqlPools,
  type SpokenEqhEqlPool,
} from "./voice-eqh-eql";
import type { EqhEqlTrackRow } from "./research/eqh-eql-liquidity";
import { detectTeachingConcept, formatTeachingSpoken, teachConcept } from "./ict-teaching";
import {
  classifyMentorIntent,
  hasPriorMarketRead,
  isInvalidationStatusQuestion,
  isMentorMarketIntent,
  parseWhyNotDirection,
  type MentorIntent,
  type MentorIntentContext,
} from "./mentor-intent";

export type MentorCoachAnswer = {
  spoken: string;
  intent: MentorIntent;
  last_fact_ids: string[];
  confidence: "high" | "medium" | "low" | "unknown";
  mode: "analysis" | "teaching";
  panel: string;
};

type CoachConversationCtx = {
  lastAssistant?: string;
  lastFactIds?: string[];
  lastTopic?: string;
};

function userPresentOpts() {
  return { mode: resolveUserPresentationMode() } as const;
}

function confidenceFromQuality(
  intel: DeskMarketIntelligence
): MentorCoachAnswer["confidence"] {
  const q = intel.observation.data_quality;
  if (q === "missing" || q === "stale") return "unknown";
  if (q === "degraded") return "medium";
  return "high";
}

function stripEvidenceKeys(text: string): string {
  return String(text || "")
    .replace(/\s*\([a-z0-9_.]+=[^)]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(text: string): string {
  const t = stripEvidenceKeys(text).replace(/\s+/g, " ").trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function joinSpeakable(parts: string[], max = 6): string {
  const out: string[] = [];
  for (const p of parts) {
    const s = sentence(p);
    if (!s) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  return expandTradingAbbreviations(out.join(" "));
}

function dataUnusable(intel: DeskMarketIntelligence): boolean {
  const q = intel.observation.data_quality;
  return q === "missing" || q === "stale";
}

function blockOnDataQuality(
  intel: DeskMarketIntelligence,
  kind: string,
  allowStaleForFollowUp: boolean
): string | null {
  if (!dataUnusable(intel) || allowStaleForFollowUp) return null;
  return staleReply(intel, kind);
}

function staleReply(intel: DeskMarketIntelligence, kind: string): string {
  const q = intel.observation.data_quality;
  if (q === "missing") {
    return `I don't have a reliable live ${kind} right now — market data is unavailable, so I won't guess.`;
  }
  return `I don't have a reliable live ${kind} right now — the feed looks stale, so I won't guess the structure.`;
}

function priceLine(intel: DeskMarketIntelligence): string {
  const price = findFact(intel.facts, "market_state.last_price");
  if (!price || price.status === "unknown") return "";
  return `Last print ${price.value}`;
}

function sessionLine(intel: DeskMarketIntelligence): string {
  const session = findFact(intel.facts, "session.active");
  if (!session || session.status === "unknown") return "";
  return `${session.value}`;
}

function mssLine(intel: DeskMarketIntelligence): string {
  const mss = findFact(intel.facts, "structure.mss");
  if (!mss || mss.status === "absent") return "No confirmed market structure shift in the lookback";
  if (mss.status === "unknown") return "Market structure shift is unknown on this data";
  if (mss.status === "invalidated") return `Prior market structure shift (${mss.value}) is invalidated`;
  return `Market structure shift is ${mss.value}`;
}

function biasLine(intel: DeskMarketIntelligence): string {
  const env = envelopeFromIntel(intel);
  return `Higher-timeframe bias is ${htfBiasMentorLine(env)}`;
}

function toSpokenPool(row: EqhEqlTrackRow): SpokenEqhEqlPool {
  return {
    price: row.price,
    liquidityType: row.kind === "eql" ? "EQL" : "EQH",
    importance: (row.importance as SpokenEqhEqlPool["importance"]) || "MEDIUM",
    why: row.why || "",
    lifecycle: row.lifecycle,
    status: row.status,
    score: row.score,
    contributingSwings: row.contributingSwings,
  };
}

function pickEqhRow(
  intel: DeskMarketIntelligence,
  question: string,
  ctx?: MentorIntentContext
): EqhEqlTrackRow | undefined {
  const rows = intel.eqhEqlRows || [];
  if (!rows.length) return undefined;
  const blob = `${question} ${ctx?.lastAssistant || ""}`;
  const prices = [...blob.matchAll(/(\d{4,6}(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
  const eqh = rows.filter((r) => r.kind === "eqh" || r.liquidityType === "EQH");
  const pool = eqh.length ? eqh : rows;
  if (prices.length) {
    let best: EqhEqlTrackRow | undefined;
    let bestDist = Infinity;
    for (const p of prices) {
      for (const r of pool) {
        const d = Math.abs(r.price - p);
        if (d < 20 && d < bestDist) {
          best = r;
          bestDist = d;
        }
      }
    }
    if (best) return best;
  }
  const spoken = pickSpeakableEqhEqlPools(rows.map(toSpokenPool), {
    side: /\beql\b|\bequal lows?\b/.test(question.toLowerCase()) ? "EQL" : "EQH",
    max: 1,
  });
  if (spoken[0]) {
    return (
      rows.find(
        (r) => Math.abs(r.price - spoken[0].price) < 0.3 && (r.kind === "eqh" || r.kind === "eql")
      ) || rows.find((r) => Math.abs(r.price - spoken[0].price) < 0.3)
    );
  }
  return pool.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
}

function wrap(
  intel: DeskMarketIntelligence,
  spoken: string,
  intent: MentorIntent,
  factIds: string[]
): MentorCoachAnswer {
  const line = expandTradingAbbreviations(spoken);
  return {
    mode: "analysis",
    spoken: line,
    panel: line,
    last_fact_ids: factIds,
    confidence: confidenceFromQuality(intel),
    intent,
  };
}

function currentDecision(intel: DeskMarketIntelligence) {
  return buildTradingDecision(intel.observation, intel.interpretation, intel.ctx);
}

function envelopeFromIntel(intel: DeskMarketIntelligence) {
  const decision = currentDecision(intel);
  return buildDecisionEnvelope(
    {
      observation: intel.observation,
      interpretation: intel.interpretation,
      decision,
    },
    intel.ctx,
    intel.state
  );
}

function speakEnvelope(intel: DeskMarketIntelligence, lead?: string): string {
  const env = envelopeFromIntel(intel);
  const spoken = formatMentorTradeSpoken(env, userPresentOpts());
  const chain = compactChainForVoice(env);
  return joinSpeakable(
    [lead || "", spoken, chain ? `Chain: ${chain}` : "", waitForLine(env)],
    10
  );
}

function answerCurrentRead(intel: DeskMarketIntelligence): string {
  if (dataUnusable(intel)) return staleReply(intel, "read");
  const loc = [sessionLine(intel), priceLine(intel)].filter(Boolean).join(", ");
  return speakEnvelope(
    intel,
    loc ? `Right now I'm seeing ${loc}` : "Right now I'm seeing the current Nasdaq futures state"
  );
}

function answerChange(intel: DeskMarketIntelligence, lastAssistant?: string): string {
  if (dataUnusable(intel)) return staleReply(intel, "change comparison");
  const running = getRunningState();
  const decision = currentDecision(intel);
  const env = envelopeFromIntel(intel);
  const decisionLine = formatMentorTradeSpoken(env, userPresentOpts());
  if (running.last_market_state_hash && running.last_market_state_hash === intel.state_hash) {
    return joinSpeakable(
      [
        "Nothing material changed since the last check — same state hash",
        mssLine(intel),
        biasLine(intel),
        decisionLine,
      ],
      6
    );
  }
  if (running.last_verdict) {
    const prev = running.last_verdict.verdict.replace("_", " ");
    const now =
      decision.verdict === "WAIT" || decision.verdict === "NO_TRADE"
        ? "wait"
        : "trade";
    const moved = prev !== now;
    return joinSpeakable(
      [
        moved
          ? `Since last check, the call moved ${prev} → ${now}`
          : `Since last check, the call is still ${now}`,
        running.last_verdict.reason
          ? `Last reason was ${stripEvidenceKeys(running.last_verdict.reason).slice(0, 140)}`
          : mssLine(intel),
        mssLine(intel),
        biasLine(intel),
        env.conflictResolution.sentence,
        decisionLine,
      ],
      8
    );
  }
  const prior = String(lastAssistant || "");
  if (!prior || prior.length < 12) {
    return joinSpeakable(
      [
        "I don't have a previous read to compare yet — this is the first check I can use",
        answerCurrentRead(intel).replace(/^Right now I'm seeing/, "Right now I'm seeing"),
      ],
      5
    );
  }
  const priorWait = /\bwait|stand aside|stay flat\b/i.test(prior);
  const nowWait = decision.verdict === "WAIT" || decision.verdict === "NO_TRADE";
  const parts: string[] = [];
  if (priorWait && nowWait) {
    parts.push("Versus the last read, I'm still waiting — the block hasn't cleared");
  } else if (priorWait && !nowWait) {
    parts.push(`Versus the last read, I'm no longer waiting — TRADE DECISION is ${env.stance} on the ${env.primaryHorizon.timeframe}`);
  } else if (!priorWait && nowWait) {
    parts.push("Versus the last read, I pulled back to waiting — evidence no longer supports a directional call");
  } else {
    parts.push("Versus the last read, the live state shifted enough to restate the structure");
  }
  parts.push(mssLine(intel));
  parts.push(biasLine(intel));
  parts.push(env.conflictResolution.sentence);
  parts.push(decisionLine);
  return joinSpeakable(parts, 8);
}

function answerWatchNext(intel: DeskMarketIntelligence): string {
  if (dataUnusable(intel)) return staleReply(intel, "watch list");
  const decision = currentDecision(intel);
  const parts: string[] = ["Here's what I'd watch next"];
  const mss = findFact(intel.facts, "structure.mss");
  if (mss && mss.status === "active" && mss.price != null) {
    parts.push(`Whether ${mss.value} holds around ${mss.price.toFixed(2)}`);
  } else {
    parts.push("A confirmed market structure shift after displacement — we don't have that yet");
  }
  const [pool] = pickSpeakableEqhEqlPools(intel.eqhEqlRows?.map(toSpokenPool), { max: 1 });
  if (pool) {
    const name = pool.liquidityType === "EQL" ? "equal lows" : "equal highs";
    parts.push(`The meaningful ${name} at ${pool.price.toFixed(2)} — if that pool is swept, the liquidity story changes`);
  } else {
    parts.push("There's no meaningful equal-high or equal-low pool to treat as liquidity");
  }
  if (decision.invalidation != null) {
    parts.push(`Invalidation for the current idea is ${decision.invalidation.toFixed(2)}`);
  } else {
    parts.push("I need a structure break plus displacement before a directional invalidation level is real");
  }
  const fvg = findFact(intel.facts, "structure.fvg");
  if (fvg && fvg.status === "active") {
    parts.push(`Also whether the active fair value gap at ${fvg.value} holds as the retrace`);
  }
  return joinSpeakable(parts, 5);
}

function answerInvalidation(intel: DeskMarketIntelligence, allowStale = false): string {
  const blocked = blockOnDataQuality(intel, "invalidation", allowStale);
  if (blocked) return blocked;
  const env = envelopeFromIntel(intel);
  return formatStructuredInvalidationFollowUp(env, userPresentOpts());
}

function answerEqh(intel: DeskMarketIntelligence, question: string, ctx?: MentorIntentContext): string {
  if (dataUnusable(intel)) return staleReply(intel, "equal-high read");
  const row = pickEqhRow(intel, question, ctx);
  if (!row) {
    return joinSpeakable(
      [
        EQH_EQL_STAY_FLAT,
        "I won't invent an equal high just because two wicks look close",
        "If you mean a specific swing, name the price and I'll ground it",
      ],
      4
    );
  }
  const spoken = toSpokenPool(row);
  const name = row.kind === "eql" ? "equal lows" : "equal highs";
  const book = row.kind === "eql" ? "sell-side" : "buy-side";
  const clocks = formatSwingClocks(spoken);
  const swings =
    clocks ||
    (row.swingPrices?.length
      ? `from swings at ${row.swingPrices
          .slice(0, 3)
          .map((p) => p.toFixed(2))
          .join(" and ")}`
      : `${row.swingCount || 0} contributing swings`);
  const parts: string[] = [];
  parts.push(
    `That ${name} is the ${row.importance || "unranked"} ${book} pool at ${row.price.toFixed(2)} ${swings}`
  );
  if (row.why) parts.push(stripEvidenceKeys(row.why));
  else if (row.whyDetection) parts.push(stripEvidenceKeys(row.whyDetection));
  parts.push(
    row.lifecycle && row.lifecycle !== "ACTIVE"
      ? `Lifecycle is ${String(row.lifecycle).toLowerCase()} — treat it as ${row.status}`
      : `It's still ${row.status} relative to price, about ${Math.abs(row.distanceAbs || row.distanceFromPrice || 0).toFixed(1)} points away`
  );
  parts.push(
    `It matters now because ${book} resting orders sit there — a sweep is a raid, not a reason to fade into the wick`
  );
  if (row.sessionLabel) parts.push(`Session context is ${row.sessionLabel}`);
  return joinSpeakable(parts, 6);
}

function answerLiquidity(intel: DeskMarketIntelligence, question: string, ctx?: MentorIntentContext): string {
  if (dataUnusable(intel)) return staleReply(intel, "liquidity read");
  const [pool] = pickSpeakableEqhEqlPools(intel.eqhEqlRows?.map(toSpokenPool), { max: 1 });
  const swept = intel.observation.liquidity.levels.filter((l) => l.taken === true);
  const parts: string[] = [];
  if (pool) {
    const name = pool.liquidityType === "EQL" ? "equal lows" : "equal highs";
    const book = pool.liquidityType === "EQL" ? "sell-side" : "buy-side";
    parts.push(
      `The liquidity that matters is ${book} at the ${name} ${pool.price.toFixed(2)}${pool.why ? ` — ${stripEvidenceKeys(pool.why)}` : ""}`
    );
    parts.push("Random similar wicks are not a pool — I only treat HIGH, or unswept MEDIUM if nothing HIGH exists");
  } else {
    parts.push(EQH_EQL_STAY_FLAT);
  }
  if (swept.length) {
    const s = swept[swept.length - 1];
    parts.push(`${s.label} at ${s.price.toFixed(2)} was already taken — that's a raid, not continuation by itself`);
  }
  parts.push("If that pool gets swept, I want displacement and a structure shift after the raid, not a guess from the wick");
  if (!pool && !swept.length) {
    return answerEqh(intel, question, ctx);
  }
  return joinSpeakable(parts, 5);
}

function answerBias(intel: DeskMarketIntelligence): string {
  if (dataUnusable(intel)) return staleReply(intel, "bias");
  const env = envelopeFromIntel(intel);
  if (env.stance === "flat" || env.stance === "wait" || env.stance === "monitor") {
    return explainBullishEvidenceWithoutConverting(env, userPresentOpts());
  }
  return speakEnvelope(
    intel,
    "MENTOR VIEW is higher-timeframe context — TRADE DECISION below is the call"
  );
}

function waitFollowUpContext(intel: DeskMarketIntelligence): WaitFollowUpContext {
  return {
    long_case: intel.interpretation.long_case,
    short_case: intel.interpretation.short_case,
    entry_model: intel.interpretation.entry_model,
  };
}

function answerWait(intel: DeskMarketIntelligence, allowStale = false): string {
  const blocked = blockOnDataQuality(intel, "wait reason", allowStale);
  if (blocked) return blocked;
  const env = envelopeFromIntel(intel);
  return formatStructuredWaitFollowUp(env, waitFollowUpContext(intel), userPresentOpts());
}

function answerWhyNotDirection(
  intel: DeskMarketIntelligence,
  direction: "long" | "short",
  allowStale = false
): string {
  const blocked = blockOnDataQuality(intel, `${direction} rejection`, allowStale);
  if (blocked) return blocked;
  const env = envelopeFromIntel(intel);
  return formatWhyNotDirectionFollowUp(env, direction, waitFollowUpContext(intel), userPresentOpts());
}

function answerWalkthrough(intel: DeskMarketIntelligence): string {
  if (dataUnusable(intel)) return staleReply(intel, "walkthrough");
  const narrative = stripEvidenceKeys(formatObservationNarrative(intel.observation));
  const parts: string[] = [];
  const loc = [sessionLine(intel), priceLine(intel)].filter(Boolean).join(", ");
  parts.push(loc ? `I'll walk the live chart: ${loc}` : "I'll walk the live chart from the current state");
  parts.push(mssLine(intel));
  if (narrative) {
    const first = narrative.split(/(?<=\.)\s+/).slice(0, 2).join(" ");
    if (first) parts.push(first);
  }
  parts.push(biasLine(intel));
  const [pool] = pickSpeakableEqhEqlPools(intel.eqhEqlRows?.map(toSpokenPool), { max: 1 });
  if (pool) {
    const name = pool.liquidityType === "EQL" ? "equal lows" : "equal highs";
    parts.push(`Liquidity that counts is ${name} at ${pool.price.toFixed(2)}`);
  } else {
    parts.push("No meaningful equal-high or equal-low pool — I won't treat similar wicks as liquidity");
  }
  const env = envelopeFromIntel(intel);
  parts.push(formatMentorTradeSpoken(env, userPresentOpts()));
  return joinSpeakable(parts, 8);
}

function answerScenario(intel: DeskMarketIntelligence): string {
  if (dataUnusable(intel)) return staleReply(intel, "scenario");
  const interp = intel.interpretation;
  const env = envelopeFromIntel(intel);
  const parts: string[] = ["MENTOR VIEW: two-sided read from the current state"];
  if (interp.long_case.reasons[0]) {
    parts.push(
      `Bull case: ${stripEvidenceKeys(interp.long_case.reasons.slice(0, 2).join("; "))}${interp.long_case.supported ? "" : " — not fully supported"}`
    );
  } else {
    parts.push("Bull case isn't supported from the frozen observations");
  }
  if (interp.short_case.reasons[0]) {
    parts.push(
      `Bear case: ${stripEvidenceKeys(interp.short_case.reasons.slice(0, 2).join("; "))}${interp.short_case.supported ? "" : " — not fully supported"}`
    );
  } else {
    parts.push("Bear case isn't supported from the frozen observations");
  }
  parts.push(
    interp.contradictions[0]
      ? `The conflict: ${stripEvidenceKeys(interp.contradictions[0])}`
      : "No major contradiction on the observation layer"
  );
  parts.push(formatMentorTradeSpoken(env, userPresentOpts()));
  return joinSpeakable(parts, 8);
}

function factIdsFor(intel: DeskMarketIntelligence): string[] {
  const ids = ["market_state.last_price", "structure.mss", "bias.tradeable"].filter((id) =>
    findFact(intel.facts, id)
  );
  return ids;
}

export function mentorContextFromConversation(
  ctx?: CoachConversationCtx,
  lastAssistant?: string,
  lastUser?: string
): MentorIntentContext {
  const mergedAssistant = lastAssistant || ctx?.lastAssistant;
  return {
    lastMentorIntent: lastUser
      ? classifyMentorIntent(lastUser)
      : (ctx as MentorIntentContext | undefined)?.lastMentorIntent,
    lastAssistant: mergedAssistant,
    lastUser,
    lastFactIds: ctx?.lastFactIds,
    lastTopic: ctx?.lastTopic,
    lastTurnCategory: (ctx as MentorIntentContext | undefined)?.lastTurnCategory,
  };
}

/** Grounded spoken coaching from frozen intelligence. */
export function answerMentorCoaching(
  intel: DeskMarketIntelligence,
  question: string,
  ctx?: CoachConversationCtx,
  lastAssistant?: string
): MentorCoachAnswer | null {
  const mentorCtx = mentorContextFromConversation(ctx, lastAssistant);
  const intent = classifyMentorIntent(question, mentorCtx);
  const allowStaleForFollowUp = hasPriorMarketRead(mentorCtx);
  if (intent === "TEACHING") {
    const key = detectTeachingConcept(question);
    const taught = key ? teachConcept(key) : null;
    if (!taught) return null;
    const spoken = expandTradingAbbreviations(formatTeachingSpoken(taught));
    return {
      mode: "teaching",
      spoken,
      panel: `${taught.concept}\n\n${taught.definition}\n\n(${taught.source_note})`,
      last_fact_ids: [],
      confidence: "high",
      intent: "TEACHING",
    };
  }
  if (intent === "GENERAL_CHAT") return null;
  if (isInvalidationStatusQuestion(question)) return null;

  const whyNot = parseWhyNotDirection(question);
  if (whyNot) {
    const spoken = answerWhyNotDirection(intel, whyNot, allowStaleForFollowUp);
    return wrap(intel, spoken, "EXPLAIN_PREVIOUS_MARKET_READ", factIdsFor(intel));
  }

  let spoken = "";
  switch (intent) {
    case "CURRENT_MARKET_READ":
      spoken = answerCurrentRead(intel);
      break;
    case "CHANGE_ANALYSIS":
      spoken = answerChange(intel, lastAssistant || ctx?.lastTopic);
      break;
    case "WATCH_NEXT":
      spoken = answerWatchNext(intel);
      break;
    case "INVALIDATION":
      spoken = answerInvalidation(intel, allowStaleForFollowUp);
      break;
    case "LIQUIDITY_EXPLANATION":
      spoken = answerLiquidity(intel, question, mentorCtx);
      break;
    case "EQH_EQL_EXPLANATION":
      spoken = answerEqh(intel, question, mentorCtx);
      break;
    case "STRUCTURE_EXPLANATION":
      spoken = answerWalkthrough(intel);
      break;
    case "EXPLAIN_PREVIOUS_MARKET_READ":
    case "BIAS_EXPLANATION":
      spoken = answerBias(intel);
      break;
    case "WAIT_EXPLANATION":
      spoken = answerWait(intel, allowStaleForFollowUp);
      break;
    case "SCENARIO_ANALYSIS":
      spoken = answerScenario(intel);
      break;
    default:
      return null;
  }
  if (!spoken) return null;
  return wrap(intel, spoken, intent, factIdsFor(intel));
}

export function needsMentorCoachingAnswer(question: string, ctx?: MentorIntentContext): boolean {
  const intent = classifyMentorIntent(question, ctx);
  if (isInvalidationStatusQuestion(question)) return false;
  return isMentorMarketIntent(intent);
}
