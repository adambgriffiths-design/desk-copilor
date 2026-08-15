import json
import pathlib

ROOT = pathlib.Path("data/research/ict-knowledge")
CAT = ROOT / "catalogue"


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


org = json.loads((CAT / "opening_range_gap_org.json").read_text(encoding="utf-8"))
new_org = [
    {
        "occurrence_id": "org_neq_ndog_rth_chart__uIvlS330qrA__59",
        "definition_text": "Students confuse new day opening gap (NDOG) with opening range gap (ORG). Chart must show regular trading hours (RTH), not electronic trading hours (ETH), with New York timezone — RTH toggle typically shown as RTH/ETH in the lower-right corner.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "Chart in RTH mode",
            "Timezone New York / Eastern",
            "Distinguish ORG from NDOG",
        ],
        "invalidation": ["ETH chart mode shows NDOG/NWOG constructs instead of ORG"],
        "timeframe_session_context": "RTH chart setup before measuring ORG",
        "variations_note": "Definitional disambiguation ORG ≠ NDOG; keep separate from settlement geometry rows.",
        "confidence": "quoted",
        "cue_start": "00:00:59.630",
        "cue_end": "00:01:43.310",
        "timestamp_sec": 59.63,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_settlement_414_to_930_premium__uIvlS330qrA__168",
        "definition_text": "On RTH chart, ORG is the difference between previous-day regular trading hours settlement at 4:14 p.m. and the first opening price at 9:30 Eastern (New York local). Opening higher than prior RTH settlement is classified as a premium opening range gap. If the ORG is 120 handles or larger, price could leave the gap unfilled.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "RTH chart",
            "Prior day settlement at 4:14 p.m. ET",
            "Next session 9:30 open",
            "Open above settlement → premium ORG",
        ],
        "invalidation": [
            "Large ORG (≥~120 handles): may leave gap unfilled (does not fully return to prior settlement)"
        ],
        "timeframe_session_context": "Prior RTH 4:14 settlement → NY 9:30 open",
        "variations_note": "Official 4:14 settlement clock (reinforces eft9). KEEP SEPARATE from large-gap unfilled rule vs ~70% CE-fill language in consequent_encroachment_half_gap.",
        "confidence": "quoted",
        "cue_start": "00:02:48.350",
        "cue_end": "00:03:31.710",
        "timestamp_sec": 168.35,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_fib_414_to_930_quadrants__uIvlS330qrA__215",
        "definition_text": "For a premium ORG: take Fibonacci, anchor to previous RTH settlement at 4:14 on a 1-minute chart, drag to next trading day 9:30 Eastern opening price (RTH toggled) to obtain quadrant levels used for ORG analysis.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "Premium ORG",
            "1-minute RTH chart",
            "Fib from 4:14 settlement → 9:30 open",
        ],
        "invalidation": [],
        "timeframe_session_context": "1m RTH; settlement→open Fib grading",
        "variations_note": "Operational geometry for quadrant/CE levels; complements V5 octant/quadrant grading occurrence.",
        "confidence": "quoted",
        "cue_start": "00:03:35.229",
        "cue_end": "00:04:01.069",
        "timestamp_sec": 215.229,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_large_gap_120_upper_quadrant__uIvlS330qrA__235",
        "definition_text": "With a large gap (couple hundred handles / ~120 handles ballpark): rules employed say it will probably keep going in the direction of an extreme gap; if it ever trades below that low (settlement side), usually it stops around the upper quadrant — 25% of the opening range gap is usually what is traded there. Gap may stay unfilled (not return all the way to previous day settlement) though it may fill at a later time.",
        "definition_mode": "close_paraphrase",
        "conditions": ["Large/extreme ORG (~120+ handles)", "Premium gap example"],
        "invalidation": [
            "May not trade even to upper quadrant; full fill may be deferred beyond the day"
        ],
        "timeframe_session_context": "Large premium ORG; first reaction often limited to upper quadrant / 25%",
        "variations_note": "CONFLICT FACTOR vs ~70% CE attempt claims — large-gap may leave unfilled / only reach 25%. Do not merge with CE 70% rows.",
        "confidence": "quoted",
        "cue_start": "00:04:22.550",
        "cue_end": "00:05:39.390",
        "timestamp_sec": 262.55,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_rth_only_eth_ndog_nwog__uIvlS330qrA__419",
        "definition_text": "Opening range gap is defined by regular trading hours only. Whatever trades between 6:00 p.m. and 9:30 is shown in electronic hours and is not needed for ORG. ETH shows new day opening gaps and/or new week opening gaps; RTH denotes what the opening range gap will be if there is a gap.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "ORG measured on RTH only",
            "ETH path 18:00–09:30 excluded from ORG",
        ],
        "invalidation": [
            "Using ETH chart for ORG measurement → wrong construct (NDOG/NWOG)"
        ],
        "timeframe_session_context": "RTH vs ETH session modes",
        "variations_note": "Reinforces org_neq_ndog; kept separate as explicit RTH-only definition + ETH NDOG/NWOG mapping.",
        "confidence": "quoted",
        "cue_start": "00:06:33.150",
        "cue_end": "00:07:41.550",
        "timestamp_sec": 393.15,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_friday_414_to_monday_930__Sf_uYZBWTrA__629",
        "definition_text": "On 1-minute RTH chart: hover Friday last candle — shows 4:14 p.m. close; wait until 9:30 New York local Monday RTH open; the difference between Friday closing price and Monday opening price is the opening range gap.",
        "definition_mode": "close_paraphrase",
        "conditions": ["RTH not ETH", "Friday 4:14 close", "Monday 9:30 open"],
        "invalidation": [],
        "timeframe_session_context": "Weekend/Friday→Monday RTH ORG example (Jun 2023)",
        "variations_note": "Same 4:14→9:30 geometry as uIvl/eft9; weekend framing explicit. KEEP SEPARATE from same-video Judas 9:30–10:00 opening range (time window ≠ gap).",
        "confidence": "quoted",
        "cue_start": "00:10:09.650",
        "cue_end": "00:10:53.810",
        "timestamp_sec": 609.65,
        "source": src(
            "Sf_uYZBWTrA",
            "2023 ICT Mentorship - Opening Range Gap Repricing Macro",
            "data/ict-transcripts/raw/Sf_uYZBWTrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_discount_premium_polarity__Sf_uYZBWTrA__665",
        "definition_text": "Opening range gap lower (open below Friday close) = discount opening range gap. Opening range gap higher (open above Friday close) = opening range gap premium.",
        "definition_mode": "close_paraphrase",
        "conditions": ["Compare 9:30 open to prior RTH close/settlement"],
        "invalidation": [],
        "timeframe_session_context": "ORG polarity at RTH open",
        "variations_note": "Polarity labels; keep separate from premium-short-lean / discount-willingness behavioral rows.",
        "confidence": "quoted",
        "cue_start": "00:10:55.490",
        "cue_end": "00:11:19.910",
        "timestamp_sec": 655.49,
        "source": src(
            "Sf_uYZBWTrA",
            "2023 ICT Mentorship - Opening Range Gap Repricing Macro",
            "data/ict-transcripts/raw/Sf_uYZBWTrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_two_refs_930_open_to_last_print__V5crdCw0AsY__320",
        "definition_text": "For RTH ORG: the open on the 9:30 candlestick to the last/final print showing on the RTH chart are the only two reference points really needed (CME website alternatives acknowledged but not required).",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "RTH chart",
            "Two anchors: 9:30 open and prior session final/last print",
        ],
        "invalidation": [],
        "timeframe_session_context": "RTH ORG measurement anchors",
        "variations_note": "Pairs with explicit 4:14 last-print labeling in same lecture; keep as two-point rule separate from Fib grading steps.",
        "confidence": "quoted",
        "cue_start": "00:05:20.510",
        "cue_end": "00:05:35.070",
        "timestamp_sec": 320.51,
        "source": src(
            "V5crdCw0AsY",
            "Chain Of Custody Of Price With RTH ORG",
            "data/ict-transcripts/raw/V5crdCw0AsY.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_high_930_low_friday_414__V5crdCw0AsY__368",
        "definition_text": "In the Monday discount-gap example: highest point of the RTH opening range gap is the 9:30 opening price; lowest point is the last print for Friday at 4:14 p.m. Eastern (low of the RTH ORG / settlement side).",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "Discount ORG (open below prior settlement)",
            "High = 9:30 open",
            "Low = Friday 4:14 last print",
        ],
        "invalidation": [],
        "timeframe_session_context": "Monday RTH ORG after Friday settlement",
        "variations_note": "Geometry polarity for discount gap (high=open, low=settlement). Premium case in uIvl inverts labels (open above settlement). Do not merge premium/discount high-low labeling.",
        "confidence": "quoted",
        "cue_start": "00:06:08.150",
        "cue_end": "00:06:56.990",
        "timestamp_sec": 368.15,
        "source": src(
            "V5crdCw0AsY",
            "Chain Of Custody Of Price With RTH ORG",
            "data/ict-transcripts/raw/V5crdCw0AsY.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_grade_octant_quadrant_pd__V5crdCw0AsY__450",
        "definition_text": "Use the RTH opening range gap concept by grading it, then look for key PD arrays that form on the octant and the quadrant levels.",
        "definition_mode": "quote",
        "conditions": [
            "ORG graded (Fib/octant/quadrant)",
            "PD arrays aligning to those levels",
        ],
        "invalidation": [],
        "timeframe_session_context": "RTH ORG graded levels as delivery map",
        "variations_note": "Adds octant language alongside quadrants; complements uIvl Fib quadrant setup.",
        "confidence": "quoted",
        "cue_start": "00:07:28.630",
        "cue_end": "00:07:35.790",
        "timestamp_sec": 448.63,
        "source": src(
            "V5crdCw0AsY",
            "Chain Of Custody Of Price With RTH ORG",
            "data/ict-transcripts/raw/V5crdCw0AsY.en.vtt",
        ),
    },
    {
        "occurrence_id": "org_discount_gap_direction_lean__tbEzAhdv_Ak__334",
        "definition_text": "Live commentary: since we gap lower with a discount gap we are likely to see a trade lower; also notes open traded up to about a quarter (lower quadrant of the gap) in the example.",
        "definition_mode": "close_paraphrase",
        "conditions": ["Discount ORG (gap lower)"],
        "invalidation": [],
        "timeframe_session_context": "Live RTH ORG review / futures commentary",
        "variations_note": "Behavioral lean for discount gaps (continue lower) — KEEP SEPARATE from uwFJ0t7SAOU willingness-to-reprice-up framing and from premium-short-lean rows.",
        "confidence": "quoted",
        "cue_start": "00:05:24.480",
        "cue_end": "00:05:38.990",
        "timestamp_sec": 324.48,
        "source": src(
            "tbEzAhdv_Ak",
            "ICT 2026 Futures Review & RTH ORG Commentary",
            "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt",
        ),
    },
]

