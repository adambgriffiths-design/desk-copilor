"""Batch 4 — OR clocks citation deep-dive (zero downloads). Updates catalogue only."""
import json
import pathlib
import shutil

ROOT = pathlib.Path("data/research/ict-knowledge")
CAT = ROOT / "catalogue"
TREE = pathlib.Path(".tmp/karen-final-integration/data/research/ict-knowledge")


def src(vid, title, path):
    return {
        "video_id": vid,
        "title": title,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "transcript_path": path,
        "transcript_status": "AVAILABLE",
        "channel": "The Inner Circle Trader",
        "provenance": "OFFICIAL_ICT",
    }


ORBT = src(
    "ORbtHOUzAIM",
    "ICT Mentorship Core Content - Month 10 - Index Futures - Basics & Opening Range Concept",
    "data/ict-transcripts/raw/ORbtHOUzAIM.en.vtt",
)
BONDS = src(
    "CGbSpa_9Z9Y",
    "ICT Mentorship Core Content - Month 10 - Bond Trading - Basics & Opening Range Concept",
    "data/ict-transcripts/raw/CGbSpa_9Z9Y.en.vtt",
)
MID = src(
    "Z0VYZoaTIKE",
    "2025 Lecture Series - SMC Midnight Opening Range",
    "data/ict-transcripts/raw/Z0VYZoaTIKE.en.vtt",
)

# --- NEW: index futures 1h OR (Month 10) ---
index_1h = {
    "concept_id": "opening_range_index_futures_1h",
    "name": "Opening range — index futures 1-hour (Month 10 Core)",
    "aliases": [
        "spoos opening range",
        "index futures opening range",
        "ES opening range 9:30-10:30",
    ],
    "status": "CONFLICTING_SOURCES",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        {
            "occurrence_id": "or_index_1h_930_1030__ORbtHOUzAIM__194",
            "definition_text": "Spoos (S&P) opening range concept: opening range is seen from 9:30 a.m. New York time and ends at 10:30 a.m. New York time — an opening range of one hour.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Index futures / spoos context",
                "NY local clock",
                "1-hour window 9:30–10:30",
            ],
            "invalidation": [],
            "timeframe_session_context": "NY RTH; Month 10 Core Content index OR = 9:30–10:30 (1h)",
            "variations_note": "CONFLICT vs modern official 30m NY OR (9:30–10:00) in Zm9/Z0VY/eft9/uwFJ. Same clock as FHDR (9:30–10:30) but labeled opening range here — KEEP SEPARATE from first_hour_dealing_range and opening_range_ny_30m.",
            "confidence": "quoted",
            "cue_start": "00:03:07.319",
            "cue_end": "00:03:24.530",
            "timestamp_sec": 187.319,
            "source": ORBT,
        },
        {
            "occurrence_id": "or_index_hod_lod_stop_or_fvg__ORbtHOUzAIM__202",
            "definition_text": "Narrow focus to the opening range between 9:30 a.m. to 10:30 a.m., which tends to create the spoos market high or low of the day — it can be a run on stops or fair value setup.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Index OR window 9:30–10:30",
                "HOD/LOD tendency framing",
            ],
            "invalidation": [],
            "timeframe_session_context": "NY AM first hour labeled as OR",
            "variations_note": "Behavioral use of 1h index OR (HOD/LOD / stop-run / FVG) — not a geometry rewrite of ORG.",
            "confidence": "quoted",
            "cue_start": "00:03:22.369",
            "cue_end": "00:03:30.949",
            "timestamp_sec": 202.369,
            "source": ORBT,
        },
        {
            "occurrence_id": "or_index_vol_surge_930_1000__ORbtHOUzAIM__162",
            "definition_text": "Highest volume for S&P trading is seen between 9:30 a.m. and 10:00 a.m. New York time — only a 30-minute span where that surge of highest volume generally kicks off at the opening.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "S&P / spoos volume profile",
                "Peak-volume surge window 9:30–10:00 inside/alongside the 1h OR teaching",
            ],
            "invalidation": [],
            "timeframe_session_context": "NY open volume surge (30m) distinct from 1h OR delineation",
            "variations_note": "Internal nuance in same lecture: volume-surge clock = 30m (9:30–10:00) while OR delineation = 1h (9:30–10:30). Do not collapse into opening_range_ny_30m without noting Month 10 still draws OR as 1h.",
            "confidence": "quoted",
            "cue_start": "00:02:39.229",
            "cue_end": "00:02:51.290",
            "timestamp_sec": 159.229,
            "source": ORBT,
        },
        {
            "occurrence_id": "or_index_central_vs_ny_clock__ORbtHOUzAIM__222",
            "definition_text": "BarChart.com charts shown in Central Time (one hour earlier): highlighted 8:30–9:30 Central equals 9:30–10:30 New York / East Coast time for the opening-range window.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Chart timezone may be Central",
                "Convert +1h to New York local for OR window",
            ],
            "invalidation": [
                "Reading Central labels as NY times mis-draws the OR window",
            ],
            "timeframe_session_context": "Chart-platform timezone hygiene for Month 10 index OR",
            "variations_note": "Operational clock-mapping only; not a third OR length.",
            "confidence": "quoted",
            "cue_start": "00:03:42.649",
            "cue_end": "00:04:00.410",
            "timestamp_sec": 222.649,
            "source": ORBT,
        },
    ],
    "karen_map": {
        "related_karen_observation": "structureFacts.fhdr uses 9:30–10:30; no separate 'Month 10 1h OR' object",
        "related_karen_evidence_or_gate": "n/a",
        "overlap_vs_baseline_v2": "Clock coincides with FHDR window already computed",
        "gap_vs_baseline_v2": "Month 10 labels this window opening range (not FHDR); conflicts with later 30m OR lore",
        "hypothesis_id": "H_ICT_OR_INDEX_1H_MONTH10",
        "status": "CONFLICTING_SOURCES",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Do not wire. Prefer disambiguation: FHDR vs Month10-1h-OR vs modern-30m-OR before any observation rename.",
    },
    "extraction_notes": "Batch4 zero-download mine of ORbtHOUzAIM. Primary conflict is 1h index OR vs later official 30m algorithmic OR; secondary naming overlap with FHDR same clock.",
}

