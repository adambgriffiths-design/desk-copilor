/**
 * QUALITY GATE DecisionEnvelope dedupe — focused regression.
 * Ensures the gate injects formatDecisionEnvelope once (via formatCanonicalEnvelopeForPrompt),
 * not formatUnifiedDecisionOutput's nested re-statement of FACTS/STANCE/THESIS/TARGET/INVALIDATION.
 *
 * Run: npm run test:quality-gate-envelope-dedupe
 */
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES, baseCtx, baseState } from "../lib/replay-fixtures";
import {
  evaluateAnalysisQualityGate,
  formatQualityGateForPrompt,
} from "../lib/analysis-quality-gate";
import {
  formatCanonicalEnvelopeForPrompt,
  formatUnifiedDecisionOutput,
  stanceRoleLine,
  waitForLine,
} from "../lib/decision-contract-output";
import {
  formatDecisionEnvelope,
  validateDecisionEnvelope,
  type DecisionEnvelope,
} from "../lib/decision-envelope";
import type { DeskMarketIntelligence } from "../lib/market-intelligence";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Optional export — clean shipset may omit latency cache helpers. */
function resetQualityGateCache(): void {
  try {
    const qg = require("../lib/analysis-quality-gate") as {
      resetQualityGateCache?: () => void;
    };
    qg.resetQualityGateCache?.();
  } catch {
    /* no-op */
  }
}

/** Optional — excluded from clean six-feature shipset; §7 skipped when absent. */
type HistUi = {
  buildHistoricalFixtureIntelligence: (opts: {
    fixtureId: string;
    barIndex: number;
  }) => { intel: DeskMarketIntelligence };
};
const histUi: HistUi | null = (() => {
  try {
    return require("../lib/research/replay/historical-ui") as HistUi;
  } catch {
    return null;
  }
})();
const buildHistoricalFixtureIntelligence = histUi?.buildHistoricalFixtureIntelligence;

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function countLabel(text: string, label: string): number {
  const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gim");
  return (text.match(re) || []).length;
}

function intelFromFixture(id: keyof typeof REPLAY_FIXTURES): DeskMarketIntelligence {
  const fx = REPLAY_FIXTURES[id];
  const pipe = runDeskPipeline(fx.ctx, fx.state);
  return {
    observation: pipe.observation,
    interpretation: pipe.interpretation,
    ctx: fx.ctx,
    state: fx.state,
    facts: [],
    eqhEqlRows: [],
    state_hash: pipe.state_hash,
    built_at: new Date().toISOString(),
  } as DeskMarketIntelligence;
}

function tok(chars: number): number {
  return Math.ceil(chars / 4);
}

console.log("\n=== QUALITY GATE envelope dedupe ===\n");

// --- Fixture wait envelope via quality gate ---
resetQualityGateCache();
const waitIntel = intelFromFixture("bullish-wait");
const waitGate = evaluateAnalysisQualityGate(waitIntel, "DEEP_ANALYSIS");
const waitEnv = waitGate.decisionEnvelope;
assert(Boolean(waitEnv), "bullish-wait gate has DecisionEnvelope");
if (!waitEnv) {
  console.error("abort: no wait envelope");
  process.exit(1);
}

const canonical = formatCanonicalEnvelopeForPrompt(waitEnv);
const structured = formatDecisionEnvelope(waitEnv);
const unified = formatUnifiedDecisionOutput(waitEnv);
const qg = formatQualityGateForPrompt(waitGate);
const qgBefore = formatQualityGateForPrompt({ ...waitGate, envelopeText: unified });

// 1) DecisionEnvelope appears exactly once in QUALITY GATE payload
assert(waitGate.envelopeText === canonical, "gate.envelopeText is canonical formatter output");
assert(qg.includes(structured), "QUALITY GATE contains full formatDecisionEnvelope");
assert(countLabel(qg, "REASONING CHAIN:") === 1, "REASONING CHAIN appears exactly once in QUALITY GATE");
assert(countLabel(qg, "HTF CONTEXT:") === 1, "HTF CONTEXT appears exactly once in QUALITY GATE");
// Case-sensitive: instructions mention "OVERALL STANCE" in prose; envelope uses the labeled line once.
assert(
  (qg.match(/^OVERALL STANCE:/gm) || []).length === 1,
  "OVERALL STANCE: labeled line appears exactly once in QUALITY GATE"
);
assert(countLabel(qg, "FACTS:") === 1, "FACTS appears exactly once (no MENTOR re-statement)");
assert(countLabel(qg, "STANCE:") === 1, "STANCE appears exactly once (no TRADE DECISION re-statement)");
assert(
  !/MENTOR VIEW — what the market is doing/i.test(qg),
  "QUALITY GATE omits unified MENTOR VIEW wrapper"
);
assert(
  !/TRADE DECISION — what I would actually trade/i.test(qg),
  "QUALITY GATE omits unified TRADE DECISION wrapper"
);
assert(!/^CONCEPT EVIDENCE:/im.test(qg), "QUALITY GATE omits CONCEPT EVIDENCE re-summary of chain");

