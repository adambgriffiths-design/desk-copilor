#!/usr/bin/env node
/**
 * Scan Screenshots folder → classify valid MNQ/TradingView candlestick charts
 * Usage: node scripts/filter-charts.mjs
 */
import { readdir, readFile, copyFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";

const SCREENSHOTS_DIR =
  process.env.SCREENSHOTS_DIR ||
  "C:\\Users\\adamg\\OneDrive\\Pictures\\Screenshots";
const OUT_DIR = path.join(process.cwd(), "examples", "valid");
const MANIFEST = path.join(process.cwd(), "examples", "manifest.json");

const MIN_SIZE = 15000;
const MAX_SIZE = 250000;

/** Priority: today's tests + May 13-14 2026 session-sized screenshots */
function isPriorityFile(name) {
  if (/2026-08-11/.test(name)) return true;
  if (/2026-05-1[34]/.test(name)) return true;
  if (/2025-08-0[5-9]/.test(name)) return true;
  return false;
}

async function loadEnv() {
  try {
    const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^OPENAI_API_KEY=(.+)$/);
      if (m) process.env.OPENAI_API_KEY = m[1].trim();
    }
  } catch {
    /* ignore */
  }
}

async function isValidChart(openai, filePath, filename) {
  const buf = await readFile(filePath);
  const b64 = buf.toString("base64");
  const dataUrl = `data:image/png;base64,${b64}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 80,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Classify screenshot. Valid = TradingView/futures candlestick chart (MNQ/NQ/ES) with price candles visible.
Invalid = app UI, tables, StrategyQuant, genetic optimizer dashboards, Pareto charts, text-only, training log, Cursor IDE, settings, no candlesticks.
Reply JSON: {"valid": true/false, "reason": "brief"}`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: `File: ${filename}` },
          { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
        ],
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || "{}";
  return JSON.parse(raw);
}

async function main() {
  await loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing in .env.local");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(SCREENSHOTS_DIR))
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort()
    .reverse(); // newest first

  const candidates = [];
  for (const f of files) {
    const fp = path.join(SCREENSHOTS_DIR, f);
    const { size } = await import("fs/promises").then((fs) => fs.stat(fp));
    if (size >= MIN_SIZE && size <= MAX_SIZE && isPriorityFile(f))
      candidates.push({ f, fp, size });
  }

  console.log(`Candidates: ${candidates.length}`);

  const valid = [];
  const invalid = [];
  let processed = 0;

  for (const { f, fp, size } of candidates) {
    processed++;
    process.stdout.write(`[${processed}/${candidates.length}] ${f}... `);
    try {
      const result = await isValidChart(openai, fp, f);
      if (result.valid) {
        const dest = path.join(OUT_DIR, f);
        await copyFile(fp, dest);
        valid.push({ file: f, size, reason: result.reason });
        console.log("VALID");
      } else {
        invalid.push({ file: f, reason: result.reason });
        console.log("skip");
      }
    } catch (e) {
      console.log("error", e.message);
    }

    // Rate limit courtesy
    await new Promise((r) => setTimeout(r, 200));
  }

  const manifest = {
    scannedAt: new Date().toISOString(),
    validCount: valid.length,
    invalidCount: invalid.length,
    valid,
    invalid: invalid.slice(0, 50),
  };

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\nDone. ${valid.length} valid charts → ${OUT_DIR}`);
}

main();
