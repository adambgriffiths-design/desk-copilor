/**
 * Conversational Market Intelligence — plain-English queries over frozen observations.
 * Facts first, interpretation second. Never invent prices or structure.
 */
import type { DeskMarketIntelligence } from "./market-intelligence";
import { findFact, type ObservationFact } from "./observation-facts";
import { detectTeachingConcept, formatTeachingSpoken, teachConcept } from "./ict-teaching";
import { formatObservationNarrative } from "./observation-engine";
import {
  classifyChartQuestion,
  isSnapshotIntent,
  resolveSnapshotIntent,
} from "./chart-question-intent";
import { buildMarketSnapshotAnswer } from "./market-snapshot";
import { expandTradingAbbreviations } from "./plain-language";
import { classifyLevelSide, isAsiaHighLevel } from "./session-liquidity";
import {
  buildSpokenEqhEqlBrief,
  isEqhEqlLiquidityQuestion,
} from "./voice-eqh-eql";
import { classifyMentorIntent, isInvalidationStatusQuestion, isMentorMarketTurn } from "./mentor-intent";
import { isStandaloneGeneralTurn } from "./conversational-intent";
import { answerMentorCoaching } from "./mentor-coaching";
import { buildTradingDecision } from "./decision-layer";
import { buildDecisionEnvelope } from "./decision-envelope";
import {
  explainBullishEvidenceWithoutConverting,
  formatMentorTradeSpoken,
  htfBiasMentorLine,
  resolveUserPresentationMode,
} from "./decision-contract-output";

export type ConversationContext = {
  /** Fact ids from the prior answer — enables "has that been invalidated?" */
  lastFactIds?: string[];
  lastTopic?: string;
  lastAssistant?: string;
  lastUser?: string;
};

export type IntelligenceConfidence = "high" | "medium" | "low" | "unknown";

export type MarketIntelligenceAnswer = {
  mode: "facts" | "teaching" | "analysis" | "legacy_snapshot";
  spoken: string;
  panel: string;
  facts: string[];
  interpretation: string | null;
  confidence: IntelligenceConfidence;
  missing: string[];
  evidence_refs: string[];
  state_hash: string;
  updated_at: string;
  scoped: true;
  intent?: string;
  last_fact_ids: string[];
  marketSnapshotId?: string;
  /** Set when data quality blocks a directional bias decision. */
  tradeable_bias?: string;
};

export type QueryMode =
  | "teaching"
  | "fact_lookup"
  | "invalidation_followup"
  | "why_followup"
  | "status"
  | "legacy_snapshot";

function isFollowUpInvalidation(question: string): boolean {
  return isInvalidationStatusQuestion(question);
}

