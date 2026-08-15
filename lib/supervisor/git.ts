import { execSync } from "child_process";
import type { GitSnapshot } from "./types";

function runGit(args: string[], cwd: string): string {
  return execSync(`git ${args.join(" ")}`, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function summarizePorcelain(porcelain: string): string {
  if (!porcelain) return "clean";

  let modified = 0;
  let added = 0;
  let deleted = 0;
  let untracked = 0;
  let renamed = 0;

  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    if (code === "??") untracked++;
    else if (code.includes("R")) renamed++;
    else if (code.includes("D")) deleted++;
    else if (code.includes("A")) added++;
    else modified++;
  }

  const parts: string[] = [];
  if (modified) parts.push(`${modified} modified`);
  if (added) parts.push(`${added} added`);
  if (deleted) parts.push(`${deleted} deleted`);
  if (renamed) parts.push(`${renamed} renamed`);
  if (untracked) parts.push(`${untracked} untracked`);
  return parts.join(", ") || "dirty";
}

function parseChangedFiles(porcelain: string): string[] {
  if (!porcelain) return [];
  return porcelain
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

export function captureGitSnapshot(cwd: string = process.cwd()): GitSnapshot {
  try {
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    const porcelain = runGit(["status", "--porcelain"], cwd);
    const lines = porcelain ? porcelain.split("\n").filter(Boolean) : [];
    const diffStat = runGit(["diff", "--stat"], cwd);
    return {
      branch,
      statusSummary: summarizePorcelain(porcelain),
      changedFileCount: lines.length,
      changedFiles: parseChangedFiles(porcelain),
      diffStat: diffStat || "(no tracked diff)",
    };
  } catch {
    return {
      branch: "(unknown)",
      statusSummary: "git unavailable",
      changedFileCount: -1,
      changedFiles: [],
      diffStat: "",
    };
  }
}
