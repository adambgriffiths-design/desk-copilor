import fs from "fs";
import path from "path";
import type { MarketObservation } from "./desk-schema";
import { runDeskPipeline } from "./desk-pipeline";
import { validateInterpretationContamination } from "./contamination-guard";
import type { ExpectedObservation, LabeledSetup } from "./labeling";
import { getExpectedObservation, listSetupFixtures, loadSetupFixture } from "./labeling";
import { REPLAY_FIXTURES } from "./replay-fixtures";

export const PRICE_TOLERANCE_POINTS = 15;

export type ObservationFieldResult = {
  field: string;
  expected: unknown;
  actual: unknown;
  match: boolean;
};

export type ReplayCaseResult = {
  id: string;
  fixture_id: string;
  observation_fields: ObservationFieldResult[];
  observation_accuracy_pct: number;
  interpretation_agreement_pct: number;
  interpretation_notes: string[];
  decision_match: boolean;
  invalidation_match: boolean | null;
  target_match: boolean | null;
  expected_verdict: string;
  actual_verdict: string;
  contamination_passed: boolean;
  label: LabeledSetup;
};

export type ObservationReport = {
  overall_pct: number;
  field_breakdown: Record<string, { matches: number; total: number; pct: number }>;
  per_case: Array<{ id: string; pct: number; mismatches: string[] }>;
};

export type InterpretationReport = {
  overall_pct: number;
  per_case: Array<{ id: string; pct: number; notes: string[] }>;
};

export type DecisionReport = {
  overall_pct: number;
  per_case: Array<{ id: string; match: boolean; expected: string; actual: string; note?: string }>;
};

export type ReplayReport = {
  ts: string;
  date: string;
  total: number;
  observation: ObservationReport;
  interpretation: InterpretationReport;
  decision: DecisionReport;
  diagnosis: string;
  results: ReplayCaseResult[];
};

export function actualObservationFields(obs: MarketObservation): ExpectedObservation {
  return {
    liquidity_swept: obs.liquidity.levels.some((l) => l.taken === true),
    fvg_status: obs.fvg.status,
    displacement: obs.displacement,
    market_structure: obs.market_structure,
    htf_bias_aligned: obs.htf_bias.aligned === true,
    tradeable_bias: obs.htf_bias.tradeable_bias,
    data_quality: obs.data_quality,
    session: obs.session,
    order_block: obs.order_block,
  };
}

function compareObservationFields(
  expected: ExpectedObservation,
  actual: ExpectedObservation
): ObservationFieldResult[] {
  return Object.entries(expected).map(([field, expVal]) => {
    const actVal = actual[field as keyof ExpectedObservation];
    return { field, expected: expVal, actual: actVal, match: JSON.stringify(expVal) === JSON.stringify(actVal) };
  });
}

const INTERPRETATION_KEYWORDS = [
  "sweep", "liquidity", "displacement", "fvg", "bullish", "bearish", "retrace", "wait",
  "short", "long", "wouldn't", "would not", "skip", "no trade", "aligned", "mss",
  "reversal", "bias", "unknown", "quality", "contradict",
];

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return INTERPRETATION_KEYWORDS.filter((kw) => lower.includes(kw));
}