function isFollowUpWhy(question: string): boolean {
  const q = question.trim().toLowerCase();
  if (/^(why|how come|explain that|what does that mean|why though|why is that)\??$/.test(q)) return true;
  if (/^why (?:are you|aren't you|are we|bullish|bearish|long|short|wait|waiting|not (?:short|long))\b/.test(q)) {
    return true;
  }
  return false;
}

function resolveFollowUpTarget(
  question: string,
  ctx: ConversationContext | undefined,
  facts: ObservationFact[]
): ObservationFact | undefined {
  const q = question.toLowerCase();
  const ids = ctx?.lastFactIds ?? [];

  if (ids.length) {
    for (const id of [...ids].reverse()) {
      const f = findFact(facts, id);
      if (f) return f;
    }
  }

  if (/\b(mss|structure shift|market structure)\b/.test(q)) return findFact(facts, "structure.mss");
  if (/\b(reh|relative equal high|eqh|equal high)\b/.test(q)) return findFact(facts, "liquidity.reh");
  if (/\b(rel|relative equal low|eql|equal low)\b/.test(q)) return findFact(facts, "liquidity.rel");
  if (/\b(fvg|fair value gap|gap)\b/.test(q)) return findFact(facts, "structure.fvg");
  if (/\b(nwog|week gap)\b/.test(q)) return findFact(facts, "gaps.nwog");
  if (/\b(ndog|day gap)\b/.test(q)) return findFact(facts, "gaps.ndog");
  if (/\b(org|opening range)\b/.test(q)) return findFact(facts, "gaps.org");
  if (ctx?.lastTopic) return findFact(facts, ctx.lastTopic);

  return findFact(facts, "structure.mss") ?? findFact(facts, "structure.fvg");
}

function classifyFactTopic(question: string): string | null {
  const q = question.trim().toLowerCase();
  if (/\b(nwog|new week opening gap|week gap)\b/.test(q)) return "gaps.nwog";
  if (/\b(ndog|new day opening gap|day gap)\b/.test(q)) return "gaps.ndog";
  if (/\b(org|opening range gap|opening range)\b/.test(q) && !/\bwhat is\b/.test(q))
    return "gaps.org";
  if (/\b(ce|consequent encroachment|half gap|50%)\b/.test(q)) return "gaps.org_ce";
  if (/\b(mss|market structure shift|structure shift|last mss)\b/.test(q)) return "structure.mss";
  if (/\b(first presented|fpfvg|1st presented)\b/.test(q)) return "structure.first_presented_fvg";
  if (/\b(fvg|fair value gap)\b/.test(q)) return "structure.fvg";
  if (/\b(displacement)\b/.test(q)) return "structure.displacement";
  if (/\b(pdh|previous day high)\b/.test(q)) return "liquidity.pdh";
  if (/\b(pdl|previous day low)\b/.test(q)) return "liquidity.pdl";
  if (/\b(pdc|previous day close)\b/.test(q)) return "liquidity.pdc";
  if (/\b(reh|relative equal high|relative equal highs|eqh|equal high)\b/.test(q)) return "liquidity.reh";
  if (/\b(rel|relative equal low|relative equal lows|eql|equal low)\b/.test(q)) return "liquidity.rel";
  if (/\b(sweep|swept|liquidity)\b/.test(q)) return "liquidity";
  if (/\b(asia high|asia low)\b/.test(q)) return "session.asia";
  if (/\b(london high|london low)\b/.test(q)) return "session.london";
  if (/\b(session high|rth high|ny high)\b/.test(q)) return "session.ny_rth_high";
  if (/\b(session low|rth low|ny low)\b/.test(q)) return "session.ny_rth_low";
  if (/\b(bias|direction|tradeable)\b/.test(q)) return "bias.tradeable";
  if (/\b(premium|discount)\b/.test(q)) return "premium_discount.zone";
  if (/\b(session|kill zone|what session)\b/.test(q)) return "session.active";
  if (/\b(price|trading at|where are we|what level)\b/.test(q)) return "market_state.last_price";
  return null;
}

export function classifyQueryMode(
  question: string,
  ctx?: ConversationContext
): QueryMode {
  if (detectTeachingConcept(question)) return "teaching";
  if (isMentorMarketTurn(question, {
    lastAssistant: ctx?.lastAssistant,
    lastUser: ctx?.lastUser,
    lastFactIds: ctx?.lastFactIds,
    lastTopic: ctx?.lastTopic,
    lastMentorIntent: ctx?.lastUser ? classifyMentorIntent(ctx.lastUser) : undefined,
  }) && !isInvalidationStatusQuestion(question)) {
    return "status";
  }
  if (isFollowUpInvalidation(question) && (ctx?.lastFactIds?.length || ctx?.lastTopic))
    return "invalidation_followup";
  if (isFollowUpInvalidation(question)) return "invalidation_followup";
  if (isFollowUpWhy(question) && (ctx?.lastFactIds?.length || ctx?.lastTopic)) return "why_followup";
  if (classifyFactTopic(question)) return "fact_lookup";
  const intent = resolveSnapshotIntent(question);
  if (isSnapshotIntent(intent)) return "legacy_snapshot";
  if (/\b(what('s| is) (the )?(chart|market)|how('s| is) (the )?(chart|market))\b/.test(question.toLowerCase()))
    return "status";
  return "legacy_snapshot";
}

function confidenceFromQuality(
  intel: DeskMarketIntelligence,
  fact?: ObservationFact
): IntelligenceConfidence {
  if (intel.observation.data_quality === "missing" || intel.observation.data_quality === "stale")
    return "unknown";
  if (fact?.status === "unknown") return "low";
  if (intel.observation.data_quality === "degraded") return "medium";
  return "high";
}

function interpretFact(fact: ObservationFact, intel: DeskMarketIntelligence): string | null {
  const price = intel.state.lastPrice;
  if (fact.id === "structure.mss") {
    if (fact.status === "active" && fact.price != null) {
      const bullish = fact.value.startsWith("bullish");
      const dir = bullish ? "buyers" : "sellers";
      const hold = bullish ? "above" : "below";
      return `That suggests ${dir} remain in control while price holds ${hold} the MSS level at ${fact.price.toFixed(2)}.`;
    }
    if (fact.status === "invalidated") {
      return "Structure shift has been invalidated — the prior directional lean from that MSS no longer holds.";
    }
    if (fact.status === "absent") {
      return "Without a clear MSS, execution structure is unconfirmed — wait for displacement and a shift.";
    }
  }
  if (fact.id === "structure.fvg" && fact.status === "active") {
    return "An active fair value gap can act as a retrace zone if structure aligns — confirm with MSS and bias.";
  }
  if (fact.id.startsWith("liquidity.") && fact.status === "swept") {
    const side = classifyLevelSide(fact.label, undefined);
    if (side === "buy_side" || isAsiaHighLevel(fact.label, fact.id)) {
      return "Buy-side liquidity was taken (raid on highs) — that is not a bullish continuation. Look for displacement or continuation lower, or stay flat until one-minute structure confirms. Do not flip long because a high was swept.";
    }
    if (side === "sell_side") {
      return "Sell-side liquidity was taken (raid on lows) — that is not a bearish continuation by itself. Watch for displacement and a structure shift after the raid, not in the sweep direction through the low.";
    }
    return "Liquidity was taken — watch for displacement after the raid. Sweeping a high is not bullish; sweeping a low is not bearish by itself.";
  }
  if (fact.id === "gaps.nwog" && fact.price_low != null && fact.price_high != null) {
    if (price > fact.price_high) return "Price is above NWOG — premium context vs the weekly gap.";
    if (price < fact.price_low) return "Price is below NWOG — discount context vs the weekly gap.";
    return "Price is inside NWOG — equilibrium between weekly gap bounds.";
  }
  if (fact.id === "bias.tradeable" && fact.value !== "unknown") {
    const decision = buildTradingDecision(intel.observation, intel.interpretation, intel.ctx);
    const env = buildDecisionEnvelope(
      { observation: intel.observation, interpretation: intel.interpretation, decision },
      intel.ctx,
      intel.state
    );
    return `MENTOR VIEW: higher-timeframe bias is ${htfBiasMentorLine(env)}. TRADE DECISION remains ${env.stance} — that bias is not a long or short by itself.`;
  }
  return null;
}

function answerInvalidationFollowUp(
  intel: DeskMarketIntelligence,
  question: string,
  ctx?: ConversationContext
): MarketIntelligenceAnswer {
  const target = resolveFollowUpTarget(question, ctx, intel.facts);
  const missing: string[] = [];
  const factLines: string[] = [];
  const evidence_refs: string[] = [];

  if (!target) {
    return wrapAnswer({
      mode: "facts",
      factLines: ["I don't know which level you mean — ask about MSS, FVG, NWOG, or a specific level."],
      interpretation: null,
      confidence: "unknown",
      missing: ["prior topic reference"],
      evidence_refs: [],
      intel,
      last_fact_ids: [],
    });
  }

  evidence_refs.push(target.evidence_key);
  if (target.status === "unknown") {
    factLines.push(`${target.label}: unknown — insufficient data.`);
    missing.push(target.label);
  } else if (target.status === "invalidated") {
    factLines.push(`${target.label} has been invalidated (${target.value}).`);
  } else if (target.status === "active") {
    factLines.push(`${target.label} is still active — not invalidated (${target.value}).`);
  } else if (target.status === "swept") {
    factLines.push(`${target.label} was swept (${target.value}).`);
  } else if (target.status === "absent") {
    factLines.push(`No active ${target.label.toLowerCase()} in the current lookback.`);
  }

  const priceFact = findFact(intel.facts, "market_state.last_price");
  if (priceFact) {
    factLines.push(`Current price: ${priceFact.value}.`);
    evidence_refs.push(priceFact.evidence_key);
  }

  const interpretation =
    target.status === "invalidated"
      ? "The prior thesis tied to that level is no longer valid until a new structure forms."
      : target.status === "active"
        ? interpretFact(target, intel)
        : null;

  return wrapAnswer({
    mode: "facts",
    factLines,
    interpretation,
    confidence: confidenceFromQuality(intel, target),
    missing,
    evidence_refs,
    intel,
    last_fact_ids: [target.id],
  });
}

function answerWhyFollowUp(
  intel: DeskMarketIntelligence,
  ctx?: ConversationContext
): MarketIntelligenceAnswer {
  const target = resolveFollowUpTarget("", ctx, intel.facts);
  const factLines: string[] = [];
  const evidence_refs: string[] = [];

  if (target) {
    factLines.push(`${target.label}: ${target.value}.`);
    evidence_refs.push(target.evidence_key);
  }

  const narrative = formatObservationNarrative(intel.observation);
  if (narrative) factLines.push(narrative);

  const decision = buildTradingDecision(intel.observation, intel.interpretation, intel.ctx);
  const env = buildDecisionEnvelope(
    { observation: intel.observation, interpretation: intel.interpretation, decision },
    intel.ctx,
    intel.state
  );
  const interpretation =
    env.stance === "flat" || env.stance === "wait" || env.stance === "monitor"
      ? explainBullishEvidenceWithoutConverting(env, { mode: resolveUserPresentationMode() })
      : formatMentorTradeSpoken(env, { mode: resolveUserPresentationMode() });

  return wrapAnswer({
    mode: "analysis",
    factLines,
    interpretation,
    confidence: confidenceFromQuality(intel),
    missing: intel.observation.data_quality === "missing" ? ["market data"] : [],
    evidence_refs: [...evidence_refs, ...intel.interpretation.observation_refs.slice(0, 5)],
    intel,
    last_fact_ids: target ? [target.id] : [],
  });
}

function answerFactLookup(
  intel: DeskMarketIntelligence,
  question: string
): MarketIntelligenceAnswer | null {
  const topic = classifyFactTopic(question);
  if (!topic) return null;

  const q = question.toLowerCase();
  const factLines: string[] = [];
  const evidence_refs: string[] = [];
  const missing: string[] = [];
  let last_fact_ids: string[] = [];

  const eqhTopics =
    topic === "liquidity" || topic === "liquidity.reh" || topic === "liquidity.rel";
  const sweepOnly =
    /\b(sweep|swept)\b/.test(q) && !isEqhEqlLiquidityQuestion(question);
  if (eqhTopics && !sweepOnly && intel.eqhEqlRows?.length) {
    const spoken = buildSpokenEqhEqlBrief(intel.eqhEqlRows, { question });
    return wrapAnswer({
      mode: "facts",
      factLines: [spoken],
      interpretation: null,
      confidence: confidenceFromQuality(intel),
      missing: [],
      evidence_refs: ["eqh-eql"],
      intel,
      last_fact_ids: [topic],
    });
  }

  if (topic === "liquidity") {
    const swept = intel.facts.filter((f) => f.status === "swept" && f.category === "liquidity");
    if (swept.length) {
      for (const s of swept.slice(-3)) {
        factLines.push(`${s.label}: ${s.value}.`);
        evidence_refs.push(s.evidence_key);
        last_fact_ids.push(s.id);
      }
    } else {
      factLines.push("No liquidity sweeps recorded in the current lookback.");
    }
    const pdh = findFact(intel.facts, "liquidity.pdh");
    const pdl = findFact(intel.facts, "liquidity.pdl");
    if (pdh) {
      factLines.push(`${pdh.label}: ${pdh.value}.`);
      evidence_refs.push(pdh.evidence_key);
    }
    if (pdl) {
      factLines.push(`${pdl.label}: ${pdl.value}.`);
      evidence_refs.push(pdl.evidence_key);
    }
  } else if (topic.startsWith("session.")) {
    const matches = intel.facts.filter(
      (f) => f.id.startsWith(topic) || f.id.startsWith("session.")
    );
    if (/\basia\b/.test(q)) {
      const asia = matches.filter((f) => f.id.includes("asia"));
      for (const f of asia) {
        factLines.push(`${f.label}: ${f.value}.`);
        evidence_refs.push(f.evidence_key);
        last_fact_ids.push(f.id);
      }
    } else if (/\blondon\b/.test(q)) {
      for (const f of matches.filter((f) => f.id.includes("london"))) {
        factLines.push(`${f.label}: ${f.value}.`);
        evidence_refs.push(f.evidence_key);
        last_fact_ids.push(f.id);
      }
    } else {
      const f = findFact(intel.facts, topic) ?? matches[0];
      if (f) {
        factLines.push(`${f.label}: ${f.value}.`);
        evidence_refs.push(f.evidence_key);
        last_fact_ids = [f.id];
      }
    }
  } else {
    const f = findFact(intel.facts, topic);
    if (!f) return null;
    if (f.status === "unknown") {
      factLines.push(`${f.label}: unknown — not enough data to locate this on the chart.`);
      missing.push(f.label);
    } else if (f.status === "absent") {
      factLines.push(`${f.label}: none detected in the current lookback.`);
    } else {
      factLines.push(`${f.label}: ${f.value}.`);
    }
    evidence_refs.push(f.evidence_key);
    last_fact_ids = [f.id];
  }

  const primary = last_fact_ids[0] ? findFact(intel.facts, last_fact_ids[0]) : undefined;
  const interpretation = primary ? interpretFact(primary, intel) : null;

  return wrapAnswer({
    mode: "facts",
    factLines,
    interpretation,
    confidence: confidenceFromQuality(intel, primary),
    missing,
    evidence_refs,
    intel,
    last_fact_ids,
  });
}

function answerStatus(intel: DeskMarketIntelligence): MarketIntelligenceAnswer {
  const price = findFact(intel.facts, "market_state.last_price");
  const mss = findFact(intel.facts, "structure.mss");
  const session = findFact(intel.facts, "session.active");
  const factLines: string[] = [];
  const evidence_refs: string[] = [];
  const decision = buildTradingDecision(intel.observation, intel.interpretation, intel.ctx);
  const env = buildDecisionEnvelope(
    { observation: intel.observation, interpretation: intel.interpretation, decision },
    intel.ctx,
    intel.state
  );

  factLines.push("MENTOR VIEW:");
  if (price) {
    factLines.push(`Price: ${price.value}.`);
    evidence_refs.push(price.evidence_key);
  }
  if (session) {
    factLines.push(`Session: ${session.value}.`);
    evidence_refs.push(session.evidence_key);
  }
  factLines.push(`Higher-timeframe bias: ${htfBiasMentorLine(env)}.`);
  if (mss && mss.status !== "absent") {
    factLines.push(`Tactical structure: ${mss.value}${mss.status === "invalidated" ? " — invalidated" : ""} on the ${env.primaryHorizon.timeframe}.`);
    evidence_refs.push(mss.evidence_key);
  }

  const narrative = formatObservationNarrative(intel.observation);
  const interpretation = formatMentorTradeSpoken(env, { mode: resolveUserPresentationMode() });

  return wrapAnswer({
    mode: "analysis",
    factLines: narrative ? [...factLines, narrative] : factLines,
    interpretation,
    confidence: confidenceFromQuality(intel),
    missing: [],
    evidence_refs,
    intel,
    last_fact_ids: mss ? [mss.id] : [],
  });
}

function wrapAnswer(input: {
  mode: MarketIntelligenceAnswer["mode"];
  factLines: string[];
  interpretation: string | null;
  confidence: IntelligenceConfidence;
  missing: string[];
  evidence_refs: string[];
  intel: DeskMarketIntelligence;
  last_fact_ids: string[];
  intent?: string;
}): MarketIntelligenceAnswer {
  const facts = input.factLines.filter(Boolean);
  const spokenParts = [...facts];
  if (input.interpretation) spokenParts.push(input.interpretation);
  if (input.missing.length) {
    spokenParts.push(`Missing data: ${input.missing.join(", ")}.`);
  }

  const panelParts = ["FACTS", ...facts.map((f) => `• ${f}`)];
  if (input.interpretation) {
    panelParts.push("", "INTERPRETATION", input.interpretation);
  }
  if (input.confidence !== "high") {
    panelParts.push("", `Confidence: ${input.confidence}`);
  }
  if (input.missing.length) {
    panelParts.push(`Unknown: ${input.missing.join(", ")}`);
  }

  return {
    mode: input.mode,
    spoken: expandTradingAbbreviations(spokenParts.join(" ")),
    panel: expandTradingAbbreviations(panelParts.join("\n")),
    facts,
    interpretation: input.interpretation,
    confidence: input.confidence,
    missing: input.missing,
    evidence_refs: [...new Set(input.evidence_refs)],
    state_hash: input.intel.state_hash,
    marketSnapshotId: input.intel.state.snapshotId || input.intel.state_hash,
    updated_at: input.intel.built_at,
    scoped: true,
    intent: input.intent,
    last_fact_ids: input.last_fact_ids,
  };
}

/** Answer a plain-English market question from frozen intelligence. */
export function answerFromIntelligence(
  intel: DeskMarketIntelligence,
  question: string,
  ctx?: ConversationContext
): MarketIntelligenceAnswer | null {
  if (isMentorMarketTurn(question, {
    lastAssistant: ctx?.lastAssistant,
    lastFactIds: ctx?.lastFactIds,
    lastTopic: ctx?.lastTopic,
  }) && !isInvalidationStatusQuestion(question)) {
    const coached = answerMentorCoaching(intel, question, ctx, ctx?.lastAssistant);
    if (coached) {
      return wrapAnswer({
        mode: coached.mode === "teaching" ? "teaching" : "analysis",
        factLines: [coached.spoken],
        interpretation: null,
        confidence: coached.confidence,
        missing: [],
        evidence_refs: [],
        intel,
        last_fact_ids: coached.last_fact_ids,
        intent: coached.intent,
      });
    }
  }

  const mode = classifyQueryMode(question, ctx);

  if (mode === "teaching") {
    const key = detectTeachingConcept(question);
    const taught = key ? teachConcept(key) : null;
    if (!taught) return null;
    return {
      mode: "teaching",
      spoken: expandTradingAbbreviations(formatTeachingSpoken(taught)),
      panel: `${taught.concept}\n\n${taught.definition}\n\n(${taught.source_note})`,
      facts: [],
      interpretation: null,
      confidence: "high",
      missing: [],
      evidence_refs: [],
      state_hash: intel.state_hash,
      updated_at: intel.built_at,
      scoped: true,
      intent: "teaching",
      last_fact_ids: [],
    };
  }

  if (mode === "invalidation_followup") {
    return answerInvalidationFollowUp(intel, question, ctx);
  }

  if (mode === "why_followup") {
    return answerWhyFollowUp(intel, ctx);
  }

  if (mode === "fact_lookup") {
    const ans = answerFactLookup(intel, question);
    if (ans) return ans;
  }

  if (mode === "status") {
    return answerStatus(intel);
  }

  if (mode === "legacy_snapshot") {
    const intent = resolveSnapshotIntent(question);
    if (!isSnapshotIntent(intent)) return null;
    const snap = buildMarketSnapshotAnswer(intel.ctx, intent, question);
    return wrapAnswer({
      mode: "legacy_snapshot",
      factLines: [snap.spoken],
      interpretation: null,
      confidence: confidenceFromQuality(intel),
      missing: [],
      evidence_refs: [],
      intel,
      last_fact_ids: classifyFactTopic(question) ? [classifyFactTopic(question)!] : [],
      intent,
    });
  }

  return null;
}

export function extractConversationContext(messages: Array<{ role: string; content: string }>): ConversationContext {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const users = messages.filter((m) => m.role === "user");
  const lastUser = users[users.length - 1];
  const priorUser = users.length >= 2 ? users[users.length - 2] : undefined;
  if (!lastAssistant?.content && !lastUser?.content) return {};

  const ids: string[] = [];
  const assistantText = lastAssistant?.content || "";
  const idMatch = assistantText.match(/\[([a-z0-9_.]+)\]/gi);
  if (idMatch) {
    for (const m of idMatch) ids.push(m.replace(/[\[\]]/g, ""));
  }

  const topic =
    /\bmss\b/i.test(assistantText) || /structure shift/i.test(assistantText)
      ? "structure.mss"
      : /\bnwog\b/i.test(assistantText)
        ? "gaps.nwog"
        : /\bndog\b/i.test(assistantText)
          ? "gaps.ndog"
          : /\bfvg\b/i.test(assistantText)
            ? "structure.fvg"
            : undefined;

  return {
    lastFactIds: ids.length ? ids : topic ? [topic] : undefined,
    lastTopic: topic,
    lastAssistant: lastAssistant?.content,
    lastUser: priorUser?.content || lastUser?.content,
  };
}

/** Try intelligence layer before legacy snapshot — returns spoken string for chat. */
export function tryIntelligenceReply(
  intel: DeskMarketIntelligence,
  question: string,
  ctx?: ConversationContext
): MarketIntelligenceAnswer | null {
  return answerFromIntelligence(intel, question, ctx);
}

/** Route plain-English fact / teaching / follow-up questions to observation-backed answers. */
export function needsMarketIntelligenceAnswer(question: string): boolean {
  if (isStandaloneGeneralTurn(question)) return false;
  if (isMentorMarketTurn(question)) return true;
  if (detectTeachingConcept(question)) return true;
  if (classifyFactTopic(question)) return true;
  if (isFollowUpInvalidation(question)) return true;
  if (isFollowUpWhy(question)) return true;
  const mode = classifyQueryMode(question);
  return mode === "fact_lookup" || mode === "invalidation_followup" || mode === "why_followup" || mode === "teaching" || mode === "status";
}
