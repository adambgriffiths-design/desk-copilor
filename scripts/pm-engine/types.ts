export type Severity = "critical" | "high" | "medium" | "low";
export type Dimension =
  | "reliability"
  | "routing"
  | "ux"
  | "performance"
  | "tests"
  | "docs";
export type Effort = "S" | "M" | "L";

export type Finding = {
  id: string;
  title: string;
  dimension: Dimension;
  severity: Severity;
  evidence: string;
  suggestedFix: string;
  effort: Effort;
};

export type ScanSummary = {
  scannedAt: string;
  repoRoot: string;
  findings: Finding[];
  stats: {
    total: number;
    bySeverity: Record<Severity, number>;
    byDimension: Record<Dimension, number>;
  };
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];