function scoreInterpretationAgreement(
  label: LabeledSetup,
  interpretation: ReturnType<typeof runDeskPipeline>["interpretation"]
): { pct: number; notes: string[] } {
  const notes: string[] = [];
  const adamText = [label.why_taken, label.why_rejected_alternatives, label.expected_entry_model || ""].join(" ").toLowerCase();
  const expectedKeywords = extractKeywords(adamText);
  const interpText = [
    interpretation.reasoning,
    interpretation.entry_model || "",
    interpretation.contradictions.join(" "),
    interpretation.long_case.reasons.join(" "),
    interpretation.short_case.reasons.join(" "),
  ].join(" ").toLowerCase();

  let keywordScore = 1;
  if (expectedKeywords.length > 0) {
    const hits = expectedKeywords.filter((kw) => interpText.includes(kw));
    keywordScore = hits.length / expectedKeywords.length;
    const missing = expectedKeywords.filter((k) => !hits.includes(k));
    if (missing.length) notes.push(`Missing keywords: ${missing.join(", ")}`);
  }

  let entryModelScore = 1;
  if (label.expected_entry_model) {
    const exp = label.expected_entry_model.toLowerCase();
    const got = (interpretation.entry_model || "").toLowerCase();
    entryModelScore = exp.split(" ").some((w) => w.length > 4 && got.includes(w)) ? 1 : 0;
    if (entryModelScore === 0) {
      notes.push(`Expected entry_model "${label.expected_entry_model}", got "${interpretation.entry_model || "null"}"`);
    }
  }

  if (label.similar_but_skip && !/wouldn't|would not|skip/i.test(interpText)) {
    notes.push("similar_but_skip: interpretation should mention wouldn't take / skip");
    keywordScore = Math.min(keywordScore, 0.5);
  }

  const pct = Math.round(((keywordScore * 0.7 + entryModelScore * 0.3) * 100) * 10) / 10;
  return { pct, notes };
}

function priceWithinTolerance(actual: number | null, expected: number | undefined): boolean | null {
  if (expected == null) return null;
  if (actual == null) return false;
  return Math.abs(actual - expected) <= PRICE_TOLERANCE_POINTS;
}

