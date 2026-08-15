#!/usr/bin/env node
/**
 * Resource-gated caption probe for priority official ICT ids — RESEARCH ONLY.
 * Uses: py -3 -m yt_dlp --skip-download --write-auto-sub --write-sub
 * Throttles with sleep between fetches. Never invents captions.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "data/ict-transcripts/raw";
const REPORT = "data/research/ict-knowledge/sources/_caption-probe-batch2.json";
const SLEEP_MS = Number(process.env.ICT_CAPTION_SLEEP_MS || 8000);

/** Curated priority official batch (ORG lectures, Dealing Ranges, FPFVG-named). */
const BATCH = [
  {
    video_id: "Zm9Q0NDRxoY",
    title: "ICT Opening Range Theory \\ 1st Presented FVG Logic",
    priority: "fpfvg_official",
  },
  {
    video_id: "s-iqN0h2Fgg",
    title: "2022 ICT Mentorship Topical Study - Dealing Ranges",
    priority: "dealing_range",
  },
  {
    video_id: "pM8oWrcIJqU",
    title: "2025 Lecture Series - SMC Trading Opening Range Gaps",
    priority: "org",
  },
  {
    video_id: "uIvlS330qrA",
    title: "2025 Lecture Series - SMC Opening Range Gaps",
    priority: "org",
  },
  {
    video_id: "Sf_uYZBWTrA",
    title: "2023 ICT Mentorship - Opening Range Gap Repricing Macro",
    priority: "org",
  },
  {
    video_id: "V5crdCw0AsY",
    title: "Chain Of Custody Of Price With RTH ORG",
    priority: "org",
  },
  {
    video_id: "UPKUqW_eaas",
    title: "AM Session - Opening Range Gap + Mitigation Block & FVG Entry",
    priority: "org",
  },
  {
    video_id: "tbEzAhdv_Ak",
    title: "ICT 2026 Futures Review & RTH ORG Commentary \\ April 29, 2026",
    priority: "org",
  },
  {
    video_id: "ORbtHOUzAIM",
    title: "ICT Mentorship Core Content - Month 10 - Index Futures - Basics & Opening Range Concept",
    priority: "opening_range",
  },
  {
    video_id: "CGbSpa_9Z9Y",
    title: "ICT Mentorship Core Content - Month 10 - Bond Trading - Basics & Opening Range Concept",
    priority: "opening_range",
  },
  {
    video_id: "Z0VYZoaTIKE",
    title: "2025 Lecture Series - SMC Midnight Opening Range",
    priority: "opening_range",
  },
  {
    video_id: "ib9sa6ldwA4",
    title: "2025 Lecture Series - SMC Midnight Opening Range Live NQ Example",
    priority: "opening_range",
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function findVttForId(id) {
  const files = fs.readdirSync(OUT_DIR);
  const matches = files.filter(
    (f) =>
      f.includes(id) &&
      (f.endsWith(".vtt") || f.endsWith(".srt")) &&
      !f.endsWith(".part")
  );
  // Prefer en
  const en = matches.find((f) => /\.en(\.|$)/i.test(f)) || matches[0];
  return en ? path.join(OUT_DIR, en) : null;
}

function probeOne(item) {
  const url = `https://www.youtube.com/watch?v=${item.video_id}`;
  const outTpl = path.join(OUT_DIR, `${item.video_id}.%(ext)s`);
  const existing = findVttForId(item.video_id);
  if (existing) {
    return {
      ...item,
      url,
      status: "AVAILABLE",
      transcript_path: existing.replace(/\\/g, "/"),
      note: "already_present",
    };
  }

  const args = [
    "-3",
    "-m",
    "yt_dlp",
    "--skip-download",
    "--write-auto-sub",
    "--write-sub",
    "--sub-langs",
    "en.*,en",
    "--sub-format",
    "vtt/best",
    "--sleep-requests",
    "1",
    "--retries",
    "2",
    "--fragment-retries",
    "2",
    "-o",
    outTpl,
    "--no-warnings",
    url,
  ];

  const started = Date.now();
  const r = spawnSync("py", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  const elapsed_ms = Date.now() - started;
  const vtt = findVttForId(item.video_id);
  const stderr = (r.stderr || "").slice(-2000);
  const stdout = (r.stdout || "").slice(-1500);

  let status = "CAPTION_MISSING";
  let note = null;
  if (vtt) {
    status = "AVAILABLE";
  } else if (/Sign in to confirm|bot|confirm you.?re not|HTTP Error 429|Too Many Requests/i.test(stderr + stdout)) {
    status = "UNAVAILABLE";
    note = "blocked_or_rate_limited";
  } else if (/has no subtitles|There aren't any subtitles|subtitle.*unavailable|Requested format is not available/i.test(stderr + stdout)) {
    status = "CAPTION_MISSING";
    note = "no_subtitles_reported";
  } else if (r.error || r.status !== 0) {
    status = "UNAVAILABLE";
    note = `yt_dlp_exit_${r.status}; ${(r.error && r.error.message) || ""}`.trim();
  }

  return {
    ...item,
    url,
    status,
    transcript_path: vtt ? vtt.replace(/\\/g, "/") : null,
    elapsed_ms,
    exit_code: r.status,
    note,
    stderr_tail: stderr.slice(-800) || null,
  };
}

const results = [];
for (let i = 0; i < BATCH.length; i++) {
  const item = BATCH[i];
  console.error(`[${i + 1}/${BATCH.length}] probing ${item.video_id} (${item.priority}) …`);
  const row = probeOne(item);
  results.push(row);
  console.error(`  → ${row.status}${row.transcript_path ? " " + row.transcript_path : ""}${row.note ? " (" + row.note + ")" : ""}`);
  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      {
        probed_at: new Date().toISOString(),
        sleep_ms: SLEEP_MS,
        batch_size: BATCH.length,
        completed: results.length,
        results,
      },
      null,
      2
    )
  );
  if (i < BATCH.length - 1) sleep(SLEEP_MS);
}

const summary = {
  probed_at: new Date().toISOString(),
  sleep_ms: SLEEP_MS,
  videos_probed: results.length,
  available: results.filter((r) => r.status === "AVAILABLE").length,
  caption_missing: results.filter((r) => r.status === "CAPTION_MISSING").length,
  unavailable: results.filter((r) => r.status === "UNAVAILABLE").length,
  results,
};
fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
