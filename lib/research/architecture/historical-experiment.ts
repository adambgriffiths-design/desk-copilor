/**
 * First historical research experiment — research-only harness.
 * Frozen architecture-v1, checkpoint-based (not per-bar), PIT at T, outcomes after T.
 * Does not modify production Karen or envelope semantics.
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { PLAYBOOK_CHAIN_CONCEPTS } from "../../decision-envelope";
import { cmeSessionDateKey } from "../../tickstream/htf-aggregate";
import type { Bar } from "../../types";
import { RESEARCH_FIXTURES_DIR, RESEARCH_RUNS_DIR, ensureResearchDataRoot } from "../paths";
import { loadResearchDatasetFixture } from "../replay/fixtures";
import type { ReplayMarketData } from "../replay/types";
import {
  selectFrameworkCheckpoints,
  summarizeCheckpointPlan,
  type CheckpointCandidate,
} from "../mentor/checkpoint-selection";
import { evaluateArchitecturesAtCutoff, type EvaluatedDecision } from "./evaluate";
import { fingerprintDecisionTrace } from "./fingerprint";
import { poisonFuture, cutoffContextFingerprintInputs } from "./pit";
import { ResearchContextSession } from "../replay/incremental-context";
import { resolveResearchReplayMode } from "../replay/mode";
import {
  assignSplit,
  planTemporalSplits,
  sampleAdequacy,
  uniqueSessionDays,
  assertNoSelectOnEval,
  type TemporalSplit,
} from "./splits";
import type {
  ArchitectureVersionId,
  ConceptStatus,
  DecisionTrace,
  EvidenceClass,
  MarketDecisionContext,
  RichOutcomeLabels,
  SplitPhase,
} from "./types";
import { MIN_N_MEANINGFUL, MIN_N_REPORT } from "./types";

export const HISTORICAL_EXPERIMENT_SCHEMA = "historical-experiment-v1" as const;
export const FROZEN_ARCHITECTURE: ArchitectureVersionId = "architecture-v1";
/** Default forward window for outcome labeling — bars strictly after T only. */
export const DEFAULT_FORWARD_BARS = 30;

/** One calendar month ≈ 22 CME session days (research labeling only). */
export const TARGET_SESSION_DAYS = 22;

export type AvailableDataset = {
  id: string;
  alias: string;
  barCount: number;
  sessionDays: number;
  calendarSpanDays: number;
  dataVersion: string | null;
  source: string | null;
  startTime: string;
  endTime: string;
  meetsMonthTarget: boolean;
  gapLabel: string;
};

export type CompactDecisionRecord = {
  timestamp: string;
  split: SplitPhase;
  checkpoint: {
    label: string;
    sessionDate: string;
    sessionPhase: string;
    regimeProxy: string;
    stratum: string;
  };
  architectureVersion: ArchitectureVersionId;
  stance: DecisionTrace["stance"];
  pipelineVerdict: DecisionTrace["pipelineVerdict"];
  entry: string | null;
  target: string | null;
  invalidation: string | null;
  conflicts: DecisionTrace["conflicts"];
  htfContext: DecisionTrace["htfContext"];
  tactical: DecisionTrace["tactical"];
  execution: DecisionTrace["execution"];
  concepts: ConceptStatus[];
  fingerprint: string;
  tripleFingerprint: string;
  evidenceClass: EvidenceClass;
  context: MarketDecisionContext;
};

export type OutcomeRecord = {
  observationTimestamp: string;
  /** Outcomes computed only from bars strictly after decision T. */
  labeledAfterT: true;
  forwardBarCount: number;
  outcome: RichOutcomeLabels;
};

export type LeakageTestResult = {
  checkpoint: string;
  poisonsPassed: number;
  poisonsTotal: number;
  passed: boolean;
};

export type ReproducibilityResult = {
  checkpoint: string;
  run1Fingerprint: string;
  run2Fingerprint: string;
  passed: boolean;
};

