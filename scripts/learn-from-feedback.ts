#!/usr/bin/env npx tsx
/**
 * Update copilot learned rules from graded failures + misses.
 */
import { readFileSync } from "fs";
import path from "path";
import {
  isLearnFrozen,
  includeBacktestMissesInLearning,
  includeBacktestWrongInLearning,
  learnFromMisses,
} from "../lib/learn-config";
import { readFeedbackForLearning } from "../lib/feedback-store";
import { runLearnFromFeedback } from "../lib/learn-runner";

function loadEnvLocal() {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // optional
  }
}

async function main() {
  loadEnvLocal();

  const eligible = await readFeedbackForLearning({
    includeBacktestWrong: includeBacktestWrongInLearning(),
    includeBacktestMisses: includeBacktestMissesInLearning(),
    learnFromMisses: learnFromMisses(),
  });
  const failures = eligible.filter((e) => e.rating === "wrong" || e.rating === "partial");
  const misses = eligible.filter((e) => e.rating === "miss");

  console.log("Desk Copilot — learn from errors + misses");
  console.log(`Wrong/partial: ${failures.length}`);
  console.log(`Misses:        ${misses.length}`);
  console.log(`LEARN_FROZEN:  ${isLearnFrozen() ? "true (paused)" : "false (active)"}\n`);

  if (isLearnFrozen()) {
    console.log("Learning paused. Set LEARN_FROZEN=false in .env.local.");
    process.exit(0);
  }

  const learned = await runLearnFromFeedback();
  console.log(`Brain updated — ${learned.newRulesCount} new rules (v${learned.version}).`);
  if (learned.analysis) console.log(`Analysis: ${learned.analysis}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
