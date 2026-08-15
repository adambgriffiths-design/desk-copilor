#!/usr/bin/env node
import { parseVtt, searchCues } from "./vtt-tools.mjs";
import fs from "node:fs";

function around(cues, startSec, windowSec = 25) {
  return cues
    .filter((c) => c.startSec != null && Math.abs(c.startSec - startSec) <= windowSec)
    .map((c) => `[${c.start}] ${c.text}`)
    .join(" ");
}

const targets = [
  {
    id: "uwFJ0t7SAOU",
    path: "tmp/ict-transcripts/org-gaps.uwFJ0t7SAOU.en.vtt",
    secs: [104, 117, 150, 200, 220],
  },
  {
    id: "eft9_3ekDCY",
    path: "tmp/ict-transcripts/entries-drills.eft9_3ekDCY.en.vtt",
    secs: [189, 370, 454, 632, 790, 3321, 3481],
  },
  {
    id: "6DuByzKLDsc",
    path: "data/ict-transcripts/pilot/dealing-range.en.vtt",
    secs: [2631, 4205, 100, 300, 600],
  },
  {
    id: "2K1IcVvq9z8",
    path: "data/ict-transcripts/pilot/premarket-range.en.vtt",
    secs: [1538, 100, 400, 800, 1200],
  },
];

for (const t of targets) {
  const cues = parseVtt(fs.readFileSync(t.path, "utf8"));
  const out = {
    video_id: t.id,
    windows: Object.fromEntries(
      t.secs.map((s) => [String(s), around(cues, s, 30)])
    ),
    extra: {
      give_bell: searchCues(cues, /give (the )?opening bell|couple of minutes|first couple/i, {
        maxHits: 5,
        window: 3,
      }).map((h) => ({ t: h.start, snippet: h.snippet.slice(0, 400) })),
      sharing_ranges: searchCues(cues, /shar(e|ing) range|wait until 10|no .+ gap/i, {
        maxHits: 5,
        window: 4,
      }).map((h) => ({ t: h.start, snippet: h.snippet.slice(0, 400) })),
      body_close: searchCues(cues, /body close|closing basis|not (just )?the wick|wick only/i, {
        maxHits: 6,
        window: 4,
      }).map((h) => ({ t: h.start, snippet: h.snippet.slice(0, 400) })),
      fhdr: searchCues(cues, /first hour dealing|9:30 to 10:30|lock.*(range|high|low)/i, {
        maxHits: 8,
        window: 4,
      }).map((h) => ({ t: h.start, snippet: h.snippet.slice(0, 450) })),
      premarket_windows: searchCues(
        cues,
        /7(:00)?\s*(to|until|-)\s*7(:30)?|8(:00)?\s*(to|until|-)\s*8(:30)?|9(:00)?\s*(to|until|-)\s*9(:30)?|pre-?market range/i,
        { maxHits: 10, window: 3 }
      ).map((h) => ({ t: h.start, snippet: h.snippet.slice(0, 450) })),
    },
  };
  const dest = `data/research/ict-knowledge/sources/_windows-${t.id}.json`;
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("wrote", dest);
}