# --- NEW: bonds 1h OR (Month 10) ---
bonds_1h = {
    "concept_id": "opening_range_bonds_1h",
    "name": "Opening range — Treasury bonds 1-hour (Month 10 Core)",
    "aliases": [
        "bond opening range",
        "Treasury opening range",
        "ZB opening range 8:00-9:00",
    ],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        {
            "occurrence_id": "or_bonds_1h_800_900__CGbSpa_9Z9Y__226",
            "definition_text": "Bond-market opening range begins at 8:00 a.m. New York time and ends 9:00 a.m. New York time. Narrow focus: the opening range between 8:00 and 9:00 tends to create the bond market high or low of the day — run-on stops or a fair value setup (bullish/bearish order block).",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Treasury bond / 30-year note context",
                "NY local clock",
                "1-hour window 8:00–9:00",
            ],
            "invalidation": [],
            "timeframe_session_context": "NY bond session; Month 10 Core Content bond OR = 8:00–9:00 (1h)",
            "variations_note": "KEEP SEPARATE from index 9:30–10:30 OR and from modern NY equity-index 30m OR. Same Month 10 series, different asset clock.",
            "confidence": "quoted",
            "cue_start": "00:03:36.000",
            "cue_end": "00:04:08.000",
            "timestamp_sec": 216.0,
            "source": BONDS,
        },
        {
            "occurrence_id": "or_bonds_vol_800_930_true_day__CGbSpa_9Z9Y__204",
            "definition_text": "Highest volume is seen between 8:00 a.m. and 9:30 a.m. New York time. True day for the bond market is 8:00 a.m. to 3:00 p.m. New York time.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Bond volume / session framing",
            ],
            "invalidation": [],
            "timeframe_session_context": "Bond true day 08:00–15:00 NY; volume surge spans into 9:30",
            "variations_note": "Volume window (8:00–9:30) is wider than the 1h OR (8:00–9:00) — parallel nuance to index lecture's 30m volume surge vs 1h OR.",
            "confidence": "quoted",
            "cue_start": "00:03:24.649",
            "cue_end": "00:03:36.000",
            "timestamp_sec": 204.649,
            "source": BONDS,
        },
        {
            "occurrence_id": "or_bonds_session_analysis_820__CGbSpa_9Z9Y__79",
            "definition_text": "Analysis on the New York session for Treasury bond begins at 8:20 a.m. to 3:00 p.m. New York time (contract delivery months noted for 30-year).",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "NY session analysis window stated as 8:20–15:00",
            ],
            "invalidation": [],
            "timeframe_session_context": "Bond NY session analysis start 8:20 vs true-day start 8:00",
            "variations_note": "KEEP SEPARATE from true-day 8:00–15:00 and OR 8:00–9:00 — three distinct clocks in same lecture (analysis start / true day / OR).",
            "confidence": "quoted",
            "cue_start": "00:01:11.030",
            "cue_end": "00:01:24.000",
            "timestamp_sec": 71.03,
            "source": BONDS,
        },
        {
            "occurrence_id": "or_bonds_hl_stop_run_example__CGbSpa_9Z9Y__306",
            "definition_text": "Opening range high/low between the 8:00–9:00 delineations; example trades down below the low formed between 8:00 and 9:00 as a stop run and potential setup.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Bond OR high/low locked from 8:00–9:00",
                "Break beyond OR low framed as stop run",
            ],
            "invalidation": [],
            "timeframe_session_context": "Post 9:00 bond OR break example",
            "variations_note": "Use-case example reinforcing HOD/LOD OR geometry — not a different clock.",
            "confidence": "quoted",
            "cue_start": "00:05:06.900",
            "cue_end": "00:05:20.000",
            "timestamp_sec": 306.9,
            "source": BONDS,
        },
    ],
    "karen_map": {
        "related_karen_observation": "None dedicated for bond 8:00–9:00 OR (Karen desk is index-centric)",
        "related_karen_evidence_or_gate": "n/a",
        "overlap_vs_baseline_v2": "None for bonds",
        "gap_vs_baseline_v2": "Bond OR clocks not in baseline-v2; catalogue for asset-specific OR disambiguation only",
        "hypothesis_id": "H_ICT_OR_BONDS_1H_MONTH10",
        "status": "CATALOGUED",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Do not wire into index Karen. Useful only as contrast proof that ICT OR clocks are asset-specific.",
    },
    "extraction_notes": "Batch4 zero-download mine of CGbSpa_9Z9Y. Bonds vs index: 8:00–9:00 vs 9:30–10:30 one-hour ORs in paired Month 10 lectures.",
}