export type SplitSummary = {
  phase: SplitPhase;
  checkpoints: number;
  long: number;
  short: number;
  wait: number;
  flat: number;
  monitor: number;
  adequacy: ReturnType<typeof sampleAdequacy>;
};

export type HistoricalExperimentResult = {
  schemaVersion: typeof HISTORICAL_EXPERIMENT_SCHEMA;
  runId: string;
  createdAt: string;
  evidenceClass: EvidenceClass;
  architectureVersion: ArchitectureVersionId;
  selectedArchitectureFrom: null;
  dataset: AvailableDataset;
  checkpointMode: "framework_session_anchors";
  checkpointTradeoff: string;
  checkpoints: number;
  decisions: number;
  splits: TemporalSplit[];
  splitSummaries: SplitSummary[];
  stanceTotals: { long: number; short: number; wait: number; flat: number; monitor: number };
  conceptCoverage: Record<string, { detected: number; used: number; influential: number }>;
  provenanceCoverage: {
    conceptsWithEvidence: number;
    conceptsTotal: number;
    rate: number;
  };
  outcomeCoverage: {
    withForwardBars: number;
    total: number;
    rate: number;
  };
  pitTest: { leakage: LeakageTestResult; reproducibility: ReproducibilityResult[] };
  trainValOos: { splits: TemporalSplit[]; summaries: SplitSummary[] };
  leakageTestPassed: boolean;
  reproducibilityPassed: boolean;
  dataGap: string;
  researchGap: string;
  nextExperiment: string;
  runDir: string;
  wallTimeMs: number;
  dryRun: boolean;
};

function sessionDaysFromBars(m1: Bar[]): number {
  const days = new Set<string>();
  for (const b of m1) days.add(cmeSessionDateKey(Math.floor(b.time.getTime() / 1000)));
  return days.size;
}