// 2) Canonical envelope content unchanged
assert(canonical.startsWith(structured), "canonical starts with exact formatDecisionEnvelope");
const extras = [`STANCE ROLE: ${stanceRoleLine(waitEnv.stance)}`, waitForLine(waitEnv)].filter(Boolean);
assert(
  canonical === [structured, "", ...extras].join("\n"),
  "canonical = structured + blank line + STANCE ROLE + WAIT FOR only"
);
assert(structured.includes(`STANCE: ${waitEnv.stance}`), "structured preserves stance");
assert(
  Boolean(waitEnv.thesis.whyNow) && structured.includes(`whyNow=${waitEnv.thesis.whyNow}`),
  "original whyNow preserved in canonical structured envelope"
);

// 3) Validation still passes
const verr = validateDecisionEnvelope(waitEnv);
assert(verr.length === 0, `validateDecisionEnvelope passes (${verr.join("; ") || "0 errors"})`);

// 4) QUALITY GATE instructions preserved
assert(/QUALITY GATE \(mandatory for trading verdicts\):/.test(qg), "QUALITY GATE header present");
assert(/Copy the DECISION ENVELOPE below/i.test(qg), "envelope copy instruction present");
assert(/MENTOR VIEW.*TRADE DECISION/i.test(qg), "mentor vs trade instruction present");
assert(/WAIT FOR:/i.test(qg), "WAIT FOR instruction present");
assert(/Never unlabeled bullish\/bearish/i.test(qg), "unlabeled lean rule present");
assert(/source of truth/i.test(qg), "envelope source-of-truth line present");

// 5) WAIT / FLAT unchanged
assert(waitEnv.stance === "wait", "WAIT fixture stance unchanged (wait)");
assert(/^WAIT FOR:/m.test(canonical), "WAIT FOR line present for wait stance");
assert(qg.includes(`STANCE: wait`), "QUALITY GATE STANCE is wait");

resetQualityGateCache();
const conflictBase = baseCtx();
const conflictPipe = runDeskPipeline(
  baseCtx({
    structureFacts: {
      ...conflictBase.structureFacts,
      mss: {
        direction: "bearish",
        level: 25080,
        at: "10:05",
        atTime: 1700000000,
        description: "Bearish market structure shift",
      },
      liquiditySweeps: [
        ...conflictBase.structureFacts.liquiditySweeps,
        {
          levelId: "pdh",
          label: "PDH",
          price: 25200,
          side: "buy_side",
          at: "10:12",
          atTime: 1700000000,
        },
        {
          levelId: "pdc",
          label: "PDC",
          price: 25000,
          side: "buy_side",
          at: "10:08",
          atTime: 1700000000,
        },
      ],
    },
  }),
  baseState({ stateHash: "qg-dedupe-htf-vs-primary-001" })
);
const conflictEnv = conflictPipe.analysis_contract!.decision!;
assert(
  conflictEnv.stance === "flat" || conflictEnv.stance === "wait" || conflictEnv.stance === "monitor",
  `FLAT/WAIT/MONITOR conflict stance unchanged (${conflictEnv.stance})`
);
const conflictCanon = formatCanonicalEnvelopeForPrompt(conflictEnv);
assert(
  conflictCanon.includes(`STANCE: ${conflictEnv.stance}`),
  "conflict canonical preserves non-directional stance"
);
assert(validateDecisionEnvelope(conflictEnv).length === 0, "conflict envelope still validates");