export function replayLabeledSetup(fixtureId: string, label: LabeledSetup): ReplayCaseResult {
  const fixture = REPLAY_FIXTURES[fixtureId];
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureId}`);

  const pipeline = runDeskPipeline(fixture.ctx, fixture.state);
  const contamination = validateInterpretationContamination(pipeline.observation, pipeline.interpretation);
  const expected = getExpectedObservation(label);
  const actual = actualObservationFields(pipeline.observation);
  const observation_fields = compareObservationFields(expected, actual);
  const obsMatches = observation_fields.filter((f) => f.match).length;
  const observation_accuracy_pct =
    observation_fields.length > 0 ? Math.round((obsMatches / observation_fields.length) * 1000) / 10 : 0;

  const { pct: interpretation_agreement_pct, notes: interpretation_notes } = scoreInterpretationAgreement(
    label,
    pipeline.interpretation
  );

  return {
    id: label.id,
    fixture_id: fixtureId,
    observation_fields,
    observation_accuracy_pct,
    interpretation_agreement_pct,
    interpretation_notes,
    decision_match: pipeline.decision.verdict === label.adam_verdict,
    invalidation_match: priceWithinTolerance(pipeline.decision.invalidation, label.expected_invalidation),
    target_match: priceWithinTolerance(pipeline.decision.target, label.expected_target),
    expected_verdict: label.adam_verdict,
    actual_verdict: pipeline.decision.verdict,
    contamination_passed: contamination.passed,
    label,
  };
}

function buildObservationReport(results: ReplayCaseResult[]): ObservationReport {
  const field_breakdown: ObservationReport["field_breakdown"] = {};
  const per_case: ObservationReport["per_case"] = [];

  for (const r of results) {
    const mismatches: string[] = [];
    for (const f of r.observation_fields) {
      if (!field_breakdown[f.field]) field_breakdown[f.field] = { matches: 0, total: 0, pct: 0 };
      field_breakdown[f.field].total++;
      if (f.match) field_breakdown[f.field].matches++;
      else mismatches.push(`${f.field}: expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)}`);
    }
    per_case.push({ id: r.id, pct: r.observation_accuracy_pct, mismatches });
  }

  for (const f of Object.values(field_breakdown)) {
    f.pct = f.total > 0 ? Math.round((f.matches / f.total) * 1000) / 10 : 0;
  }

  const totalFields = results.reduce((s, r) => s + r.observation_fields.length, 0);
  const totalMatches = results.reduce((s, r) => s + r.observation_fields.filter((f) => f.match).length, 0);

  return {
    overall_pct: totalFields > 0 ? Math.round((totalMatches / totalFields) * 1000) / 10 : 0,
    field_breakdown,
    per_case,
  };
}

function buildInterpretationReport(results: ReplayCaseResult[]): InterpretationReport {
  return {
    overall_pct:
      results.length > 0
        ? Math.round((results.reduce((s, r) => s + r.interpretation_agreement_pct, 0) / results.length) * 10) / 10
        : 0,
    per_case: results.map((r) => ({ id: r.id, pct: r.interpretation_agreement_pct, notes: r.interpretation_notes })),
  };
}

function buildDecisionReport(results: ReplayCaseResult[]): DecisionReport {
  const per_case = results.map((r) => {
    let note: string | undefined;
    if (!r.decision_match) {
      note = `Expected ${r.expected_verdict}, got ${r.actual_verdict}`;
      if (r.interpretation_agreement_pct >= 70) note += " — interpretation was reasonable; check decision rules";
    }
    return { id: r.id, match: r.decision_match, expected: r.expected_verdict, actual: r.actual_verdict, note };
  });
  const matches = results.filter((r) => r.decision_match).length;
  return { overall_pct: results.length > 0 ? Math.round((matches / results.length) * 1000) / 10 : 0, per_case };
}

function buildDiagnosis(obs: ObservationReport, interp: InterpretationReport, dec: DecisionReport): string {
  const scores = [
    { layer: "observation", pct: obs.overall_pct, hint: "fix market data / observation engine" },
    { layer: "interpretation", pct: interp.overall_pct, hint: "fix interpretation prompt/engine, NOT market data" },
    { layer: "decision", pct: dec.overall_pct, hint: "fix decision rules" },
  ].sort((a, b) => a.pct - b.pct);

  const primary = scores[0];
  const lines = [
    `Primary gap: **${primary.layer}** layer (${primary.pct}% — ${primary.hint}).`,
    `Observation ${obs.overall_pct}%, Interpretation ${interp.overall_pct}%, Decision ${dec.overall_pct}%.`,
  ];
  if (obs.overall_pct >= 70 && interp.overall_pct < 60) {
    lines.push("Observations mostly correct but interpretation lagging — focus Layer 2.");
  } else if (interp.overall_pct >= 70 && dec.overall_pct < 60) {
    lines.push("Interpretation reasonable but decision mismatches — focus Layer 3 rules.");
  } else if (obs.overall_pct < 60) {
    lines.push("Observation detection is the bottleneck — verify MarketState quality and ICT feature extraction.");
  }
  return lines.join(" ");
}

export function runReplayReport(): ReplayReport {
  const results: ReplayCaseResult[] = [];
  for (const file of listSetupFixtures()) {
    const loaded = loadSetupFixture(file);
    const fixtureId = loaded.id.replace(/\.json$/, "") || loaded.label.id;
    results.push(replayLabeledSetup(fixtureId, loaded.label));
  }

  const observation = buildObservationReport(results);
  const interpretation = buildInterpretationReport(results);
  const decision = buildDecisionReport(results);
  const date = new Date().toISOString().slice(0, 10);

  return {
    ts: new Date().toISOString(),
    date,
    total: results.length,
    observation,
    interpretation,
    decision,
    diagnosis: buildDiagnosis(observation, interpretation, decision),
    results,
  };
}

export function formatReplayMarkdown(report: ReplayReport): string {
  const lines = [
    `# Replay Report ${report.date}`,
    ``,
    `Generated: ${report.ts}`,
    `Setups replayed: ${report.total}`,
    ``,
    `---`,
    ``,
    `## 1. Observation Accuracy: ${report.observation.overall_pct}%`,
    ``,
    `_Did the engine detect what actually happened?_`,
    `_If low → fix market data / observation engine_`,
    ``,
  ];

  for (const [field, stat] of Object.entries(report.observation.field_breakdown)) {
    const mark = stat.pct === 100 ? "✓" : stat.pct >= 60 ? "~" : "✗";
    lines.push(`- **${field}**: ${stat.matches}/${stat.total} ${mark} (${stat.pct}%)`);
  }

  lines.push(``, `### Per-example observation`, ``);
  for (const c of report.observation.per_case) {
    lines.push(`- **${c.id}**: ${c.pct}%${c.mismatches.length ? ` — ${c.mismatches.join("; ")}` : " ✓"}`);
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 2. Interpretation Agreement: ${report.interpretation.overall_pct}% (${report.interpretation.per_case.filter((c) => c.pct >= 60).length}/${report.total} above 60%)`,
    ``,
    `_Did the engine interpret observations the way Adam's label says he would?_`,
    `_If observations right but this is low → fix interpretation engine/prompt_`,
    ``
  );

  for (const c of report.interpretation.per_case) {
    lines.push(`- **${c.id}**: ${c.pct}%${c.notes.length ? ` — ${c.notes.join("; ")}` : ""}`);
  }

  lines.push(
    ``,
    `---`,
    ``,
    `## 3. Decision Agreement: ${report.decision.overall_pct}% (${report.decision.per_case.filter((c) => c.match).length}/${report.total})`,
    ``,
    `_Did it reach the same LONG / SHORT / WAIT / NO_TRADE?_`,
    `_If interpretation right but this is low → fix decision rules_`,
    `_Invalidation/target tolerance: ±${PRICE_TOLERANCE_POINTS} points_`,
    ``
  );

  for (const c of report.decision.per_case) {
    const mark = c.match ? "✓" : "✗";
    lines.push(`- **${c.id}**: ${c.expected} vs ${c.actual} ${mark}${c.note ? ` — ${c.note}` : ""}`);
  }

  lines.push(``, `---`, ``, `## Diagnosis`, ``, report.diagnosis, ``, `> Phase 1 diagnostic only — Adam to refine scoring in Phase 2.`);
  return lines.join("\n");
}