existing_ids = {d["occurrence_id"] for d in org["definitions"]}
added_org = [d for d in new_org if d["occurrence_id"] not in existing_ids]
org["definitions"].extend(added_org)
org["status"] = "CONFLICTING_SOURCES"
org["karen_map"]["status"] = "CONFLICTING_SOURCES"
org["karen_map"]["notes"] = (
    "Batch3 deep-dive: official geometry 4:14→9:30 + premium/discount polarity + Fib/octant/quadrant grading now catalogued from uIvl/Sf/V5. "
    "Conflicts kept separate: (1) large ≥~120h may leave unfilled / stop at 25% vs ~70% CE claims; "
    "(2) discount continue-lower lean (tbEz) vs willingness-to-reprice-up (uwFJ); "
    "(3) ORG ≠ NDOG/ETH; OR Judas 9:30–10 ≠ ORG. Still NOT_IN_PRODUCTION."
)
org["extraction_notes"] = (
    "Batch3 (zero downloads): mined uIvlS330qrA, Sf_uYZBWTrA, V5crdCw0AsY; light add from tbEzAhdv_Ak. "
    "UPKUqW_eaas has ambient ORG mention only — no definitional citation added. "
    "Geometry consistent across official sources at 4:14 settlement; behavioral fill/direction claims conflict — kept as separate occurrences."
)
(CAT / "opening_range_gap_org.json").write_text(
    json.dumps(org, indent=2) + "\n", encoding="utf-8"
)

