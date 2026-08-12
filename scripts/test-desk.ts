/**
 * Unified deterministic desk pipeline tests — run before shipping code changes.
 * Usage: npm run test:desk
 */
import { execSync } from "child_process";

const SUITES = [
  "test:observation",
  "test:contamination",
  "test:decision",
  "test:desk:infra",
  "test:analysis-contract",
  "test:replay",
] as const;

function run(name: string) {
  console.log(`\n--- ${name} ---`);
  execSync(`npm run ${name}`, { stdio: "inherit", cwd: process.cwd() });
}

let failed = 0;
for (const suite of SUITES) {
  try {
    run(suite);
  } catch {
    failed++;
    console.error(`FAILED: ${suite}`);
  }
}

if (failed > 0) {
  console.error(`\ntest:desk — ${failed}/${SUITES.length} suites failed`);
  process.exit(1);
}

console.log(`\ntest:desk — all ${SUITES.length} suites passed`);