function calendarSpanDays(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function readManifest(fixtureId: string): Record<string, unknown> | null {
  const p = path.join(RESEARCH_FIXTURES_DIR, fixtureId, "manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Discover on-disk NQ research fixtures — prefer longest calendar span. */
export function discoverAvailableDatasets(): AvailableDataset[] {
  if (!fs.existsSync(RESEARCH_FIXTURES_DIR)) return [];
  const out: AvailableDataset[] = [];
  for (const entry of fs.readdirSync(RESEARCH_FIXTURES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = readManifest(entry.name);
    if (!manifest) continue;
    const candlesPath = path.join(RESEARCH_FIXTURES_DIR, entry.name, "candles.json");
    if (!fs.existsSync(candlesPath)) continue;
    let barCount = 0;
    try {
      const candles = JSON.parse(fs.readFileSync(candlesPath, "utf8")) as unknown[];
      barCount = candles.length;
    } catch {
      continue;
    }
    const startTs = (manifest.start_timestamp as number) ?? 0;
    const endTs = (manifest.end_timestamp as number) ?? startTs;
    const startTime = new Date(startTs * 1000).toISOString();
    const endTime = new Date(endTs * 1000).toISOString();
    const sessionDays = Math.max(1, Math.round(barCount / 1381));
    const calendarSpanDays_ = calendarSpanDays(new Date(startTs * 1000), new Date(endTs * 1000));
    const meetsMonthTarget = calendarSpanDays_ >= 28 || sessionDays >= TARGET_SESSION_DAYS;
    const gapLabel = meetsMonthTarget
      ? "≥1 calendar month on disk"
      : `GAP: ${calendarSpanDays_} calendar days / ~${sessionDays} session-days — need ≥1 month PIT NQ via TickStream or NT export`;
    out.push({
      id: (manifest.dataset_id as string) ?? entry.name,
      alias: entry.name,
      barCount,
      sessionDays,
      calendarSpanDays: calendarSpanDays_,
      dataVersion: (manifest.data_version as string) ?? null,
      source: (manifest.source as string) ?? null,
      startTime,
      endTime,
      meetsMonthTarget,
      gapLabel,
    });
  }
  return out.sort((a, b) => b.barCount - a.barCount);
}

export function selectBestAvailableDataset(): AvailableDataset | null {
  const nq = discoverAvailableDatasets().filter(
    (d) => d.alias.includes("nq") || d.source === "tickstream"
  );
  return nq[0] ?? discoverAvailableDatasets()[0] ?? null;
}

function compactDecision(
  evaluated: EvaluatedDecision,
  split: SplitPhase,
  checkpoint: CheckpointCandidate
): CompactDecisionRecord {
  const t = evaluated.trace;
  return {
    timestamp: t.timestamp,
    split,
    checkpoint: {
      label: checkpoint.label,
      sessionDate: checkpoint.sessionDate,
      sessionPhase: checkpoint.sessionPhase,
      regimeProxy: checkpoint.regimeProxy,
      stratum: checkpoint.stratum,
    },
    architectureVersion: t.architectureVersion,
    stance: t.stance,
    pipelineVerdict: t.pipelineVerdict,
    entry: t.entry,
    target: t.target,
    invalidation: t.invalidation,
    conflicts: t.conflicts,
    htfContext: t.htfContext,
    tactical: t.tactical,
    execution: t.execution,
    concepts: t.concepts,
    fingerprint: evaluated.fingerprint,
    tripleFingerprint: evaluated.tripleFingerprint,
    evidenceClass: t.evidenceClass,
    context: evaluated.context,
  };
}

function outcomeRecord(timestamp: string, outcome: RichOutcomeLabels, forwardBarCount: number): OutcomeRecord {
  return {
    observationTimestamp: timestamp,
    labeledAfterT: true,
    forwardBarCount,
    outcome,
  };
}

function aggregateConceptCoverage(records: CompactDecisionRecord[]): HistoricalExperimentResult["conceptCoverage"] {
  const cov: HistoricalExperimentResult["conceptCoverage"] = {};
  for (const r of records) {
    for (const c of r.concepts) {
      const slot = (cov[c.concept] ??= { detected: 0, used: 0, influential: 0 });
      if (c.detected) slot.detected++;
      if (c.used) slot.used++;
      if (c.influential) slot.influential++;
    }
  }
  return cov;
}

function provenanceCoverage(records: CompactDecisionRecord[]): HistoricalExperimentResult["provenanceCoverage"] {
  let withEvidence = 0;
  let total = 0;
  for (const r of records) {
    for (const c of r.concepts) {
      if (!c.detected) continue;
      total++;
      if (c.evidence && c.evidence.trim().length > 0) withEvidence++;
    }
  }
  return {
    conceptsWithEvidence: withEvidence,
    conceptsTotal: total,
    rate: total > 0 ? withEvidence / total : 0,
  };
}

function stanceTotals(records: CompactDecisionRecord[]) {
  const t = { long: 0, short: 0, wait: 0, flat: 0, monitor: 0 };
  for (const r of records) {
    if (r.stance === "long") t.long++;
    else if (r.stance === "short") t.short++;
    else if (r.stance === "wait") t.wait++;
    else if (r.stance === "flat") t.flat++;
    else if (r.stance === "monitor") t.monitor++;
  }
  return t;
}

function splitSummaries(records: CompactDecisionRecord[], splits: TemporalSplit[]): SplitSummary[] {
  const phases: SplitPhase[] = ["TRAIN", "VALIDATION", "OOS"];
  return phases.map((phase) => {
    const subset = records.filter((r) => r.split === phase);
    const t = stanceTotals(subset);
    return {
      phase,
      checkpoints: subset.length,
      ...t,
      adequacy: sampleAdequacy(subset.length),
    };
  });
}

export function runLeakageTest(data: ReplayMarketData, asOf: Date): LeakageTestResult {
  const kinds = ["price", "swing", "sweep", "mss", "fvg", "liquidity"] as const;
  const base = cutoffContextFingerprintInputs(data, asOf);
  let passed = 0;
  for (const kind of kinds) {
    const poisoned = poisonFuture(data, asOf, kind);
    const after = cutoffContextFingerprintInputs(poisoned, asOf);
    if (JSON.stringify(base) === JSON.stringify(after)) passed++;
  }
  return {
    checkpoint: asOf.toISOString(),
    poisonsPassed: passed,
    poisonsTotal: kinds.length,
    passed: passed === kinds.length,
  };
}

export function runReproducibilityCheck(
  data: ReplayMarketData,
  asOf: Date,
  datasetId: string
): ReproducibilityResult {
  const run = (version: ArchitectureVersionId) =>
    evaluateArchitecturesAtCutoff({
      data,
      asOf,
      datasetId,
      versions: [version],
      evidenceClass: "INFRASTRUCTURE",
    })[0]!.fingerprint;

  const fp1 = run(FROZEN_ARCHITECTURE);
  const fp2 = run(FROZEN_ARCHITECTURE);
  return {
    checkpoint: asOf.toISOString(),
    run1Fingerprint: fp1,
    run2Fingerprint: fp2,
    passed: fp1 === fp2,
  };
}

export type RunHistoricalExperimentOptions = {
  datasetAlias?: string;
  forwardBarCount?: number;
  maxCheckpoints?: number;
  dryRun?: boolean;
  runId?: string;
  /** Run leakage + reproducibility on first checkpoint only (default true). */
  runIntegrityChecks?: boolean;
  /** CURRENT = full rebuild per checkpoint; OPTIMIZED = incremental (default CURRENT). */
  mode?: import("../replay/mode").ResearchReplayMode;
};

export function runHistoricalExperiment(opts: RunHistoricalExperimentOptions = {}): HistoricalExperimentResult {
  const started = Date.now();
  ensureResearchDataRoot();

  const available = discoverAvailableDatasets();
  const picked =
    (opts.datasetAlias ? available.find((d) => d.alias === opts.datasetAlias || d.id === opts.datasetAlias) : null) ??
    selectBestAvailableDataset();

  if (!picked) {
    throw new Error("No research datasets on disk — ingest NQ 1m via research:dataset first");
  }

  const data = loadResearchDatasetFixture(picked.alias);
  const actualSessionDays = sessionDaysFromBars(data.m1);
  const dataset: AvailableDataset = { ...picked, sessionDays: actualSessionDays };

  const splits = planTemporalSplits(data.m1);
  const allCheckpoints = selectFrameworkCheckpoints(data.m1);
  const checkpoints =
    opts.maxCheckpoints != null && opts.maxCheckpoints > 0
      ? allCheckpoints.slice(0, opts.maxCheckpoints)
      : allCheckpoints;

  const runId =
    opts.runId ??
    `hist-exp-${new Date().toISOString().replace(/[:.]/g, "-")}-${picked.alias.slice(0, 20)}`;
  const runDir = path.join(RESEARCH_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const evidenceClass: EvidenceClass = dataset.meetsMonthTarget ? "INFRASTRUCTURE" : "DEBUGGING";
  const forwardBarCount = opts.forwardBarCount ?? DEFAULT_FORWARD_BARS;

  if (opts.dryRun) {
    const plan = summarizeCheckpointPlan(checkpoints);
    const manifest = {
      schemaVersion: HISTORICAL_EXPERIMENT_SCHEMA,
      runId,
      dryRun: true,
      dataset,
      checkpointCount: checkpoints.length,
      checkpointPlan: plan,
      splits,
    };
    fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    return buildResult({
      runId,
      runDir,
      dataset,
      splits,
      decisions: [],
      outcomes: [],
      checkpoints,
      leakage: { checkpoint: "", poisonsPassed: 0, poisonsTotal: 6, passed: false },
      repro: [],
      wallTimeMs: Date.now() - started,
      dryRun: true,
      forwardBarCount,
      evidenceClass,
    });
  }

  const decisions: CompactDecisionRecord[] = [];
  const outcomes: OutcomeRecord[] = [];
  const repro: ReproducibilityResult[] = [];
  let leakage: LeakageTestResult = { checkpoint: "", poisonsPassed: 0, poisonsTotal: 6, passed: false };
  const replayMode = opts.mode ?? resolveResearchReplayMode();
  const contextSession = replayMode === "OPTIMIZED" ? new ResearchContextSession() : undefined;
  if (contextSession) contextSession.reset(data);

  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i]!;
    const asOf = new Date(cp.asOf);

    if (i === 0 && opts.runIntegrityChecks !== false) {
      leakage = runLeakageTest(data, asOf);
      repro.push(runReproducibilityCheck(data, asOf, dataset.id));
    }

    const evaluated = evaluateArchitecturesAtCutoff({
      data,
      asOf,
      datasetId: dataset.id,
      versions: [FROZEN_ARCHITECTURE],
      evidenceClass,
      forwardBarCount,
      mode: replayMode,
      contextSession,
    })[0]!;

    const split = assignSplit(data.m1, cp.asOf, splits) ?? "TRAIN";
    decisions.push(compactDecision(evaluated, split, cp));
    if (evaluated.outcome) {
      outcomes.push(outcomeRecord(cp.asOf, evaluated.outcome, forwardBarCount));
    }

    if ((i + 1) % 10 === 0 || i === checkpoints.length - 1) {
      process.stderr.write(`[historical-experiment] ${i + 1}/${checkpoints.length} checkpoints\n`);
    }
  }

  fs.writeFileSync(
    path.join(runDir, "decisions.jsonl"),
    decisions.map((d) => JSON.stringify(d)).join("\n") + (decisions.length ? "\n" : ""),
    "utf8"
  );
  fs.writeFileSync(
    path.join(runDir, "outcomes.jsonl"),
    outcomes.map((o) => JSON.stringify(o)).join("\n") + (outcomes.length ? "\n" : ""),
    "utf8"
  );

  const manifest = {
    schemaVersion: HISTORICAL_EXPERIMENT_SCHEMA,
    runId,
    architectureVersion: FROZEN_ARCHITECTURE,
    selectedArchitectureFrom: null,
    dataset,
    evidenceClass,
    checkpointMode: "framework_session_anchors",
    checkpointTradeoff:
      "~12 session-phase anchors per CME day — not per-bar (~100× cheaper than full pass; see readiness audit)",
    splits,
    checkpointSummary: summarizeCheckpointPlan(checkpoints),
    forwardBarCount,
    decisions: decisions.length,
    outcomes: outcomes.length,
    runFingerprint: fingerprintRun(decisions, dataset.dataVersion),
    assertNoSelectOnEval: assertNoSelectOnEval({ selectedArchitectureFrom: null }),
  };
  fs.writeFileSync(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  return buildResult({
    runId,
    runDir,
    dataset,
    splits,
    decisions,
    outcomes,
    checkpoints,
    leakage,
    repro,
    wallTimeMs: Date.now() - started,
    dryRun: false,
    forwardBarCount,
    evidenceClass,
  });
}

function fingerprintRun(decisions: CompactDecisionRecord[], dataVersion: string | null): string {
  const payload = {
    dataVersion,
    architecture: FROZEN_ARCHITECTURE,
    fingerprints: decisions.map((d) => d.fingerprint),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildResult(input: {
  runId: string;
  runDir: string;
  dataset: AvailableDataset;
  splits: TemporalSplit[];
  decisions: CompactDecisionRecord[];
  outcomes: OutcomeRecord[];
  checkpoints: CheckpointCandidate[];
  leakage: LeakageTestResult;
  repro: ReproducibilityResult[];
  wallTimeMs: number;
  dryRun: boolean;
  forwardBarCount: number;
  evidenceClass: EvidenceClass;
}): HistoricalExperimentResult {
  const totals = stanceTotals(input.decisions);
  const summaries = splitSummaries(input.decisions, input.splits);
  const conceptCov = aggregateConceptCoverage(input.decisions);
  const prov = provenanceCoverage(input.decisions);
  const outcomeCov = {
    withForwardBars: input.outcomes.filter((o) => o.forwardBarCount > 0).length,
    total: input.decisions.length,
    rate: input.decisions.length ? input.outcomes.length / input.decisions.length : 0,
  };

  const missingPlaybook = PLAYBOOK_CHAIN_CONCEPTS.filter((id) => !conceptCov[id]);
  const dataGap = input.dataset.gapLabel;
  const researchGap =
    input.decisions.length < MIN_N_MEANINGFUL
      ? `Sample n=${input.decisions.length} < ${MIN_N_MEANINGFUL} — all rates are INFRASTRUCTURE/DEBUGGING only`
      : missingPlaybook.length
        ? `Playbook concepts never detected: ${missingPlaybook.join(", ")}`
        : "No multi-architecture comparison or ablation yet — v2/v3/H-A/B/C remain UNTESTED";

  return {
    schemaVersion: HISTORICAL_EXPERIMENT_SCHEMA,
    runId: input.runId,
    createdAt: new Date().toISOString(),
    evidenceClass: input.evidenceClass,
    architectureVersion: FROZEN_ARCHITECTURE,
    selectedArchitectureFrom: null,
    dataset: input.dataset,
    checkpointMode: "framework_session_anchors",
    checkpointTradeoff:
      "~12 session-phase anchors per CME day — not per-bar (~100× cheaper than full pass; see readiness audit)",
    checkpoints: input.checkpoints.length,
    decisions: input.decisions.length,
    splits: input.splits,
    splitSummaries: summaries,
    stanceTotals: totals,
    conceptCoverage: conceptCov,
    provenanceCoverage: prov,
    outcomeCoverage: outcomeCov,
    pitTest: { leakage: input.leakage, reproducibility: input.repro },
    trainValOos: { splits: input.splits, summaries },
    leakageTestPassed: input.leakage.passed,
    reproducibilityPassed: input.repro.every((r) => r.passed),
    dataGap,
    researchGap,
    nextExperiment:
      input.dataset.meetsMonthTarget
        ? "TRAIN-only v1 traces on full month; then frozen v2/v3 overlay smoke (no winner selection)"
        : "Acquire ≥1 month PIT NQ 1m (TickStream week batches or NT Minute/Last GUI export); re-run this harness",
    runDir: input.runDir,
    wallTimeMs: input.wallTimeMs,
    dryRun: input.dryRun,
  };
}

export function formatHistoricalExperimentReport(result: HistoricalExperimentResult): string {
  const s = result.splitSummaries;
  const warn =
    result.decisions < MIN_N_REPORT
      ? `\n> **WARNING:** n=${result.decisions} < ${MIN_N_REPORT} — insufficient for any rate interpretation.\n`
      : result.decisions < MIN_N_MEANINGFUL
        ? `\n> **WARNING:** n=${result.decisions} < ${MIN_N_MEANINGFUL} — minimum reporting only; not EDGE.\n`
        : "";

  const pitLine = result.dryRun
    ? "SKIPPED (dry-run)"
    : result.leakageTestPassed && result.reproducibilityPassed
      ? "PASS — 6/6 poisons + fingerprint reproducibility on first checkpoint"
      : `FAIL — leakage ${result.pitTest.leakage.poisonsPassed}/${result.pitTest.leakage.poisonsTotal}; repro ${result.reproducibilityPassed}`;

  return `# First historical research experiment

**Date:** ${result.createdAt.slice(0, 10)}  
**Run ID:** \`${result.runId}\`  
**Status:** ${result.dryRun ? "DRY-RUN (plan only)" : "EXECUTED"}  
**Evidence class:** **${result.evidenceClass}** — not **EDGE EVIDENCE**  
**Architecture:** frozen \`${result.architectureVersion}\` only — no winner selected  
${warn}
---

## FINAL REPORT

| Field | Value |
|-------|-------|
| **DATA** | \`${result.dataset.alias}\` — ${result.dataset.barCount} bars, ${result.dataset.sessionDays} CME session-days, ${result.dataset.calendarSpanDays} calendar days (${result.dataset.startTime.slice(0, 10)} → ${result.dataset.endTime.slice(0, 10)}). Source: ${result.dataset.source ?? "unknown"}. data_version: \`${result.dataset.dataVersion ?? "n/a"}\`. ${result.dataGap} |
| **CHECKPOINTS** | ${result.checkpoints} (${result.checkpointMode}). ${result.checkpointTradeoff} |
| **DECISIONS** | ${result.decisions} complete v1 traces |
| **LONG** | ${result.stanceTotals.long} |
| **SHORT** | ${result.stanceTotals.short} |
| **WAIT** | ${result.stanceTotals.wait} |
| **FLAT** | ${result.stanceTotals.flat + result.stanceTotals.monitor} (flat ${result.stanceTotals.flat}, monitor ${result.stanceTotals.monitor}) |
| **CONCEPT COVERAGE** | ${Object.keys(result.conceptCoverage).length} concepts seen; playbook detected counts: ${PLAYBOOK_CHAIN_CONCEPTS.map((c) => `${c}=${result.conceptCoverage[c]?.detected ?? 0}`).join(", ")} |
| **PROVENANCE COVERAGE** | ${result.provenanceCoverage.conceptsWithEvidence}/${result.provenanceCoverage.conceptsTotal} detected concepts with evidence (${(result.provenanceCoverage.rate * 100).toFixed(1)}%) |
| **OUTCOME COVERAGE** | ${result.outcomeCoverage.withForwardBars}/${result.outcomeCoverage.total} with forward-window outcomes (${(result.outcomeCoverage.rate * 100).toFixed(1)}%) — labeled **after** T only |
| **PIT TEST** | ${pitLine} |
| **TRAIN VAL OOS** | TRAIN n=${s.find((x) => x.phase === "TRAIN")?.checkpoints ?? 0} (${s.find((x) => x.phase === "TRAIN")?.adequacy ?? "n/a"}); VAL n=${s.find((x) => x.phase === "VALIDATION")?.checkpoints ?? 0}; OOS n=${s.find((x) => x.phase === "OOS")?.checkpoints ?? 0} — chronological 60/20/20, no shuffle |
| **LEAKAGE TEST** | Outcomes in separate \`outcomes.jsonl\`; forward bars strictly after decision timestamp; architecture selection on VAL/OOS forbidden (\`selectedArchitectureFrom: null\`) |
| **BIGGEST DATA GAP** | ${result.dataGap} |
| **BIGGEST RESEARCH GAP** | ${result.researchGap} |
| **NEXT HIGHEST-VALUE EXPERIMENT** | ${result.nextExperiment} |

---

## Split detail

| Phase | n | LONG | SHORT | WAIT | FLAT+MON | Adequacy |
|-------|---|------|-------|------|----------|----------|
| TRAIN | ${s[0]?.checkpoints ?? 0} | ${s[0]?.long ?? 0} | ${s[0]?.short ?? 0} | ${s[0]?.wait ?? 0} | ${(s[0]?.flat ?? 0) + (s[0]?.monitor ?? 0)} | ${s[0]?.adequacy ?? "n/a"} |
| VALIDATION | ${s[1]?.checkpoints ?? 0} | ${s[1]?.long ?? 0} | ${s[1]?.short ?? 0} | ${s[1]?.wait ?? 0} | ${(s[1]?.flat ?? 0) + (s[1]?.monitor ?? 0)} | ${s[1]?.adequacy ?? "n/a"} |
| OOS | ${s[2]?.checkpoints ?? 0} | ${s[2]?.long ?? 0} | ${s[2]?.short ?? 0} | ${s[2]?.wait ?? 0} | ${(s[2]?.flat ?? 0) + (s[2]?.monitor ?? 0)} | ${s[2]?.adequacy ?? "n/a"} |

---

## Run artifacts

- \`${result.runDir}/manifest.json\`
- \`${result.runDir}/decisions.jsonl\` — decision traces at T (context, concepts, conflicts, stance, horizons, entry/target/invalidation, fingerprints)
- \`${result.runDir}/outcomes.jsonl\` — post-T labels only (MFE, MAE, target/invalidation reached, liquidity, structure invalidated, direction-after, WAIT counterfactual)

**Wall time:** ${(result.wallTimeMs / 1000).toFixed(1)}s  
**Dry run:** ${result.dryRun}
`;
}
