#!/usr/bin/env npx tsx
/**
 * Product Manager Engine — heuristic codebase audit for Desk Copilot.
 * Usage: npm run pm:scan [-- --out reports/custom.md] [-- --top 15]
 */
import fs from "fs";
import path from "path";
import { runAllChecks } from "./checks";
import { buildSummary, formatMarkdownReport, formatStdoutSummary } from "./report";

function parseArgs(argv: string[]) {
  let out: string | null = null;
  let top = 15;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) {
      out = argv[++i];
    } else if (argv[i] === "--top" && argv[i + 1]) {
      top = Number(argv[++i]) || 15;
    }
  }
  return { out, top };
}

function defaultReportPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(process.cwd(), "reports", `pm-scan-${date}.md`);
}

async function main() {
  const { out, top } = parseArgs(process.argv.slice(2));
  const findings = runAllChecks();
  const summary = buildSummary(findings);
  const reportPath = out ? path.resolve(out) : defaultReportPath();

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, formatMarkdownReport(summary, top), "utf8");

  console.log(formatStdoutSummary(summary, Math.min(top, 10)));
  console.log(`\nFull report: ${reportPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
