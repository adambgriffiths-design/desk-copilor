#!/usr/bin/env node
/**
 * ICT knowledge extraction helpers — RESEARCH ONLY.
 * Parses public VTT captions → cue-indexed plain text; keyword search for citation.
 * Does NOT import trading-brain / verdict / observation engines.
 * Does NOT mutate baseline-v2 or production decisioning.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Strip YouTube auto-caption word timestamps and HTML-ish tags. */
function cleanCueText(raw) {
  return String(raw || "")
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
    .replace(/<\/?c>/g, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimestamp(ts) {
  const m = String(ts).match(/(\d+):(\d{2}):(\d{2})\.(\d{3})/);
  if (!m) return null;
  const [, h, mi, s, ms] = m;
  return Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
}

/**
 * Parse YouTube-style VTT into deduped cues { start, end, startSec, text }.
 * Keeps only "final" rolling lines (no nested word-timestamp fragments as separate cues).
 */
export function parseVtt(content) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\n+/);
  const cues = [];
  const seen = new Set();

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length);
    if (!lines.length) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx < 0) continue;
    const [startRaw, endPart] = lines[timeLineIdx].split("-->");
    const start = startRaw.trim();
    const end = (endPart || "").trim().split(/\s+/)[0];
    const textLines = lines.slice(timeLineIdx + 1);
    // Prefer lines without inline <c> word timestamps (the "rolled up" caption)
    const plain = textLines
      .filter((l) => !/<c>/.test(l) && !/<\d{2}:\d{2}:\d{2}\.\d{3}>/.test(l))
      .map(cleanCueText)
      .filter(Boolean);
    const fallback = textLines.map(cleanCueText).filter(Boolean);
    const text = (plain.length ? plain : fallback).join(" ").trim();
    if (!text) continue;
    const startSec = parseTimestamp(start);
    // Collapse YouTube dual-line rollup duplicates (same text ~10ms apart).
    const last = cues[cues.length - 1];
    if (last && last.text === text && startSec != null && last.startSec != null && Math.abs(startSec - last.startSec) < 0.05) {
      continue;
    }
    const key = `${text}|${Math.round((startSec || 0) * 2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cues.push({
      start,
      end,
      startSec,
      text,
    });
  }
  return cues;
}

export function cuesToPlainText(cues) {
  return cues.map((c) => `[${c.start}] ${c.text}`).join("\n");
}

export function searchCues(cues, pattern, { window = 2, maxHits = 40 } = {}) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
  const hits = [];
  for (let i = 0; i < cues.length; i++) {
    if (!re.test(cues[i].text)) continue;
    const from = Math.max(0, i - window);
    const to = Math.min(cues.length - 1, i + window);
    const snippet = cues
      .slice(from, to + 1)
      .map((c) => `[${c.start}] ${c.text}`)
      .join(" ");
    hits.push({
      index: i,
      start: cues[i].start,
      startSec: cues[i].startSec,
      text: cues[i].text,
      snippet,
    });
    if (hits.length >= maxHits) break;
  }
  return hits;
}

const DEFAULT_LOCAL = [
  {
    video_id: "6DuByzKLDsc",
    title: "ICT 1st Hour Dealing Range",
    url: "https://www.youtube.com/watch?v=6DuByzKLDsc",
    transcript_path: "data/ict-transcripts/pilot/dealing-range.en.vtt",
  },
  {
    video_id: "2K1IcVvq9z8",
    title: "ICT Gems — Pre-Market Range",
    url: "https://www.youtube.com/watch?v=2K1IcVvq9z8",
    transcript_path: "data/ict-transcripts/pilot/premarket-range.en.vtt",
  },
  {
    video_id: "uwFJ0t7SAOU",
    title: "ICT Gems — Opening Range Gaps",
    url: "https://www.youtube.com/watch?v=uwFJ0t7SAOU",
    transcript_path: "tmp/ict-transcripts/org-gaps.uwFJ0t7SAOU.en.vtt",
  },
  {
    video_id: "eft9_3ekDCY",
    title: "ICT 2026 Entries & Drills Part 2",
    url: "https://www.youtube.com/watch?v=eft9_3ekDCY",
    transcript_path: "tmp/ict-transcripts/entries-drills.eft9_3ekDCY.en.vtt",
  },
];

function cmdNormalize(args) {
  const inPath = args[0];
  if (!inPath) {
    console.error("Usage: normalize <vtt-path> [out-txt-path]");
    process.exit(1);
  }
  const abs = path.isAbsolute(inPath) ? inPath : path.join(ROOT, inPath);
  const content = fs.readFileSync(abs, "utf8");
  const cues = parseVtt(content);
  const out =
    args[1] ||
    abs.replace(/\.vtt$/i, ".plain.txt");
  fs.writeFileSync(out, cuesToPlainText(cues), "utf8");
  console.log(JSON.stringify({ cues: cues.length, out }, null, 2));
}

function cmdSearch(args) {
  const inPath = args[0];
  const pattern = args[1];
  if (!inPath || !pattern) {
    console.error("Usage: search <vtt-path> <regex>");
    process.exit(1);
  }
  const abs = path.isAbsolute(inPath) ? inPath : path.join(ROOT, inPath);
  const cues = parseVtt(fs.readFileSync(abs, "utf8"));
  const hits = searchCues(cues, new RegExp(pattern, "i"), {
    window: 3,
    maxHits: 25,
  });
  console.log(JSON.stringify({ cues: cues.length, hits: hits.length, results: hits }, null, 2));
}

function cmdInventory() {
  const rows = DEFAULT_LOCAL.map((v) => {
    const abs = path.join(ROOT, v.transcript_path);
    const available = fs.existsSync(abs);
    return {
      ...v,
      transcript_status: available ? "AVAILABLE" : "MISSING_TRANSCRIPT",
      bytes: available ? fs.statSync(abs).size : null,
    };
  });
  console.log(JSON.stringify({ count: rows.length, videos: rows }, null, 2));
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (isMain) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "normalize") cmdNormalize(rest);
  else if (cmd === "search") cmdSearch(rest);
  else if (cmd === "inventory") cmdInventory();
  else {
    console.log(`ICT research VTT tools (no trading imports)

Commands:
  inventory
  normalize <vtt> [out.txt]
  search <vtt> <regex>

Local default videos: ${DEFAULT_LOCAL.length}
`);
  }
}
