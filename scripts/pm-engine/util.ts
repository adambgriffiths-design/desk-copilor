import fs from "fs";
import path from "path";

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

export function listFiles(root: string, opts?: { ext?: string[]; ignore?: RegExp }): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "tmp") continue;
        walk(full);
        continue;
      }
      if (opts?.ignore?.test(full)) continue;
      if (opts?.ext && !opts.ext.some((e) => full.endsWith(e))) continue;
      out.push(full);
    }
  };

  walk(root);
  return out;
}

export function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

export function findPatternLines(
  filePath: string,
  pattern: RegExp,
  limit = 5
): Array<{ line: number; text: string }> {
  const text = readText(filePath);
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const hits: Array<{ line: number; text: string }> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      hits.push({ line: i + 1, text: `${rel}:${i + 1} — ${lines[i].trim().slice(0, 120)}` });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

export function extractObjectKeys(source: string, objectName: string): string[] {
  const re = new RegExp(`${objectName}\\s*(?::[^=]+)?=\\s*\\{([^}]+)\\}`, "s");
  const m = source.match(re);
  if (!m) return [];
  const keys: string[] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i);
    if (km) keys.push(km[1]);
  }
  return keys;
}
