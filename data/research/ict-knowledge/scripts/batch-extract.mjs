#!/usr/bin/env node
import { parseVtt, searchCues } from "./vtt-tools.mjs";
import fs from "node:fs";
import path from "node:path";

const jobs = [
  [
    "uwFJ0t7SAOU",
    "tmp/ict-transcripts/org-gaps.uwFJ0t7SAOU.en.vtt",
    [
      "opening range",
      "30 minutes",
      "willingness",
      "gap down",
      "previous session",
      "couple of minutes",
    ],
  ],
  [
    "eft9_3ekDCY",
    "tmp/ict-transcripts/entries-drills.eft9_3ekDCY.en.vtt",
    [
      "half gap",
      "consequent encroachment",
      "opening range",
      "first presented",
      "fair value gap",
      "quadrant",
      "70%",
      "settlement",
      "first 30",
      "rhyme and reason",
    ],
  ],
  [
    "6DuByzKLDsc",
    "data/ict-transcripts/pilot/dealing-range.en.vtt",
    [
      "first hour",
      "dealing range",
      "10:30",
      "opening range",
      "first presented",
      "fair value gap",
      "body close",
      "not the wick",
    ],
  ],
  [
    "2K1IcVvq9z8",
    "data/ict-transcripts/pilot/premarket-range.en.vtt",
    [
      "pre-market",
      "pre market",
      "opening range",
      "7:00",
      "8:00",
      "9:00",
      "equal high",
      "equal low",
      "relative equal",
    ],
  ],
];

const outDir = path.join("data/research/ict-knowledge/sources");

for (const [id, p, pats] of jobs) {
  const cues = parseVtt(fs.readFileSync(p, "utf8"));
  const out = { video_id: id, path: p, cues: cues.length, searches: {} };
  for (const pat of pats) {
    out.searches[pat] = searchCues(cues, new RegExp(escapeRe(pat), "i"), {
      window: 4,
      maxHits: 8,
    }).map((h) => ({
      t: h.start,
      sec: h.startSec,
      snippet: h.snippet.slice(0, 500),
    }));
  }
  const dest = path.join(outDir, `_extract-${id}.json`);
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(id, "cues", cues.length, "->", dest);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
