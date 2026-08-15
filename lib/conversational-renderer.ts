/**
 * Conversational renderer — vary language, never vary truth.
 *
 * Architecture:
 *   1) deterministic semantic result (caller)
 *   2) response rendering (this module)
 *   3) recent-response / repetition memory (response-repetition-memory)
 *
 * No OpenAI for wording. DecisionEnvelope truth is never mutated here.
 */

import {
  openingFingerprint as memoryOpeningFingerprint,
  pickDiverseIndex,
  rememberResponse,
  resetResponseRepetitionMemory,
  type ConversationTurn,
  type ResponseFamily,
} from "./response-repetition-memory";

export type RenderFamily =
  | "stance"
  | "wait_followup"
  | "why_not"
  | "invalidation"
  | "quality_gate"
  | "history_composite"
  | "history_recorded_only"
  | "history_actionable"
  | "history_previous_setup"
  | "history_setup_outcome"
  | "levels"
  | "price"
  | "data_quality"
  | "market_closed"
  | "ack"
  | "general_chat";

export type RenderOpts = {
  /** Explicit variant index for tests; omit for runtime variety. */
  variant?: number;
  /** Opening fingerprints to avoid (cross-turn diversity). */
  avoidOpenings?: string[];
  /** When true, do not push into repetition memory (isolated unit checks). */
  silent?: boolean;
  /** Chat turns for cheap continuity (preferred over inventing new stores). */
  messages?: ConversationTurn[];
  /** Memory family override. */
  family?: ResponseFamily;
};

/** Flagged stock openings — prefer not to reuse across consecutive turns. */
export const FLAGGED_OPENING_FPS = new Set([
  "im_waiting",
  "right_now",
  "at_the_moment",
  "looks_like",
]);

export function resetConversationalRendererState(_seq = 0): void {
  resetResponseRepetitionMemory();
}

export function getRecentOpeningFingerprints(): string[] {
  return [];
}

export function openingFingerprint(text: string): string {
  return memoryOpeningFingerprint(text);
}

function familyFor(opts?: RenderOpts, fallback: ResponseFamily = "general"): ResponseFamily {
  return opts?.family || fallback;
}

function preferDiverseIndex(
  candidates: Array<{ text: string } | string>,
  opts?: RenderOpts,
  family: ResponseFamily = "general"
): number {
  const texts = candidates.map((c) => (typeof c === "string" ? c : c.text));
  return pickDiverseIndex({
    count: texts.length,
    fingerprints: texts,
    openings: texts.map((t) => openingFingerprint(t)),
    family: familyFor(opts, family),
    messages: opts?.messages,
    variant: opts?.variant,
  });
}

function finalize(
  text: string,
  opts?: RenderOpts,
  family: ResponseFamily = "general"
): string {
  const out = text.replace(/\s+/g, " ").trim();
  if (!opts?.silent) {
    rememberResponse(familyFor(opts, family), out);
  }
  return out;
}