ce = json.loads(
    (CAT / "consequent_encroachment_half_gap.json").read_text(encoding="utf-8")
)
new_ce = [
    {
        "occurrence_id": "ce_minimum_midgap_after_buyside__uIvlS330qrA__657",
        "definition_text": "After running buy side (e.g. overnight/London high or REH between 6:00–9:30), look for price to trade back down into minimum consequent encroachment — the middle of the gap. Whether to seek complete gap closure depends on bullish/bearish stance or if just trading inside a range. Premium-gap rules reverse for a discount ORG.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "ORG present",
            "Initial buy-side run then seek CE mid-gap",
            "Complete fill optional / bias-dependent",
        ],
        "invalidation": [
            "Complete gap closure not required — minimum objective is CE"
        ],
        "timeframe_session_context": "Post-open delivery into ORG mid-gap; 2025 model framing",
        "variations_note": "Minimum CE objective without 70% frequency claim — KEEP SEPARATE from eft9/6Du 70% rows.",
        "confidence": "quoted",
        "cue_start": "00:10:51.990",
        "cue_end": "00:11:37.310",
        "timestamp_sec": 651.99,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "ce_quadrant_ladder_to_full_fill__uIvlS330qrA__889",
        "definition_text": "Example path through previous day premium ORG: breaks lower → upper quadrant → consequent encroachment → lower quadrant → complete closure of the previous day premium opening range gap.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "Prior-day premium ORG levels still relevant",
            "Graded quadrants + CE",
        ],
        "invalidation": [],
        "timeframe_session_context": "Multi-day ORG level reuse (Jan 2025 example)",
        "variations_note": "Ladder sequence (UQ→CE→LQ→full fill) — separate from 3/4-gap premium first-30m ladder in eft9.",
        "confidence": "quoted",
        "cue_start": "00:14:45.710",
        "cue_end": "00:15:02.790",
        "timestamp_sec": 885.71,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "ce_midgap_bodies_respect__uIvlS330qrA__1023",
        "definition_text": "On premium ORG (Fib from 4:14 close up to 9:30 open): as market sells off, consequent encroachment / mid-gap offers shorting opportunity; bodies shown respecting the midpoint, then lower quadrant / low of gap.",
        "definition_mode": "close_paraphrase",
        "conditions": ["Premium ORG graded", "CE = mid-gap"],
        "invalidation": [],
        "timeframe_session_context": "Intraday delivery into graded premium ORG",
        "variations_note": "CE as actionable mid-gap with body respect — no frequency % here.",
        "confidence": "quoted",
        "cue_start": "00:16:50.910",
        "cue_end": "00:17:39.549",
        "timestamp_sec": 1010.91,
        "source": src(
            "uIvlS330qrA",
            "2025 Lecture Series - SMC Opening Range Gaps",
            "data/ict-transcripts/raw/uIvlS330qrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "ce_gap_midpoint_vs_ob_mean_threshold__Sf_uYZBWTrA__683",
        "definition_text": "For any gap (including ORG): the midpoint is consequent encroachment. For order blocks / breaker / propulsion blocks, the midpoint is mean threshold (50% of that range) — two different viewpoints of a midpoint (gap/wick → CE; other order block → mean threshold).",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "Gap or wick → CE at midpoint",
            "Order block family → mean threshold at midpoint",
        ],
        "invalidation": [],
        "timeframe_session_context": "General PD-array midpoint taxonomy adjacent to ORG definition",
        "variations_note": "KEEP SEPARATE from ORG-only CE rows; also ASR auto-caption says encouragement — meaning is encroachment.",
        "confidence": "quoted",
        "cue_start": "00:11:23.389",
        "cue_end": "00:11:58.730",
        "timestamp_sec": 683.389,
        "source": src(
            "Sf_uYZBWTrA",
            "2023 ICT Mentorship - Opening Range Gap Repricing Macro",
            "data/ict-transcripts/raw/Sf_uYZBWTrA.en.vtt",
        ),
    },
    {
        "occurrence_id": "ce_rth_org_midpoint_fvg_touch__V5crdCw0AsY__738",
        "definition_text": "Intraday gap/inefficiency forms touching the midpoint or consequent encroachment of the regular trading hours opening range gap; FVG on lower quadrant also shown; later SIBI goes up to CE and stops with bodies staying below it.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "RTH ORG graded",
            "PD array / FVG aligning to ORG CE or quadrant",
        ],
        "invalidation": [],
        "timeframe_session_context": "Chain-of-custody delivery on Monday RTH ORG levels",
        "variations_note": "CE as magnet/alignment for other inefficiencies — not a 70% frequency claim.",
        "confidence": "quoted",
        "cue_start": "00:12:12.990",
        "cue_end": "00:13:41.430",
        "timestamp_sec": 732.99,
        "source": src(
            "V5crdCw0AsY",
            "Chain Of Custody Of Price With RTH ORG",
            "data/ict-transcripts/raw/V5crdCw0AsY.en.vtt",
        ),
    },
    {
        "occurrence_id": "ce_prior_day_org_octant__tbEzAhdv_Ak__378",
        "definition_text": "Live: consequent encroachment of yesterday's RTH opening range gap highlighted; price traded to an octant, then into the lower quadrant of yesterday's RTH ORG.",
        "definition_mode": "close_paraphrase",
        "conditions": [
            "Prior-day RTH ORG still mapped",
            "CE + octant + lower quadrant",
        ],
        "invalidation": [],
        "timeframe_session_context": "Multi-day ORG level reuse in live review",
        "variations_note": "Prior-day ORG CE as active level — separate from same-day first-30m 70% CE window claims.",
        "confidence": "quoted",
        "cue_start": "00:06:17.440",
        "cue_end": "00:06:53.390",
        "timestamp_sec": 377.44,
        "source": src(
            "tbEzAhdv_Ak",
            "ICT 2026 Futures Review & RTH ORG Commentary",
            "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt",
        ),
    },
]
existing_ce = {d["occurrence_id"] for d in ce["definitions"]}
added_ce = [d for d in new_ce if d["occurrence_id"] not in existing_ce]
ce["definitions"].extend(added_ce)
ce["status"] = "CONFLICTING_SOURCES"
ce["karen_map"]["notes"] = (
    "Batch3: CE defined as ORG mid-gap / minimum objective (uIvl) + quadrant ladder + gap-vs-OB midpoint taxonomy (Sf). "
    "Still CONFLICTING: 9:30 vs 9:31 70% windows; large-gap may-not-fill vs 70% CE; minimum-CE-without-% vs frequency claims. Offline study only — NOT_IN_PRODUCTION."
)
ce["extraction_notes"] = (
    "Conflicting clock starts (9:30 vs 9:31) intentionally preserved. Batch3 adds non-frequency CE geometry from official ORG lectures; do not collapse with 70% rows."
)
(CAT / "consequent_encroachment_half_gap.json").write_text(
    json.dumps(ce, indent=2) + "\n", encoding="utf-8"
)