// 6) LONG / SHORT unchanged (formatter parity — stance text identical to formatDecisionEnvelope)
function withStance(env: DecisionEnvelope, stance: "long" | "short"): DecisionEnvelope {
  return {
    ...env,
    stance,
    read: {
      ...env.read,
      overallStance: stance,
      tradeDirection: stance === "long" ? "LONG" : "SHORT",
      tradeableOpportunity: stance === "long" ? "long_setup" : "short_setup",
    },
    thesis: {
      ...env.thesis,
      complete: true,
      what: stance === "long" ? "long continuation" : "short continuation",
      whyNow: env.thesis.whyNow || "synthetic whyNow for dedupe parity",
      timeframe: env.thesis.timeframe || "1m",
      toward: env.thesis.toward || "target",
      fromWhere: env.thesis.fromWhere || "25090",
      invalidates: env.thesis.invalidates || env.invalidation.condition,
    },
  };
}

const longEnv = withStance(waitEnv, "long");
const shortEnv = withStance(waitEnv, "short");
const longStruct = formatDecisionEnvelope(longEnv);
const shortStruct = formatDecisionEnvelope(shortEnv);
const longCanon = formatCanonicalEnvelopeForPrompt(longEnv);
const shortCanon = formatCanonicalEnvelopeForPrompt(shortEnv);
assert(longCanon.startsWith(longStruct), "LONG canonical preserves formatDecisionEnvelope exactly");
assert(shortCanon.startsWith(shortStruct), "SHORT canonical preserves formatDecisionEnvelope exactly");
assert(longCanon.includes("STANCE: long") && countLabel(longCanon, "STANCE:") === 1, "LONG STANCE once");
assert(shortCanon.includes("STANCE: short") && countLabel(shortCanon, "STANCE:") === 1, "SHORT STANCE once");
assert(longStruct.includes("whyNow="), "LONG whyNow still in structured envelope");
assert(shortStruct.includes("whyNow="), "SHORT whyNow still in structured envelope");

// 7) Historical fixture path — gate uses canonical, not unified
// Skipped when historical-ui is absent (clean six-feature shipset exclusion).
if (buildHistoricalFixtureIntelligence) {
  resetQualityGateCache();
  const hist = buildHistoricalFixtureIntelligence({ fixtureId: "synthetic-ny-am", barIndex: 50 });
  const histGate = evaluateAnalysisQualityGate(hist.intel, "DEEP_ANALYSIS");
  assert(Boolean(histGate.decisionEnvelope), "historical fixture gate has DecisionEnvelope");
  if (histGate.decisionEnvelope) {
    const histStruct = formatDecisionEnvelope(histGate.decisionEnvelope);
    const histQg = formatQualityGateForPrompt(histGate);
    assert(histGate.envelopeText === formatCanonicalEnvelopeForPrompt(histGate.decisionEnvelope), "historical envelopeText is canonical");
    assert(histQg.includes(histStruct), "historical QUALITY GATE includes structured envelope once");
    assert(countLabel(histQg, "REASONING CHAIN:") === 1, "historical REASONING CHAIN once");
    assert(!/MENTOR VIEW — what the market is doing/i.test(histQg), "historical QUALITY GATE has no unified mentor wrapper");
    assert(validateDecisionEnvelope(histGate.decisionEnvelope).length === 0, "historical envelope validates");
    assert(
      Boolean(histGate.decisionEnvelope.thesis.whyNow) &&
        histStruct.includes(`whyNow=${histGate.decisionEnvelope.thesis.whyNow}`),
      "historical whyNow preserved"
    );
  }
} else {
  console.log("  · skip §7 historical fixture (historical-ui not in shipset)");
}

// Token measurement (chars/4) — before = unified injection, after = canonical
const beforeChars = qgBefore.length;
const afterChars = qg.length;
const beforeTok = tok(beforeChars);
const afterTok = tok(afterChars);
const savedTok = beforeTok - afterTok;
console.log("\n--- token estimate (chars/4) ---");
console.log(`QUALITY GATE BEFORE (unified envelopeText): ${beforeChars} chars / ~${beforeTok} tok`);
console.log(`QUALITY GATE AFTER  (canonical envelopeText): ${afterChars} chars / ~${afterTok} tok`);
console.log(`SAVED: ~${savedTok} tok`);
console.log(`envelope unified: ${unified.length} chars / ~${tok(unified.length)} tok`);
console.log(`envelope canonical: ${canonical.length} chars / ~${tok(canonical.length)} tok`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

// Emit machine-readable summary for the impl report
console.log(
  "\nMEASUREMENT_JSON=" +
    JSON.stringify({
      tokens_before: beforeTok,
      tokens_after: afterTok,
      tokens_saved: savedTok,
      chars_before: beforeChars,
      chars_after: afterChars,
      envelope_unified_tok: tok(unified.length),
      envelope_canonical_tok: tok(canonical.length),
    })
);
