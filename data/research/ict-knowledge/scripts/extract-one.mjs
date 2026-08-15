#!/usr/bin/env node
/**
 * One-off keyword extract for a single VTT — RESEARCH ONLY.
 */
import { parseVtt, searchCues } from "./vtt-tools.mjs";
import fs from "node:fs";
import path from "node:path";

const id = process.argv[2];
const vttPath = process.argv[3];
if (!id || !vttPath) {
  console.error("Usage: node extract-one.mjs <video_id> <vtt_path> [pat1,pat2,...]");
  process.exit(1);
}
const pats = (process.argv[4] ||
  "first presented,fair value gap,9:30,9:31,middle candle,middle of the,1 minute,one minute,dealing range,displacement,beyond,opening range,three candle,inverted,body close")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const cues = parseVtt(fs.readFileSync(vttPath, "utf8"));
const out = { video_id: id, path: vttPath, cues: cues.length, searches: {} };
for (const pat of pats) {
  const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  out.searches[pat] = searchCues(cues, re, { window: 5, maxHits: 15 }).map((h) => ({
    t: h.start,
    sec: h.startSec,
    snippet: h.snippet.slice(0, 700),
  }));
}
const dest = path.join(
  "data/research/ict-knowledge/sources",
  `_extract-${id.replace(/^-/, "")}.json`
);
// Keep leading-dash ids readable on Windows: _extract-DMKLrUJvfg.json for -DMKLrUJvfg
const destSafe = path.join(
  "data/research/ict-knowledge/sources",
  `_extract-${id}.json`.replace("/_extract--", "/_extract-")
);
fs.writeFileSync(destSafe, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ id, cues: cues.length, dest: destSafe, hit_counts: Object.fromEntries(Object.entries(out.searches).map(([k, v]) => [k, v.length])) }, null, 2));
