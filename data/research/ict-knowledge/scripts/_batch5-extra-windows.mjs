#!/usr/bin/env node
import { parseVtt, searchCues } from "./vtt-tools.mjs";
import fs from "node:fs";

function windowText(cues, a, b) {
  return cues
    .filter((c) => c.startSec != null && c.startSec >= a && c.startSec <= b)
    .map((c) => `[${c.start}] ${c.text}`)
    .join("\n");
}

const extras = {};

// Equilibrium: find 50% / equilibrium phrasing
for (const [id, pats] of [
  ["qC0LogyIk2I", ["equilibrium", "discount", "50", "fifty percent", "optimal"]],
  ["YuefjnUKQdM", ["equilibrium", "premium", "50", "fifty percent", "above"]],
  ["22XkhpJR5eA", ["buy stop", "sell stop", "liquidity run", "buy side", "sell side"]],
  ["Gnw54f9v6SA", ["equal high", "equal low", "relative equal", "liquidity pool", "old high"]],
  ["O69iFqP1j7o", ["low resistance", "high resistance", "liquidity run", "resistance"]],
  ["POUT0pVs4U0", ["first presented", "reclaimed", "sellside", "sell side", "fair value"]],
]) {
  const path = `data/ict-transcripts/raw/${id}.en.vtt`;
  const cues = parseVtt(fs.readFileSync(path, "utf8"));
  extras[id] = {};
  for (const pat of pats) {
    const hits = searchCues(cues, new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), {
      window: 6,
      maxHits: 8,
    });
    extras[id][pat] = hits.slice(0, 4).map((h) => ({
      t: h.start,
      sec: h.startSec,
      snippet: h.snippet.slice(0, 600),
      around: windowText(cues, h.startSec - 5, h.startSec + 40).slice(0, 900),
    }));
  }
}

fs.writeFileSync(
  "data/research/ict-knowledge/sources/_batch5-extra-windows.json",
  JSON.stringify(extras, null, 2)
);

for (const [id, pats] of Object.entries(extras)) {
  console.log("\n####", id);
  for (const [pat, hits] of Object.entries(pats)) {
    if (!hits.length) continue;
    console.log(`-- ${pat} --`);
    console.log(hits[0].around.slice(0, 700));
  }
}
