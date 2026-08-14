#!/usr/bin/env npx tsx
/**
 * Layer 1 full-resolution mentor minute replay — every 1m cutoff, Phase 1 pipeline.
 * Run: npm run research:mentor-minute-replay -- [--dataset nq-week-aug05-aug12-2026-cme] [--full-week]
 */
import fs from "fs";
import path from "path";
import {
  runMinuteReplay,
  type MinuteReplayReport,
  type StateTransition,
} from "../lib/research/mentor/minute-replay";
import { ensureResearchFixtures, loadResearchDatasetFixture } from "../lib/research/replay/fixtures";

const DEFAULT_DATASET = "nq-week-aug05-aug12-2026-cme";
const DAY_BENCHMARK_DATASET = "nq-aug12-2026-cme";
const BENCHMARK_DAY = "2026-08-12";
const WEEK_RUNTIME_CAP_MS = 20 * 60_000;

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

function formatTransitionTable(rows: StateTransition[], limit = 40): string {
  if (rows.length === 0) return "_None detected._\n";
  const head = rows.slice(0, limit);
  const lines = [
    "| Time (UTC) | Field | From | To |",
    "|------------|-------|------|-----|",
    ...head.map(
      (t) => `| ${t.asOf.replace(".000Z", "Z").slice(0, 19)} | ${t.field} | ${String(t.from)} | ${String(t.to)} |`
    ),
  ];
  if (rows.length > limit) lines.push(`\n_…and ${rows.length - limit} more._`);
  return lines.join("\n") + "\n";
}

function formatDistribution(dist: Record<string, number>): string {
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- **${k}:** ${v} (${total > 0 ? ((v / total) * 100).toFixed(1) : 0}%)`)
    .join("\n");
}

function formatWindows(report: MinuteReplayReport): string {
  const windows = [...report.setupEligibleWindows, ...report.entryActiveWindows];
  if (windows.length === 0) return "_No actionable windows detected._\n";
  const lines = [
    "| Kind | Start | End | Duration (min) | Verdict | Entry status | Act→Inv (min) |",
    "|------|-------|-----|----------------|---------|--------------|---------------|",
    ...windows.slice(0, 30).map(
      (w) =>
        `| ${w.kind} | ${w.startAsOf.slice(11, 16)} | ${w.endAsOf.slice(11, 16)} | ${w.durationMinutes} | ${w.verdictAtStart} | ${w.entryStatus ?? "-"} | ${w.activationToInvalidationMinutes ?? "-"} |`
    ),
  ];
  if (windows.length > 30) lines.push(`\n_…and ${windows.length - 30} more windows._`);
  return lines.join("\n") + "\n";
}

function reportSection(title: string, report: MinuteReplayReport): string[] {
  const r = report.responsiveness;
  return [
    `### ${title}`,
    "",
    `- Evaluations: **${report.evaluationCount.toLocaleString()}** | Runtime: **${(report.runtimeMs / 1000).toFixed(1)}s** (${report.msPerEvaluation.toFixed(1)} ms/eval)`,
    `- Range: ${report.range.start} → ${report.range.end}`,
    `- Verdict transitions: **${r.verdictTransitionCount}** | entry ACTIVE windows: **${r.entryActiveWindowCount}** (${r.totalEntryActiveMinutes} min) | setup-eligible: **${r.setupEligibleWindowCount}** (${r.totalSetupEligibleMinutes} min)`,
    `- Structure / bias / session changes: **${report.structureChanges.length}** / **${report.biasChanges.length}** / **${report.sessionChanges.length}**`,
    `- Responsive: **${r.responsive ? "YES" : "NO"}** — ${r.evidence}`,
    `- Poison test: ${report.poisonTest.pass ? "✅ PASS" : "❌ FAIL"} — ${report.poisonTest.detail}`,
    "",
  ];
}

