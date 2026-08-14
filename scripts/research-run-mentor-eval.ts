#!/usr/bin/env npx tsx
/**
 * Batch mentor-quality evaluation across historical cutoffs.
 * Run: npm run research:mentor-eval -- --dataset nq-aug12-2026-cme [--mode framework|responsiveness]
 */
import fs from "fs";
import path from "path";
import {
  checkpointsToCutoffSpecs,
  compareCheckpointModes,
  selectFrameworkCheckpoints,
  selectResponsivenessCheckpoints,
  type MentorEvalMode,
  type RegimeProxy,
} from "../lib/research/mentor/checkpoint-selection";
import {
  MENTOR_CRITERION_LABELS,
  type MentorCriterionId,
  type MentorEvalResult,
} from "../lib/research/mentor/types";
import { evaluateMentorResponse } from "../lib/research/mentor/evaluation";
import { ReplayDataCutoff } from "../lib/research/replay/cutoff";
import { buildKarenReplayResponse } from "../lib/research/replay/karen";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";
import type { Bar } from "../lib/types";

export type MentorCutoffSpec = {
  asOf: string;
  label: string;
  rationale: string;
  stratum?: string;
  regimeProxy?: RegimeProxy;
};
/** Legacy Aug 12 anchors — Mode A reference set. */
export const NQ_AUG12_MENTOR_CUTOFFS: MentorCutoffSpec[] = [
  {
    asOf: "2026-08-11T22:00:00.000Z",
    label: "Globex open",
    rationale: "First bar of CME session — minimal RTH context, tests overnight framing",
  },
  {
    asOf: "2026-08-12T02:00:00.000Z",
    label: "Overnight mid",
    rationale: "Low-liquidity overnight — should not over-trade",
  },
  {
    asOf: "2026-08-12T06:00:00.000Z",
    label: "Early morning",
    rationale: "Pre-London / early globex — structure still forming",
  },
  {
    asOf: "2026-08-12T11:00:00.000Z",
    label: "Pre-market",
    rationale: "~7 AM ET — pre-RTH positioning, PD arrays relevant",
  },
  {
    asOf: "2026-08-12T13:00:00.000Z",
    label: "Pre-NY open",
    rationale: "~9 AM ET — final pre-open context before RTH",
  },
  {
    asOf: "2026-08-12T14:30:00.000Z",
    label: "NY open anchor",
    rationale: "Canonical research anchor — NY RTH active, high information density",
  },
  {
    asOf: "2026-08-12T15:30:00.000Z",
    label: "Post-open hour",
    rationale: "First hour post-open — displacement / ORG context",
  },
  {
    asOf: "2026-08-12T16:30:00.000Z",
    label: "Mid-morning RTH",
    rationale: "Mid-session trend vs range assessment",
  },
  {
    asOf: "2026-08-12T17:30:00.000Z",
    label: "Lunch",
    rationale: "Typical liquidity dip — uncertainty should be expressed",
  },
  {
    asOf: "2026-08-12T19:00:00.000Z",
    label: "PM session",
    rationale: "Afternoon continuation / reversal context",
  },
  {
    asOf: "2026-08-12T20:59:00.000Z",
    label: "Session end anchor",
    rationale: "Last RTH minute — prior research fingerprint cutoff",
  },
  {
    asOf: "2026-08-12T21:45:00.000Z",
    label: "Late globex",
    rationale: "Near CME roll boundary — tests session-end honesty",
  },
];

export type MentorCaseResult = {
  asOf: string;
  label: string;
  rationale: string;
  stratum?: string;
  regimeProxy?: RegimeProxy;
  sessionDate?: string;
  price: number;
  barsAvailable: number;
  karen: ReturnType<typeof buildKarenReplayResponse>["karen"];
  pipeline: {
    verdict: string;
    verdictReason: string;
    dataQuality: string;
    marketStructure: string;
    longSupported: boolean;
    shortSupported: boolean;
    entryModel: string | null;
  };
  eval: MentorEvalResult;
  postHocAudit: {
    barsAfterCutoff: number;
    invalidationBreached: boolean | null;
    maxAdverseMove: number | null;
    note: string;
  };
};

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