# --- NEW: midnight OR ---
midnight = {
    "concept_id": "midnight_opening_range",
    "name": "Midnight opening range (NY local 00:00–00:30)",
    "aliases": [
        "midnight OR",
        "00:00 opening range",
        "midnight to 12:30 opening range",
    ],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        {
            "occurrence_id": "midnight_or_30m_algo_same_as_ny__Z0VYZoaTIKE__618",
            "definition_text": "Morning-session algorithmic opening range is specifically the 9:30–10:00 30-minute interval — if less than 30 minutes it is not algorithmic. The algorithm uses that first 30 minutes and does the same type of thing at midnight New York local time.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "30-minute algorithmic OR length",
                "Midnight NY local analogue of NY AM OR logic",
            ],
            "invalidation": [
                "Sub-30-minute 'opening range' framed as non-algorithmic",
            ],
            "timeframe_session_context": "NY AM 9:30–10:00 contrasted with midnight NY local 30m OR",
            "variations_note": "Reinforces modern 30m NY OR while introducing midnight OR as same-type construct — KEEP SEPARATE from Month 10 1h index/bond ORs.",
            "confidence": "quoted",
            "cue_start": "00:09:46.870",
            "cue_end": "00:10:27.870",
            "timestamp_sec": 586.87,
            "source": MID,
        },
        {
            "occurrence_id": "midnight_or_window_0000_0030__Z0VYZoaTIKE__1527",
            "definition_text": "Midnight opening range is the 30-minute interval between midnight and 12:30 Eastern. Framing on 1-minute chart: mark midnight candle and 12:30 to obtain the midnight opening range.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Eastern / NY local timezone",
                "Window 00:00–00:30",
                "1m chart framing with verticals at midnight and 12:30",
            ],
            "invalidation": [],
            "timeframe_session_context": "ETH overnight; midnight→12:30 ET",
            "variations_note": "Primary clock definition for midnight OR. Reinforced again ~00:46 and ~00:48 in same lecture.",
            "confidence": "quoted",
            "cue_start": "00:25:19.830",
            "cue_end": "00:25:35.000",
            "timestamp_sec": 1519.83,
            "source": MID,
        },
        {
            "occurrence_id": "midnight_or_three_refs_open_hi_lo__Z0VYZoaTIKE__1041",
            "definition_text": "Three crucial reference points on the midnight candle / range: (1) opening price at midnight — midnight opening price for Power of Three (daily-range candlestick formation); (2) high of the midnight opening range; (3) low of the midnight opening range.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Midnight candle identified on chart",
                "Track open, high, and low of the midnight OR",
            ],
            "invalidation": [],
            "timeframe_session_context": "Midnight OR geometry anchors + Power of Three open",
            "variations_note": "Geometry triad; Power-of-Three midnight open is related but not identical to OR high/low — kept in one occurrence as lecture presents them together.",
            "confidence": "quoted",
            "cue_start": "00:17:21.559",
            "cue_end": "00:19:05.000",
            "timestamp_sec": 1041.559,
            "source": MID,
        },
        {
            "occurrence_id": "midnight_or_fib_sd_projection__Z0VYZoaTIKE__1519",
            "definition_text": "Fib measuring the midnight opening range (high→low): if the market trades above the range, it can go one-half of one standard deviation or one standard deviation (lecture walks -1 SD / projection settings from the midnight OR).",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Midnight OR high/low graded with Fib / SD projections",
                "Trade above midnight OR high → look for 0.5 / 1.0 SD extensions",
            ],
            "invalidation": [],
            "timeframe_session_context": "Post-midnight OR expansion geometry",
            "variations_note": "Related geometry (not ORG settlement Fib). KEEP SEPARATE from RTH ORG Fib 4:14→9:30 grading.",
            "confidence": "quoted",
            "cue_start": "00:25:19.830",
            "cue_end": "00:25:50.710",
            "timestamp_sec": 1519.83,
            "source": MID,
        },
        {
            "occurrence_id": "midnight_or_fpfvg_inside__Z0VYZoaTIKE__1714",
            "definition_text": "Inside the midnight opening range, algorithm can rebook/redeliver premium and discount via first-presented displacement (first presented FVG-style displacement that 'jumps off the chart' inside the midnight OR).",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "Displacement forms inside midnight OR window",
                "First-presented displacement prioritized",
            ],
            "invalidation": [],
            "timeframe_session_context": "00:00–00:30 NY; FPFVG analogue inside midnight OR",
            "variations_note": "KEEP SEPARATE from NY 9:31 FPFVG and silver-bullet-after-10 variants; midnight-window first displacement only.",
            "confidence": "quoted",
            "cue_start": "00:28:26.269",
            "cue_end": "00:29:15.000",
            "timestamp_sec": 1706.269,
            "source": MID,
        },
        {
            "occurrence_id": "midnight_or_ce_midpoint__Z0VYZoaTIKE__2762",
            "definition_text": "Consequent encroachment of the midnight opening range — the 30-minute interval between midnight and 12:30 Eastern — is used as a delivery magnet (example path trades into CE of midnight OR).",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "CE = midpoint of midnight OR high/low",
                "Window midnight–12:30 ET",
            ],
            "invalidation": [],
            "timeframe_session_context": "Midnight OR CE (not RTH ORG CE)",
            "variations_note": "KEEP SEPARATE from consequent_encroachment_half_gap RTH-ORG ~70% claims — same CE vocabulary, different range object.",
            "confidence": "quoted",
            "cue_start": "00:46:02.790",
            "cue_end": "00:46:19.990",
            "timestamp_sec": 2762.79,
            "source": MID,
        },
        {
            "occurrence_id": "midnight_or_1m_frame_0000_0030__Z0VYZoaTIKE__2921",
            "definition_text": "Operational framing: on a one-minute chart place markers at the midnight candle and at 12:30 to obtain the midnight opening range; for a down-close midnight candle, the open of that body is the midnight opening price for Power of Three.",
            "definition_mode": "close_paraphrase",
            "conditions": [
                "1-minute chart",
                "Verticals / range from 00:00 to 00:30",
                "Down-close midnight candle → body open = midnight open",
            ],
            "invalidation": [],
            "timeframe_session_context": "1m ETH chart framing procedure",
            "variations_note": "How-to reinforcement of window + midnight open; complements three-refs occurrence.",
            "confidence": "quoted",
            "cue_start": "00:48:32.510",
            "cue_end": "00:49:14.309",
            "timestamp_sec": 2912.51,
            "source": MID,
        },
    ],
    "karen_map": {
        "related_karen_observation": "No dedicated midnight-OR observation in baseline-v2",
        "related_karen_evidence_or_gate": "n/a",
        "overlap_vs_baseline_v2": "None",
        "gap_vs_baseline_v2": "Midnight OR high/low/open/CE not Layer-1 fields",
        "hypothesis_id": "H_ICT_MIDNIGHT_OR",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Later DEV only if Adam wants overnight OR object; do not conflate with RTH OR/ORG/FHDR.",
    },
    "extraction_notes": "Batch4 zero-download mine of Z0VYZoaTIKE. Official 2025 lecture: midnight OR = 00:00–00:30 ET; same 30m algorithmic logic as NY 9:30–10:00; geometry open/hi/lo + Fib/SD + CE + first displacement inside.",
}

