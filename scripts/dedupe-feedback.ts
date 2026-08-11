#!/usr/bin/env npx tsx
import { dedupeBacktestFeedback } from "../lib/feedback-store";

async function main() {
  const result = await dedupeBacktestFeedback();
  console.log(`Feedback: ${result.before} → ${result.after} (removed ${result.removed} duplicate backtest rows)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
