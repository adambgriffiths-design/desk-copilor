/**
 * PIT-safe reasoning_repr_v0 stamp unit + smoke tests.
 * Run: npx tsx scripts/test-reasoning-stamp-features.ts
 *
 * Representation only — no outcomes, no unlock, no decision changes.
 * Small fixture sample only (no Y=1500).
 */
import { runDeskPipeline } from "../lib/desk-pipeline";
import { REPLAY_FIXTURES, baseCtx, baseState } from "../lib/replay-fixtures";
import {
  PLAYBOOK_CHAIN_CONCEPTS,
  type DecisionEnvelope,
} from "../lib/decision-envelope";
import {
  REASONING_REPRESENTATION_VERSION,
  quantifyReasoningReprV0,
  stampReasoningFeaturesFromEnvelope,
  stampReasoningFeaturesFromEvidence,
  type ReasoningChainCompactRow,
} from "../lib/reasoning-stamp-features";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Mirrors additive featuresAtT merge (citedConcepts + reason counts preserved). */
function featuresAtTFromEnvelope(env: DecisionEnvelope) {
  const reasoning = stampReasoningFeaturesFromEnvelope(env);
  const longReasonCount = 0; // placeholder — reason lists live on RS; not derived here
  const shortReasonCount = 0;
  return {
    citedConcepts: [...(env.citedConcepts ?? [])],
    longReasonCount,
    shortReasonCount,
    reasoningChainCompact: reasoning.reasoningChainCompact,
    conflictBetween: reasoning.conflictBetween,
    reasoningRepresentationVersion: reasoning.reasoningRepresentationVersion,
  };
}

function assertRowMatchesChain(
  row: ReasoningChainCompactRow,
  env: DecisionEnvelope
) {
  const src = env.reasoningChain.find((c) => c.concept === row.concept);
  assert(Boolean(src), `chain has concept ${row.concept}`);
  assert(row.checked === src!.checked, `${row.concept}.checked`);
  assert(row.outcome === src!.outcome, `${row.concept}.outcome`);
  assert(row.detected === src!.detected, `${row.concept}.detected`);
  assert(row.usedInDecision === src!.usedInDecision, `${row.concept}.usedInDecision`);
  assert(row.role === src!.role, `${row.concept}.role`);
  assert(row.evidenceSource === (src!.evidence?.source ?? ""), `${row.concept}.evidenceSource`);
}

// --- Fixture envelopes ---
const waitPipe = runDeskPipeline(
  REPLAY_FIXTURES["bullish-wait"].ctx,
  REPLAY_FIXTURES["bullish-wait"].state
);
const waitEnv = waitPipe.analysis_contract!.decision!;
assert(waitEnv, "bullish-wait envelope");