# write new concepts
for obj, name in [
    (index_1h, "opening_range_index_futures_1h.json"),
    (bonds_1h, "opening_range_bonds_1h.json"),
    (midnight, "midnight_opening_range.json"),
]:
    (CAT / name).write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {name} ({len(obj['definitions'])} defs)")

# --- UPDATE opening_range_ny_30m with Z0VY reinforcement ---
ny = json.loads((CAT / "opening_range_ny_30m.json").read_text(encoding="utf-8"))
ny_occ = {
    "occurrence_id": "opening_range_ny_30m_algo_only__Z0VYZoaTIKE__607",
    "definition_text": "Opening range in the morning session specifically aimed at 9:30 to 10:00 — the 30-minute algorithmic opening range. There is no other opening range except for that 30-minute interval; if less than 30 minutes it is not algorithmic.",
    "definition_mode": "close_paraphrase",
    "conditions": [
        "NY morning 9:30–10:00",
        "30-minute length required for algorithmic OR claim",
    ],
    "invalidation": [
        "Sub-30m OR framing rejected as non-algorithmic",
    ],
    "timeframe_session_context": "NY AM 9:30–10:00; lecture also maps same logic to midnight",
    "variations_note": "Strong official reinforcement of 30m NY OR. CONFLICTS with Month 10 index 1h OR (ORbtHOUzAIM 9:30–10:30) — keep both; see opening_range_index_futures_1h.",
    "confidence": "quoted",
    "cue_start": "00:09:46.870",
    "cue_end": "00:10:18.550",
    "timestamp_sec": 586.87,
    "source": MID,
}
if not any(d["occurrence_id"] == ny_occ["occurrence_id"] for d in ny["definitions"]):
    ny["definitions"].append(ny_occ)
