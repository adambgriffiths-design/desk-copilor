#!/usr/bin/env node
/**
 * Precise cue windows for Batch5 definitional citations — RESEARCH ONLY.
 */
import { parseVtt } from "./vtt-tools.mjs";
import fs from "node:fs";

function windowText(cues, startSec, endSec) {
  return cues
    .filter(
      (c) => c.startSec != null && c.startSec >= startSec && c.startSec <= endSec
    )
    .map((c) => `[${c.start}] ${c.text}`)
    .join("\n");
}

const jobs = [
  {
    id: "FgacYSN9QEo",
    path: "data/ict-transcripts/raw/FgacYSN9QEo.en.vtt",
    windows: [
      { key: "fvg_definition", start: 30, end: 70 },
      { key: "fvg_three_candle_geometry", start: 110, end: 200 },
      { key: "fvg_fill_after_ssl", start: 380, end: 450 },
      { key: "fvg_overlap_void_pools", start: 540, end: 600 },
    ],
  },
  {
    id: "uC4-1SYXJFg",
    path: "data/ict-transcripts/raw/uC4-1SYXJFg.en.vtt",
    windows: [
      { key: "fpfvg_in_or_930_1000", start: 490, end: 560 },
      { key: "fpfvg_criteria_vs_930_candle", start: 560, end: 650 },
      { key: "fpfvg_after_reh_raid", start: 770, end: 820 },
      { key: "fpfvg_ifvg_pair", start: 2430, end: 2490 },
    ],
  },
  {
    id: "POUT0pVs4U0",
    path: "data/ict-transcripts/raw/POUT0pVs4U0.en.vtt",
    windows: [
      { key: "fpfvg_sellside_early", start: 0, end: 180 },
      { key: "fpfvg_mentions", start: 180, end: 420 },
    ],
  },
  {
    id: "qC0LogyIk2I",
    path: "data/ict-transcripts/raw/qC0LogyIk2I.en.vtt",
    windows: [
      { key: "eq_vs_discount_def", start: 0, end: 200 },
      { key: "fib_eq_50", start: 200, end: 400 },
      { key: "discount_use", start: 400, end: 600 },
    ],
  },
  {
    id: "YuefjnUKQdM",
    path: "data/ict-transcripts/raw/YuefjnUKQdM.en.vtt",
    windows: [
      { key: "eq_vs_premium_def", start: 0, end: 200 },
      { key: "premium_use", start: 200, end: 450 },
    ],
  },
  {
    id: "22XkhpJR5eA",
    path: "data/ict-transcripts/raw/22XkhpJR5eA.en.vtt",
    windows: [
      { key: "liquidity_run_def", start: 0, end: 200 },
      { key: "bsl_ssl_runs", start: 200, end: 450 },
    ],
  },
  {
    id: "Gnw54f9v6SA",
    path: "data/ict-transcripts/raw/Gnw54f9v6SA.en.vtt",
    windows: [
      { key: "liquidity_pool_def", start: 0, end: 200 },
      { key: "eqh_eql_pools", start: 200, end: 450 },
    ],
  },
  {
    id: "vqtA1S9JH34",
    path: "data/ict-transcripts/raw/vqtA1S9JH34.en.vtt",
    windows: [
      { key: "open_float_def", start: 0, end: 200 },
      { key: "open_float_use", start: 200, end: 450 },
    ],
  },
  {
    id: "HTQgH11W37o",
    path: "data/ict-transcripts/raw/HTQgH11W37o.en.vtt",
    windows: [
      { key: "liquidity_void_def", start: 0, end: 200 },
      { key: "void_vs_fvg", start: 200, end: 420 },
    ],
  },
  {
    id: "O69iFqP1j7o",
    path: "data/ict-transcripts/raw/O69iFqP1j7o.en.vtt",
    windows: [
      { key: "lrlr_def", start: 0, end: 220 },
      { key: "lrlr_examples", start: 220, end: 480 },
    ],
  },
];

const out = {};
for (const job of jobs) {
  const cues = parseVtt(fs.readFileSync(job.path, "utf8"));
  out[job.id] = { path: job.path, cues: cues.length, windows: {} };
  for (const w of job.windows) {
    out[job.id].windows[w.key] = {
      start_sec: w.start,
      end_sec: w.end,
      text: windowText(cues, w.start, w.end),
    };
  }
}

const tbExtract = JSON.parse(
  fs.readFileSync(
    "data/research/ict-knowledge/sources/_extract-tbEzAhdv_Ak.json",
    "utf8"
  )
);
const tbCues = parseVtt(
  fs.readFileSync("data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt", "utf8")
);
out.tbEzAhdv_Ak = { path: "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt", cues: tbCues.length, windows: {} };
for (const pat of ["opening range gap", "consequent encroachment", "fair value gap"]) {
  for (const h of (tbExtract.searches[pat] || []).slice(0, 3)) {
    const key = `${pat.replace(/\s+/g, "_")}_${Math.floor(h.sec)}`;
    const a = Math.max(0, h.sec - 15);
    const b = h.sec + 45;
    out.tbEzAhdv_Ak.windows[key] = {
      start_sec: a,
      end_sec: b,
      text: windowText(tbCues, a, b),
    };
  }
}

fs.writeFileSync(
  "data/research/ict-knowledge/sources/_batch5-precise-windows.json",
  JSON.stringify(out, null, 2)
);

// Compact preview for console
for (const [id, v] of Object.entries(out)) {
  console.log(`\n#### ${id} (${v.cues} cues)`);
  for (const [k, w] of Object.entries(v.windows)) {
    const preview = (w.text || "").replace(/\n/g, " | ").slice(0, 500);
    console.log(`  [${k}] ${preview}`);
  }
}