function buildMarkdown(opts: {
  dataset: string;
  dayReport: MinuteReplayReport;
  weekReport: MinuteReplayReport | null;
  weekEstimateMs: number;
  weekRan: boolean;
}): string {
  const primary = opts.weekReport ?? opts.dayReport;
  const r = primary.responsiveness;
  const verdict = r.responsive
    ? "**Karen IS responsive** — minute replay detected state transitions and/or actionable windows at native 1m resolution."
    : "**Karen appears static** in the evaluated range — no verdict, entry, or structure transitions (this is NOT inferred from coarse checkpoints).";

  const weekSection =
    opts.weekRan && opts.weekReport
      ? reportSection("Full week (all m1 bars)", opts.weekReport)
      : [
          `- Full week **not executed** — extrapolated runtime ~**${(opts.weekEstimateMs / 1000 / 60).toFixed(1)} min** (cap ${WEEK_RUNTIME_CAP_MS / 60_000} min).`,
          `- Extrapolation: ${opts.dayReport.msPerEvaluation.toFixed(1)} ms/eval × week m1 bars.`,
          `- Re-run with \`--full-week\` to force complete week replay.`,
          "",
        ];

  return [
    "# Mentor Minute Replay — Layer 1 (Full Resolution)",
    "",
    `**Dataset:** \`${opts.dataset}\``,
    `**Generated:** ${new Date().toISOString()}`,
    "",
    "## Methodology",
    "",
    "- **Layer 1 (this report):** Phase 1 pipeline at **every 1-minute cutoff** — point-in-time only.",
    "- **Layer 2 (not run):** 10-criterion mentor rubric on Layer 1 episodes only — not a substitute for minute replay.",
    "- **Do NOT** conclude unresponsiveness from 15–30 min checkpoint sampling alone.",
    "",
    "## Benchmark — Aug 12 (1 CME day)",
    "",
    `**Day benchmark fixture:** \`${DAY_BENCHMARK_DATASET}\` (full CME session, every 1m bar)`,
    "",
    ...reportSection(`CME session ${BENCHMARK_DAY}`, opts.dayReport),
    "",
    "## Week run",
    "",
    ...weekSection,
    "",
    "## Primary responsiveness verdict",
    "",
    verdict,
    "",
    r.evidence,
    "",
    "### Aggregate metrics (primary scope)",
    "",
    `- Minute evaluations: **${primary.evaluationCount.toLocaleString()}**`,
    `- Verdict transitions: **${primary.verdictTransitions.length}**`,
    `- entryStatus ACTIVE windows: **${primary.entryActiveWindows.length}** (${primary.responsiveness.totalEntryActiveMinutes} total minutes)`,
    `- Setup-eligible windows: **${primary.setupEligibleWindows.length}** (${primary.responsiveness.totalSetupEligibleMinutes} total minutes)`,
    `- Episode indices for Layer 2 rubric: **${primary.episodeIndices.length}**`,
    "",
    "## Verdict distribution",
    "",
    formatDistribution(primary.verdictDistribution),
    "",
    "## Entry status distribution",
    "",
    formatDistribution(primary.entryStatusDistribution),
    "",
    "## Verdict transitions",
    "",
    formatTransitionTable(primary.verdictTransitions),
    "",
    "## Entry status transitions",
    "",
    formatTransitionTable(primary.entryStatusTransitions, 25),
    "",
    "## Structure / bias / session changes",
    "",
    "**Structure:**",
    formatTransitionTable(primary.structureChanges, 20),
    "**Bias:**",
    formatTransitionTable(primary.biasChanges, 15),
    "**Session:**",
    formatTransitionTable(primary.sessionChanges, 15),
    "",
    "## Actionable windows",
    "",
    formatWindows(primary),
    "",
    "---",
    "*Generated by scripts/research-run-mentor-minute-replay.ts — research only.*",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataset = args.dataset ?? DEFAULT_DATASET;
  const forceWeek = args["full-week"] === "true";
  const dayOnly = args.day;
  const outPath =
    args.out ??
    path.join(process.cwd(), "data", "supervisor", "results", "research-mentor-minute-replay-nq-week.md");

  ensureResearchFixtures();
  const weekFixture = loadResearchDatasetFixture(dataset);
  const dayFixture = loadResearchDatasetFixture(DAY_BENCHMARK_DATASET);

  console.log(`Minute replay week dataset: ${dataset} (${weekFixture.m1.length} m1 bars)`);
  console.log(`Day benchmark fixture: ${DAY_BENCHMARK_DATASET} (${dayFixture.m1.length} m1 bars)`);

  const dayReport = runMinuteReplay({
    datasetId: DAY_BENCHMARK_DATASET,
    data: dayFixture,
    onProgress: (d, t) => process.stdout.write(`\r  day ${d}/${t}…`),
  });
  console.log(`\n  Day: ${dayReport.evaluationCount} evals, ${(dayReport.runtimeMs / 1000).toFixed(1)}s (${dayReport.msPerEvaluation.toFixed(0)} ms/eval)`);

  const weekEstimateMs = dayReport.msPerEvaluation * weekFixture.m1.length;
  console.log(`  Week estimate (${weekFixture.m1.length} bars): ~${(weekEstimateMs / 1000 / 60).toFixed(1)} min`);

  let weekReport: MinuteReplayReport | null = null;
  let weekRan = false;

  if (!dayOnly && (forceWeek || weekEstimateMs <= WEEK_RUNTIME_CAP_MS)) {
    console.log("\nRunning full week…");
    weekReport = runMinuteReplay({
      datasetId: dataset,
      data: weekFixture,
      onProgress: (d, t) => process.stdout.write(`\r  week ${d}/${t}…`),
    });
    weekRan = true;
    console.log(`\n  Week: ${weekReport.evaluationCount} evals, ${(weekReport.runtimeMs / 1000).toFixed(1)}s`);
  } else if (!dayOnly) {
    console.log(`  Skipping week (estimate > ${WEEK_RUNTIME_CAP_MS / 60_000} min). Use --full-week to override.`);
  }

  const primary = weekReport ?? dayReport;
  const md = buildMarkdown({ dataset, dayReport, weekReport, weekEstimateMs, weekRan });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, "utf8");
  fs.writeFileSync(outPath.replace(/\.md$/, ".json"), JSON.stringify({ dayReport, weekReport, weekEstimateMs }, null, 2), "utf8");

  console.log(`\nReport: ${outPath}`);
  console.log(`Responsiveness (${weekRan ? "week" : "day"}): ${primary.responsiveness.responsive ? "YES" : "NO"}`);
  console.log(`  ${primary.responsiveness.evidence}`);
  console.log(
    `Transitions: verdict=${primary.verdictTransitions.length} entryActive=${primary.entryActiveWindows.length} setup=${primary.setupEligibleWindows.length}`
  );
}

main();
