import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { tryDataWrite } from "./data-fs";

export type LearnedGraderRule = {
  rule: string;
  source: string;
  addedAt: string;
};

export type LearnedGraderFile = {
  version: number;
  updatedAt: string;
  promptAddendum: string;
  rules: LearnedGraderRule[];
};

const FILE = path.join(process.cwd(), "data", "learned-grader.json");

const DEFAULT: LearnedGraderFile = {
  version: 0,
  updatedAt: new Date(0).toISOString(),
  promptAddendum:
    "Grade direction and ICT structure only. Stand-aside misses are rating miss, not wrong. No fixed point or RR rules.",
  rules: [],
};

export async function readLearnedGrader(): Promise<LearnedGraderFile> {
  try {
    const raw = await readFile(FILE, "utf-8");
    return JSON.parse(raw) as LearnedGraderFile;
  } catch {
    return { ...DEFAULT };
  }
}

export async function writeLearnedGrader(data: LearnedGraderFile): Promise<void> {
  await tryDataWrite("learned grader", async () => {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
  });
}

export function formatLearnedGraderForPrompt(data: LearnedGraderFile): string {
  if (data.rules.length === 0 && !data.promptAddendum) return "";
  const rules = data.rules.map((r) => `- ${r.rule}`).join("\n");
  return `## Learned grading guidance (from prior runs — apply when grading)
${data.promptAddendum}
${rules ? `\n${rules}` : ""}`;
}
