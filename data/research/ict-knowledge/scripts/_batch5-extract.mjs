#!/usr/bin/env node
/**
 * Batch 5 keyword extract across new VTTs (+ optional light tbEz re-pass).
 * RESEARCH ONLY.
 */
import { parseVtt, searchCues } from "./vtt-tools.mjs";
import fs from "node:fs";
import path from "node:path";

const jobs = [
  [
    "FgacYSN9QEo",
    "data/ict-transcripts/raw/FgacYSN9QEo.en.vtt",
    [
      "fair value gap",
      "fvg",
      "three candle",
      "imbalance",
      "liquidity void",
      "consequent encroachment",
      "half",
      "premium",
      "discount",
      "equilibrium",
      "fill",
      "entry",
    ],
  ],
  [
    "uC4-1SYXJFg",
    "data/ict-transcripts/raw/uC4-1SYXJFg.en.vtt",
    [
      "first presented",
      "9:30",
      "9:31",
      "fair value gap",
      "fvg",
      "opening range",
      "middle candle",
      "one minute",
      "1 minute",
      "displacement",
      "buy side",
      "sell side",
    ],
  ],
  [
    "POUT0pVs4U0",
    "data/ict-transcripts/raw/POUT0pVs4U0.en.vtt",
    [
      "first presented",
      "fair value gap",
      "fvg",
      "sell side",
      "buy side",
      "liquidity",
      "9:30",
      "9:31",
      "opening range",
      "dealing range",
    ],
  ],
  [
    "qC0LogyIk2I",
    "data/ict-transcripts/raw/qC0LogyIk2I.en.vtt",
    [
      "equilibrium",
      "discount",
      "premium",
      "dealing range",
      "50%",
      "fifty",
      "fib",
      "range",
      "buy side",
      "sell side",
      "fair value",
    ],
  ],
  [
    "YuefjnUKQdM",
    "data/ict-transcripts/raw/YuefjnUKQdM.en.vtt",
    [
      "equilibrium",
      "premium",
      "discount",
      "dealing range",
      "50%",
      "fifty",
      "fib",
      "range",
      "buy side",
      "sell side",
      "fair value",
    ],
  ],
  [
    "22XkhpJR5eA",
    "data/ict-transcripts/raw/22XkhpJR5eA.en.vtt",
    [
      "liquidity run",
      "liquidity",
      "buy side",
      "sell side",
      "stop",
      "pool",
      "equal high",
      "equal low",
      "sweep",
      "raid",
      "inducement",
    ],
  ],
  [
    "Gnw54f9v6SA",
    "data/ict-transcripts/raw/Gnw54f9v6SA.en.vtt",
    [
      "liquidity pool",
      "liquidity",
      "buy side",
      "sell side",
      "equal high",
      "equal low",
      "relative equal",
      "stop",
      "old high",
      "old low",
      "pool",
    ],
  ],
  [
    "vqtA1S9JH34",
    "data/ict-transcripts/raw/vqtA1S9JH34.en.vtt",
    [
      "open float",
      "liquidity pool",
      "liquidity",
      "buy side",
      "sell side",
      "float",
      "equal high",
      "equal low",
      "stop",
      "pool",
    ],
  ],
  [
    "HTQgH11W37o",
    "data/ict-transcripts/raw/HTQgH11W37o.en.vtt",
    [
      "liquidity void",
      "void",
      "fair value gap",
      "imbalance",
      "fvg",
      "fill",
      "buy side",
      "sell side",
      "gap",
    ],
  ],
  [
    "O69iFqP1j7o",
    "data/ict-transcripts/raw/O69iFqP1j7o.en.vtt",
    [
      "low resistance",
      "liquidity run",
      "liquidity",
      "high resistance",
      "buy side",
      "sell side",
      "stop",
      "pool",
      "draw",
      "target",
    ],
  ],
  // optional light re-pass already-local under-mined
  [
    "tbEzAhdv_Ak",
    "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt",
    [
      "first presented",
      "fair value gap",
      "fvg",
      "liquidity",
      "buy side",
      "sell side",
      "dealing range",
      "opening range gap",
      "consequent encroachment",
      "9:31",
      "sweep",
    ],
  ],
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const outDir = path.join("data/research/ict-knowledge/sources");
const summary = { extracted_at: new Date().toISOString(), videos: [] };

for (const [id, p, pats] of jobs) {
  if (!fs.existsSync(p)) {
    console.error("MISSING", id, p);
    summary.videos.push({ id, status: "MISSING_FILE", path: p });
    continue;
  }
  const cues = parseVtt(fs.readFileSync(p, "utf8"));
  const out = { video_id: id, path: p, cues: cues.length, searches: {} };
  const hitCounts = {};
  for (const pat of pats) {
    const hits = searchCues(cues, new RegExp(escapeRe(pat), "i"), {
      window: 5,
      maxHits: 12,
    }).map((h) => ({
      t: h.start,
      sec: h.startSec,
      snippet: h.snippet.slice(0, 750),
    }));
    out.searches[pat] = hits;
    hitCounts[pat] = hits.length;
  }
  const dest = path.join(outDir, `_extract-${id}.json`);
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  summary.videos.push({ id, cues: cues.length, dest, hitCounts });
  console.log(id, "cues", cues.length, "hits", JSON.stringify(hitCounts));
}

fs.writeFileSync(
  path.join(outDir, "_batch5-extract-summary.json"),
  JSON.stringify(summary, null, 2)
);
console.log("summary -> sources/_batch5-extract-summary.json");
