#!/usr/bin/env node
/**
 * Batch 5 — throttled caption probe: dealing-range-adjacent / FVG / IFVG / FPFVG / liquidity.
 * RESEARCH ONLY. Captions-only. Never invents missing captions.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = "data/ict-transcripts/raw";
const REPORT = "data/research/ict-knowledge/sources/_caption-probe-batch5.json";
const SLEEP_MS = Number(process.env.ICT_CAPTION_SLEEP_MS || 10000);

/** Curated official priority batch (12). Prefer definitional lectures over long live streams. */
const BATCH = [
  {
    video_id: "FgacYSN9QEo",
    title: "ICT Mentorship Core Content - Month 04 - ICT Fair Value Gaps FVG",
    priority: "fvg_core",
  },
  {
    video_id: "uC4-1SYXJFg",
    title: "2025 Lecture Series - NQ Review When 9:30am ET Is 1st Presented FVG May 18, 2025",
    priority: "fpfvg_official",
  },
  {
    video_id: "o38k6-twQCg",
    title: "2025 Lecture Series - NQ Review Advanced 1st Presented FVG Trade May 16, 2025",
    priority: "fpfvg_official",
  },
  {
    video_id: "-tuXoqSjO78",
    title: "Old Daily Lows -Breaker Entry and -IFVG Reentry After Profitable Stop Out",
    priority: "ifvg",
  },
  {
    video_id: "POUT0pVs4U0",
    title: "Trading Friday Sellside Under 1st Presented FVG",
    priority: "fpfvg_liquidity",
  },
  {
    video_id: "qC0LogyIk2I",
    title: "ICT Mentorship Core Content - Month 1 - Equilibrium Vs. Discount",
    priority: "dealing_range_adjacent",
  },
  {
    video_id: "YuefjnUKQdM",
    title: "ICT Mentorship Core Content - Month 1 - Equilibrium Vs. Premium",
    priority: "dealing_range_adjacent",
  },
  {
    video_id: "22XkhpJR5eA",
    title: "ICT Mentorship Core Content - Month 1 - Liquidity Runs",
    priority: "liquidity",
  },
  {
    video_id: "Gnw54f9v6SA",
    title: "ICT Mentorship Core Content - Month 04 - Liquidity Pools",
    priority: "liquidity",
  },
  {
    video_id: "vqtA1S9JH34",
    title: "ICT Mentorship Core Content - Month 05 - Defining Open Float Liquidity Pools",
    priority: "liquidity",
  },
  {
    video_id: "HTQgH11W37o",
    title: "ICT Mentorship Core Content - Month 04 - Liquidity Voids",
    priority: "liquidity",
  },
  {
    video_id: "O69iFqP1j7o",
    title: "ICT Mentorship Core Content - Month 07 - Short Term Trading Low Resistance Liquidity Runs",
    priority: "liquidity",
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
  } else if (
    /Sign in to confirm|bot|confirm you.?re not|HTTP Error 429|Too Many Requests/i.test(
      stderr + stdout
    )
  ) {
    status = "UNAVAILABLE";
    note = "blocked_or_rate_limited";
  } else if (
    /has no subtitles|There aren't any subtitles|subtitle.*unavailable|Requested format is not available/i.test(
      stderr + stdout
    )
  ) {
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
  console.error(
    `[${i + 1}/${BATCH.length}] probing ${item.video_id} (${item.priority}) …`
  );
  const row = probeOne(item);
  results.push(row);
  console.error(
    `  → ${row.status}${row.transcript_path ? " " + row.transcript_path : ""}${
      row.note ? " (" + row.note + ")" : ""
    }`
  );
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
  batch_name: "batch5_dr_fvg_liquidity",
  videos_probed: results.length,
  available: results.filter((r) => r.status === "AVAILABLE").length,
  caption_missing: results.filter((r) => r.status === "CAPTION_MISSING").length,
  unavailable: results.filter((r) => r.status === "UNAVAILABLE").length,
  results,
};
fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