export function writeReplayReport(dir = path.join(process.cwd(), "reports")): string {
  const report = runReplayReport();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `replay-${report.date}.md`);
  fs.writeFileSync(filePath, formatReplayMarkdown(report));
  return filePath;
}

export type ReplayScaleSummary = {
  iterations: number;
  total_runs: number;
  observation_pct: { min: number; max: number; avg: number };
  interpretation_pct: { min: number; max: number; avg: number };
  decision_pct: { min: number; max: number; avg: number };
  deterministic: boolean;
  elapsed_ms: number;
};

/** Run full replay N times — verifies deterministic pipeline (same inputs → same outputs). */
export function runReplayAtScale(iterations = 50): ReplayScaleSummary {
  const start = Date.now();
  const obs: number[] = [];
  const interp: number[] = [];
  const dec: number[] = [];
  let firstHashes: string[] | null = null;
  let deterministic = true;

  for (let i = 0; i < iterations; i++) {
    const report = runReplayReport();
    obs.push(report.observation.overall_pct);
    interp.push(report.interpretation.overall_pct);
    dec.push(report.decision.overall_pct);

    const hashes = report.results.map(
      (r) =>
        `${r.id}:${r.actual_verdict}:${r.observation_accuracy_pct}:${JSON.stringify(r.observation_fields.map((f) => f.match))}`
    );
    if (firstHashes === null) firstHashes = hashes;
    else if (JSON.stringify(hashes) !== JSON.stringify(firstHashes)) deterministic = false;
  }

  const avg = (arr: number[]) => Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  const min = (arr: number[]) => Math.min(...arr);
  const max = (arr: number[]) => Math.max(...arr);

  return {
    iterations,
    total_runs: iterations * (firstHashes?.length ?? 0),
    observation_pct: { min: min(obs), max: max(obs), avg: avg(obs) },
    interpretation_pct: { min: min(interp), max: max(interp), avg: avg(interp) },
    decision_pct: { min: min(dec), max: max(dec), avg: avg(dec) },
    deterministic,
    elapsed_ms: Date.now() - start,
  };
}
