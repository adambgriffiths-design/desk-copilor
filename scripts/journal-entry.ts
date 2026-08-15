/**
 * Trade journal CLI — record thinking before and review after trades.
 *
 * Pre-trade:  npm run journal:pre -- --id ny-open-2026-08-12 --thinking "Sweep + FVG, wait retrace"
 * Post-trade: npm run journal:post -- --id ny-open-review --pre ny-open-2026-08-12 --review "Took long, target hit" --outcome win
 * List:       npm run journal:list
 */
import {
  createPostTradeEntry,
  createPreTradeEntry,
  listJournalEntries,
  pairJournalEntries,
  saveJournalEntry,
} from "../lib/trade-journal";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];

if (cmd === "list" || process.argv.includes("--list")) {
  const pairs = pairJournalEntries();
  if (!pairs.length) {
    console.log("No journal entries yet. Use: npm run journal:pre");
    process.exit(0);
  }
  for (const { pre, post } of pairs) {
    console.log(`${pre.id} [pre] ${pre.thinking_before?.slice(0, 60)}...`);
    if (post) console.log(`  └ ${post.id} [post] ${post.outcome}: ${post.review_after?.slice(0, 60)}...`);
    else console.log("  └ (no post-trade review yet)");
  }
  console.log(`\nTotal files: ${listJournalEntries().length}`);
  process.exit(0);
}

if (cmd === "post" || arg("pre")) {
  const id = arg("id") || `post-${Date.now()}`;
  const preId = arg("pre");
  const review = arg("review");
  const outcome = (arg("outcome") || "pending") as "win" | "loss" | "breakeven" | "skipped" | "pending";
  if (!preId || !review) {
    console.error("Usage: npm run journal:post -- --pre <pre_trade_id> --review \"...\" [--outcome win|loss|...]");
    process.exit(1);
  }
  const entry = createPostTradeEntry({
    id,
    pre_trade_id: preId,
    review_after: review,
    outcome,
    what_worked: arg("worked"),
    what_failed: arg("failed"),
    label_link: arg("label"),
  });
  const path = saveJournalEntry(entry);
  console.log(`Saved post-trade journal: ${path}`);
  process.exit(0);
}

const id = arg("id") || `pre-${Date.now()}`;
const thinking = arg("thinking");
if (!thinking) {
  console.error(
    'Usage: npm run journal:pre -- --thinking "Your read before acting" [--verdict WAIT] [--invalidation 21445]'
  );
  process.exit(1);
}

const verdict = arg("verdict") as "LONG" | "SHORT" | "WAIT" | "NO_TRADE" | undefined;
const entry = createPreTradeEntry({
  id,
  thinking_before: thinking,
  planned_verdict: verdict,
  planned_invalidation: arg("invalidation") ? parseFloat(arg("invalidation")!) : undefined,
  planned_target: arg("target") ? parseFloat(arg("target")!) : undefined,
  planned_entry_zone: arg("entry"),
  state_hash: arg("state_hash"),
});

const filePath = saveJournalEntry(entry);
console.log(`Saved pre-trade journal: ${filePath}`);
