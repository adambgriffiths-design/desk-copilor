#!/usr/bin/env node
/**
 * Select priority official ICT titles for caption probe — RESEARCH ONLY.
 */
import fs from "node:fs";

const inv = JSON.parse(
  fs.readFileSync("data/research/ict-knowledge/sources/inventory.json", "utf8")
);
const rows = inv.videos;

const buckets = {
  org: [],
  dealing_range: [],
  first_presented_fvg: [],
  opening_range: [],
  fvg_open: [],
  first_hour: [],
  other_priority: [],
};

function classify(title) {
  const t = (title || "").toLowerCase();
  const tags = [];
  if (/opening\s*range\s*gap|\borg\b/.test(t)) tags.push("org");
  if (/dealing\s*range/.test(t)) tags.push("dealing_range");
  if (/first\s*presented|fpfvg/.test(t)) tags.push("first_presented_fvg");
  if (/first\s*hour/.test(t)) tags.push("first_hour");
  if (/opening\s*range/.test(t) && !tags.includes("org")) tags.push("opening_range");
  if (/fair\s*value\s*gap/.test(t) && /(open|9:3|first|morning|ny\b)/.test(t))
    tags.push("fvg_open");
  if (/pre[- ]?market\s*range/.test(t)) tags.push("other_priority");
  return tags;
}

function score(r, tags) {
  let s = 0;
  if (tags.includes("org")) s += 100;
  if (tags.includes("dealing_range")) s += 90;
  if (tags.includes("first_presented_fvg")) s += 95;
  if (tags.includes("fvg_open")) s += 80;
  if (tags.includes("first_hour")) s += 70;
  if (tags.includes("opening_range")) s += 40;
  if (tags.includes("other_priority")) s += 50;
  const t = (r.title || "").toLowerCase();
  if (/explained|model|lecture|core content|mentorship|gems/.test(t)) s += 15;
  if ((r.channel_tabs || []).includes("streams")) s += 5;
  if (r.duration_sec && r.duration_sec >= 600 && r.duration_sec <= 10800) s += 10;
  if (/bitcoin|twitter|raid|euro\b|cable|gbp|aud/.test(t)) s -= 15;
  return s;
}

const selected = [];
for (const r of rows) {
  if (r.transcript_status === "AVAILABLE") continue;
  const tags = classify(r.title);
  if (!tags.length) continue;
  const entry = {
    video_id: r.video_id,
    title: r.title,
    url: r.url,
    duration_sec: r.duration_sec,
    channel_tabs: r.channel_tabs,
    transcript_status: r.transcript_status,
    tags,
    score: score(r, tags),
  };
  selected.push(entry);
  for (const tag of tags) {
    if (buckets[tag]) buckets[tag].push(entry);
  }
}

selected.sort((a, b) => b.score - a.score);

const batch = [];
const seen = new Set();
function take(list, n) {
  for (const e of list.sort((a, b) => b.score - a.score)) {
    if (batch.length >= 25) break;
    if (seen.has(e.video_id)) continue;
    seen.add(e.video_id);
    batch.push(e);
    if ([...seen].filter((id) => list.some((x) => x.video_id === id)).length >= n)
      break;
  }
}

// Prefer ORG + dealing + FPFVG first
take(buckets.org, 8);
take(buckets.dealing_range, 8);
take(buckets.first_presented_fvg, 6);
take(buckets.fvg_open, 4);
take(buckets.first_hour, 3);
take(buckets.opening_range, 3);
take(buckets.other_priority, 2);
// fill to ~20 from overall
for (const e of selected) {
  if (batch.length >= 20) break;
  if (seen.has(e.video_id)) continue;
  seen.add(e.video_id);
  batch.push(e);
}

const out = {
  selected_at: new Date().toISOString().slice(0, 10),
  total_keyword_hits: selected.length,
  bucket_counts: Object.fromEntries(
    Object.entries(buckets).map(([k, v]) => [k, v.length])
  ),
  batch_size: batch.length,
  batch,
  all_hits_top40: selected.slice(0, 40),
};

fs.writeFileSync(
  "data/research/ict-knowledge/sources/_priority-batch.json",
  JSON.stringify(out, null, 2)
);
console.log(
  JSON.stringify(
    {
      total_keyword_hits: selected.length,
      bucket_counts: out.bucket_counts,
      batch_size: batch.length,
      batch: batch.map((b) => ({
        id: b.video_id,
        score: b.score,
        tags: b.tags,
        title: b.title,
      })),
    },
    null,
    2
  )
);