ny["extraction_notes"] = (
    "Status CONFLICTING_SOURCES: hourly post-premarket language (2K1); Judas 9:30–10≠ORG (Sf); "
    "Batch4: Z0VY reinforces 30m-only algorithmic NY OR while Month 10 ORbt teaches index OR as 9:30–10:30 1h — kept separate under opening_range_index_futures_1h."
)
ny["karen_map"]["notes"] = (
    "Later DEV: observation-only OR high/low lock at 10:00 — no weigher. "
    "Conflicts: Month10 1h index OR; hourly model; Judas naming vs ORG. Do not wire until clock chosen."
)
(CAT / "opening_range_ny_30m.json").write_text(json.dumps(ny, indent=2) + "\n", encoding="utf-8")
print(f"updated opening_range_ny_30m ({len(ny['definitions'])} defs)")

# --- UPDATE FHDR with naming-collision note ---
fhdr = json.loads((CAT / "first_hour_dealing_range.json").read_text(encoding="utf-8"))
fhdr_occ = {
    "occurrence_id": "fhdr_vs_month10_index_or_label__ORbtHOUzAIM__194",
    "definition_text": "Cross-link conflict: Month 10 Core Content index lecture (ORbtHOUzAIM) labels the same 9:30–10:30 New York window as an 'opening range of one hour' that tends to create the spoos HOD/LOD — whereas FHDR lectures use 9:30–10:30 as first-hour dealing range and explicitly contrast it with a 30-minute opening range.",
    "definition_mode": "close_paraphrase",
    "conditions": [
        "Same clock 9:30–10:30 ET",
        "Different concept labels across eras/lectures (OR 1h vs FHDR)",
    ],
    "invalidation": [],
    "timeframe_session_context": "NY 9:30–10:30 naming collision across sources",
    "variations_note": "Do not merge Month 10 '1h opening range' into FHDR. Catalogue both; status CONFLICTING_SOURCES for naming/role.",
    "confidence": "paraphrased",
    "cue_start": "00:03:07.319",
    "cue_end": "00:03:30.949",
    "timestamp_sec": 187.319,
    "source": ORBT,
}
if not any(d["occurrence_id"] == fhdr_occ["occurrence_id"] for d in fhdr["definitions"]):
    fhdr["definitions"].append(fhdr_occ)