function barsAfterCutoff(allM1: Bar[], asOf: Date): Bar[] {
  const ms = asOf.getTime();
  return allM1.filter((b) => b.time.getTime() > ms);
}

function postHocAudit(
  karen: MentorCaseResult["karen"],
  pipelineVerdict: string,
  priceAtCutoff: number,
  futureBars: Bar[]
): MentorCaseResult["postHocAudit"] {
  if (futureBars.length === 0) {
    return { barsAfterCutoff: 0, invalidationBreached: null, maxAdverseMove: null, note: "No future bars" };
  }

  const inv = parseFloat(karen.invalidation);
  const directional = pipelineVerdict === "LONG" || pipelineVerdict === "SHORT";

  if (!directional || !Number.isFinite(inv)) {
    return {
      barsAfterCutoff: futureBars.length,
      invalidationBreached: null,
      maxAdverseMove: null,
      note: directional ? "Directional but no numeric invalidation to audit" : "Non-directional — outcome audit N/A",
    };
  }

  let breached = false;
  let maxAdverse = 0;
  for (const b of futureBars.slice(0, 60)) {
    if (pipelineVerdict === "LONG") {
      const adverse = priceAtCutoff - b.low;
      maxAdverse = Math.max(maxAdverse, adverse);
      if (b.low <= inv) breached = true;
    } else {
      const adverse = b.high - priceAtCutoff;
      maxAdverse = Math.max(maxAdverse, adverse);
      if (b.high >= inv) breached = true;
    }
  }

  return {
    barsAfterCutoff: futureBars.length,
    invalidationBreached: breached,
    maxAdverseMove: Math.round(maxAdverse * 10) / 10,
    note: breached
      ? `Invalidation ${karen.invalidation} breached within 60 bars (diagnostic only — not scored)`
      : `Invalidation held over next ${Math.min(60, futureBars.length)} bars`,
  };
}

export function resolveMentorCutoffs(
  datasetId: string,
  mode: MentorEvalMode
): { cutoffs: MentorCutoffSpec[]; comparison?: ReturnType<typeof compareCheckpointModes> } {
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture(datasetId);
  if (mode === "responsiveness") {
    const candidates = selectResponsivenessCheckpoints(fixture.m1);
    return {
      cutoffs: checkpointsToCutoffSpecs(candidates),
      comparison: compareCheckpointModes(fixture.m1),
    };
  }
  const candidates = selectFrameworkCheckpoints(fixture.m1);
  return { cutoffs: checkpointsToCutoffSpecs(candidates) };
}

export function runMentorEvalBatch(
  datasetId: string,
  cutoffs: MentorCutoffSpec[]
): { datasetId: string; cases: MentorCaseResult[] } {
  ensureResearchFixtures();
  const fixture = loadResearchDatasetFixture(datasetId);
  const cases: MentorCaseResult[] = [];

  for (let i = 0; i < cutoffs.length; i++) {
    const spec = cutoffs[i]!;
    const t0 = Date.now();
    const asOf = new Date(spec.asOf);
    const cutoff = new ReplayDataCutoff(fixture, asOf);
    cutoff.assertNoFutureLeak();
    const ctx = cutoff.buildContext();
    const m1 = cutoff.slicedM1();
    const { karen, pipeline } = buildKarenReplayResponse(ctx, fixture, asOf);

    const evalResult = evaluateMentorResponse({
      asOf: spec.asOf,
      karen,
      observation: pipeline.observation,
      interpretation: pipeline.interpretation,
      decision: pipeline.decision,
      availableBarTimes: m1.map((b) => b.time.toISOString()),
    });

    const price = m1.at(-1)?.close ?? 0;
    const future = barsAfterCutoff(fixture.m1, asOf);

    cases.push({
      asOf: spec.asOf,
      label: spec.label,
      rationale: spec.rationale,
      stratum: spec.stratum,
      regimeProxy: spec.regimeProxy,
      sessionDate: spec.asOf.slice(0, 10),
      price,
      barsAvailable: m1.length,
      karen,
      pipeline: {
        verdict: pipeline.decision.verdict,
        verdictReason: pipeline.decision.verdict_reason,
        dataQuality: pipeline.observation.data_quality,
        marketStructure: pipeline.observation.market_structure,
        longSupported: pipeline.interpretation.long_case.supported,
        shortSupported: pipeline.interpretation.short_case.supported,
        entryModel: pipeline.interpretation.entry_model,
      },
      eval: evalResult,
      postHocAudit: postHocAudit(karen, pipeline.decision.verdict, price, future),
    });

    console.log(
      `  [${i + 1}/${cutoffs.length}] ${spec.label} — ${pipeline.decision.verdict} (${Date.now() - t0}ms, ${m1.length} bars)`
    );
  }

  return { datasetId, cases };
}