or30 = json.loads((CAT / "opening_range_ny_30m.json").read_text(encoding="utf-8"))
or_row = {
    "occurrence_id": "opening_range_judas_930_1000__Sf_uYZBWTrA__532",
    "definition_text": "Judas swing forms at 9:30 to 10 o'clock — that is your opening range (time window). In the same lecture, opening range gap is separately defined as Friday close → Monday 9:30 open difference.",
    "definition_mode": "close_paraphrase",
    "conditions": ["NY 9:30–10:00 window labeled opening range / Judas"],
    "invalidation": [],
    "timeframe_session_context": "NY AM 9:30–10:00 Judas / OR time window",
    "variations_note": "KEEP SEPARATE from ORG gap geometry in same video — opening range ≠ opening range gap. Reinforces 30m NY OR clock while proving naming collision risk.",
    "confidence": "quoted",
    "cue_start": "00:08:52.130",
    "cue_end": "00:09:01.370",
    "timestamp_sec": 532.13,
    "source": src(
        "Sf_uYZBWTrA",
        "2023 ICT Mentorship - Opening Range Gap Repricing Macro",
        "data/ict-transcripts/raw/Sf_uYZBWTrA.en.vtt",
    ),
}
added_or = 0
if or_row["occurrence_id"] not in {d["occurrence_id"] for d in or30["definitions"]}:
    or30["definitions"].append(or_row)
    added_or = 1
or30["status"] = "CONFLICTING_SOURCES"
(CAT / "opening_range_ny_30m.json").write_text(
    json.dumps(or30, indent=2) + "\n", encoding="utf-8"
)

index_lines = []
total_defs = 0
for p in sorted(CAT.glob("*.json")):
    c = json.loads(p.read_text(encoding="utf-8"))
    n = len(c.get("definitions", []))
    total_defs += n
    index_lines.append(
        json.dumps(
            {
                "concept_id": c["concept_id"],
                "file": f"catalogue/{p.name}",
                "status": c.get("status"),
                "occurrences": n,
            },
            separators=(",", ":"),
        )
    )
(CAT / "index.jsonl").write_text("\n".join(index_lines) + "\n", encoding="utf-8")

print("ADDED_ORG", len(added_org))
print("ADDED_CE", len(added_ce))
print("ADDED_OR30", added_or)
print("ORG_TOTAL", len(org["definitions"]))
print("CE_TOTAL", len(ce["definitions"]))
print("ALL_DEFS", total_defs)
print("ORG_CITATIONS_ADDED", len(added_org) + len(added_ce) + added_or)
