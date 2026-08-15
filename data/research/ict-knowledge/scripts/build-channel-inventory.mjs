#!/usr/bin/env node
/**
 * Build channel inventory JSON from flat TSV dumps — RESEARCH ONLY.
 * Caption status: AVAILABLE only when a local VTT path is known; else CAPTION_STATUS_UNPROBED.
 * Does not download media or hit per-video caption APIs (resource-light).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "data/research/ict-knowledge/sources";
const knownLocal = {
  "6DuByzKLDsc": {
    transcript_path: "data/ict-transcripts/pilot/dealing-range.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
  },
  "2K1IcVvq9z8": {
    transcript_path: "data/ict-transcripts/pilot/premarket-range.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
  },
  uwFJ0t7SAOU: {
    transcript_path: "tmp/ict-transcripts/org-gaps.uwFJ0t7SAOU.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
  },
  eft9_3ekDCY: {
    transcript_path: "tmp/ict-transcripts/entries-drills.eft9_3ekDCY.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
  },
  "-DMKLrUJvfg": {
    transcript_path: "data/ict-transcripts/raw/-DMKLrUJvfg.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
    notes:
      "THIRD_PARTY (DanDowdTrading) explaining ICT FPFVG model — not official ICT primary lecture. Auto-captions fetched 2026-08-15.",
  },
  // Batch 2 — priority official caption probe (2026-08-15)
  Zm9Q0NDRxoY: {
    transcript_path: "data/ict-transcripts/raw/Zm9Q0NDRxoY.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
    notes: "Official ICT — Opening Range Theory / 1st Presented FVG Logic; Batch2 probe.",
  },
  "s-iqN0h2Fgg": {
    transcript_path: "data/ict-transcripts/raw/s-iqN0h2Fgg.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
    notes: "Official ICT — 2022 Topical Study Dealing Ranges; Batch2 probe.",
  },
  pM8oWrcIJqU: {
    transcript_path: "data/ict-transcripts/raw/pM8oWrcIJqU.en.vtt",
    transcript_status: "AVAILABLE",
    processed: true,
    notes:
      "Official ICT — 2025 Lecture Series SMC Trading Opening Range Gaps; states FPFVG since 9:31 / not on 9:30 candle. Batch2 probe.",
  },
  uIvlS330qrA: {
    transcript_path: "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT ORG lecture; captions fetched Batch2 — citation extract deferred.",
  },
  Sf_uYZBWTrA: {
    transcript_path: "data/ict-transcripts/raw/Sf_uYZBWTrA.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT ORG repricing macro; captions fetched Batch2 — citation extract deferred.",
  },
  V5crdCw0AsY: {
    transcript_path: "data/ict-transcripts/raw/V5crdCw0AsY.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT RTH ORG chain-of-custody; captions fetched Batch2 — citation extract deferred.",
  },
  UPKUqW_eaas: {
    transcript_path: "data/ict-transcripts/raw/UPKUqW_eaas.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT AM Session ORG+MB+FVG; captions fetched Batch2 — citation extract deferred.",
  },
  tbEzAhdv_Ak: {
    transcript_path: "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT 2026 RTH ORG commentary live; captions fetched Batch2 — citation extract deferred.",
  },
  ORbtHOUzAIM: {
    transcript_path: "data/ict-transcripts/raw/ORbtHOUzAIM.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT Core Content Month 10 Index Futures OR basics; captions fetched Batch2.",
  },
  CGbSpa_9Z9Y: {
    transcript_path: "data/ict-transcripts/raw/CGbSpa_9Z9Y.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT Core Content Month 10 Bond Trading OR basics; captions fetched Batch2.",
  },
  Z0VYZoaTIKE: {
    transcript_path: "data/ict-transcripts/raw/Z0VYZoaTIKE.en.vtt",
    transcript_status: "AVAILABLE",
    processed: false,
    notes: "Official ICT 2025 Midnight Opening Range lecture; captions fetched Batch2.",
  },
  ib9sa6ldwA4: {
    transcript_path: null,
    transcript_status: "CAPTION_MISSING",
    processed: false,
    notes:
      "Official ICT 2025 Midnight Opening Range Live NQ Example — yt-dlp wrote no en VTT (Batch2 probe). Honest CAPTION_MISSING.",
  },
};

function parseTsv(file, tab) {
  const text = fs.readFileSync(file, "utf8");
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const [id, title, url, duration, upload_date] = parts;
    if (!id) continue;
    rows.push({
      video_id: id,
      title: title || null,
      url: url || `https://www.youtube.com/watch?v=${id}`,
      duration_sec: duration && duration !== "NA" ? Number(duration) : null,
      upload_date: upload_date && upload_date !== "NA" ? upload_date : null,
      channel_tab: tab,
      channel: "The Inner Circle Trader",
      channel_id: "UCtjxa77NqamhVC8atV85Rog",
      channel_url: "https://www.youtube.com/@InnerCircleTrader",
    });
  }
  return rows;
}

const videos = parseTsv(path.join(ROOT, "channel-inventory.tsv"), "videos");
const streams = parseTsv(path.join(ROOT, "channel-streams.tsv"), "streams");
const shorts = parseTsv(path.join(ROOT, "channel-shorts.tsv"), "shorts");

const byId = new Map();
for (const row of [...videos, ...streams, ...shorts]) {
  const prev = byId.get(row.video_id);
  if (!prev) {
    byId.set(row.video_id, { ...row, channel_tabs: [row.channel_tab] });
  } else {
    if (!prev.channel_tabs.includes(row.channel_tab)) prev.channel_tabs.push(row.channel_tab);
    // Prefer non-null duration/title
    if (!prev.duration_sec && row.duration_sec) prev.duration_sec = row.duration_sec;
    if ((!prev.title || prev.title === "NA") && row.title) prev.title = row.title;
  }
}

const channelVideos = [...byId.values()].map((v) => {
  const { channel_tab, ...rest } = v;
  const known = knownLocal[v.video_id];
  return {
    ...rest,
    transcript_path: known?.transcript_path ?? null,
    transcript_status: known?.transcript_status ?? "CAPTION_STATUS_UNPROBED",
    processed: known?.processed ?? false,
    notes: known?.notes ?? null,
  };
});

// Extra seed videos not on official channel listing
const offChannel = [
  {
    video_id: "2K1IcVvq9z8",
    title: "ICT Gems — Pre-Market Range",
    url: "https://www.youtube.com/watch?v=2K1IcVvq9z8",
    channel: "UC_ft_-mxIGK4cOjR-hZiN8g (not official ICT)",
    channel_id: "UC_ft_-mxIGK4cOjR-hZiN8g",
    channel_tabs: ["off_channel_seed"],
    ...knownLocal["2K1IcVvq9z8"],
    notes: "Seed VTT; channel is NOT @InnerCircleTrader (verified 2026-08-15).",
  },
  {
    video_id: "uwFJ0t7SAOU",
    title: "ICT Gems — Opening Range Gaps",
    url: "https://www.youtube.com/watch?v=uwFJ0t7SAOU",
    channel: "UCKLSLwlC2x3w0UeKLLwu7JA (not official ICT)",
    channel_id: "UCKLSLwlC2x3w0UeKLLwu7JA",
    channel_tabs: ["off_channel_seed"],
    ...knownLocal.uwFJ0t7SAOU,
    notes: "Seed VTT; channel is NOT @InnerCircleTrader (verified 2026-08-15).",
  },
  {
    video_id: "-DMKLrUJvfg",
    title: "ICT's First Presented FVG Model - Explained",
    url: "https://www.youtube.com/watch?v=-DMKLrUJvfg",
    channel: "DanDowdTrading",
    channel_id: "UCWInp9beoLN_RDZ4KxezcCQ",
    channel_url: "https://www.youtube.com/@dandowdtrading",
    channel_tabs: ["off_channel_third_party"],
    duration_sec: 815,
    upload_date: "20250315",
    ...knownLocal["-DMKLrUJvfg"],
  },
];

for (const row of offChannel) {
  if (!byId.has(row.video_id)) {
    channelVideos.push(row);
  }
}

const available = channelVideos.filter((v) => v.transcript_status === "AVAILABLE").length;
const unprobed = channelVideos.filter((v) => v.transcript_status === "CAPTION_STATUS_UNPROBED").length;
const missing = channelVideos.filter(
  (v) =>
    v.transcript_status === "MISSING_TRANSCRIPT" ||
    v.transcript_status === "CAPTION_MISSING"
).length;
const unavailable = channelVideos.filter((v) => v.transcript_status === "UNAVAILABLE").length;

const inventory = {
  schema_version: "1.1.0",
  project_type: "research_knowledge_extraction",
  baseline_v2: "UNCHANGED",
  production_logic: "NOT_IN_PRODUCTION",
  channel: {
    name: "The Inner Circle Trader (ICT)",
    handle: "@InnerCircleTrader",
    channel_id: "UCtjxa77NqamhVC8atV85Rog",
    url: "https://www.youtube.com/@InnerCircleTrader",
    full_channel_status: "FLAT_INVENTORY_DONE — per-video caption probe NOT done for all rows",
    inventoried_at: "2026-08-15",
    tabs: {
      videos: videos.length,
      streams: streams.length,
      shorts: shorts.length,
      unique_ids: byId.size,
    },
  },
  flat_files: {
    videos_tsv: "sources/channel-inventory.tsv",
    streams_tsv: "sources/channel-streams.tsv",
    shorts_tsv: "sources/channel-shorts.tsv",
  },
  videos: channelVideos.sort((a, b) => a.video_id.localeCompare(b.video_id)),
  coverage: {
    official_channel_unique_ids: byId.size,
    off_channel_seed_added: offChannel.filter((r) => !byId.has(r.video_id)).length,
    total_rows_in_inventory: channelVideos.length,
    local_transcripts_available: available,
    caption_status_unprobed: unprobed,
    known_missing_transcript: missing,
    caption_unavailable: unavailable,
    claim_full_channel_caption_complete: false,
    claim_full_channel_metadata_complete:
      "PARTIAL — videos+streams+shorts tabs via yt-dlp --flat-playlist; YouTube may paginate/omit; lives found under streams",
    approx_channel_metadata_coverage_pct:
      "UNKNOWN exact denominator; this pass listed videos=722 streams=165 shorts=6 unique≈computed — treat as best-effort flat crawl, not audited 100%",
  },
  notes: [
    "Official ICT lives (e.g. 6DuByzKLDsc, eft9_3ekDCY) appear under /streams, not /videos.",
    "Several prior seed VTTs are third-party or gem reuploads — keep channel provenance explicit.",
    "CAPTION_STATUS_UNPROBED means metadata listed but public-caption availability not fetched (resource-light).",
    "Batch2 (2026-08-15): probed 12 priority official titles; 11 AVAILABLE, 1 CAPTION_MISSING (ib9sa6ldwA4).",
    "Official FPFVG 9:31 / not-on-9:30-candle rule corroborated in pM8oWrcIJqU (NOT inventing from third-party alone).",
  ],
};

fs.writeFileSync(path.join(ROOT, "inventory.json"), JSON.stringify(inventory, null, 2));
fs.writeFileSync(
  path.join(ROOT, "channel-inventory.summary.json"),
  JSON.stringify(
    {
      inventoried_at: inventory.channel.inventoried_at,
      tabs: inventory.channel.tabs,
      coverage: inventory.coverage,
      available_ids: channelVideos.filter((v) => v.transcript_status === "AVAILABLE").map((v) => v.video_id),
    },
    null,
    2
  )
);
console.log(
  JSON.stringify(
    {
      unique_official: byId.size,
      total_rows: channelVideos.length,
      available,
      unprobed,
      tabs: inventory.channel.tabs,
    },
    null,
    2
  )
);