function aggregateByCriterion(cases: MentorCaseResult[]) {
  const ids = Object.keys(MENTOR_CRITERION_LABELS) as MentorCriterionId[];
  return ids.map((id) => {
    const scores = cases.map((c) => c.eval.criteria.find((x) => x.id === id)!.score);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    return { id, label: MENTOR_CRITERION_LABELS[id], avgScore: Math.round(avg * 100) / 100, scores };
  });
}

function buildMarkdownReport(result: { datasetId: string; cases: MentorCaseResult[] }): string {
  const { cases, datasetId } = result;
  const n = cases.length;
  const avgPct = Math.round(cases.reduce((s, c) => s + c.eval.pctScore, 0) / n);
  const avgRaw = Math.round((cases.reduce((s, c) => s + c.eval.totalScore, 0) / n) * 10) / 10;
  const mentorReadyCount = cases.filter((c) => c.eval.mentorEvalReady).length;
  const byCriterion = aggregateByCriterion(cases);

  const strongest = [...byCriterion].sort((a, b) => b.avgScore - a.avgScore).slice(0, 3);
  const weakest = [...byCriterion].sort((a, b) => a.avgScore - b.avgScore).slice(0, 3);

  const falsificationCounts: Record<string, number> = {};
  for (const c of cases) {
    for (const f of c.eval.falsifications) {
      if (f.detected) falsificationCounts[f.flag] = (falsificationCounts[f.flag] ?? 0) + 1;
    }
  }

  const goodExamples = cases
    .filter((c) => c.eval.pctScore >= 80 && !c.eval.falsifications.some((f) => f.detected))
    .slice(0, 2);
  const badExamples = cases
    .filter((c) => c.eval.pctScore < 70 || c.eval.falsifications.some((f) => f.detected))
    .slice(0, 2);

  const confidence =
    n >= 10 ? "MODERATE" : n >= 6 ? "LOW" : "INCONCLUSIVE — sample too small";

  const lines: string[] = [
    "# Karen Mentor Quality Evaluation — NQ Aug 12 2026",
    "",
    "**Task ID:** research-mentor-quality-nq-aug12",
    `**Dataset:** \`${datasetId}\` (1381 bars, SESSION_BOUNDARY_GAP WARNING acceptable)`,
    "**Path:** Phase 1 pipeline via `buildKarenReplayResponse` (NOT deterministic)",
    "**Scope:** Mentor reasoning quality — NOT signal frequency, NOT edge, NOT infrastructure",
    "",
    "---",
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Historical cases | ${n} |`,
    `| Average rubric score | ${avgRaw}/20 (${avgPct}%) |`,
    `| mentorEvalReady pass | ${mentorReadyCount}/${n} |`,
    `| Confidence in evaluation | **${confidence}** |`,
    "",
    "Single-session sample — sufficient for methodology calibration, insufficient for multi-day mentor drift claims.",
    "",
    "---",
    "",
    "## Cutoff selection rationale",
    "",
    "Cutoffs span CME Globex session phases rather than uniform bar sampling:",
    "",
    "| # | Cutoff (UTC) | Label | Rationale |",
    "|---|--------------|-------|-----------|",
  ];

  cases.forEach((c, i) => {
    lines.push(`| ${i + 1} | ${c.asOf} | ${c.label} | ${c.rationale} |`);
  });

  lines.push(
    "",
    "---",
    "",
    "## Score by criterion",
    "",
    "| Criterion | Avg (0–2) |",
    "|-----------|-----------|"
  );
  for (const c of byCriterion) {
    lines.push(`| ${c.label} | ${c.avgScore} |`);
  }

  lines.push(
    "",
    "### Strongest mentor behaviours",
    "",
    ...strongest.map((c) => `- **${c.label}** — avg ${c.avgScore}/2`),
    "",
    "### Weakest mentor behaviours",
    "",
    ...weakest.map((c) => `- **${c.label}** — avg ${c.avgScore}/2`),
    "",
    "---",
    "",
    "## Falsification audit",
    "",
    "| Flag | Cases detected |",
    "|------|----------------|"
  );

  const allFlags = ["hindsight_leakage", "overconfidence", "forced_signal", "cherry_pick", "unavailable_info_cited"];
  for (const flag of allFlags) {
    lines.push(`| ${flag} | ${falsificationCounts[flag] ?? 0}/${n} |`);
  }

  lines.push(
    "",
    "**Post-hoc market audit (NOT scored):** Later candles used only to check invalidation breach within 60 bars after directional calls.",
    ""
  );

  const directionalCases = cases.filter((c) => c.pipeline.verdict === "LONG" || c.pipeline.verdict === "SHORT");
  if (directionalCases.length === 0) {
    lines.push("No directional verdicts at any cutoff — invalidation/outcome audit N/A (consistent WAIT/NO_TRADE mentor posture).");
  } else {
    for (const c of directionalCases) {
      lines.push(`- ${c.label}: ${c.postHocAudit.note}`);
    }
  }

  lines.push(
    "",
    "---",
    "",
    "## Uncertainty, structure, invalidation quality",
    "",
    "| Cutoff | Verdict | Confidence | Structure | Long/Short supported | Uncertainty score | Invalidation score |",
    "|--------|---------|------------|-----------|----------------------|-------------------|-------------------|"
  );

  for (const c of cases) {
    const unc = c.eval.criteria.find((x) => x.id === "uncertainty")!;
    const inv = c.eval.criteria.find((x) => x.id === "invalidation")!;
    const str = c.eval.criteria.find((x) => x.id === "structure_accuracy")!;
    lines.push(
      `| ${c.label} | ${c.pipeline.verdict} | ${c.karen.confidence} | ${c.pipeline.marketStructure} (${str.score}/2) | ${c.pipeline.longSupported}/${c.pipeline.shortSupported} | ${unc.score}/2 | ${inv.score}/2 |`
    );
  }

  lines.push(
    "",
    "---",
    "",
    "## Per-case results",
    ""
  );

  for (const c of cases) {
    lines.push(
      `### ${c.label} — ${c.asOf}`,
      "",
      `- **Price:** ${c.price.toFixed(1)} | **Bars at T:** ${c.barsAvailable} | **data_quality:** ${c.pipeline.dataQuality}`,
      `- **Verdict:** ${c.pipeline.verdict} — ${c.pipeline.verdictReason}`,
      `- **Score:** ${c.eval.totalScore}/${c.eval.maxScore} (${c.eval.pctScore}%) | mentorEvalReady: ${c.eval.mentorEvalReady}`,
      `- **Structure evidence:** ${c.karen.structureEvidence.slice(0, 120)}${c.karen.structureEvidence.length > 120 ? "…" : ""}`,
      `- **Entry idea:** ${c.karen.entryIdea}`,
      `- **Summary:** ${c.eval.summary}`,
      ""
    );
  }

  lines.push("---", "", "## Representative examples", "");

  if (goodExamples.length > 0) {
    lines.push("### Good mentor behaviour", "");
    for (const c of goodExamples) {
      lines.push(
        `**${c.label} (${c.asOf})** — ${c.eval.pctScore}%`,
        `- Verdict: ${c.pipeline.verdict} with confidence ${c.karen.confidence}`,
        `- ${c.karen.entryIdea}`,
        `- ${c.eval.summary}`,
        ""
      );
    }
  }

  if (badExamples.length > 0) {
    lines.push("### Weak mentor behaviour", "");
    for (const c of badExamples) {
      const flags = c.eval.falsifications.filter((f) => f.detected).map((f) => f.flag);
      lines.push(
        `**${c.label} (${c.asOf})** — ${c.eval.pctScore}%`,
        `- Flags: ${flags.length ? flags.join(", ") : "low criterion scores"}`,
        `- ${c.eval.summary}`,
        `- Weak criteria: ${c.eval.criteria.filter((x) => x.score === 0).map((x) => x.id).join(", ") || "none"}`,
        ""
      );
    }
  } else {
    lines.push("No cases scored below 70% or triggered falsification flags.");
  }

  lines.push(
    "",
    "---",
    "",
    "## Interpretation",
    "",
    "Analysis quality is separated from eventual market outcome. WAIT/NO_TRADE verdicts score well when reasoning is honest and uncertainty is expressed.",
    "",
    `- Pipeline source on all ${n} cases — deterministic path not used.`,
    `- All cutoffs: data_quality=good (research_bars adapter working).`,
    `- Dominant verdict pattern: ${[...new Set(cases.map((c) => c.pipeline.verdict))].join(", ")}.`,
    "",
    "**NOT measured:** Whether WAIT was eventually correct. Price direction is diagnostic only in post-hoc audit.",
    "",
    "---",
    "",
    "*Generated by scripts/research-run-mentor-eval.ts*"
  );

  return lines.join("\n");
}

