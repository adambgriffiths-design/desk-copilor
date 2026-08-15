/**
 * Unified user-facing decision contract — presentation and runtime validation only.
 * Does not change sweep / PDH / REH / entry semantics or the seven-layer envelope.
 *
 * Plain mode: semantic fields → conversational renderer (wording only).
 */

import {
  renderInvalidation,
  renderQualityGateWait,
  renderStanceReply,
  renderWaitFollowUp,
  renderWhyNot,
  type RenderOpts,
} from "./conversational-renderer";
import {
  assertNoLeanWithoutWhy,
  formatDecisionEnvelope,
  isTopDownReadable,
  unlabeledDirectionalLeans,
  type DecisionEnvelope,
  type DecisionStance,
} from "./decision-envelope";

export const NO_DECISION_LABEL = "NO DECISION";
export const UNAVAILABLE_VERDICT = "UNAVAILABLE";

const DECISION_CONVERTING = [
  /\bi(?:'d| would)\s+look\s+for\s+a\s+(long|short)\b/i,
  /\bleaning\s+(bullish|bearish|long|short)\b/i,
  /\bcall\s+is\s+potential\s+(buy|sell)\b/i,
  /\bi(?:'m| am)\s+(going\s+)?(long|short)\b/i,
  /\btake\s+the\s+(long|short)\s+side\b/i,
  /\bstance\s+is\s+(long|short)\b/i,
  /\btrade\s+direction:\s*(LONG|SHORT)\b/i,
];

const VAGUE_WAIT = /\bwait(?:ing)?\s+for\s+entry\b/i;

const GENERIC_WAIT_TRIGGER =
  /specific retrace, fair value gap, or structure confirmation — not a generic entry/i;

/** Generic mentor follow-up phrases that must not appear unless structured decision defines them. */
export const VAGUE_WAIT_FOLLOWUP =
  /\b(clear signal|clean signal|market to (?:tell|give) us|just waiting for the market|waiting for confirmation(?!\s+of)|give us that clear)\b/i;

export type WaitFollowUpContext = {
  long_case?: { supported: boolean; reasons: string[] };
  short_case?: { supported: boolean; reasons: string[] };
  entry_model?: string | null;
  rejected_alternative?: string | null;
};

/** plain = normal chat/voice; structured = debug / prompts / legacy labeled contract. */
export type DecisionPresentationMode = "plain" | "structured";

export type VisibleDecisionOpts = {
  chartEvidence?: string;
  source?: "pipeline" | "screenshot" | "text" | "voice" | "mentor";
  /** Default structured for backward-compatible call sites; user paths pass resolveUserPresentationMode(). */
  mode?: DecisionPresentationMode;
  render?: RenderOpts;
};

export type PresentationOpts = {
  mode?: DecisionPresentationMode;
  /** Wording variant / diversity opts — never changes semantic facts. */
  render?: RenderOpts;
};

/**
 * User-facing chat/voice default: plain English.
 * Debug: set KAREN_DECISION_DEBUG=1 or pass mode "structured".
 */
export function resolveUserPresentationMode(
  explicit?: DecisionPresentationMode
): DecisionPresentationMode {
  if (explicit) return explicit;
  if (process.env.KAREN_DECISION_DEBUG === "1") return "structured";
  return "plain";
}

function presentationMode(opts?: { mode?: DecisionPresentationMode }): DecisionPresentationMode {
  return opts?.mode === "plain" || opts?.mode === "structured" ? opts.mode : "structured";
}

/** Uppercase internal labels that must not appear in normal (plain) user replies. */
export const INTERNAL_DECISION_LABEL_RE =
  /\b(HTF CONTEXT|CURRENT STRUCTURE|TRADEABLE OPPORTUNITY|TRADE DIRECTION|OVERALL STANCE|WAITING FOR|WAIT FOR|WHY NOT (?:LONG|SHORT)|LONG CONDITION|SHORT CONDITION|CURRENT STATE|CURRENT STANCE|THESIS INVALIDATES|MENTOR VIEW|TRADE DECISION|PREVIOUS DECISION|CONCEPT EVIDENCE|REASONING CHAIN|CONFLICT LOG|STRATEGIC BIAS|TACTICAL BIAS|DecisionKey|LIVE\s*\/\s*PREVIOUS DECISION|HISTORICAL\s*\/\s*PREVIOUS DECISION|entryStatus|EVIDENCE|THESIS|CONFLICTS|INVALIDATION|MARKET STATE)\s*:/i;

export function hasInternalDecisionLabels(text: string): boolean {
  return INTERNAL_DECISION_LABEL_RE.test(String(text || ""));
}

function stanceSpokenWord(stance: DecisionStance): "WAITING" | "LONG" | "SHORT" | "NO_TRADE" {
  if (stance === "long") return "LONG";
  if (stance === "short") return "SHORT";
  if (stance === "wait") return "WAITING";
  return "NO_TRADE";
}

function waitTriggerText(env: DecisionEnvelope): string {
  return waitForLine(env).replace(/^WAIT FOR:\s*/i, "").trim();
}

function whyBecause(env: DecisionEnvelope): string {
  const raw =
    String(env.thesis.whyNow || "").trim() ||
    String(env.conflictResolution.sentence || "").trim() ||
    String(env.thesis.what || "").trim() ||
    stanceRoleLine(env.stance).replace(/^[A-Z]+ —\s*/, "");
  if (!raw) return "the structured decision does not justify a directional trade";
  return raw.charAt(0).toLowerCase() + raw.slice(1);
}

function uncertaintyClause(env: DecisionEnvelope): string {
  const bits: string[] = [];
  if (env.confidence === "low" || env.confidence === "unknown") {
    bits.push(`confidence is ${env.confidence}`);
  }
  for (const item of env.reasoningChain) {
    if (item.outcome === "uncertain" && bits.length < 3) {
      bits.push(`${item.concept} is unproven`);
    }
  }
  return bits.length ? `Uncertainty: ${bits.join("; ")}.` : "";
}

function rejectedDirectionReason(
  env: DecisionEnvelope,
  direction: "long" | "short",
  ctx?: WaitFollowUpContext
): string {
  const side = direction === "long" ? ctx?.long_case : ctx?.short_case;
  const label = direction.toUpperCase();
  if (ctx?.rejected_alternative) return ctx.rejected_alternative;
  if (side?.supported) {
    return `${label.toLowerCase()} case is supported in interpretation but stance is ${env.stance}`;
  }
  if (side?.reasons?.length) return side.reasons.slice(0, 3).join("; ");
  return `no structured evidence for a ${direction}`;
}

export function stanceRoleLine(stance: DecisionStance): string {
  if (stance === "flat") return "FLAT — no trade justified";
  if (stance === "wait") return "WAIT — named trigger required";
  if (stance === "monitor") return "MONITOR — observing, no active thesis";
  if (stance === "long") return "LONG — directional trade on the execution horizon";
  return "SHORT — directional trade on the execution horizon";
}

export function waitForLine(env: DecisionEnvelope): string {
  if (env.stance !== "wait") return "";
  const from = (env.thesis.fromWhere || "").trim();
  if (from && /\d/.test(from) && !VAGUE_WAIT.test(from)) {
    return `WAIT FOR: retrace into ${from}`;
  }
  const what = (env.thesis.what || "").trim();
  if (what && !VAGUE_WAIT.test(what)) {
    return `WAIT FOR: ${what}`;
  }
  const exec = env.logicOrder.execution.replace(/^wait for\s+/i, "").replace(/\s+—\s+no order yet$/i, "");
  if (exec && !VAGUE_WAIT.test(exec) && !/^the named trigger/i.test(exec)) {
    return `WAIT FOR: ${exec}`;
  }
  const inv = env.invalidation.condition.trim();
  if (inv) return `WAIT FOR: ${inv}`;
  return "WAIT FOR: a specific retrace, fair value gap, or structure confirmation — not a generic entry";
}

function sideConditionLabel(
  side: "long" | "short",
  ctx: WaitFollowUpContext | undefined,
  env: DecisionEnvelope
): string {
  const row = side === "long" ? ctx?.long_case : ctx?.short_case;
  if (!row) return "not in structured decision";
  const reasons = row.reasons.slice(0, 3).join("; ");
  if (row.supported) {
    const trigger =
      env.stance === "wait" && env.thesis.fromWhere
        ? ` — active when ${env.thesis.what || env.thesis.fromWhere} at ${env.thesis.fromWhere}`
        : env.thesis.what
          ? ` — ${env.thesis.what}`
          : "";
    return `${reasons || "supported in interpretation"}${trigger}`.trim();
  }
  if (reasons) return `not active — ${reasons}`;
  return "not supported — no structured evidence";
}

/** Fields missing for a concrete WAIT follow-up — do not invent to fill these. */
export function missingWaitEnvelopeFields(env: DecisionEnvelope): string[] {
  const missing: string[] = [];
  if (env.stance !== "wait" && env.stance !== "flat" && env.stance !== "monitor") return missing;
  const trigger = waitForLine(env);
  if (GENERIC_WAIT_TRIGGER.test(trigger)) {
    missing.push("named wait trigger (thesis.what / fromWhere / execution)");
  }
  if (!String(env.invalidation.condition || "").trim()) missing.push("invalidation.condition");
  if (!String(env.conflictResolution.sentence || "").trim()) missing.push("conflictResolution.sentence");
  return missing;
}

function formatStructuredWaitFollowUpLabeled(
  env: DecisionEnvelope,
  ctx: WaitFollowUpContext | undefined,
  missing: string[],
  waitingFor: string,
  until: string
): string {
  if (missing.length > 0) {
    return [
      "WAIT CONDITION IS UNDER-SPECIFIED",
      `Missing: ${missing.join(", ")}`,
      waitingFor ? `WAITING FOR: ${waitingFor}` : "",
      env.invalidation.condition ? `INVALIDATION: ${env.invalidation.condition}` : "",
      `Until then: ${until}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const currentState = [
    env.conflictResolution.sentence,
    env.stance === "wait" || env.stance === "flat" || env.stance === "monitor"
      ? `Trade direction is ${env.read.tradeDirection}; opportunity ${env.read.tradeableOpportunity.replace(/_/g, " ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `WAITING FOR: ${waitingFor}`,
    `LONG CONDITION: ${sideConditionLabel("long", ctx, env)}`,
    `SHORT CONDITION: ${sideConditionLabel("short", ctx, env)}`,
    `CURRENT STATE: ${currentState}`,
    `INVALIDATION: ${env.invalidation.condition}`,
    `Until then: ${until}`,
  ].join("\n");
}

function formatStructuredWaitFollowUpPlain(
  env: DecisionEnvelope,
  ctx: WaitFollowUpContext | undefined,
  missing: string[],
  waitingFor: string,
  opts?: PresentationOpts
): string {
  const stanceWord = stanceSpokenWord(env.stance);
  const inv = String(env.invalidation.condition || "").trim();
  const longSide = sideConditionLabel("long", ctx, env);
  const shortSide = sideConditionLabel("short", ctx, env);
  return renderWaitFollowUp(
    {
      stanceWord,
      waitingFor,
      because: whyBecause(env),
      missing,
      longSide,
      shortSide,
      invalidation: inv || undefined,
      uncertainty: uncertaintyClause(env) || undefined,
    },
    opts?.render
  );
}

/** Deterministic WAIT / flat follow-up from envelope + interpretation — no LLM paraphrase. */
export function formatStructuredWaitFollowUp(
  env: DecisionEnvelope,
  ctx?: WaitFollowUpContext,
  opts?: PresentationOpts
): string {
  const missing = missingWaitEnvelopeFields(env);
  const waitingFor = waitTriggerText(env);
  const until =
    env.stance === "flat"
      ? "FLAT"
      : env.stance === "monitor"
        ? "MONITOR"
        : env.stance === "wait"
          ? "WAIT/FLAT"
          : env.stance.toUpperCase();

  if (presentationMode(opts) === "plain") {
    return formatStructuredWaitFollowUpPlain(env, ctx, missing, waitingFor, opts);
  }
  return formatStructuredWaitFollowUpLabeled(env, ctx, missing, waitingFor, until);
}

function formatStructuredInvalidationFollowUpLabeled(env: DecisionEnvelope, missing: string[]): string {
  if (missing.length) {
    return [
      "INVALIDATION IS UNDER-SPECIFIED",
      `Missing: ${missing.join(", ")}`,
      env.conflictLog.disagree ? `CONFLICT: ${env.conflictLog.why}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `INVALIDATION: ${env.invalidation.condition}`,
    env.thesis.invalidates && env.thesis.invalidates !== env.invalidation.condition
      ? `THESIS INVALIDATES: ${env.thesis.invalidates}`
      : "",
    env.conflictLog.disagree ? `CONFLICT: ${env.conflictLog.why}` : "",
    `STANCE: ${env.stance} — ${stanceRoleLine(env.stance)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatStructuredInvalidationFollowUpPlain(
  env: DecisionEnvelope,
  missing: string[],
  opts?: PresentationOpts
): string {
  return renderInvalidation(
    {
      missing,
      invalidation: String(env.invalidation.condition || "").trim() || undefined,
      thesisInvalidates:
        env.thesis.invalidates && env.thesis.invalidates !== env.invalidation.condition
          ? env.thesis.invalidates
          : undefined,
      conflict: env.conflictLog.disagree ? `Conflict: ${env.conflictLog.why}.` : undefined,
      stanceWord: stanceSpokenWord(env.stance),
      because: whyBecause(env),
      uncertainty: uncertaintyClause(env) || undefined,
    },
    opts?.render
  );
}

/** Deterministic invalidation follow-up from envelope only. */
export function formatStructuredInvalidationFollowUp(
  env: DecisionEnvelope,
  opts?: PresentationOpts
): string {
  const missing: string[] = [];
  if (!String(env.invalidation.condition || "").trim()) missing.push("invalidation.condition");
  if (!String(env.thesis.invalidates || "").trim() && !String(env.invalidation.condition || "").trim()) {
    missing.push("thesis.invalidates");
  }
  if (presentationMode(opts) === "plain") {
    return formatStructuredInvalidationFollowUpPlain(env, missing, opts);
  }
  return formatStructuredInvalidationFollowUpLabeled(env, missing);
}

function formatWhyNotDirectionFollowUpLabeled(
  env: DecisionEnvelope,
  direction: "long" | "short",
  ctx: WaitFollowUpContext | undefined,
  rejected: string
): string {
  const side = direction === "long" ? ctx?.long_case : ctx?.short_case;
  const label = direction.toUpperCase();
  return [
    `WHY NOT ${label}: ${rejected}`,
    env.conflictLog.disagree
      ? `CONFLICT: ${env.conflictLog.htfHorizon} ${env.conflictLog.htfLean} vs ${env.conflictLog.tacticalHorizon} ${env.conflictLog.tacticalLean} — ${env.conflictLog.why}`
      : "",
    `CURRENT STANCE: ${env.read.overallStance}`,
    env.stance === "wait" || env.stance === "flat"
      ? `WAITING FOR: ${waitTriggerText(env)}`
      : "",
    `${label}-SIDE EVIDENCE: ${side?.reasons?.slice(0, 3).join("; ") || "none in structured decision"}`,
    `Until then: ${env.stance === "flat" ? "FLAT" : env.stance === "wait" ? "WAIT/FLAT" : env.stance.toUpperCase()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatWhyNotDirectionFollowUpPlain(
  env: DecisionEnvelope,
  direction: "long" | "short",
  ctx: WaitFollowUpContext | undefined,
  rejected: string,
  opts?: PresentationOpts
): string {
  const trigger =
    env.stance === "wait" || env.stance === "flat" ? waitTriggerText(env) : "";
  return renderWhyNot(
    {
      direction,
      rejected,
      conflict: env.conflictLog.disagree
        ? `Conflict: ${env.conflictLog.htfHorizon} ${env.conflictLog.htfLean} vs ${env.conflictLog.tacticalHorizon} ${env.conflictLog.tacticalLean} — ${env.conflictLog.why}.`
        : undefined,
      waitTrigger: trigger || undefined,
      stanceWord: stanceSpokenWord(env.stance),
      uncertainty: uncertaintyClause(env) || undefined,
    },
    opts?.render
  );
}

/** Why-not-short/long from envelope conflict + interpretation — no invention. */
export function formatWhyNotDirectionFollowUp(
  env: DecisionEnvelope,
  direction: "long" | "short",
  ctx?: WaitFollowUpContext,
  opts?: PresentationOpts
): string {
  const rejected = rejectedDirectionReason(env, direction, ctx);
  if (presentationMode(opts) === "plain") {
    return formatWhyNotDirectionFollowUpPlain(env, direction, ctx, rejected, opts);
  }
  return formatWhyNotDirectionFollowUpLabeled(env, direction, ctx, rejected);
}

export function htfBiasMentorLine(env: DecisionEnvelope): string {
  return `${env.htfContext.timeframe} ${env.htfContext.lean} (HTF context — not the trade)`;
}

export function conflictPresentation(env: DecisionEnvelope): string[] {
  const log = env.conflictLog;
  const conflict = log.disagree || env.conflictResolution.conflict;
  if (!conflict) {
    return [
      "CONFLICTS: no",
      `HTF: ${log.htfHorizon} ${log.htfLean}`,
      `TACTICAL: ${log.tacticalHorizon} ${log.tacticalLean}`,
    ];
  }
  const tradeable =
    env.read.tradeDirection === "NONE"
      ? "none — neither HTF nor LTF automatically overrides"
      : `${env.primaryHorizon.timeframe} (${env.read.tradeDirection}); this is NOT an HTF reversal`;
  return [
    "CONFLICTS: yes",
    `HTF: ${log.htfHorizon} ${log.htfLean}`,
    `TACTICAL: ${log.tacticalHorizon} ${log.tacticalLean}`,
    "CONFLICT: yes",
    `TRADEABLE HORIZON: ${tradeable}`,
    `STANCE: ${env.stance}`,
    `REASON: ${env.conflictResolution.sentence}`,
    `INVALIDATION: ${env.invalidation.condition}`,
  ];
}

function conceptEvidenceBlock(env: DecisionEnvelope): string {
  const rows = env.reasoningChain.map((item) => {
    const proven =
      item.outcome === "true"
        ? "detected"
        : item.outcome === "uncertain"
          ? "UNPROVEN"
          : "not detected";
    const used = item.usedInDecision ? `used=${item.role}` : "used=NONE";
    return `- [${item.concept}] ${proven}; ${used}; ${item.impact}`;
  });
  return rows.join("\n");
}

function sanitizeChartEvidence(raw: string): string {
  return String(raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(bias|call|entry zone|target 1|target 2|meta)\s*:/i.test(l))
    .filter((l) => !/potential buy|potential sell|i(?:'d| would) look for a (long|short)/i.test(l))
    .join("\n")
    .slice(0, 800);
}

/**
 * Canonical DecisionEnvelope for LLM QUALITY GATE prompts.
 * Emits `formatDecisionEnvelope` once, then only presentation fields that are
 * not already in the structured envelope (STANCE ROLE, WAIT FOR).
 * Drops the unified MENTOR/TRADE re-statement of FACTS/STANCE/THESIS/TARGET/
 * INVALIDATION/CONFLICTS and CONCEPT EVIDENCE (covered by REASONING CHAIN).
 */
export function formatCanonicalEnvelopeForPrompt(env: DecisionEnvelope): string {
  const extras = [`STANCE ROLE: ${stanceRoleLine(env.stance)}`, waitForLine(env)].filter(Boolean);
  return [formatDecisionEnvelope(env), "", ...extras].join("\n");
}

/** Full labeled contract consumed by TEXT / VISION / CHAT / DESK / CHART READ. */
export function formatUnifiedDecisionOutput(env: DecisionEnvelope, opts?: VisibleDecisionOpts): string {
  const evidence = sanitizeChartEvidence(opts?.chartEvidence || "");
  const wait = waitForLine(env);
  const header = [
    formatDecisionEnvelope(env),
    "",
    "MENTOR VIEW — what the market is doing (explanation, not the order)",
    `FACTS: ${env.layers.facts}`,
    `HTF: ${htfBiasMentorLine(env)}`,
    `TACTICAL: ${env.primaryHorizon.timeframe} ${env.primaryHorizon.lean}`,
    "CONCEPT EVIDENCE:",
    conceptEvidenceBlock(env),
    evidence ? `CHART EVIDENCE (screenshot — observations only, not a trade):\n${evidence}` : "",
    "",
    "TRADE DECISION — what I would actually trade, on which horizon, under what conditions",
    `STANCE: ${env.stance}`,
    `STANCE ROLE: ${stanceRoleLine(env.stance)}`,
    wait,
    `EXECUTION: ${env.logicOrder.execution}`,
    `TARGET: ${env.read.target}`,
    `INVALIDATION: ${env.invalidation.condition}`,
    `CONFIDENCE: ${env.confidence}`,
    `THESIS: what=${env.thesis.what || "unanswered"} | whyNow=${env.thesis.whyNow || "unanswered"} | timeframe=${env.thesis.timeframe || "unanswered"} | toward=${env.thesis.toward || "unanswered"} | fromWhere=${env.thesis.fromWhere || "unanswered"} | invalidates=${env.thesis.invalidates || "unanswered"} | complete=${env.thesis.complete ? "yes" : "no"}`,
    "",
    ...conflictPresentation(env),
  ];
  return header.filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n");
}

function spokenSafe(text: string): string {
  return String(text || "").replace(/(\d+)\.(\d+)\b/g, "$1");
}

function formatMentorTradeSpokenLabeled(env: DecisionEnvelope, opts?: VisibleDecisionOpts): string {
  const wait = spokenSafe(waitForLine(env));
  const conflict = env.conflictLog.disagree
    ? `conflict yes — ${env.conflictLog.htfHorizon} ${env.conflictLog.htfLean} vs ${env.conflictLog.tacticalHorizon} ${env.conflictLog.tacticalLean}; neither auto-overrides`
    : "conflict no";
  const evidence = sanitizeChartEvidence(opts?.chartEvidence || "");
  const decision =
    `TRADE DECISION: ${stanceRoleLine(env.stance)} on the ${env.primaryHorizon.timeframe}` +
    `${wait ? `; ${wait}` : `; execution ${spokenSafe(env.logicOrder.execution)}`}.`;
  const mentor =
    `MENTOR VIEW: HTF context is ${env.read.htfContext.horizon} ${env.read.htfContext.lean}; current structure on the ${env.read.currentStructure.horizon} is ${env.read.currentStructure.lean}; ${conflict}` +
    `${evidence ? `; chart evidence ${evidence.replace(/\n/g, " ").slice(0, 60)}` : ""}.`;
  return spokenSafe(`${decision} ${mentor}`.replace(/\s+/g, " ").trim());
}

function formatMentorTradeSpokenPlain(env: DecisionEnvelope, opts?: VisibleDecisionOpts): string {
  const stanceWord = stanceSpokenWord(env.stance);
  const because = spokenSafe(whyBecause(env));
  const wait = waitTriggerText(env);
  const inv = String(env.invalidation.condition || "").trim();
  const conflict = env.conflictLog.disagree
    ? `Higher-timeframe ${env.conflictLog.htfHorizon} ${env.conflictLog.htfLean} conflicts with ${env.conflictLog.tacticalHorizon} ${env.conflictLog.tacticalLean}; neither auto-overrides.`
    : "";
  const evidence = sanitizeChartEvidence(opts?.chartEvidence || "");
  return spokenSafe(
    renderStanceReply(
      {
        stanceWord,
        because,
        htfHorizon: env.read.htfContext.horizon,
        htfLean: env.read.htfContext.lean,
        structureHorizon: env.read.currentStructure.horizon,
        structureLean: env.read.currentStructure.lean,
        conflict: conflict || undefined,
        waitTrigger:
          wait && (env.stance === "wait" || env.stance === "flat" || env.stance === "monitor")
            ? spokenSafe(wait)
            : undefined,
        invalidation: inv ? spokenSafe(inv) : undefined,
        evidence: evidence
          ? spokenSafe(evidence.replace(/\n/g, " ").slice(0, 60))
          : undefined,
        uncertainty: uncertaintyClause(env) || undefined,
      },
      opts?.render
    )
  );
}

/**
 * Spoken / mentor utterance.
 * mode structured (default): labeled TRADE DECISION / MENTOR VIEW.
 * mode plain: concise first-person English for normal chat/voice.
 */
export function formatMentorTradeSpoken(env: DecisionEnvelope, opts?: VisibleDecisionOpts): string {
  if (presentationMode(opts) === "plain") {
    return formatMentorTradeSpokenPlain(env, opts);
  }
  return formatMentorTradeSpokenLabeled(env, opts);
}

export type QualityGateSpokenInput = {
  waitReason?: string | null;
  missing?: string[];
  envelopeText?: string;
  decisionEnvelope?: DecisionEnvelope | null;
};

/**
 * User-facing quality-gate WAIT reply.
 * plain: natural explanation of missing data — does NOT dump CONTEXT / CURRENT STRUCTURE labels.
 * structured: legacy waitReason + envelopeText dump (debug).
 */
export function formatQualityGateSpokenReply(
  gate: QualityGateSpokenInput,
  opts?: PresentationOpts
): string {
  const missing = (gate.missing || []).filter(Boolean).slice(0, 4);
  const rawReason = String(gate.waitReason || "").trim();
  const reasonBody = rawReason.replace(/^WAIT\s*[—\-:]\s*/i, "").trim() || missing.join("; ");

  if (presentationMode(opts) === "structured") {
    return [rawReason || (reasonBody ? `WAIT — ${reasonBody}` : "WAIT — data incomplete"), gate.envelopeText]
      .filter(Boolean)
      .join("\n\n");
  }

  const env = gate.decisionEnvelope;
  return renderQualityGateWait(
    {
      reasonBody,
      lastWhy: env ? String(env.thesis.whyNow || "").trim() || undefined : undefined,
      invalidation: env ? String(env.invalidation.condition || "").trim() || undefined : undefined,
      uncertainty: env ? uncertaintyClause(env) || undefined : undefined,
    },
    opts?.render
  );
}

export function explainBullishEvidenceWithoutConverting(
  env: DecisionEnvelope,
  opts?: PresentationOpts
): string {
  const bullishBits: string[] = [];
  if (env.htfContext.lean === "bullish") {
    bullishBits.push(`${env.htfContext.timeframe} context is bullish`);
  }
  if (env.primaryHorizon.lean === "bullish") {
    bullishBits.push(`${env.primaryHorizon.timeframe} structure is bullish`);
  }
  for (const item of env.reasoningChain) {
    if (item.detected && /bullish|long|buy-side taken|sell-side/i.test(item.impact)) {
      bullishBits.push(`${item.concept} ${item.outcome === "uncertain" ? "UNPROVEN" : "detected"} (${item.role})`);
    }
  }
  const evidence =
    bullishBits.slice(0, 4).join("; ") || "directional structure exists on a named horizon";

  if (presentationMode(opts) === "plain") {
    const wait = waitTriggerText(env);
    return [
      `Bullish evidence: ${evidence}. That is what the market is doing — not a long.`,
      `I'm ${stanceSpokenWord(env.stance)} because ${whyBecause(env)}.`,
      wait ? `I'm waiting for ${wait}.` : "",
      env.invalidation.condition
        ? `This view is invalidated if ${env.invalidation.condition}.`
        : "",
      uncertaintyClause(env),
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return [
    "MENTOR VIEW:",
    `Bullish evidence: ${evidence}. That is what the market is doing — not a long.`,
    "TRADE DECISION:",
    `${stanceRoleLine(env.stance)}.`,
    waitForLine(env),
    `Execution: ${env.logicOrder.execution}.`,
    `Invalidation: ${env.invalidation.condition}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function unavailableDecisionText(): string {
  return [
    "MENTOR VIEW: structured market facts are not attached to this path.",
    `TRADE DECISION: ${NO_DECISION_LABEL} / ${UNAVAILABLE_VERDICT}.`,
    "Stance is not inferred from prose. I will not call long or short from unlabeled text.",
  ].join(" ");
}

export function safeDecisionResponse(env: DecisionEnvelope | null | undefined, opts?: VisibleDecisionOpts): string {
  if (!env) return unavailableDecisionText();
  return formatUnifiedDecisionOutput(env, opts);
}

function contradictsStructuredStance(text: string, env: DecisionEnvelope): string[] {
  const errors: string[] = [];
  const t = text;
  if (env.stance === "flat" || env.stance === "wait" || env.stance === "monitor") {
    for (const re of DECISION_CONVERTING) {
      if (re.test(t)) {
        errors.push(`visible text converts ${env.stance} into a directional trade (${re.source})`);
      }
    }
    if (/\bTRADE DIRECTION:\s*(LONG|SHORT)\b/i.test(t) && env.read.tradeDirection === "NONE") {
      errors.push("visible TRADE DIRECTION contradicts structured NONE");
    }
    if (/\bSTANCE:\s*(long|short)\b/i.test(t)) {
      errors.push(`visible STANCE contradicts structured ${env.stance}`);
    }
  }
  if (env.stance === "wait" && VAGUE_WAIT.test(t) && !/WAIT FOR:/i.test(t) && !/\bI(?:'m| am) waiting for\b/i.test(t)) {
    errors.push("WAIT without named WAIT FOR condition");
  }
  if (env.stance === "wait" && /WAIT FOR:\s*(entry\.?|entry zone)\s*$/im.test(t)) {
    errors.push("WAIT FOR: entry is too vague");
  }
  return errors;
}

function missingMentorDecisionLabels(text: string): string[] {
  const body = String(text || "");
  // Plain-English user replies (no MENTOR VIEW / TRADE DECISION labels).
  if (/\bI(?:'m| am)\s+(WAITING|LONG|SHORT|NO_TRADE)\b/i.test(body)) return [];
  if (/\bso I(?:'m| am)\s+(WAITING|LONG|SHORT|NO_TRADE)\b/i.test(body)) return [];
  if (/\bI(?:'m| am)\s+not\s+(long|short)\b/i.test(body)) return [];
  if (/\bI(?:'m| am)\s+waiting for\b/i.test(body)) return [];
  if (/\bUntil then I(?:'m| am)\s+(WAITING|LONG|SHORT|NO_TRADE)\b/i.test(body)) return [];
  if (/\bThis view is invalidated if\b/i.test(body)) return [];
  if (/\bStance stays (WAITING|LONG|SHORT|NO_TRADE)\b/i.test(body)) return [];
  const s = body.toUpperCase();
  const hasMentor = s.includes("MENTOR VIEW");
  const hasTrade = s.includes("TRADE DECISION") || s.includes("OVERALL STANCE") || s.includes("STANCE:");
  if (hasMentor && hasTrade) return [];
  if (hasTrade && (s.includes("HTF CONTEXT") || s.includes("CURRENT STRUCTURE"))) return [];
  return ["missing MENTOR VIEW vs TRADE DECISION separation"];
}

/** Runtime checks on visible LLM / spoken / panel text against structured SoT. */
export function validateVisibleDecisionText(text: string, env?: DecisionEnvelope | null): string[] {
  const errors: string[] = [];
  const body = String(text || "").trim();
  if (!body) {
    errors.push("empty visible decision text");
    return errors;
  }
  errors.push(...unlabeledDirectionalLeans(body));
  errors.push(...missingMentorDecisionLabels(body));
  if (env) {
    errors.push(...assertNoLeanWithoutWhy(env, body));
    errors.push(...contradictsStructuredStance(body, env));
    const formatted = formatDecisionEnvelope(env);
    if (!isTopDownReadable(formatted)) {
      errors.push("structured envelope is not top-down readable");
    }
  }
  return errors;
}

export type EnforcedDecision = {
  text: string;
  replaced: boolean;
  errors: string[];
};

/**
 * On validation fail: do not silently show the invalid answer.
 * Downgrade to the deterministic contract (or UNAVAILABLE).
 */
export function enforceVisibleDecisionContract(
  text: string,
  env?: DecisionEnvelope | null,
  opts?: VisibleDecisionOpts
): EnforcedDecision {
  const errors = validateVisibleDecisionText(text, env);
  if (errors.length === 0) {
    return { text, replaced: false, errors };
  }
  return {
    text: safeDecisionResponse(env, opts),
    replaced: true,
    errors,
  };
}

export function uiVerdictFromStance(stance: DecisionStance | string | undefined): string {
  const s = String(stance || "").toLowerCase();
  if (s === "long") return "LONG";
  if (s === "short") return "SHORT";
  if (s === "wait") return "WAIT";
  if (s === "flat" || s === "monitor") return "NO_TRADE";
  return UNAVAILABLE_VERDICT;
}
