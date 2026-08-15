#!/usr/bin/env npx tsx
/**
 * Interactive helper to add labeled setups.
 * Usage: npm run label:setup
 */
import readline from "readline";
import { saveLabeledSetup, validateLabeledSetup, type LabeledSetup } from "../lib/labeling";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function main() {
  console.log("Desk Copilot — Label Setup\n");
  const id = await ask("Setup id (e.g. ny-open-sweep-2026-08-12): ");
  const adam_verdict = (await ask("Adam verdict (LONG|SHORT|WAIT|NO_TRADE): ")).toUpperCase() as LabeledSetup["adam_verdict"];
  const would_take = (await ask("Would take? (y/n): ")).toLowerCase().startsWith("y");
  const grade = (await ask("Grade (A+|A|B|C|pass|no_trade): ")) as LabeledSetup["grade"];
  const why_taken = await ask("Why taken (required — Adam's words): ");
  const why_rejected_alternatives = await ask("Why rejected alternatives (required): ");
  const fvg_validity = (await ask("FVG validity (valid|present_not_tradeable|invalid|absent): ")) as LabeledSetup["fvg_validity"];
  const notes = await ask("Notes: ");
  const snapshot = await ask("MarketState snapshot path: ");
  const expected_observation_raw = await ask("Expected observation JSON (or empty to skip): ");

  const label: LabeledSetup = {
    id,
    timestamp: new Date().toISOString(),
    market_state_snapshot: snapshot || `replay-fixtures/${id}`,
    expected_observation: expected_observation_raw
      ? (JSON.parse(expected_observation_raw) as LabeledSetup["expected_observation"])
      : {},
    adam_verdict,
    would_take,
    grade,
    why_taken,
    why_rejected_alternatives,
    fvg_validity,
    notes,
  };

  const errors = validateLabeledSetup(label);
  if (errors.length) {
    console.error("\nValidation failed:");
    errors.forEach((e) => console.error(`  - ${e}`));
    rl.close();
    process.exit(1);
  }

  const path = saveLabeledSetup(label);
  console.log(`\nSaved: ${path}`);
  console.log("Next: add matching fixture to lib/replay-fixtures.ts if new scenario.");
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
