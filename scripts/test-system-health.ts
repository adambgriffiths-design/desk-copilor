/**
 * Pre-release system health — golden tests, optional prod probes, score + checklist.
 *
 * Run: npm run test:system
 * Prod: npm run test:system -- --prod
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { evaluateReleaseChecklist, RELEASE_THRESHOLDS } from "../lib/request-trace";

type SubsystemResult = {
  name: string;
  status: "pass" | "warn" | "fail";
  icon: string;
  detail: string;
  priority: "P0" | "P1" | "P2";
  ms: number;
};

type SystemHealthReport = {
  at: string;
  pass: boolean;
  score: number;
  subsystems: SubsystemResult[];
  checklist: ReturnType<typeof evaluateReleaseChecklist>;
  summary: string;
  failures: string[];
};

const GOLDEN_TESTS: Array<{ name: string; script: string; priority: "P0" | "P1" | "P2" }> = [
  { name: "routing-golden", script: "test:routing", priority: "P0" },
  { name: "conversation-chains", script: "test:conversation-chains", priority: "P0" },
  { name: "observation-engine", script: "test:observation", priority: "P0" },
  { name: "reh-rel", script: "test:reh-rel", priority: "P1" },
  { name: "chart-snapshot", script: "test:chart-snapshot", priority: "P0" },
  { name: "decision-pipeline", script: "test:decision", priority: "P0" },
  { name: "contamination-guard", script: "test:contamination", priority: "P0" },
  { name: "chart-export-quality", script: "test:chart-export-quality", priority: "P1" },
  { name: "request-trace", script: "test:request-trace", priority: "P2" },
  { name: "connection-state", script: "test:connection", priority: "P2" },
];

const PROD_PROBES: Array<{ name: string; script: string; priority: "P0" | "P1" }> = [
  { name: "health", script: "health", priority: "P0" },
  { name: "desk-tracker", script: "test:desk-tracker", priority: "P1" },
];

function runNpmScript(script: string, timeoutMs = 120_000): { ok: boolean; ms: number; output: string } {
  const started = Date.now();
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutMs,
    shell: process.platform === "win32",
  });
  const ms = Date.now() - started;
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { ok: result.status === 0, ms, output };
}

function statusIcon(status: SubsystemResult["status"]): string {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function scoreSubsystem(results: SubsystemResult[]): number {
  if (!results.length) return 0;
  let earned = 0;
  let max = 0;
  for (const r of results) {
    const weight = r.priority === "P0" ? 15 : r.priority === "P1" ? 10 : 5;
    max += weight;
    if (r.status === "pass") earned += weight;
    else if (r.status === "warn") earned += weight * 0.5;
  }
  return Math.round((earned / max) * 100);
}

function printHuman(report: SystemHealthReport) {
  console.log("\n=== Desk Copilot system health ===\n");
  console.log(`Score: ${report.score}/100 · ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`Time: ${report.at}\n`);
  for (const s of report.subsystems) {
    console.log(`${statusIcon(s.status)} ${s.name} (${s.ms}ms) — ${s.detail}`);
  }
  console.log("\n--- Release checklist ---");
  for (const item of report.checklist.items) {
    console.log(`${item.pass ? "PASS" : "FAIL"} · ${item.label}`);
    console.log(`       ${item.detail}`);
  }
  if (report.failures.length) {
    console.log("\n--- Failures ---");
    for (const f of report.failures) console.log(`  • ${f}`);
  }
  console.log(`\n${report.summary}\n`);
}

function main() {
  const prod = process.argv.includes("--prod");
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  const subsystems: SubsystemResult[] = [];
  const failures: string[] = [];
  let openCriticals = 0;

  for (const t of GOLDEN_TESTS) {
    if (!pkg.scripts?.[t.script]) {
      subsystems.push({
        name: t.name,
        status: "warn",
        icon: "⚠️",
        detail: "script missing — skipped",
        priority: t.priority,
        ms: 0,
      });
      continue;
    }

    const r = runNpmScript(t.script);
    let status: SubsystemResult["status"] = r.ok ? "pass" : "fail";
    if (!r.ok && t.priority === "P2") status = "warn";

    subsystems.push({
      name: t.name,
      status,
      icon: statusIcon(status),
      detail: r.ok ? "pass" : r.output.split("\n").slice(-2).join(" ").slice(0, 120) || "failed",
      priority: t.priority,
      ms: r.ms,
    });

    if (!r.ok && status === "fail") {
      if (t.priority === "P0") openCriticals += 1;
      else if (t.priority === "P1") openCriticals += 1;
      failures.push(`${t.name}: ${r.output.slice(-240)}`);
    }
  }

  if (prod) {
    for (const p of PROD_PROBES) {
      if (!pkg.scripts?.[p.script]) continue;
      const r = runNpmScript(p.script, 180_000);
      const status: SubsystemResult["status"] = r.ok ? "pass" : "fail";
      subsystems.push({
        name: `prod:${p.name}`,
        status,
        icon: statusIcon(status),
        detail: r.ok ? "probe ok" : r.output.slice(-120) || "probe failed",
        priority: p.priority,
        ms: r.ms,
      });
      if (!r.ok) {
        if (p.priority === "P0") openCriticals += 1;
        failures.push(`prod ${p.name} failed`);
      }
    }
  }

  const goldenPass = !subsystems.some((s) => s.status === "fail" && s.priority !== "P2");
  const exportSubsystem = subsystems.find((s) => s.name === "chart-export-quality");
  const exportRate =
    exportSubsystem?.status === "pass" ? 1 : exportSubsystem?.status === "warn" ? 0.9 : 0.5;

  const checklist = evaluateReleaseChecklist({
    goldenTestsPass: goldenPass,
    openCriticals,
    exportSuccessRate: exportRate,
    voiceMaxMs: RELEASE_THRESHOLDS.voiceTotalMs,
  });

  const score = scoreSubsystem(subsystems);
  const pass = checklist.pass && goldenPass;

  const report: SystemHealthReport = {
    at: new Date().toISOString(),
    pass,
    score,
    subsystems,
    checklist,
    summary: pass
      ? "System health OK — ready for release review."
      : "System health FAILED — resolve P0/P1 before release.",
    failures,
  };

  const outDir = path.join(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "system-health-latest.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  const extPath = path.join(process.cwd(), "extension", "system-health-latest.json");
  fs.writeFileSync(extPath, JSON.stringify(report, null, 2));

  printHuman(report);
  console.log(`JSON: ${outPath}`);
  console.log(
    `Thresholds: voice≤${RELEASE_THRESHOLDS.voiceTotalMs}ms export≥${RELEASE_THRESHOLDS.exportSuccessRate * 100}% criticals≤${RELEASE_THRESHOLDS.maxOpenCriticals}`
  );

  process.exit(pass ? 0 : 1);
}

main();
