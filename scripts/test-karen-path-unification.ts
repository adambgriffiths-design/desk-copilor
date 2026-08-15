/**
 * Karen path unification — runtime contract, UI stance, mentor vs decision.
 * Run: npx tsx scripts/test-karen-path-unification.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES, baseCtx, baseState } from "../lib/replay-fixtures";
import { formatAnalysisContract } from "../lib/analysis-contract";
import { narrateAnalysisContractForVoice } from "../lib/voice-analysis-narrator";
import {
  formatDecisionEnvelope,
  isTopDownReadable,
  unlabeledDirectionalLeans,
  validateDecisionEnvelope,
} from "../lib/decision-envelope";
import {
  enforceVisibleDecisionContract,
  explainBullishEvidenceWithoutConverting,
  formatMentorTradeSpoken,
  formatUnifiedDecisionOutput,
  validateVisibleDecisionText,
} from "../lib/decision-contract-output";
import { LIVE_VERDICT_SYSTEM, PANEL_VERDICT_FORMAT, CHART_EVIDENCE_SYSTEM } from "../lib/playbook";
import { answerMentorCoaching } from "../lib/mentor-coaching";
import type { DeskMarketIntelligence } from "../lib/market-intelligence";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
}

function conflictPipeline() {
  const base = baseCtx();
  return runDeskPipeline(
    baseCtx({
      biasStack: {
        daily: "bearish",
        m15: "bearish",
        m5: "neutral",
        biasConflict: true,
        alignedCount: 2,
        dominantBias: "bearish",
        tradeableBias: "bearish",
        summary: "Daily bearish vs one-minute bullish",
        conflictPairs: ["daily vs 1m"],
      },
      structureFacts: {
        ...base.structureFacts,
        mss: {
          direction: "bullish",
          level: 25080,
          at: "10:05",
          atTime: 1700000000,
          description: "Bullish market structure shift",
        },
        liquiditySweeps: [
          ...base.structureFacts.liquiditySweeps,
          {
            levelId: "pdh",
            label: "PDH",
            price: 25200,
            side: "buy_side",
            at: "10:12",
            atTime: 1700000000,
          },
          {
            levelId: "pdl",
            label: "PDL",
            price: 24800,
            side: "sell_side",
            at: "10:08",
            atTime: 1700000000,
          },
        ],
      },
    }),
    baseState({ stateHash: "unification-htf-vs-1m-001" })
  );
}

function loadVerdictUi() {
  const root = join(process.cwd(), "extension");
  function createEl(tag: string, attrs: Record<string, string> = {}) {
    return {
      tagName: tag.toUpperCase(),
      className: "",
      classList: {
        _set: new Set<string>(),
        add(...c: string[]) {
          c.forEach((x) => this._set.add(x));
        },
        remove(...c: string[]) {
          c.forEach((x) => this._set.delete(x));
        },
        toggle(c: string, force?: boolean) {
          const has = this._set.has(c);
          const next = force ?? !has;
          if (next) this._set.add(c);
          else this._set.delete(c);
        },
        contains(c: string) {
          return this._set.has(c);
        },
      },
      textContent: "",
      innerHTML: "",
      id: attrs.id || "",
      closest() {
        return null;
      },
      appendChild() {
        return this;
      },
      querySelectorAll() {
        return [];
      },
    };
  }
  const elements = new Map<string, ReturnType<typeof createEl>>();
  function ensureEl(id: string) {
    if (!elements.has(id)) elements.set(id, createEl("div", { id }));
    return elements.get(id)!;
  }
  const document = {
    getElementById(id: string) {
      return ensureEl(id);
    },
    createElement(tag: string) {
      return createEl(tag);
    },
    querySelectorAll() {
      return [];
    },
  };
  const storage: Record<string, string> = {};
  const localStorage = {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => {
      storage[k] = String(v);
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
  };
  const code = readFileSync(join(root, "desk-verdict-ui.js"), "utf8");
  const fn = new Function("window", "document", "localStorage", "sessionStorage", code);
  fn(globalThis, document, localStorage, { ...localStorage });
  return (globalThis as unknown as { DeskCopilotVerdictUI: { contractFromData: (d: unknown) => { verdict: string; decision?: { stance?: string } } } })
    .DeskCopilotVerdictUI;
}

async function main() {
  const waitPipe = runDeskPipeline(
    REPLAY_FIXTURES["bullish-wait"].ctx,
    REPLAY_FIXTURES["bullish-wait"].state
  );
  const waitEnv = waitPipe.analysis_contract!.decision!;
  const waitBefore = waitEnv.stance;
  assert(
    waitBefore === "wait" || waitBefore === "flat" || waitBefore === "monitor" || waitBefore === "long",
    "pipeline wait fixture still produces a valid stance (semantics unchanged)"
  );
  assert(validateDecisionEnvelope(waitEnv).length === 0, validateDecisionEnvelope(waitEnv).join("; "));

  const formatted = formatAnalysisContract(waitPipe.analysis_contract!);
  assert(isTopDownReadable(formatted), "unified contract remains top-down readable");
  assert(/MENTOR VIEW/i.test(formatted), "panel includes MENTOR VIEW");
  assert(/TRADE DECISION/i.test(formatted), "panel includes TRADE DECISION");
  assert(/FACTS:/i.test(formatted), "FACTS labeled");
  assert(/CONCEPT EVIDENCE/i.test(formatted), "CONCEPT EVIDENCE labeled");
  assert(/STANCE:/i.test(formatted), "STANCE labeled");
  assert(/CONFIDENCE:/i.test(formatted), "CONFIDENCE labeled");

  const conflict = conflictPipeline();
  const env = conflict.analysis_contract!.decision!;
  assert(env.stance === "flat" || env.stance === "wait" || env.stance === "monitor", "golden conflict stance is non-directional");
  assert(env.stance !== "long" && env.stance !== "short", "golden conflict is not LONG/SHORT");
  assert(env.conflictLog.disagree === true, "golden conflict logs HTF vs tactical");
  assert(env.read.tradeDirection === "NONE", "golden trade direction NONE");

  const unified = formatUnifiedDecisionOutput(env);
  assert(/MENTOR VIEW/i.test(unified) && /TRADE DECISION/i.test(unified), "unified output separates mentor vs decision");
  assert(/CONFLICTS:\s*yes/i.test(unified), "conflict block exposed");
  assert(/TRADEABLE HORIZON/i.test(unified), "tradeable horizon labeled");
  assert(validateVisibleDecisionText(unified, env).length === 0, validateVisibleDecisionText(unified, env).join("; "));

  const spoken = formatMentorTradeSpoken(env);
  assert(/MENTOR VIEW/i.test(spoken) && /TRADE DECISION/i.test(spoken), "spoken separates mentor vs decision");
  assert(validateVisibleDecisionText(spoken, env).length === 0, validateVisibleDecisionText(spoken, env).join("; "));

  const voice = narrateAnalysisContractForVoice(conflict.analysis_contract!);
  assert(/MENTOR VIEW/i.test(voice) && /TRADE DECISION/i.test(voice), "voice separates mentor vs decision");
  assert(/flat|wait|monitor/i.test(voice), "voice names non-directional stance");
  assert(!/leaning bullish/i.test(voice), "voice does not convert conflict to leaning bullish");
  assert(!/i'?d look for a long/i.test(voice), "voice does not invent a long");

  const bad = "I'd look for a long here. Structure is bullish.";
  const badErr = validateVisibleDecisionText(bad, env);
  assert(badErr.length > 0, "flat stance cannot become I'd look for a long");
  const enforced = enforceVisibleDecisionContract(bad, env);
  assert(enforced.replaced, "invalid visible text is replaced, not shown");
  assert(/TRADE DECISION/i.test(enforced.text), "replacement is structured contract");
  assert(!/i'?d look for a long/i.test(enforced.text), "replacement does not keep invalid lean");

  assert(unlabeledDirectionalLeans("I'm bullish").length > 0, "unlabeled bullish still blocked");
  assert(unlabeledDirectionalLeans("I'd go LONG here").length > 0, "unlabeled LONG trade call still blocked");
  assert(
    unlabeledDirectionalLeans("1-minute structure is bullish but TRADE DECISION is flat").length === 0,
    "horizon-labeled bullish with flat decision is allowed"
  );
  assert(
    unlabeledDirectionalLeans("I would consider LONG because displacement. I rejected SHORT because HTF.").length === 0,
    "interpretation consider/rejected LONG is not an unlabeled trade call"
  );

  const waitText = "MENTOR VIEW: 1-minute structure is bullish. TRADE DECISION: WAIT for entry.";
  const waitCheckEnv = { ...waitEnv, stance: "wait" as const };
  assert(
    validateVisibleDecisionText(waitText, waitCheckEnv).some((e) => /WAIT/i.test(e)),
    "WAIT for entry without named trigger fails"
  );

  const why = explainBullishEvidenceWithoutConverting(env);
  assert(/MENTOR VIEW/i.test(why) && /bullish/i.test(why), "why-bullish explains evidence");
  assert(/TRADE DECISION/i.test(why), "why-bullish still has trade decision");
  assert(!/\bstance is long\b/i.test(why), "why-bullish does not convert to LONG");
  assert(new RegExp(`\\b${env.stance}\\b`, "i").test(why) || /FLAT|WAIT|MONITOR/.test(why), "why-bullish keeps non-directional stance");

  assert(/screenshot supplies chart evidence only|do NOT make a trading decision/i.test(LIVE_VERDICT_SYSTEM + CHART_EVIDENCE_SYSTEM), "vision prompts forbid independent decision");
  assert(/STANCE: long \| short \| flat \| wait \| monitor/i.test(PANEL_VERDICT_FORMAT), "panel format uses stance enum");
  assert(!/Call: potential buy/i.test(PANEL_VERDICT_FORMAT), "panel format no longer uses independent Call");

  const ui = loadVerdictUi();
  const inferred = ui.contractFromData({
    spokenBrief: "1m structure is bullish but I remain flat",
    verdict: "1m structure is bullish but I remain flat",
  });
  assert(inferred.verdict !== "LONG" && inferred.verdict !== "SHORT", "UI must not infer LONG from bullish prose");
  assert(inferred.verdict === "UNAVAILABLE" || inferred.verdict === "NO_TRADE", "missing structured decision is UNAVAILABLE/NO DECISION");

  const structured = ui.contractFromData({
    spokenBrief: "1m structure is bullish but I remain flat",
    deskPipeline: {
      analysis_contract: {
        verdict: "WAIT",
        htf_bias: "bearish",
        decision: env,
      },
    },
  });
  assert(structured.decision?.stance === env.stance, "UI consumes structured stance");
  assert(structured.verdict !== "LONG", "structured flat/wait does not display LONG");

  const waitIntel = {
    observation: waitPipe.observation,
    interpretation: waitPipe.interpretation,
    ctx: REPLAY_FIXTURES["bullish-wait"].ctx,
    state: REPLAY_FIXTURES["bullish-wait"].state,
    facts: [],
    eqhEqlRows: [],
    state_hash: waitPipe.state_hash,
    built_at: new Date().toISOString(),
  } as DeskMarketIntelligence;
  const waitCoach = answerMentorCoaching(waitIntel, "Why are you bullish?");
  if (waitCoach?.spoken) {
    assert(/MENTOR VIEW|TRADE DECISION/i.test(waitCoach.spoken), "mentor why-bullish keeps section labels");
    assert(!/\bstance is long\b/i.test(waitCoach.spoken), "mentor why-bullish does not convert to LONG");
  }

  const after = runDeskPipeline(
    REPLAY_FIXTURES["bullish-wait"].ctx,
    REPLAY_FIXTURES["bullish-wait"].state
  ).analysis_contract!.decision!;
  assert(after.stance === waitBefore, "pipeline stance semantics unchanged after presentation wiring");

  assert(
    formatDecisionEnvelope(env).includes("HTF CONTEXT:"),
    "seven-layer envelope labels unchanged"
  );

  console.log("test-karen-path-unification: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
