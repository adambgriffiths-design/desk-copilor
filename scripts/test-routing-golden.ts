import fs from "fs";
import path from "path";
import { classifyDeskRoute, type DeskRoute } from "../lib/desk-route-intent";
import { tryCasualChatReplyInstant } from "../lib/chat-engine";
import { LIVE_DATA_FALLBACK, mustUseTradingStream } from "../lib/routing";

const CSV_PATH = path.join(process.cwd(), "data", "routing-golden.csv");

type GoldenRow = { phrase: string; expectedRoute: DeskRoute; detail?: string };

function parseCsv(text: string): GoldenRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: GoldenRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && /^phrase,/i.test(line)) continue;
    const parts = line.split(",");
    if (parts.length < 2) continue;
    const phrase = parts[0].trim();
    const expectedRoute = parts[1].trim() as DeskRoute;
    const detail = parts[2]?.trim() || undefined;
    if (!phrase || !expectedRoute) continue;
    rows.push({ phrase, expectedRoute, detail });
  }
  return rows;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const raw = fs.readFileSync(CSV_PATH, "utf8");
const golden = parseCsv(raw);
assert(golden.length >= 40, `expected at least 40 golden rows, got ${golden.length}`);

let failed = 0;
for (const row of golden) {
  const result = classifyDeskRoute({ text: row.phrase, routeText: row.phrase });
  const routeOk = result.route === row.expectedRoute;
  const detailOk = !row.detail || result.detail === row.detail;
  if (!routeOk || !detailOk) {
    failed += 1;
    console.error(
      `FAIL: "${row.phrase}"\n  expected: ${row.expectedRoute}${row.detail ? ` · ${row.detail}` : ""}\n  got:      ${result.route}${result.detail ? ` · ${result.detail}` : ""}`
    );
  } else {
    console.log(`ok: ${row.phrase} → ${result.route}${result.detail ? ` · ${result.detail}` : ""}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} routing golden test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${golden.length} routing golden tests passed.`);

async function runThreadChecks() {
  const threadMessages = [
    { role: "user", content: "What's the market doing right now?" },
    {
      role: "assistant",
      content: "Nasdaq futures last near 29906.50 — bias neutral, stand aside.",
    },
    { role: "user", content: "Tell me about the market structure." },
  ] as { role: "user" | "assistant"; content: string }[];

const followUp = "Tell me about the market structure.";

async function runFollowUpChecks() {
  assert(mustUseTradingStream(followUp), "market structure follow-up must use trading stream");
  const instant = await tryCasualChatReplyInstant(followUp, threadMessages);
  assert(instant === null, "instant casual must be null for trading follow-up");
  assert(instant !== LIVE_DATA_FALLBACK, "must not return LIVE_DATA_FALLBACK for trading follow-up");
  console.log("ok: post-snapshot market structure → no live-data fallback");
}

runFollowUpChecks().catch((e) => {
  console.error(e);
  process.exit(1);
});
}

runThreadChecks().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});