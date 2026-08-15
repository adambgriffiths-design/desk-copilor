import type { Finding, ScanSummary, Severity } from "./types";
import { SEVERITY_ORDER } from "./types";

function countBy<T extends string>(items: T[], order: T[]): Record<T, number> {
  const counts = Object.fromEntries(order.map((k) => [k, 0])) as Record<T, number>;
  for (const item of items) counts[item] = (counts[item] || 0) + 1;
  return counts;
}

export function buildSummary(findings: Finding[]): ScanSummary {
  return {
    scannedAt: new Date().toISOString(),
    repoRoot: process.cwd(),
    findings,
    stats: {
      total: findings.length,
      bySeverity: countBy(
        findings.map((f) => f.severity),
        SEVERITY_ORDER
      ),
      byDimension: countBy(findings.map((f) => f.dimension), [
        "reliability",
        "routing",
        "ux",
        "performance",
        "tests",
        "docs",
      ]),
    },
  };
}

function severityEmoji(sev: Severity): string {
  switch (sev) {
    case "critical":
      return "🔴";
    case "high":
      return "🟠";
    case "medium":
      return "🟡";
    case "low":
      return "⚪";
  }
}

export function formatMarkdownReport(summary: ScanSummary, topN = 15): string {
  const sorted = [...summary.findings].sort((a, b) => {
    const si = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (si !== 0) return si;
    return a.dimension.localeCompare(b.dimension);
  });

  const lines: string[] = [];
  lines.push("# Desk Copilot — PM Engine Scan");
  lines.push("");
  lines.push(`**Scanned:** ${summary.scannedAt}`);
  lines.push(`**Findings:** ${summary.stats.total} (${SEVERITY_ORDER.map((s) => `${s}: ${summary.stats.bySeverity[s]}`).join(", ")})`);
  lines.push("");
  lines.push("## Dimensions");
  lines.push("");
  for (const [dim, count] of Object.entries(summary.stats.byDimension)) {
    if (count > 0) lines.push(`- **${dim}**: ${count}`);
  }
  lines.push("");
  lines.push(`## Top priorities (top ${Math.min(topN, sorted.length)})`);
  lines.push("");

  for (const f of sorted.slice(0, topN)) {
    lines.push(`### ${severityEmoji(f.severity)} ${f.title}`);
    lines.push("");
    lines.push(`- **Severity:** ${f.severity}`);
    lines.push(`- **Dimension:** ${f.dimension}`);
    lines.push(`- **Effort:** ${f.effort}`);
    lines.push(`- **Evidence:** ${f.evidence}`);
    lines.push(`- **Suggested fix:** ${f.suggestedFix}`);
    lines.push("");
  }

  if (sorted.length > topN) {
    lines.push("## Remaining findings");
    lines.push("");
    for (const f of sorted.slice(topN)) {
      lines.push(`- [${f.severity}] **${f.title}** (${f.dimension}, ${f.effort}) — ${f.evidence}`);
    }
    lines.push("");
  }

  lines.push("## Next steps");
  lines.push("");
  lines.push("1. Run `npm run test:routing` and `npm run test:regression` after routing fixes.");
  lines.push("2. Feed this report + `git log --oneline -20` into `scripts/pm-engine/prompt.md` for sprint planning.");
  lines.push("3. Re-scan weekly: `npm run pm:scan`");
  lines.push("");

  return lines.join("\n");
}

export function formatStdoutSummary(summary: ScanSummary, topN = 10): string {
  const sorted = [...summary.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  const lines: string[] = [
    `PM scan: ${summary.stats.total} findings (${SEVERITY_ORDER.map((s) => `${s}=${summary.stats.bySeverity[s]}`).join(", ")})`,
    "",
  ];
  for (const f of sorted.slice(0, topN)) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`  ${f.evidence}`);
  }
  if (sorted.length > topN) lines.push(`… +${sorted.length - topN} more (see report file)`);
  return lines.join("\n");
}
