/**
 * Karen UI ask — OpenAI strategist reply from KAREN-UI-BRIEF.md.
 * Loads OPENAI_API_KEY via lib/karen-env (never logs the key).
 *
 * Usage:
 *   npx tsx scripts/karen-ui-ask.ts
 *   npx tsx scripts/karen-ui-ask.ts --brief-status
 *   npx tsx scripts/karen-ui-ask.ts --reply
 *   npm run karen:ui:ask
 *
 * Env: OPENAI_API_KEY required for --ask (default).
 *      KAREN_UI_MODEL optional (default gpt-4o).
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadKarenEnv } from "../lib/karen-env";

const ROOT = process.cwd();
const RESEARCH = join(ROOT, "data", "research");
const BRIEF_PATH = join(RESEARCH, "KAREN-UI-BRIEF.md");
const REPLY_PATH = join(RESEARCH, "KAREN-UI-REPLY.md");
const HANDOFF_PATH = join(RESEARCH, "KAREN-HANDOFF.md");
const REL_BRIEF = "data/research/KAREN-UI-BRIEF.md";
const REL_REPLY = "data/research/KAREN-UI-REPLY.md";

const SYSTEM_PROMPT = `You are Adam's careful Karen research advisor (ChatGPT-strategy role).

Hard rules — never violate:
- EDGE_CLAIM: NONE until Adam explicitly changes it.
- HOLDOUT: SEALED — never peek, unlock, or suggest holdout access.
- VAL: DO NOT TOUCH — no retune, no second VAL pass.
- SELECTIVE_UNLOCK: PARKED — representation work before any unlock discussion.
- Prefer representation enrichment over inventing unlocks or score/implement paths.
- ONE next action only. No threshold mining. No multi-lane parallel "do everything".
- No trading behaviour / live decision changes from research advice.
- Never ask for or echo secrets, API keys, or unlock env vars.
- Base advice only on the brief (+ optional handoff excerpt). If something is unknown, say so.

Reply format (markdown):
1. Short status read-back (2–4 bullets).
2. Decision: what Adam should do next and why (representation discipline).
3. What NOT to do (VAL/HOLDOUT/unlock/score).
4. A section exactly titled:

## NEXT_CURSOR_PROMPT

Then a single fenced code block containing one paste-ready Cursor prompt for the next execution step only.`;

function readOptional(path: string, maxChars?: number): string | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  if (maxChars != null && text.length > maxChars) {
    return text.slice(0, maxChars) + "\n\n…(truncated)…\n";
  }
  return text;
}

function summaryLines(md: string, n: number): string {
  return md
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, n)
    .join("\n");
}

function extractNextCursorPrompt(reply: string): string | null {
  const heading = reply.match(
    /##\s*NEXT_CURSOR_PROMPT\s*\r?\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/i
  );
  if (!heading) return null;
  const block = heading[1] ?? "";
  const fenced = block.match(/```(?:[a-zA-Z0-9_-]*)?\r?\n([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  return block.trim() || null;
}

function briefStatus(): void {
  console.log(REL_BRIEF);
  if (!existsSync(BRIEF_PATH)) {
    console.log("(missing)");
    process.exitCode = 1;
    return;
  }
  console.log("---");
  console.log(summaryLines(readFileSync(BRIEF_PATH, "utf8"), 28));
}

function replyStatus(): void {
  console.log(REL_REPLY);
  if (!existsSync(REPLY_PATH)) {
    console.log("(missing)");
    process.exitCode = 1;
    return;
  }
  console.log("---");
  console.log(summaryLines(readFileSync(REPLY_PATH, "utf8"), 40));
}

async function askOpenAi(): Promise<void> {
  loadKarenEnv();
  const keyConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!keyConfigured) {
    console.error(
      "OPENAI_API_KEY not configured (checked process.env + karen-env files). No key logged."
    );
    process.exitCode = 1;
    return;
  }

  const brief = readOptional(BRIEF_PATH);
  if (!brief) {
    console.error(`Missing brief: ${REL_BRIEF}`);
    process.exitCode = 1;
    return;
  }

  const handoffExcerpt = readOptional(HANDOFF_PATH, 6000);
  const model = (process.env.KAREN_UI_MODEL?.trim() || "gpt-4o").trim();

  const userContent = [
    "## KAREN-UI-BRIEF.md",
    brief,
    handoffExcerpt
      ? ["", "## KAREN-HANDOFF.md (excerpt)", handoffExcerpt].join("\n")
      : "",
    "",
    "Advise Adam: one next Cursor action only. Write the full strategist reply.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const safe = errText.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
    console.error(`OpenAI chat completions failed: HTTP ${res.status}`);
    if (safe) console.error(safe.slice(0, 500));
    process.exitCode = 1;
    return;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error("OpenAI returned empty content");
    process.exitCode = 1;
    return;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const out = [
    "# KAREN UI REPLY — Strategist → Cursor",
    "",
    `**Status:** API mode (${model})`,
    `**Updated:** ${stamp}`,
    "",
    "---",
    "",
    "## Latest reply",
    "",
    content,
    "",
  ].join("\n");

  writeFileSync(REPLY_PATH, out, "utf8");
  console.log(`Wrote ${REL_REPLY}`);

  const next = extractNextCursorPrompt(content);
  if (next) {
    console.log("");
    console.log("=== NEXT_CURSOR_PROMPT ===");
    console.log(next);
    console.log("=== END NEXT_CURSOR_PROMPT ===");
  } else {
    console.log("(no NEXT_CURSOR_PROMPT section found in model reply)");
  }
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--brief-status")) {
    briefStatus();
    return;
  }
  if (args.has("--reply")) {
    replyStatus();
    return;
  }
  await askOpenAi();
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]"));
  process.exitCode = 1;
});
