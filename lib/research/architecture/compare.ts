import type { ArchitectureVersionId, SplitPhase } from "./types";
import type { DecisionQualityMetrics } from "./quality";
import { computeDecisionQuality, stabilityAcrossSplits, type QualityRow } from "./quality";
import { evidenceClassForDataset, sampleAdequacy, uniqueSessionDays } from "./splits";
import type { EvaluatedDecision } from "./evaluate";

export type ArchitectureComparisonRow = {
  architectureVersion: ArchitectureVersionId;
  split: SplitPhase | "ALL";
  metrics: DecisionQualityMetrics;
  evidenceClass: ReturnType<typeof evidenceClassForDataset>;
  uniqueSessionDays: number;
};

export type ArchitectureComparison = {
  selectedArchitectureFrom: null;
  note: string;
  rows: ArchitectureComparisonRow[];
  stability: Record<ArchitectureVersionId, ReturnType<typeof stabilityAcrossSplits>>;
  sampleGap: string;
};

export function compareArchitectures(input: {
  evaluations: Array<EvaluatedDecision & { split: SplitPhase }>;
}): ArchitectureComparison {
  const timestamps = input.evaluations.map((e) => e.trace.timestamp);
  const days = uniqueSessionDays(timestamps);
  const versions = [...new Set(input.evaluations.map((e) => e.trace.architectureVersion))] as ArchitectureVersionId[];
  const splits: SplitPhase[] = ["TRAIN", "VALIDATION", "OOS"];
  const rows: ArchitectureComparisonRow[] = [];

  for (const version of versions) {
    const bySplit: Partial<Record<SplitPhase, DecisionQualityMetrics>> = {};
    for (const split of splits) {
      const subset = input.evaluations.filter(
        (e) => e.trace.architectureVersion === version && e.split === split && e.outcome
      );
      const qualityRows: QualityRow[] = subset.map((e) => ({
        trace: e.trace,
        outcome: e.outcome!,
        context: e.context,
        hindsightViolation: false,
      }));
      const metrics = computeDecisionQuality(qualityRows);
      bySplit[split] = metrics;
      rows.push({
        architectureVersion: version,
        split,
        metrics,
        evidenceClass: evidenceClassForDataset({ uniqueSessionDays: days, n: metrics.n, phase: split }),
        uniqueSessionDays: days,
      });
    }
    const all = input.evaluations.filter((e) => e.trace.architectureVersion === version && e.outcome);
    const allMetrics = computeDecisionQuality(
      all.map((e) => ({
        trace: e.trace,
        outcome: e.outcome!,
        context: e.context,
        hindsightViolation: false,
      }))
    );
    rows.push({
      architectureVersion: version,
      split: "ALL",
      metrics: allMetrics,
      evidenceClass: evidenceClassForDataset({ uniqueSessionDays: days, n: allMetrics.n, phase: "TRAIN" }),
      uniqueSessionDays: days,
    });
  }

  const stability = {} as ArchitectureComparison["stability"];
  for (const version of versions) {
    const slice = Object.fromEntries(
      splits.map((s) => [s, rows.find((r) => r.architectureVersion === version && r.split === s)?.metrics])
    ) as Partial<Record<SplitPhase, DecisionQualityMetrics>>;
    stability[version] = stabilityAcrossSplits(slice);
  }

  const maxN = Math.max(0, ...rows.filter((r) => r.split === "ALL").map((r) => r.metrics.n));
  const oosN = rows.find((r) => r.split === "OOS")?.metrics.n ?? 0;
  const sampleGap =
    days <= 1 || maxN < 30 || oosN < 30
      ? `Sample-size gap: uniqueSessionDays=${days}, max n=${maxN}, OOS n=${oosN}, adequacy=${sampleAdequacy(maxN)}. Numbers are INFRASTRUCTURE EVIDENCE, not EDGE EVIDENCE. Do not select an architecture from VALIDATION/OOS.`
      : `n and days meet mention thresholds; still do not select an architecture from VALIDATION/OOS in this harness.`;

  return {
    selectedArchitectureFrom: null,
    note: "All three architectures are reported on every split. No winner is chosen from eval/OOS. Weights were not tuned.",
    rows,
    stability,
    sampleGap,
  };
}

export function formatComparisonTable(comparison: ArchitectureComparison): string {
  const header =
    "| Architecture | Split | n | dir | wait/flat | dir% | wait% | avoid% | target% | inv% | mean R:R | conflicts | false conf | adequacy | class |";
  const sep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const pct = (x: number | null) => (x == null ? "n/a" : `${(x * 100).toFixed(0)}%`);
  const num = (x: number | null) => (x == null ? "n/a" : x.toFixed(2));
  const lines = comparison.rows.map((r) => {
    const m = r.metrics;
    return `| ${r.architectureVersion} | ${r.split} | ${m.n} | ${m.directionalN} | ${m.waitFlatMonitorN} | ${pct(m.correctDirectionRate)} | ${pct(m.correctWaitRate)} | ${pct(m.badTradeAvoidanceRate)} | ${pct(m.targetHitRate)} | ${pct(m.invalidationHitRate)} | ${num(m.meanRR)} | ${m.conflictRows} | ${pct(m.falseConfidenceRate)} | ${m.sampleAdequacy} | ${r.evidenceClass} |`;
  });
  return [header, sep, ...lines].join("\n");
}
