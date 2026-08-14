import fs from "fs";
import path from "path";
import type { BacktestRunResult } from "./backtest/types";
import type { ResearchRunManifest } from "./manifest";
import { createRunDirectory } from "./paths";

export function formatBacktestReportMarkdown(
  result: BacktestRunResult,
  manifest: ResearchRunManifest
): string {
  const s = result.statistics;
  const lines = [
    `# Research Backtest Report`,
    ``,
    `- **Run ID:** ${manifest.runId}`,
    `- **Strategy:** ${result.strategyName} (\`${result.strategyId}\`)`,
    `- **Dataset:** ${result.datasetId} (${result.symbol})`,
    `- **Window:** ${result.window.start} → ${result.window.end}`,
    `- **Git:** ${manifest.gitHash ?? "unavailable"}`,
    `- **Fingerprint:** \`${manifest.fingerprint}\``,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total setups | ${s.totalSetups} |`,
    `| Win rate | ${(s.winRate * 100).toFixed(1)}% |`,
    `| Expectancy (R) | ${s.expectancy.toFixed(3)} |`,
    `| Profit factor | ${s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)} |`,
    `| Max drawdown (R) | ${s.maxDrawdownR.toFixed(2)} |`,
    `| Avg R | ${s.avgR.toFixed(3)} |`,
    `| Wins / Losses / Ambiguous | ${s.wins} / ${s.losses} / ${s.ambiguous} |`,
    ``,
    `## Setups (${result.setups.length})`,
    ``,
  ];

  if (result.setups.length === 0) {
    lines.push(`_No setups detected in window._`);
  } else {
    lines.push(
      `| Time | Dir | Entry | Outcome | R | MFE | MAE |`,
      `| --- | --- | --- | --- | --- | --- | --- |`
    );
    for (const setup of result.setups.slice(0, 50)) {
      lines.push(
        `| ${setup.timestamp} | ${setup.direction} | ${setup.entry.toFixed(1)} | ${setup.outcome} | ${setup.result_R.toFixed(2)} | ${setup.MFE.toFixed(1)} | ${setup.MAE.toFixed(1)} |`
      );
    }
    if (result.setups.length > 50) {
      lines.push(``, `_…${result.setups.length - 50} more setups in results.json_`);
    }
  }

  lines.push(
    ``,
    `---`,
    `_Internal research only — not fed into Karen production pipeline._`
  );
  return lines.join("\n");
}

export function writeBacktestReport(
  runId: string,
  result: BacktestRunResult,
  manifest: ResearchRunManifest
): { reportPath: string; markdown: string } {
  const dir = createRunDirectory(runId);
  const markdown = formatBacktestReportMarkdown(result, manifest);
  const reportPath = path.join(dir, "report.md");
  fs.writeFileSync(reportPath, markdown, "utf8");
  return { reportPath, markdown };
}