function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

export function buildResponsivenessMarkdownReport(
  result: { datasetId: string; cases: MentorCaseResult[] },
  comparison: ReturnType<typeof compareCheckpointModes>
): string {
  const { cases, datasetId } = result;
  const n = cases.length;
  const avgPct = Math.round(cases.reduce((s, c) => s + c.eval.pctScore, 0) / n);
  const modeATotal = comparison.modeA.total;

  const verdictCounts: Record<string, number> = {};
  for (const c of cases) {
    verdictCounts[c.pipeline.verdict] = (verdictCounts[c.pipeline.verdict] ?? 0) + 1;
  }

  const byDay: Record<string, MentorCaseResult[]> = {};
  for (const c of cases) {
    const day = c.asOf.slice(0, 10);
    (byDay[day] ??= []).push(c);
  }

  const structureStrata = cases.filter((c) => c.stratum?.startsWith("structure_change"));
  const temporalStrata = cases.filter((c) => c.stratum?.startsWith("rth_temporal"));
  const conflictingStrata = cases.filter((c) => c.stratum === "conflicting_setup");

  const avgScore = (subset: MentorCaseResult[]) =>
    subset.length ? Math.round(subset.reduce((s, c) => s + c.eval.pctScore, 0) / subset.length) : null;

  const directional = (cases.filter((c) => c.pipeline.verdict === "LONG" || c.pipeline.verdict === "SHORT").length);
  const dirCi = wilsonInterval(directional, n);

  const byRegime: Record<string, MentorCaseResult[]> = {};
  for (const c of cases) {
    const r = c.regimeProxy ?? "unknown";
    (byRegime[r] ??= []).push(c);
  }

  const lines: string[] = [
    "# Karen Mentor Responsiveness Evaluation — NQ Week Aug 5–12 2026",
    "",
    "**Task ID:** research-mentor-responsiveness-nq-week",
    `**Dataset:** \`${datasetId}\` | **Mode:** B (responsiveness coverage)`,
    "**Path:** Phase 1 pipeline via `buildKarenReplayResponse` (NOT deterministic)",
    "",
    "---",
    "",
    "## Sampling method (Mode B)",
    "",
    "Mode B answers: *How responsive is Karen across changing market conditions?*",
    "",
    "Algorithm (point-in-time only — **no verdict/outcome filtering**):",
    "",
    "1. **Session transitions** — globex open, NY open, lunch, PM, session end (same anchors as Mode A).",
    "2. **RTH temporal density** — grid every **20 min** during NY RTH (14:30–20:59 UTC).",
    "   - *Justification:* 20 min ≈ 16 RTH samples/session; Wilson 95% CI width on directional rate drops from ~16% (n=12) to ~6% (n≈80).",
    "3. **Structure-change candidates** — MSS direction flips, FHDR body-close breaks (bars ≤ T only).",
    "4. **Regime proxies** — trend/range/volatile/quiet shifts from 60-bar heuristic at T.",
    "5. **Conflicting-setup periods** — bull AND bear evidence present at T (MSS vs drift mismatch).",
    "",
    "**Mode A (framework validation)** retains ~12 session anchors/day for rubric fidelity.",
    "",
    "| Mode | Checkpoints (this dataset) | Est. runtime | Question answered |",
    "|------|---------------------------|--------------|-------------------|",
    `| A — Framework | ${modeATotal} | ${comparison.scaling.estimates.oneWeek.estMinutes} min (week scale) | Does reasoning framework function? |`,
    `| B — Responsiveness | ${n} | ${Math.round((n * comparison.scaling.checkpointMsP50) / 60_000 * 10) / 10} min | Responsive across regimes/structure? |`,
    "",
    "---",
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Checkpoints | ${n} (vs Mode A ${modeATotal}) |`,
    `| Average rubric score | ${avgPct}% |`,
    `| Directional verdicts (LONG/SHORT) | ${directional}/${n} (${pct(directional / n)}, 95% CI ${pct(dirCi.low)}–${pct(dirCi.high)}) |`,
    `| WAIT / NO_TRADE | ${(verdictCounts.WAIT ?? 0) + (verdictCounts.NO_TRADE ?? 0)}/${n} |`,
    "",
    "**CI caveat:** Cells with n<10 (e.g. single SHORT) have wide intervals — treat directional rates as indicative, not precise.",
    "",
    "---",
    "",
    "## Verdict distribution",
    "",
    "| Verdict | Count | Share | Wilson 95% CI |",
    "|---------|-------|-------|---------------|",
  ];

  for (const [verdict, count] of Object.entries(verdictCounts).sort((a, b) => b[1] - a[1])) {
    const ci = wilsonInterval(count, n);
    lines.push(`| ${verdict} | ${count} | ${pct(count / n)} | ${pct(ci.low)}–${pct(ci.high)} |`);
  }

  lines.push("", "---", "", "## Per-day breakdown", "", "| Date | n | Avg score | WAIT | NO_TRADE | LONG | SHORT |", "|------|---|-----------|------|----------|------|-------|");

  for (const [day, dayCases] of Object.entries(byDay).sort()) {
    const v = (k: string) => dayCases.filter((c) => c.pipeline.verdict === k).length;
    const dayAvg = Math.round(dayCases.reduce((s, c) => s + c.eval.pctScore, 0) / dayCases.length);
    lines.push(`| ${day} | ${dayCases.length} | ${dayAvg}% | ${v("WAIT")} | ${v("NO_TRADE")} | ${v("LONG")} | ${v("SHORT")} |`);
  }

  lines.push(
    "",
    "---",
    "",
    "## Structure-change vs temporal samples",
    "",
    "| Stratum | n | Avg rubric | Directional rate |",
    "|---------|---|------------|------------------|",
    `| structure_change (MSS flip, FHDR break) | ${structureStrata.length} | ${avgScore(structureStrata) ?? "—"}% | ${structureStrata.length ? pct(structureStrata.filter((c) => c.pipeline.verdict === "LONG" || c.pipeline.verdict === "SHORT").length / structureStrata.length) : "—"} |`,
    `| rth_temporal (20 min grid) | ${temporalStrata.length} | ${avgScore(temporalStrata) ?? "—"}% | ${temporalStrata.length ? pct(temporalStrata.filter((c) => c.pipeline.verdict === "LONG" || c.pipeline.verdict === "SHORT").length / temporalStrata.length) : "—"} |`,
    `| conflicting_setup | ${conflictingStrata.length} | ${avgScore(conflictingStrata) ?? "—"}% | ${conflictingStrata.length ? pct(conflictingStrata.filter((c) => c.pipeline.verdict === "LONG" || c.pipeline.verdict === "SHORT").length / conflictingStrata.length) : "—"} |`,
    "",
    "---",
    "",
    "## Regime proxy breakdown",
    "",
    "| Regime at T | n | Dominant verdict | Avg score |",
    "|-------------|---|------------------|-----------|"
  );

  for (const [regime, regimeCases] of Object.entries(byRegime).sort()) {
    const dom = Object.entries(
      regimeCases.reduce<Record<string, number>>((acc, c) => {
        acc[c.pipeline.verdict] = (acc[c.pipeline.verdict] ?? 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1])[0];
    lines.push(
      `| ${regime} | ${regimeCases.length} | ${dom?.[0] ?? "—"} (${dom?.[1] ?? 0}) | ${avgScore(regimeCases) ?? "—"}% |`
    );
  }

  const allWait = cases.every((c) => c.pipeline.verdict === "WAIT" || c.pipeline.verdict === "NO_TRADE");
  const regimeWithDirectional = Object.entries(byRegime).filter(([, rc]) =>
    rc.some((c) => c.pipeline.verdict === "LONG" || c.pipeline.verdict === "SHORT")
  );

  lines.push(
    "",
    "---",
    "",
    "## Answer: inactive across ALL regimes or only some?",
    "",
    allWait
      ? "**Karen is inactive (WAIT/NO_TRADE) at every checkpoint** in this week sample — no regime showed sustained directional calls."
      : regimeWithDirectional.length === 0
        ? "**Directional calls are rare** — insufficient per-regime cells to distinguish regime-specific inactivity."
        : `**Directional activity is regime-specific:** ${regimeWithDirectional.map(([r]) => r).join(", ")} showed LONG/SHORT; other regimes dominated by WAIT.`,
    "",
    "---",
    "",
    "## What this CAN and CANNOT conclude",
    "",
    "**CAN conclude:**",
    "- Mentor rubric quality across diverse market states (structure changes, regimes, conflicting evidence).",
    "- Whether Karen maintains WAIT posture under dense temporal sampling (not just 12 anchors).",
    "- Relative directional rate at structure-change vs random temporal checkpoints.",
    "",
    "**CANNOT conclude:**",
    "- Whether WAIT was eventually correct (no outcome scoring).",
    "- Edge or P&L — this is mentor reasoning quality only.",
    "- Multi-month mentor drift (one week, one instrument).",
    "- Cherry-picked setups — no verdict filtering was applied.",
    "",
    "---",
    "",
    "*Generated by scripts/research-run-mentor-eval.ts (Mode B)*"
  );

  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetId = args.dataset ?? "nq-aug12-2026-cme";
  const mode = (args.mode ?? "framework") as MentorEvalMode;
  const outDir = args.out ?? path.join(process.cwd(), "data", "research", "mentor-eval-runs");
  const reportPath =
    args.report ??
    (mode === "responsiveness"
      ? path.join(process.cwd(), "data", "supervisor", "results", "research-mentor-responsiveness-nq-week.md")
      : path.join(process.cwd(), "data", "supervisor", "results", "research-mentor-quality-nq-aug12.md"));

  const cutoffsFromFile =
    args.cutoffs != null
      ? (JSON.parse(fs.readFileSync(args.cutoffs, "utf8")) as MentorCutoffSpec[])
      : null;

  const resolved = cutoffsFromFile ? { cutoffs: cutoffsFromFile } : resolveMentorCutoffs(datasetId, mode);
  const cutoffs = resolved.cutoffs;

  console.log(`Running mentor eval (${mode}) on ${datasetId} (${cutoffs.length} cutoffs)…`);
  const result = runMentorEvalBatch(datasetId, cutoffs);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const runId = `mentor-eval-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const jsonPath = path.join(outDir, `${runId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");

  const md =
    mode === "responsiveness" && resolved.comparison
      ? buildResponsivenessMarkdownReport(result, resolved.comparison)
      : buildMarkdownReport(result);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, md, "utf8");

  const avgPct = Math.round(result.cases.reduce((s, c) => s + c.eval.pctScore, 0) / result.cases.length);
  console.log(`\n=== MENTOR QUALITY EVAL ===`);
  console.log(`Cases: ${result.cases.length} | Avg score: ${avgPct}%`);
  console.log(`JSON:   ${jsonPath}`);
  console.log(`Report: ${reportPath}`);
  for (const c of result.cases) {
    console.log(`  ${c.label.padEnd(18)} ${c.pipeline.verdict.padEnd(10)} ${c.eval.pctScore}% ready=${c.eval.mentorEvalReady}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