fhdr["status"] = "CONFLICTING_SOURCES"
fhdr["extraction_notes"] = (
    "Batch4: naming collision with Month 10 index 1h OR (same 9:30–10:30 clock, different label/role). "
    "Equilibrium/halfway point of FHDR also mentioned (~50:22) — candidate for a later occurrence row if needed."
)
(CAT / "first_hour_dealing_range.json").write_text(json.dumps(fhdr, indent=2) + "\n", encoding="utf-8")
print(f"updated first_hour_dealing_range ({len(fhdr['definitions'])} defs, status={fhdr['status']})")

# --- light FPFVG midnight variant ---
fpfvg = json.loads((CAT / "first_presented_fvg.json").read_text(encoding="utf-8"))
fp_occ = {
    "occurrence_id": "fpfvg_midnight_or_displacement__Z0VYZoaTIKE__1714",
    "definition_text": "First-presented displacement inside the midnight opening range (00:00–00:30 NY) is framed as the algorithmic rebook/redelivery tool within that midnight OR — distinct from NY 9:31 morning FPFVG.",
    "definition_mode": "close_paraphrase",
    "conditions": [
        "Forms inside midnight OR window",
        "First presented displacement prioritized",
    ],
    "invalidation": [],
    "timeframe_session_context": "Midnight OR 00:00–00:30 NY — NOT NY 9:31 FPFVG",
    "variations_note": "KEEP SEPARATE from official 9:31 / silver-bullet-after-10 / London 1:30 / post-FHDR variants.",
    "confidence": "quoted",
    "cue_start": "00:28:26.269",
    "cue_end": "00:29:15.000",
    "timestamp_sec": 1706.269,
    "source": MID,
}
if not any(d["occurrence_id"] == fp_occ["occurrence_id"] for d in fpfvg["definitions"]):
    fpfvg["definitions"].append(fp_occ)
fpfvg["extraction_notes"] = (
    (fpfvg.get("extraction_notes") or "")
    + " Batch4: added midnight-OR first-displacement variant from Z0VYZoaTIKE."
).strip()
(CAT / "first_presented_fvg.json").write_text(json.dumps(fpfvg, indent=2) + "\n", encoding="utf-8")
print(f"updated first_presented_fvg ({len(fpfvg['definitions'])} defs)")

# --- rebuild index.jsonl ---
rows = []
for p in sorted(CAT.glob("*.json")):
    if p.name == "index.json":
        continue
    obj = json.loads(p.read_text(encoding="utf-8"))
    if "concept_id" not in obj:
        continue
    rows.append(
        {
            "concept_id": obj["concept_id"],
            "file": f"catalogue/{p.name}",
            "status": obj.get("status"),
            "occurrences": len(obj.get("definitions", [])),
        }
    )
rows.sort(key=lambda r: r["concept_id"])
(CAT / "index.jsonl").write_text(
    "".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8"
)
total_occ = sum(r["occurrences"] for r in rows)
print(f"index: {len(rows)} concepts, {total_occ} occurrences")

# --- mirror TREE ---
if TREE.exists():
    for rel in [
        "catalogue",
        "PROGRESS.md",
        "END_REPORT.md",
        "karen-hypothesis-map.md",
        "sources",
        "scripts",
    ]:
        src_p = ROOT / rel
        dst_p = TREE / rel
        if src_p.is_dir():
            if dst_p.exists():
                shutil.rmtree(dst_p)
            shutil.copytree(src_p, dst_p)
        elif src_p.is_file():
            dst_p.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_p, dst_p)
    print(f"mirrored catalogue+sources+scripts to {TREE} (PROGRESS/END/map after write)")
else:
    print("TREE path missing — skip mirror for now")

print("DONE catalogue core")