const base = baseCtx();
const conflictPipe = runDeskPipeline(
  baseCtx({
    structureFacts: {
      ...base.structureFacts,
      mss: {
        direction: "bearish",
        level: 25080,
        at: "10:05",
        atTime: 1700000000,
        description: "Bearish market structure shift",
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
  baseState({ stateHash: "reasoning-repr-conflict-001" })
);
const conflictEnv = conflictPipe.analysis_contract!.decision!;
assert(conflictEnv, "conflict envelope");

const bearPipe = runDeskPipeline(
  REPLAY_FIXTURES["bearish-wait"].ctx,
  REPLAY_FIXTURES["bearish-wait"].state
);
const bearEnv = bearPipe.analysis_contract!.decision!;
assert(bearEnv, "bearish-wait envelope");

const neutralPipe = runDeskPipeline(
  REPLAY_FIXTURES["neutral-no-trade"].ctx,
  REPLAY_FIXTURES["neutral-no-trade"].state
);
const neutralEnv = neutralPipe.analysis_contract!.decision!;
assert(neutralEnv, "neutral envelope");

const envs: Array<{ name: string; env: DecisionEnvelope }> = [
  { name: "bullish-wait", env: waitEnv },
  { name: "conflict", env: conflictEnv },
  { name: "bearish-wait", env: bearEnv },
  { name: "neutral-no-trade", env: neutralEnv },
];

// --- Unit: rows survive into featuresAtT shape ---
for (const { name, env } of envs) {
  const feat = featuresAtTFromEnvelope(env);
  assert(
    feat.reasoningRepresentationVersion === REASONING_REPRESENTATION_VERSION,
    `${name}: version`
  );
  assert(Array.isArray(feat.reasoningChainCompact), `${name}: compact array`);
  assert(
    feat.reasoningChainCompact.length === env.reasoningChain.length,
    `${name}: row count matches chain (${feat.reasoningChainCompact.length} vs ${env.reasoningChain.length})`
  );
  for (const id of PLAYBOOK_CHAIN_CONCEPTS) {
    assert(
      feat.reasoningChainCompact.some((r) => r.concept === id),
      `${name}: playbook ${id} stamped`
    );
  }
  for (const row of feat.reasoningChainCompact) {
    assertRowMatchesChain(row, env);
  }
  // Compatibility: citedConcepts unchanged; PRIMARY ids ⊆ citedConcepts when present
  assert(Array.isArray(feat.citedConcepts), `${name}: citedConcepts kept`);
  assert(
    JSON.stringify(feat.citedConcepts) === JSON.stringify(env.citedConcepts),
    `${name}: citedConcepts identical to envelope`
  );
  const primaryIds = feat.reasoningChainCompact
    .filter((r) => r.role === "PRIMARY")
    .map((r) => r.concept)
    .sort();
  const citedSorted = [...feat.citedConcepts].sort();
  assert(
    JSON.stringify(primaryIds) === JSON.stringify(citedSorted),
    `${name}: PRIMARY ≡ citedConcepts (${primaryIds.join(",")} vs ${citedSorted.join(",")})`
  );
  assert(
    typeof feat.longReasonCount === "number" && typeof feat.shortReasonCount === "number",
    `${name}: reason counts retained`
  );
  if (env.conflictResolution?.between) {
    assert(
      feat.conflictBetween === env.conflictResolution.between,
      `${name}: conflictBetween preserved`
    );
  }
}

// --- Evidence pass-through (no invention) ---
const stamped = stampReasoningFeaturesFromEnvelope(waitEnv);
const fromEvidence = stampReasoningFeaturesFromEvidence(stamped);
assert(
  JSON.stringify(fromEvidence.reasoningChainCompact) ===
    JSON.stringify(stamped.reasoningChainCompact),
  "evidence pass-through identical"
);
assert(fromEvidence.conflictBetween === stamped.conflictBetween, "conflictBetween pass-through");
const emptyEv = stampReasoningFeaturesFromEvidence({});
assert(emptyEv.reasoningChainCompact.length === 0, "empty evidence → empty rows (no invent)");
assert(emptyEv.conflictBetween === null, "empty evidence → null conflictBetween");

// --- Determinism ---
const a = stampReasoningFeaturesFromEnvelope(waitEnv);
const b = stampReasoningFeaturesFromEnvelope(waitEnv);
assert(JSON.stringify(a) === JSON.stringify(b), "deterministic stamp");

// --- Outcome-blind quantification (fixture smoke sample) ---
const featRows = envs.map(({ env }) => featuresAtTFromEnvelope(env));
const q = quantifyReasoningReprV0(featRows);

assert(q.stampCount === envs.length, "quant stampCount");
assert(q.totalRows === featRows.reduce((n, f) => n + f.reasoningChainCompact.length, 0), "quant rows");
assert(q.primaryCount + q.supportingCount + q.noneCount === q.totalRows, "role partition");

console.log(
  JSON.stringify(
    {
      ok: true,
      version: REASONING_REPRESENTATION_VERSION,
      fixtureNames: envs.map((e) => e.name),
      quantification: q,
      sample: {
        name: "bullish-wait",
        citedConcepts: featRows[0]!.citedConcepts,
        conflictBetween: featRows[0]!.conflictBetween,
        roles: featRows[0]!.reasoningChainCompact.map((r) => ({
          concept: r.concept,
          role: r.role,
          usedInDecision: r.usedInDecision,
          outcome: r.outcome,
        })),
      },
    },
    null,
    2
  )
);

console.log("test-reasoning-stamp-features: PASS");
