import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import type { LearnedRulesFile } from "./feedback-types";
import { tryDataWrite } from "./data-fs";

const DATA_DIR = path.join(process.cwd(), "data");
const LEARNED_FILE = path.join(DATA_DIR, "learned-rules.json");

const EMPTY: LearnedRulesFile = {
  version: 0,
  updatedAt: new Date(0).toISOString(),
  conceptErrorCounts: {},
  rules: [],
  promptAddendum: "",
};

export async function readLearnedRules(): Promise<LearnedRulesFile> {
  try {
    const raw = await readFile(LEARNED_FILE, "utf-8");
    return JSON.parse(raw) as LearnedRulesFile;
  } catch {
    return { ...EMPTY };
  }
}

export async function writeLearnedRules(rules: LearnedRulesFile): Promise<void> {
  await tryDataWrite("learned rules", async () => {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(LEARNED_FILE, JSON.stringify(rules, null, 2), "utf-8");
  });
}

const MAX_LEARNED_RULES = 8;

export function formatLearnedRulesForPrompt(learned: LearnedRulesFile): string {
  if (learned.rules.length === 0 && !learned.promptAddendum) return "";

  const ruleBlocks = learned.rules
    .slice(-MAX_LEARNED_RULES)
    .map((r) => `- **[${r.concept}]** ${r.rule}`)
    .join("\n");

  return `## LEARNED ICT RULES (from past failures — refine timing, do NOT use to default to stand aside)

When PD-array bias and tradeableBias agree, **make a directional call** at medium confidence even if these rules mention waiting for extra confirmation.

${learned.promptAddendum ? `${learned.promptAddendum}\n\n` : ""}${ruleBlocks}`;
}
