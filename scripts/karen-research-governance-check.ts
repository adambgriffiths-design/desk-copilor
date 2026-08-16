/**
 * HOLDOUT / VAL governance check — lightweight env + script-pattern scan.
 * EDGE_CLAIM: NONE · does not unlock holdout · no secrets printed.
 *
 * Fails when:
 *  - KAREN_HOLDOUT_UNLOCK is set in the environment without --allow-holdout-unlock
 *  - research scripts assign KAREN_HOLDOUT_UNLOCK outside allowlisted test files
 *  - research scripts write under sealed/holdout or UNTOUCHED_HOLDOUT paths
 *  - research scripts write under experiments/.../validation (VAL) paths
 *
 * Usage: npm run karen:research:governance-check
 *        npx tsx scripts/karen-research-governance-check.ts [--allow-holdout-unlock]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, basename } from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const allowHoldoutUnlock = process.argv.includes("--allow-holdout-unlock");
const SELF = "karen-research-governance-check.ts";

const ALLOWLIST_UNLOCK_ASSIGN = new Set([
  "scripts/test-karen-dv-day-checkpoint.ts",
]);

const DENY_LIST_HINT =
  /Never touches|never touches|exclude|deny|ignore|\*\*\/\*holdout\*|sealed\/holdout\/\*\*|HOLDOUT_WRITE_MARKERS|VAL_WRITE_MARKERS/i;

type Issue = { severity: "FAIL" | "WARN"; file?: string; detail: string };

function listScriptFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    if (!/\.(ts|mjs|js)$/.test(name)) continue;
    if (name === SELF) continue;
    if (
      !/karen|dv-|decision-validation|force-wait|contradiction|holdout|val-/i.test(
        name
      )
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

function hasEnvAssign(text: string): boolean {
  return (
    /process\.env\.KAREN_HOLDOUT_UNLOCK\s*=/.test(text) ||
    /(?:^|[^\w])KAREN_HOLDOUT_UNLOCK\s*=\s*["'`]/.test(text)
  );
}

function hasDangerousWriteNear(text: string, marker: string): boolean {
  const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nearWrite = new RegExp(
    `(writeFile(?:Sync)?|mkdirSync|createWriteStream)[\\s\\S]{0,220}${esc}`,
    "i"
  );
  const writeAfter = new RegExp(
    `${esc}[\\s\\S]{0,120}(writeFile(?:Sync)?|mkdirSync|createWriteStream)`,
    "i"
  );
  return nearWrite.test(text) || writeAfter.test(text);
}

function scanFile(abs: string): Issue[] {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const text = readFileSync(abs, "utf8");
  const issues: Issue[] = [];

  if (hasEnvAssign(text) && !ALLOWLIST_UNLOCK_ASSIGN.has(rel)) {
    issues.push({
      severity: "FAIL",
      file: rel,
      detail: "assigns KAREN_HOLDOUT_UNLOCK (not in test allowlist)",
    });
  }

  const holdoutMarkers = [
    "experiments/sealed/holdout",
    "sealed/holdout",
    "UNTOUCHED_HOLDOUT",
  ];
  for (const marker of holdoutMarkers) {
    if (!text.includes(marker)) continue;
    if (DENY_LIST_HINT.test(text) && !hasDangerousWriteNear(text, marker)) {
      continue;
    }
    if (hasDangerousWriteNear(text, marker)) {
      issues.push({
        severity: "FAIL",
        file: rel,
        detail: `possible HOLDOUT write near: ${marker}`,
      });
    }
  }

  if (/^scripts\//.test(rel) && !basename(rel).startsWith("test-")) {
    const valMarkers = ["experiments/validation", "/validation/scores"];
    for (const marker of valMarkers) {
      if (text.includes(marker) && hasDangerousWriteNear(text, marker)) {
        issues.push({
          severity: "FAIL",
          file: rel,
          detail: `possible VAL path write near: ${marker}`,
        });
      }
    }
  }

  return issues;
}

function main(): void {
  const issues: Issue[] = [];

  const unlock = process.env.KAREN_HOLDOUT_UNLOCK?.trim();
  if (unlock && unlock !== "" && unlock !== "0") {
    if (!allowHoldoutUnlock) {
      issues.push({
        severity: "FAIL",
        detail: `env KAREN_HOLDOUT_UNLOCK=${JSON.stringify(unlock)} without --allow-holdout-unlock`,
      });
    } else {
      issues.push({
        severity: "WARN",
        detail:
          "env KAREN_HOLDOUT_UNLOCK set but --allow-holdout-unlock passed (explicit override)",
      });
    }
  }

  const scripts = listScriptFiles(join(ROOT, "scripts"));
  for (const f of scripts) {
    issues.push(...scanFile(f));
  }

  try {
    const r = spawnSync(
      "git",
      [
        "status",
        "--porcelain",
        "--",
        "**/sealed/holdout/**",
        "data/karen-decision-validation/experiments",
      ],
      { encoding: "utf8", cwd: ROOT }
    );
    if (r.status === 0 && r.stdout?.trim()) {
      for (const line of r.stdout.trim().split(/\r?\n/).filter(Boolean)) {
        if (/holdout/i.test(line) || /\/validation\//i.test(line)) {
          issues.push({
            severity: "FAIL",
            detail: `git dirty on sealed/VAL path: ${line}`,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  console.log("=== KAREN research governance check ===");
  console.log(`HOLDOUT env unlock: ${unlock ? "SET" : "unset"}`);
  console.log(`Scripts scanned: ${scripts.length}`);
  console.log("");

  let fails = 0;
  let warns = 0;
  for (const i of issues) {
    if (i.severity === "FAIL") fails++;
    else warns++;
    console.log(`${i.severity}  ${i.file ? i.file + " — " : ""}${i.detail}`);
  }

  if (issues.length === 0) {
    console.log("No unauthorized HOLDOUT/VAL patterns detected.");
  }

  console.log("");
  if (fails > 0) {
    console.log(`GOVERNANCE_CHECK: FAIL (${fails} fail, ${warns} warn)`);
    process.exit(1);
  }
  if (warns > 0) {
    console.log(`GOVERNANCE_CHECK: PASS (with ${warns} warn)`);
    process.exit(0);
  }
  console.log("GOVERNANCE_CHECK: PASS");
}

main();