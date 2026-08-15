/**
 * Spoken EQH/EQL — HIGH / unswept MEDIUM only. Run: npx tsx scripts/test-voice-eqh-eql.ts
 */
import {
  buildSpokenEqhEqlBrief,
  EQH_EQL_STAY_FLAT,
  formatMeaningfulEqhEqlForPrompt,
  isEqhEqlLiquidityQuestion,
  pickSpeakableEqhEqlPools,
  type SpokenEqhEqlPool,
} from "../lib/voice-eqh-eql";
import { answerFromIntelligence } from "../lib/conversational-query";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

const t2135 = Date.parse("2026-08-11T21:35:00-04:00") / 1000;
const t2158 = Date.parse("2026-08-11T21:58:00-04:00") / 1000;
const t2139 = Date.parse("2026-08-11T21:39:00-04:00") / 1000;

const highEql: SpokenEqhEqlPool = {
  price: 29646.75,
  liquidityType: "EQL",
  importance: "HIGH",
  why: "HIGH: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity.",
  lifecycle: "ACTIVE",
  status: "active",
  score: 80.7,
  contributingSwings: [
    { price: 29646.75, barTime: t2135, prominence: 13.5 },
    { price: 29646.75, barTime: t2158, prominence: 20.25 },
  ],
};

const lowNoise: SpokenEqhEqlPool = {
  price: 29650.0,
  liquidityType: "EQL",
  importance: "LOW",
  why: "LOW: Weak swings / noisy wick cluster — similar lows, not a pool.",
  lifecycle: "ACTIVE",
  status: "active",
  score: 22,
  contributingSwings: [{ price: 29650, barTime: t2139, prominence: 2 }],
};

const sweptMedium: SpokenEqhEqlPool = {
  price: 29654.25,
  liquidityType: "EQH",
  importance: "MEDIUM",
  why: "MEDIUM: already swept — preserved as history, less relevant as resting liquidity.",
  lifecycle: "SWEPT",
  status: "closed_through",
  score: 73.7,
};

const unsweptMedium: SpokenEqhEqlPool = {
  price: 29729.75,
  liquidityType: "EQL",
  importance: "MEDIUM",
  why: "MEDIUM: Two confirmed significant swing lows, still unswept.",
  lifecycle: "ACTIVE",
  status: "touched",
  score: 67.2,
};

assert(isEqhEqlLiquidityQuestion("where's the liquidity?"), "where liquidity is EQH/EQL question");
assert(isEqhEqlLiquidityQuestion("Can Karen distinguish meaningful liquidity from random similar highs/lows?"), "user test question");
assert(isEqhEqlLiquidityQuestion("where are the equal lows"), "equal lows question");
assert(!isEqhEqlLiquidityQuestion("was previous day high taken"), "PDH sweep is not EQH/EQL");

const mixed = [lowNoise, sweptMedium, highEql, unsweptMedium];
const picked = pickSpeakableEqhEqlPools(mixed, { max: 2 });
assert(picked[0]?.price === 29646.75, "picks HIGH EQL first");
assert(picked.every((p) => p.importance !== "LOW"), "never LOW");
assert(picked.every((p) => p.lifecycle !== "SWEPT"), "never swept");

const spoken = buildSpokenEqhEqlBrief(mixed);
assert(/29646\.75/.test(spoken), "cites HIGH price");
assert(/21:35/.test(spoken) && /21:58/.test(spoken), "cites contributing swing times");
assert(!/21:39/.test(spoken), "does not cite the wick time");
assert(!/29650/.test(spoken), "does not cite LOW noise");
assert(!/29654\.25/.test(spoken), "does not cite swept MEDIUM");
assert(/random similar wicks/i.test(spoken), "rejects random wicks");
assert(!/\b(long|short)\b/i.test(spoken), "does not invent long/short");

const onlyNoise = buildSpokenEqhEqlBrief([lowNoise, sweptMedium]);
assert(onlyNoise === EQH_EQL_STAY_FLAT, "stay-flat when nothing meaningful");
assert(/stay flat/i.test(onlyNoise), "stay-flat wording");

const mediumOnly = buildSpokenEqhEqlBrief([unsweptMedium, lowNoise]);
assert(/29729\.75/.test(mediumOnly), "unswept MEDIUM used when no HIGH");

const eqhOnly = buildSpokenEqhEqlBrief(mixed, { question: "where's the equal highs" });
assert(eqhOnly === EQH_EQL_STAY_FLAT, "EQH question stay-flat if only HIGH is EQL");

const prompt = formatMeaningfulEqhEqlForPrompt(mixed);
assert(/29646\.75/.test(prompt), "prompt includes HIGH");
assert(!/LOW noise|29650/.test(prompt), "prompt omits LOW");

const intelAns = answerFromIntelligence(
  {
    eqhEqlRows: mixed,
    facts: [
      {
        id: "liquidity.rel.29650",
        category: "liquidity",
        label: "REL pool",
        value: "29650.00 — similar wick cluster",
        status: "active",
        evidence_key: "liquidity.rel_0",
      },
    ],
    observation: { data_quality: "good" },
    interpretation: { reasoning: "", observation_refs: [] },
    state: { lastPrice: 29868 },
    state_hash: "t",
    built_at: "2026-08-12T00:00:00Z",
    ctx: {},
  } as Parameters<typeof answerFromIntelligence>[0],
  "where's the liquidity?"
);
assert(/29646\.75/.test(intelAns?.spoken || ""), "intelligence voice cites HIGH EQL");
assert(!/29650/.test(intelAns?.spoken || ""), "intelligence voice skips LOW wick REL");
assert(!/\b(long|short)\b/i.test(intelAns?.spoken || ""), "intelligence voice no invented side");

console.log("\nAll spoken EQH/EQL tests passed.");