function joinParts(parts: Array<string | null | undefined | false>): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function capFirst(s: string): string {
  const t = String(s || "").trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Stance / market read ───────────────────────────────────────────────

export type StanceSemantic = {
  stanceWord: "WAITING" | "LONG" | "SHORT" | "NO_TRADE";
  because: string;
  htfHorizon: string;
  htfLean: string;
  structureHorizon: string;
  structureLean: string;
  conflict?: string;
  waitTrigger?: string;
  invalidation?: string;
  evidence?: string;
  uncertainty?: string;
};

function stanceLockedTail(s: StanceSemantic): string[] {
  const wait = String(s.waitTrigger || "").trim();
  return [
    s.conflict || "",
    wait && (s.stanceWord === "WAITING" || s.stanceWord === "NO_TRADE")
      ? `Trigger on file: ${wait}.`
      : "",
    s.invalidation ? `This view is invalidated if ${s.invalidation}.` : "",
    s.evidence ? `Chart evidence: ${s.evidence}.` : "",
    s.uncertainty || "",
  ].filter(Boolean);
}

export function renderStanceReply(s: StanceSemantic, opts?: RenderOpts): string {
  const because = String(s.because || "").trim();
  const wait = String(s.waitTrigger || "").trim();
  const tail = stanceLockedTail(s);
  const structures: string[] = [
    joinParts([
      `I'm ${s.stanceWord} because ${because}.`,
      `Higher-timeframe context is ${s.htfHorizon} ${s.htfLean}; current structure on the ${s.structureHorizon} is ${s.structureLean}.`,
      ...tail,
    ]),
    joinParts([
      `${capFirst(because)} — so I'm ${s.stanceWord}.`,
      `On the ${s.structureHorizon}, structure is ${s.structureLean}; higher-timeframe ${s.htfHorizon} is ${s.htfLean}.`,
      ...tail,
    ]),
    joinParts([
      `On the ${s.structureHorizon} structure is ${s.structureLean}; higher-timeframe ${s.htfHorizon} is ${s.htfLean}.`,
      `I'm ${s.stanceWord} because ${because}.`,
      ...tail,
    ]),
    joinParts([
      `I'm ${s.stanceWord}. ${capFirst(because)}.`,
      `HTF ${s.htfHorizon} ${s.htfLean}; ${s.structureHorizon} structure ${s.structureLean}.`,
      ...tail,
    ]),
  ];

  if (wait && (s.stanceWord === "WAITING" || s.stanceWord === "NO_TRADE")) {
    structures.push(
      joinParts([
        `No order yet — need ${wait}.`,
        `I'm ${s.stanceWord} because ${because}.`,
        `Higher-timeframe context is ${s.htfHorizon} ${s.htfLean}; current structure on the ${s.structureHorizon} is ${s.structureLean}.`,
        ...tail,
      ])
    );
  }

  const idx = preferDiverseIndex(structures, opts, "stance");
  return finalize(structures[idx] || structures[0]!, opts, "stance");
}

// ── Wait / monitor follow-up ───────────────────────────────────────────

export type WaitFollowUpSemantic = {
  stanceWord: "WAITING" | "LONG" | "SHORT" | "NO_TRADE";
  waitingFor?: string;
  because?: string;
  missing?: string[];
  longSide?: string;
  shortSide?: string;
  invalidation?: string;
  uncertainty?: string;
};

export function renderWaitFollowUp(s: WaitFollowUpSemantic, opts?: RenderOpts): string {
  const missing = (s.missing || []).filter(Boolean);
  const wait = String(s.waitingFor || "").trim();
  const because = String(s.because || "").trim();
  const inv = String(s.invalidation || "").trim();

  const structures: string[] = [];

  if (missing.length) {
    structures.push(
      joinParts([
        `I'm ${s.stanceWord} because the wait condition is under-specified — missing: ${missing.join(", ")}.`,
        wait ? `Still keyed to ${wait}.` : "",
        inv ? `This view is invalidated if ${inv}.` : "",
        `Until then I'm ${s.stanceWord}.`,
        s.uncertainty || "",
      ]),
      joinParts([
        `Can't sharpen the wait yet — missing: ${missing.join(", ")}.`,
        `I'm ${s.stanceWord}${because ? ` because ${because}` : ""}.`,
        wait ? `Named trigger on file: ${wait}.` : "",
        inv ? `This view is invalidated if ${inv}.` : "",
        `Until then I'm ${s.stanceWord}.`,
        s.uncertainty || "",
      ])
    );
  } else {
    structures.push(
      joinParts([
        wait ? `I'm keyed to ${wait}.` : `I'm ${s.stanceWord} because ${because}.`,
        s.longSide && s.longSide !== "not in structured decision" ? `Long is ${s.longSide}.` : "",
        s.shortSide && s.shortSide !== "not in structured decision"
          ? `Short is ${s.shortSide}.`
          : "",
        inv ? `This view is invalidated if ${inv}.` : "",
        `Until then I'm ${s.stanceWord}.`,
        s.uncertainty || "",
      ]),
      joinParts([
        wait
          ? `Holding off until ${wait}.`
          : `Stance stays ${s.stanceWord}${because ? ` — ${because}` : ""}.`,
        s.longSide && s.longSide !== "not in structured decision" ? `Long is ${s.longSide}.` : "",
        s.shortSide && s.shortSide !== "not in structured decision"
          ? `Short is ${s.shortSide}.`
          : "",
        inv ? `This view is invalidated if ${inv}.` : "",
        `Until then I'm ${s.stanceWord}.`,
        s.uncertainty || "",
      ]),
      joinParts([
        `Until then I'm ${s.stanceWord}.`,
        wait ? `Need ${wait}.` : because ? `Because ${because}.` : "",
        s.longSide && s.longSide !== "not in structured decision" ? `Long is ${s.longSide}.` : "",
        s.shortSide && s.shortSide !== "not in structured decision"
          ? `Short is ${s.shortSide}.`
          : "",
        inv ? `This view is invalidated if ${inv}.` : "",
        s.uncertainty || "",
      ]),
      joinParts([
        wait ? `Trigger first: ${wait}.` : `I'm ${s.stanceWord} because ${because}.`,
        `I'm ${s.stanceWord} for now.`,
        s.longSide && s.longSide !== "not in structured decision" ? `Long is ${s.longSide}.` : "",
        s.shortSide && s.shortSide !== "not in structured decision"
          ? `Short is ${s.shortSide}.`
          : "",
        inv ? `This view is invalidated if ${inv}.` : "",
        s.uncertainty || "",
      ])
    );
  }

  const idx = preferDiverseIndex(structures, opts, "wait_followup");
  return finalize(structures[idx] || structures[0]!, opts, "wait_followup");
}

// ── Why-not / invalidation / quality-gate ──────────────────────────────

export type WhyNotSemantic = {
  direction: "long" | "short";
  rejected: string;
  conflict?: string;
  waitTrigger?: string;
  stanceWord: "WAITING" | "LONG" | "SHORT" | "NO_TRADE";
  uncertainty?: string;
};

export function renderWhyNot(s: WhyNotSemantic, opts?: RenderOpts): string {
  const structures = [
    joinParts([
      `I'm not ${s.direction} because ${s.rejected}.`,
      s.conflict || "",
      s.waitTrigger ? `Still need ${s.waitTrigger}.` : "",
      `Until then I'm ${s.stanceWord}.`,
      s.uncertainty || "",
    ]),
    joinParts([
      `${capFirst(s.rejected)} — that's why I'm not ${s.direction}.`,
      s.conflict || "",
      s.waitTrigger ? `Holding for ${s.waitTrigger}.` : "",
      `Until then I'm ${s.stanceWord}.`,
      s.uncertainty || "",
    ]),
    joinParts([
      `Until then I'm ${s.stanceWord}.`,
      `Not ${s.direction}: ${s.rejected}.`,
      s.conflict || "",
      s.waitTrigger ? `Trigger on file: ${s.waitTrigger}.` : "",
      s.uncertainty || "",
    ]),
    joinParts([
      `No ${s.direction} from here — ${s.rejected}.`,
      s.conflict || "",
      s.waitTrigger ? `Need ${s.waitTrigger} first.` : "",
      `Until then I'm ${s.stanceWord}.`,
      s.uncertainty || "",
    ]),
  ];
  const idx = preferDiverseIndex(structures, opts, "why_not");
  return finalize(structures[idx]!, opts, "why_not");
}

export type InvalidationSemantic = {
  missing?: string[];
  invalidation?: string;
  thesisInvalidates?: string;
  conflict?: string;
  stanceWord: "WAITING" | "LONG" | "SHORT" | "NO_TRADE";
  because: string;
  uncertainty?: string;
};

export function renderInvalidation(s: InvalidationSemantic, opts?: RenderOpts): string {
  const missing = (s.missing || []).filter(Boolean);
  if (missing.length) {
    const structures = [
      joinParts([
        `This view's invalidation is under-specified — missing: ${missing.join(", ")}.`,
        s.conflict || "",
        `I'm ${s.stanceWord} because ${s.because}.`,
      ]),
      joinParts([
        `Invalidation isn't fully specified yet (missing: ${missing.join(", ")}).`,
        s.conflict || "",
        `I'm ${s.stanceWord} because ${s.because}.`,
      ]),
    ];
    const idx = preferDiverseIndex(structures, opts, "invalidation");
    return finalize(structures[idx]!, opts, "invalidation");
  }
  const inv = String(s.invalidation || "").trim();
  const structures = [
    joinParts([
      inv ? `This view is invalidated if ${inv}.` : "",
      s.thesisInvalidates ? `Thesis also invalidates if ${s.thesisInvalidates}.` : "",
      s.conflict || "",
      `I'm ${s.stanceWord} because ${s.because}.`,
      s.uncertainty || "",
    ]),
    joinParts([
      `I'm ${s.stanceWord} because ${s.because}.`,
      inv ? `Kill the idea if ${inv}.` : "",
      s.thesisInvalidates ? `Thesis also invalidates if ${s.thesisInvalidates}.` : "",
      s.conflict || "",
      s.uncertainty || "",
    ]),
    joinParts([
      inv ? `Invalidation line: ${inv}.` : "",
      `I'm ${s.stanceWord} because ${s.because}.`,
      s.thesisInvalidates ? `Thesis also invalidates if ${s.thesisInvalidates}.` : "",
      s.conflict || "",
      s.uncertainty || "",
    ]),
  ];
  const idx = preferDiverseIndex(structures, opts, "invalidation");
  return finalize(structures[idx]!, opts, "invalidation");
}

export type QualityGateSemantic = {
  reasonBody: string;
  lastWhy?: string;
  invalidation?: string;
  uncertainty?: string;
};

export function renderQualityGateWait(s: QualityGateSemantic, opts?: RenderOpts): string {
  const reason =
    String(s.reasonBody || "").trim() || "required market observations are incomplete";
  const structures = [
    joinParts([
      `I'm WAITING because ${reason}.`,
      "I won't call a long or short until those observations are confirmed.",
      s.lastWhy ? `Last structured why-now: ${s.lastWhy}.` : "",
      s.invalidation ? `This view is invalidated if ${s.invalidation}.` : "",
      s.uncertainty || "",
    ]),
    joinParts([
      `Observations aren't complete enough yet — ${reason}.`,
      `I'm WAITING; no long or short until that's confirmed.`,
      s.lastWhy ? `Last structured why-now: ${s.lastWhy}.` : "",
      s.invalidation ? `This view is invalidated if ${s.invalidation}.` : "",
      s.uncertainty || "",
    ]),
    joinParts([
      `Holding the call: ${reason}.`,
      `I'm WAITING and I won't invent a long or short around missing confirmation.`,
      s.lastWhy ? `Last structured why-now: ${s.lastWhy}.` : "",
      s.invalidation ? `This view is invalidated if ${s.invalidation}.` : "",
      s.uncertainty || "",
    ]),
  ];
  const idx = preferDiverseIndex(structures, opts, "quality_gate");
  return finalize(structures[idx]!, opts, "quality_gate");
}

// ── History leads (facts locked in body) ───────────────────────────────

export function renderHistoryCompositeLead(
  recordedStatus: string,
  actionableStatus: string,
  actionableAsOfEst: string,
  opts?: RenderOpts
): string {
  const structures = [
    `My latest recorded stance is ${recordedStatus}. My last actionable decision was ${actionableStatus} at ${actionableAsOfEst} ET.`,
    `Latest on record: ${recordedStatus}. Last actionable call was ${actionableStatus} at ${actionableAsOfEst} ET.`,
    `Recorded stance sits at ${recordedStatus}; last actionable was ${actionableStatus} at ${actionableAsOfEst} ET.`,
    `On the tape: recorded ${recordedStatus}, with the last actionable ${actionableStatus} at ${actionableAsOfEst} ET.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "history");
  return finalize(structures[idx]!, opts, "history");
}

export function renderHistoryRecordedOnlyLead(
  recordedStatus: string,
  opts?: RenderOpts
): string {
  const structures = [
    `My latest recorded stance is ${recordedStatus}. No LONG or SHORT decision has been recorded.`,
    `Latest on record is ${recordedStatus} — no actionable LONG or SHORT in history.`,
    `Recorded stance: ${recordedStatus}. I don't have a LONG or SHORT decision on file.`,
    `What's recorded is ${recordedStatus}; nothing directional (LONG/SHORT) sits behind it.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "history");
  return finalize(structures[idx]!, opts, "history");
}

export function renderHistoryActionableLead(
  status: string,
  asOfEst: string,
  opts?: RenderOpts
): string {
  const structures = [
    `My last ${status} was at ${asOfEst} ET.`,
    `Last actionable ${status} prints at ${asOfEst} ET.`,
    `Most recent ${status} on record: ${asOfEst} ET.`,
    `I was last ${status} at ${asOfEst} ET.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "history");
  return finalize(structures[idx]!, opts, "history");
}

export function renderPreviousSetupLead(
  status: string,
  asOfEst: string,
  opts?: RenderOpts
): string {
  const structures = [
    `Previous setup: ${status} at ${asOfEst} ET.`,
    `Prior setup on file was ${status} at ${asOfEst} ET.`,
    `Last setup I had: ${status} @ ${asOfEst} ET.`,
    `The previous setup was ${status}, timestamped ${asOfEst} ET.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "history");
  return finalize(structures[idx]!, opts, "history");
}

export function renderSetupOutcomeStillLatest(
  status: string,
  asOfEst: string,
  opts?: RenderOpts
): string {
  const structures = [
    `My last actionable setup (${status} at ${asOfEst} ET) is still the latest recorded decision.`,
    `That ${status} from ${asOfEst} ET is still the newest envelope on record.`,
    `Nothing later has superseded the ${status} setup from ${asOfEst} ET.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "history");
  return finalize(structures[idx]!, opts, "history");
}

export function renderSetupOutcomeSuperseded(
  actStatus: string,
  actAsOfEst: string,
  laterStatus: string,
  laterAsOfEst: string,
  opts?: RenderOpts
): string {
  const structures = [
    `My last actionable setup was ${actStatus} at ${actAsOfEst} ET. It was later superseded by a recorded ${laterStatus} at ${laterAsOfEst} ET.`,
    `After the ${actStatus} at ${actAsOfEst} ET, history shows a later ${laterStatus} at ${laterAsOfEst} ET.`,
    `The ${actStatus} from ${actAsOfEst} ET got superseded — next recorded stance was ${laterStatus} at ${laterAsOfEst} ET.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "history");
  return finalize(structures[idx]!, opts, "history");
}

// ── Levels / price / data quality / closed ─────────────────────────────

export function renderLevelLine(
  kind: "pdh" | "pdl" | "support" | "resistance" | "session_high" | "session_low",
  price: string,
  label?: string,
  opts?: RenderOpts
): string {
  const structures: string[] = [];
  if (kind === "pdh") {
    structures.push(
      `Previous day high is ${price}.`,
      `PDH sits at ${price}.`,
      `Prior-day high: ${price}.`,
      `High from the previous day is ${price}.`
    );
  } else if (kind === "pdl") {
    structures.push(
      `Previous day low is ${price}.`,
      `PDL sits at ${price}.`,
      `Prior-day low: ${price}.`,
      `Low from the previous day is ${price}.`
    );
  } else if (kind === "support") {
    const name = label || "support";
    structures.push(
      `Nearest support is ${name} at ${price}.`,
      `Closest support: ${name} @ ${price}.`,
      `Support underneath is ${name} at ${price}.`
    );
  } else if (kind === "resistance") {
    const name = label || "resistance";
    structures.push(
      `Nearest resistance is ${name} at ${price}.`,
      `Closest resistance: ${name} @ ${price}.`,
      `Resistance overhead is ${name} at ${price}.`
    );
  } else if (kind === "session_high") {
    structures.push(
      `New York regular trading hours high is ${price}.`,
      `NY RTH high prints at ${price}.`,
      `Session high (NY RTH) is ${price}.`
    );
  } else {
    structures.push(
      `New York regular trading hours low is ${price}.`,
      `NY RTH low prints at ${price}.`,
      `Session low (NY RTH) is ${price}.`
    );
  }
  const idx = preferDiverseIndex(structures, opts, "levels");
  return finalize(structures[idx]!, opts, "levels");
}

export function renderPriceLine(price: string, opts?: RenderOpts): string {
  const structures = [
    `We're trading at ${price} on Nasdaq futures.`,
    `Nasdaq futures last around ${price}.`,
    `Price on the desk: ${price} (Nasdaq futures).`,
    `MNQ/NQ area is ${price}.`,
  ];
  const idx = preferDiverseIndex(structures, opts, "price");
  return finalize(structures[idx]!, opts, "price");
}

export function renderInsufficientData(
  detail?: string,
  opts?: RenderOpts
): string {
  const d = String(detail || "").trim();
  const structures = d
    ? [
        `I don't have enough information to say — ${d}.`,
        `Can't answer cleanly yet — ${d}.`,
        `That data isn't available: ${d}.`,
      ]
    : [
        "I don't have enough information to say — chart data is missing or not reliable enough right now.",
        "Chart data is missing or too unreliable to answer that.",
        "I won't guess — the market observations I need aren't solid enough.",
      ];
  const idx = preferDiverseIndex(structures, opts, "data_quality");
  return finalize(structures[idx]!, opts, "data_quality");
}

/**
 * Closed / holiday copy — must never read like a broken feed.
 */
export function renderMarketClosedLine(reason: string, opts?: RenderOpts): string {
  const r = String(reason || "").trim() || "Market closed";
  const lower = r.toLowerCase();
  const isHoliday = /holiday/.test(lower);
  const isWeekend = /weekend/.test(lower);
  const isMaint = /maintenance/.test(lower);

  let structures: string[];
  if (isHoliday) {
    structures = [
      r,
      `${r} — not a feed issue.`,
      `Globex is on holiday hours: ${r}.`,
    ];
  } else if (isWeekend) {
    structures = [
      r,
      `Weekend closure — ${r}.`,
      `CME Globex is shut for the weekend (${r}).`,
    ];
  } else if (isMaint) {
    structures = [
      r,
      `Daily maintenance window: ${r}.`,
      `Market paused for maintenance — ${r}.`,
    ];
  } else {
    structures = [r, `Session closed: ${r}.`, `Market isn't open right now — ${r}.`];
  }
  const idx = preferDiverseIndex(structures, opts, "market_closed");
  return finalize(structures[idx]!, opts, "market_closed");
}

export function renderAck(opts?: RenderOpts): string {
  const structures = [
    "Got it.",
    "Understood.",
    "Noted.",
    "Okay — with you.",
    "Copy that.",
    "Alright.",
  ];
  const idx = preferDiverseIndex(structures, opts, "ack");
  return finalize(structures[idx]!, opts, "ack");
}

/** Extract decimal/number tokens for semantic lock tests. */
export function extractFactTokens(text: string): string[] {
  const out = new Set<string>();
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  const s = String(text || "");
  while ((m = re.exec(s))) out.add(m[0].replace(/,/g, ""));
  return [...out].sort();
}

export function assertFactsPreserved(
  semanticLocked: string[],
  rendered: string
): string[] {
  const body = String(rendered || "");
  return semanticLocked.filter((f) => f && !body.includes(f));
}
