#!/usr/bin/env python3
"""Batch 5 — write catalogue concepts + update inventory/index/PROGRESS artifacts."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("data/research/ict-knowledge")
CAT = ROOT / "catalogue"
SRC = ROOT / "sources"
TREE = Path(".tmp/karen-final-integration/data/research/ict-knowledge")
TREE_VTT = Path(".tmp/karen-final-integration/data/ict-transcripts/raw")
VTT = Path("data/ict-transcripts/raw")

OFFICIAL = {
    "channel": "The Inner Circle Trader",
    "channel_id": "UCtjxa77NqamhVC8atV85Rog",
    "provenance": "OFFICIAL_ICT",
}


def src(vid: str, title: str, path: str) -> dict:
    return {
        "video_id": vid,
        "title": title,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "transcript_path": path,
        "transcript_status": "AVAILABLE",
        **OFFICIAL,
    }


def occ(**kwargs) -> dict:
    return kwargs


# --- New / updated concept files ---

concepts = {}

concepts["fair_value_gap"] = {
    "concept_id": "fair_value_gap",
    "name": "Fair value gap (FVG)",
    "aliases": ["FVG", "fair value gaps", "ICT fair value gap"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="fvg_def_range_void__FgacYSN9QEo__35",
            definition_text=(
                "A fair value gap is a range in price delivery where one side of the market "
                "liquidity is offered and typically confirmed with a liquidity void on the "
                "lower time frame charts in the same range of price; price can gap to create "
                "a literal vacuum of trading thus posting an actual price gap."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "One-sided liquidity offered in a delivery range",
                "Often confirmed by lower-TF liquidity void in same range",
            ],
            invalidation=[],
            timeframe_session_context="Multi-TF mentorship core (Month 04 FVG lecture)",
            variations_note=(
                "General FVG construct — KEEP SEPARATE from first_presented_fvg (session-timed) "
                "and inverted_fair_value_gap."
            ),
            confidence="quoted",
            cue_start="00:00:35.280",
            cue_end="00:00:55.590",
            timestamp_sec=35.28,
            source=src(
                "FgacYSN9QEo",
                "ICT Mentorship Core Content - Month 04 - ICT Fair Value Gaps FVG",
                "data/ict-transcripts/raw/FgacYSN9QEo.en.vtt",
            ),
        ),
        occ(
            occurrence_id="fvg_fill_after_ssl__FgacYSN9QEo__385",
            definition_text=(
                "After sell-side liquidity is taken (e.g. turtle soup / false break below an "
                "old low), expect price to trade back up to fill the fair value gap; polarity "
                "reverses for buy-side liquidity runs seeking to close an FVG below price."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "Opposite-side liquidity already taken",
                "Unfilled FVG remains as draw / fill objective",
            ],
            invalidation=[],
            timeframe_session_context="Month 04 FVG lecture examples (incl. 4h)",
            variations_note="Behavioral fill expectancy after SSL/BSL run — not a geometry rule.",
            confidence="quoted",
            cue_start="00:06:25.749",
            cue_end="00:09:01.350",
            timestamp_sec=385.749,
            source=src(
                "FgacYSN9QEo",
                "ICT Mentorship Core Content - Month 04 - ICT Fair Value Gaps FVG",
                "data/ict-transcripts/raw/FgacYSN9QEo.en.vtt",
            ),
        ),
        occ(
            occurrence_id="fvg_overlaps_void_ob_pools__FgacYSN9QEo__548",
            definition_text=(
                "Fair value gaps, liquidity voids, order blocks, and liquidity pools overlap "
                "in multiple ways (lecture flags overlap as advanced theme)."
            ),
            definition_mode="close_paraphrase",
            conditions=[],
            invalidation=[],
            timeframe_session_context="Month 04 FVG lecture",
            variations_note="Do not collapse FVG into void/OB/pool — catalogue as overlap note only.",
            confidence="quoted",
            cue_start="00:09:07.990",
            cue_end="00:09:16.470",
            timestamp_sec=547.99,
            source=src(
                "FgacYSN9QEo",
                "ICT Mentorship Core Content - Month 04 - ICT Fair Value Gaps FVG",
                "data/ict-transcripts/raw/FgacYSN9QEo.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "FVG / imbalance detectors — audit before linking",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "General FVG ≠ FPFVG session rule",
        "gap_vs_baseline_v2": "Official three-candle middle-candle rule still incomplete in this lecture extract",
        "hypothesis_id": "H_ICT_FVG_GENERAL",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month04 core definition. No production implication.",
    },
    "extraction_notes": "Batch5 from FgacYSN9QEo. Geometry details in lecture are example-specific; keep general def separate from FPFVG.",
}

concepts["inverted_fair_value_gap"] = {
    "concept_id": "inverted_fair_value_gap",
    "name": "Inversion fair value gap (IFVG)",
    "aliases": ["IFVG", "inversion FVG", "inverted FVG"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="ifvg_paired_with_fpfvg__uC4-1SYXJFg__2432",
            definition_text=(
                "Lecture labels a structure as 'first presented fair value gap inversion fair "
                "value gap' at the start of a new day; projects it forward as a respected level "
                "(bodies respect; later bump-through / leave)."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "Presented in context of FPFVG / ORG narrative on the example day",
            ],
            invalidation=[],
            timeframe_session_context="2025 Lecture Series NQ review (May 18, 2025) — live/review framing",
            variations_note=(
                "USAGE EXAMPLE — not a standalone geometric definition of inversion. "
                "Dedicated IFVG lecture (-tuXoqSjO78) was CAPTION_MISSING this batch."
            ),
            confidence="paraphrased",
            cue_start="00:40:32.910",
            cue_end="00:40:54.950",
            timestamp_sec=2432.91,
            source=src(
                "uC4-1SYXJFg",
                "2025 Lecture Series - NQ Review When 9:30am ET Is 1st Presented FVG May 18, 2025",
                "data/ict-transcripts/raw/uC4-1SYXJFg.en.vtt",
            ),
        ),
        occ(
            occurrence_id="ifvg_ce_half__tbEzAhdv_Ak__551",
            definition_text=(
                "Inversion fair value gap half / consequent encroachment used as entry/weight "
                "reference; in the example CE of the IFVG coincides with Friday RTH ORG high."
            ),
            definition_mode="close_paraphrase",
            conditions=["IFVG already identified on the chart in live commentary"],
            invalidation=[],
            timeframe_session_context="ICT 2026 Futures Review & RTH ORG Commentary (live)",
            variations_note="Live application of CE-to-IFVG — keep separate from ORG CE geometry.",
            confidence="quoted",
            cue_start="00:09:11.310",
            cue_end="00:09:20.670",
            timestamp_sec=551.31,
            source=src(
                "tbEzAhdv_Ak",
                "ICT 2026 Futures Review & RTH ORG Commentary \\ April 29, 2026",
                "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "Possible IFVG / inversion detectors — none confirmed",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "Unknown",
        "gap_vs_baseline_v2": "No official definitional IFVG lecture captions this batch",
        "hypothesis_id": "H_ICT_IFVG",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Thin catalogue — usage mentions only until definitional lecture captions exist.",
    },
    "extraction_notes": "Batch5. CAPTION_MISSING on -tuXoqSjO78 (IFVG-titled). Do not invent IFVG geometry.",
}

concepts["equilibrium_premium_discount"] = {
    "concept_id": "equilibrium_premium_discount",
    "name": "Equilibrium vs premium / discount (range 50%)",
    "aliases": ["premium", "discount", "equilibrium", "OTE premium discount"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="eq_is_fib_50__qC0LogyIk2I__667",
            definition_text=(
                "Equilibrium price point is basically the Fibonacci level 50 of the range; "
                "with bullish context, look for price to come down to that equilibrium / into "
                "discount, then drop to lower TF to hunt buys (context only — not entry signals)."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "Range established for Fib 50 measurement",
                "Directional context (lecture: expecting higher)",
            ],
            invalidation=[],
            timeframe_session_context="Month 1 Core — Equilibrium Vs. Discount (daily→lower TF framing)",
            variations_note=(
                "KEEP SEPARATE from dealing_range (both-sides-taken construct) and from FHDR. "
                "This is premium/discount grading of a dealing/trading range via 50%."
            ),
            confidence="quoted",
            cue_start="00:11:07.590",
            cue_end="00:11:33.829",
            timestamp_sec=667.59,
            source=src(
                "qC0LogyIk2I",
                "ICT Mentorship Core Content - Month 1 - Equilibrium Vs. Discount",
                "data/ict-transcripts/raw/qC0LogyIk2I.en.vtt",
            ),
        ),
        occ(
            occurrence_id="premium_above_halfway__YuefjnUKQdM__237",
            definition_text=(
                "Equilibrium is fifty percent of the range created from the high to low. Once "
                "price moves above the halfway point it starts going into a premium market "
                "(high price relative to its current trading range). Prefers selling at premium "
                "vs treating raw 50% retracement as the trade level."
            ),
            definition_mode="close_paraphrase",
            conditions=["Current trading range high→low defined"],
            invalidation=[],
            timeframe_session_context="Month 1 Core — Equilibrium Vs. Premium",
            variations_note="Diametric counterpart to discount teaching; same 50% equilibrium object.",
            confidence="quoted",
            cue_start="00:03:57.830",
            cue_end="00:04:20.870",
            timestamp_sec=237.83,
            source=src(
                "YuefjnUKQdM",
                "ICT Mentorship Core Content - Month 1 - Equilibrium Vs. Premium",
                "data/ict-transcripts/raw/YuefjnUKQdM.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "Premium/discount / equilibrium framing in structure facts",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "May relate to dealing-range PD arrays — do not auto-map",
        "gap_vs_baseline_v2": "Which range (session vs swing) for 50% must be specified before any experiment",
        "hypothesis_id": "H_ICT_EQ_PREMIUM_DISCOUNT",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month1 core. Adjacent to dealing_range but not the same concept.",
    },
    "extraction_notes": "Batch5. Dealing-range-adjacent (requested topic) — no additional 'Dealing Ranges' title remained unprobed.",
}

concepts["liquidity_run"] = {
    "concept_id": "liquidity_run",
    "name": "Liquidity run (BSL/SSL stop run)",
    "aliases": ["liquidity runs", "buy side liquidity run", "sell side liquidity run", "stop run"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="lq_def_open_interest_stops__22XkhpJR5eA__29",
            definition_text=(
                "Liquidity refers to how quickly an asset can be bought/sold without dramatically "
                "affecting price. ICT interest focuses on where pending orders (buy stops above / "
                "sell-side below) reside; swing highs left behind imply buy-stop / buy-side "
                "liquidity above; polarity for lows."
            ),
            definition_mode="close_paraphrase",
            conditions=[],
            invalidation=[],
            timeframe_session_context="Month 1 Core — Liquidity Runs",
            variations_note="Foundational definition before high/low-resistance variants.",
            confidence="quoted",
            cue_start="00:00:29.519",
            cue_end="00:03:54.550",
            timestamp_sec=29.519,
            source=src(
                "22XkhpJR5eA",
                "ICT Mentorship Core Content - Month 1 - Liquidity Runs",
                "data/ict-transcripts/raw/22XkhpJR5eA.en.vtt",
            ),
        ),
        occ(
            occurrence_id="hrlr_through_many_levels__22XkhpJR5eA__457",
            definition_text=(
                "High resistance liquidity run: market must trade through thick prior highs/lows "
                "to reach stop liquidity above an old high (or below an old low) — least probable "
                "condition to seek; prefer not hunting these opportunities."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "Many intervening swing highs/lows between price and target stop pool",
            ],
            invalidation=[],
            timeframe_session_context="Month 1 Core — Liquidity Runs",
            variations_note="KEEP SEPARATE from low_resistance_liquidity_run (Month 07).",
            confidence="quoted",
            cue_start="00:07:37.110",
            cue_end="00:08:07.589",
            timestamp_sec=457.11,
            source=src(
                "22XkhpJR5eA",
                "ICT Mentorship Core Content - Month 1 - Liquidity Runs",
                "data/ict-transcripts/raw/22XkhpJR5eA.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "BSL/SSL / sweep / pool objectives",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "May relate to liquidity-swept stance language — catalogue only",
        "gap_vs_baseline_v2": "HRLR vs LRLR selection not in production",
        "hypothesis_id": "H_ICT_LIQUIDITY_RUN",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month1.",
    },
    "extraction_notes": "Batch5. HRLR defined here; LRLR is separate concept file from Month07.",
}

concepts["liquidity_pool"] = {
    "concept_id": "liquidity_pool",
    "name": "Liquidity pool (stops at old highs/lows)",
    "aliases": ["liquidity pools", "buyside liquidity pool", "sellside liquidity pool"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="pool_open_interest_at_levels__Gnw54f9v6SA__46",
            definition_text=(
                "Liquidity is the open interest of buyers and sellers and can be further defined "
                "by those entities at or near specific price levels; lecture reinforces liquidity "
                "pools and when to anticipate raids."
            ),
            definition_mode="close_paraphrase",
            conditions=[],
            invalidation=[],
            timeframe_session_context="Month 04 Core — Liquidity Pools",
            variations_note="General pool definition — distinct from open_float_liquidity lookback method.",
            confidence="quoted",
            cue_start="00:00:46.490",
            cue_end="00:01:01.250",
            timestamp_sec=46.49,
            source=src(
                "Gnw54f9v6SA",
                "ICT Mentorship Core Content - Month 04 - Liquidity Pools",
                "data/ict-transcripts/raw/Gnw54f9v6SA.en.vtt",
            ),
        ),
        occ(
            occurrence_id="ssl_pool_below_old_low__Gnw54f9v6SA__554",
            definition_text=(
                "Sellside liquidity pool: a low under current price typically holds trailed sell "
                "stops for longs and breakout-short sell stops; validation when price violates "
                "the low and those stops become market sells (injecting sell-side liquidity)."
            ),
            definition_mode="close_paraphrase",
            conditions=["Old/recent low below market", "Stop clusters expected under that low"],
            invalidation=[],
            timeframe_session_context="Month 04 Core — Liquidity Pools",
            variations_note="Auto-captions say 'ghoulish'/'cell' for sellside — paraphrased carefully.",
            confidence="quoted",
            cue_start="00:09:12.170",
            cue_end="00:09:50.269",
            timestamp_sec=552.17,
            source=src(
                "Gnw54f9v6SA",
                "ICT Mentorship Core Content - Month 04 - Liquidity Pools",
                "data/ict-transcripts/raw/Gnw54f9v6SA.en.vtt",
            ),
        ),
        occ(
            occurrence_id="eqh_contrary_pool_after_ssl__Gnw54f9v6SA__733",
            definition_text=(
                "After raiding sell stops below an old low (accumulating longs), look to offset "
                "above old highs / equal highs where buy-stop liquidity rests (contrary pool)."
            ),
            definition_mode="close_paraphrase",
            conditions=["SSL raid already occurred", "Equal/old highs as opposing pool"],
            invalidation=[],
            timeframe_session_context="Month 04 Core — Liquidity Pools",
            variations_note="Links equal highs to buy-side pool targets — complements REH/REL catalogue.",
            confidence="quoted",
            cue_start="00:12:08.930",
            cue_end="00:12:44.750",
            timestamp_sec=728.93,
            source=src(
                "Gnw54f9v6SA",
                "ICT Mentorship Core Content - Month 04 - Liquidity Pools",
                "data/ict-transcripts/raw/Gnw54f9v6SA.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "relativeEqualPools / BSL-SSL objectives",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "Pool raid language may overlap liquidity-swept — do not wire",
        "gap_vs_baseline_v2": "Raid timing filters not catalogued here",
        "hypothesis_id": "H_ICT_LIQUIDITY_POOL",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month04.",
    },
    "extraction_notes": "Batch5.",
}

concepts["open_float_liquidity"] = {
    "concept_id": "open_float_liquidity",
    "name": "Open float liquidity pools",
    "aliases": ["open float", "large funds open float"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="open_float_3m_window__vqtA1S9JH34__63",
            definition_text=(
                "Large-funds open float liquidity above old highs or below old lows is generally "
                "targeted every quarter. Method: take last three months of data — or last month "
                "and a half plus next month and a half — encapsulating ~three months to identify "
                "which HTF liquidity pools to focus on."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "Higher-timeframe chart",
                "~3-month lookback / lookaround window for pool selection",
            ],
            invalidation=[],
            timeframe_session_context="Month 05 Core — Defining Open Float Liquidity Pools",
            variations_note="Selection method for which pools matter — not the same as generic liquidity_pool definition.",
            confidence="quoted",
            cue_start="00:01:03.709",
            cue_end="00:01:44.149",
            timestamp_sec=63.709,
            source=src(
                "vqtA1S9JH34",
                "ICT Mentorship Core Content - Month 05 - Defining Open Float Liquidity Pools",
                "data/ict-transcripts/raw/vqtA1S9JH34.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "none direct",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "Likely none (quarterly HTF)",
        "gap_vs_baseline_v2": "Intraday Karen does not use open-float windows",
        "hypothesis_id": "H_ICT_OPEN_FLOAT_LQ",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month05. Catalogue-only HTF framing.",
    },
    "extraction_notes": "Batch5.",
}

concepts["liquidity_void"] = {
    "concept_id": "liquidity_void",
    "name": "Liquidity void",
    "aliases": ["liquidity voids", "void"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="void_def_wide_one_sided__HTQgH11W37o__58",
            definition_text=(
                "A liquidity void is a range in price delivery where one side of the market "
                "liquidity is shown in wide or long one-sided ranges or candles; price typically "
                "wants to revisit this porous range / void of contrarian liquidity. Contrasts "
                "with price in balance (small consolidation / equilibrium) before the voiding run."
            ),
            definition_mode="close_paraphrase",
            conditions=["One-sided wide/long candles after consolidation"],
            invalidation=[],
            timeframe_session_context="Month 04 Core — Liquidity Voids",
            variations_note=(
                "Overlaps FVG conceptually (Fgac lecture) but KEEP SEPARATE — void is the "
                "wide one-sided delivery object; FVG is the gap/imbalance framing."
            ),
            confidence="quoted",
            cue_start="00:00:58.739",
            cue_end="00:01:38.810",
            timestamp_sec=58.739,
            source=src(
                "HTQgH11W37o",
                "ICT Mentorship Core Content - Month 04 - Liquidity Voids",
                "data/ict-transcripts/raw/HTQgH11W37o.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "imbalance / gap objects — audit naming",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "May collide with FVG naming in code — do not merge",
        "gap_vs_baseline_v2": "Void vs FVG disambiguation needed before any experiment",
        "hypothesis_id": "H_ICT_LIQUIDITY_VOID",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month04.",
    },
    "extraction_notes": "Batch5. Keep separate from fair_value_gap despite lecture overlap notes.",
}

concepts["low_resistance_liquidity_run"] = {
    "concept_id": "low_resistance_liquidity_run",
    "name": "Low resistance liquidity run (LRLR)",
    "aliases": ["LRLR", "low resistance liquidity runs"],
    "status": "CATALOGUED",
    "wiring": "NOT_IN_PRODUCTION",
    "definitions": [
        occ(
            occurrence_id="lrlr_short_term_framing__O69iFqP1j7o__11",
            definition_text=(
                "Low resistance liquidity runs taught for short-term / one-shot-one-kill: key off "
                "PD arrays based on premium or discount and look to trade from one PD array to "
                "the next (ideally discount→premium), using last ~3 months for salient "
                "institutional reference points / IPDA data ranges (20/40/60 day refs mentioned)."
            ),
            definition_mode="close_paraphrase",
            conditions=[
                "Short-term trading context",
                "Premium/discount PD-array path",
            ],
            invalidation=[],
            timeframe_session_context="Month 07 Core — Short Term Trading Low Resistance Liquidity Runs",
            variations_note=(
                "This lecture extract is application/framing-heavy; contrast HRLR is clearer in "
                "Month1 Liquidity Runs. Do not invent a crisp geometric LRLR definition beyond captions."
            ),
            confidence="paraphrased",
            cue_start="00:00:11.209",
            cue_end="00:01:08.400",
            timestamp_sec=11.209,
            source=src(
                "O69iFqP1j7o",
                "ICT Mentorship Core Content - Month 07 - Short Term Trading Low Resistance Liquidity Runs",
                "data/ict-transcripts/raw/O69iFqP1j7o.en.vtt",
            ),
        ),
    ],
    "karen_map": {
        "related_karen_observation": "none direct",
        "related_karen_evidence_or_gate": "none wired",
        "overlap_vs_baseline_v2": "Unknown",
        "gap_vs_baseline_v2": "Needs clearer definitional citation than this application lecture",
        "hypothesis_id": "H_ICT_LRLR",
        "status": "CANDIDATE_FOR_DEV_LATER",
        "wiring": "NOT_IN_PRODUCTION",
        "notes": "Batch5 Month07 — thin definitional yield.",
    },
    "extraction_notes": "Batch5. Partial/application. Keep separate from liquidity_run HRLR occurrence.",
}

# Write new concept files
for cid, obj in concepts.items():
    path = CAT / f"{cid}.json"
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf8")
    print("wrote", path)

# --- Update first_presented_fvg ---
fpfvg_path = CAT / "first_presented_fvg.json"
fpfvg = json.loads(fpfvg_path.read_text(encoding="utf8"))
new_fpfvg = [
    occ(
        occurrence_id="fpfvg_931_to_1000_1m__uC4-1SYXJFg__492",
        definition_text=(
            "For AM session / opening range 9:30–10:00: the first presented fair value gap to "
            "use is the very first FVG that forms on a one-minute chart between 9:31 Eastern "
            "and 10:00; extend that level through the day/week."
        ),
        definition_mode="close_paraphrase",
        conditions=[
            "AM session opening range 9:30–10:00 ET",
            "1-minute chart",
            "First FVG forming from 9:31 (not treating earlier as default)",
        ],
        invalidation=[],
        timeframe_session_context="2025 Lecture Series — When 9:30am ET Is 1st Presented FVG",
        variations_note=(
            "Strong official corroboration of 9:31–10:00 1m FPFVG. KEEP SEPARATE from cases "
            "where ICT later allows using the 9:30 candle FVG under criteria."
        ),
        confidence="quoted",
        cue_start="00:08:12.390",
        cue_end="00:08:48.310",
        timestamp_sec=492.39,
        source=src(
            "uC4-1SYXJFg",
            "2025 Lecture Series - NQ Review When 9:30am ET Is 1st Presented FVG May 18, 2025",
            "data/ict-transcripts/raw/uC4-1SYXJFg.en.vtt",
        ),
    ),
    occ(
        occurrence_id="fpfvg_when_930_candle_usable__uC4-1SYXJFg__568",
        definition_text=(
            "Normally a candidate gap would be first presented FVG, but ICT teaches criteria for "
            "when/how to use the 9:31 as the first presented FVG vs allowing the 9:30 one-minute "
            "FVG; states nothing inherently wrong with using the 9:30-candle FVG, but notes it "
            "may be respected less than the 9:30 candlestick level later in the day."
        ),
        definition_mode="close_paraphrase",
        conditions=["Criteria (lecture) for permitting 9:30 1m FVG as FPFVG"],
        invalidation=[],
        timeframe_session_context="Same May 18 2025 review — RTH ORG context also discussed",
        variations_note=(
            "CONFLICT/VARIANT vs strict 9:31-only rule — keep as separate occurrence. "
            "Exact visual criteria beyond spoken 'criteria' not fully transcribed here."
        ),
        confidence="quoted",
        cue_start="00:09:28.389",
        cue_end="00:10:01.399",
        timestamp_sec=568.389,
        source=src(
            "uC4-1SYXJFg",
            "2025 Lecture Series - NQ Review When 9:30am ET Is 1st Presented FVG May 18, 2025",
            "data/ict-transcripts/raw/uC4-1SYXJFg.en.vtt",
        ),
    ),
    occ(
        occurrence_id="fpfvg_after_reh_raid__uC4-1SYXJFg__781",
        definition_text=(
            "Example qualifies first presented FVG because price raided previous early RTH "
            "relative equal highs; then measure ORG for consequent encroachment / ~70% likelihood "
            "pullback into 50% of ORG."
        ),
        definition_mode="close_paraphrase",
        conditions=["Raid on prior early-session relative equal highs", "ORG measured at open"],
        invalidation=[],
        timeframe_session_context="Same May 18 2025 review",
        variations_note="FPFVG qualification via REH raid + ORG CE context — behavioral variant.",
        confidence="quoted",
        cue_start="00:13:01.310",
        cue_end="00:13:29.269",
        timestamp_sec=781.31,
        source=src(
            "uC4-1SYXJFg",
            "2025 Lecture Series - NQ Review When 9:30am ET Is 1st Presented FVG May 18, 2025",
            "data/ict-transcripts/raw/uC4-1SYXJFg.en.vtt",
        ),
    ),
    occ(
        occurrence_id="fpfvg_sellside_example__POUT0pVs4U0__233",
        definition_text=(
            "Live/example framing: first presented FVG since morning used in a sellside delivery "
            "context (reclaimed FVG language also present). Example-heavy — not a new geometric rule."
        ),
        definition_mode="close_paraphrase",
        conditions=["Intraday example under first presented FVG"],
        invalidation=[],
        timeframe_session_context="Trading Friday Sellside Under 1st Presented FVG",
        variations_note="EXAMPLE ONLY — do not elevate to definitional conflict.",
        confidence="incomplete_transcript",
        cue_start="00:03:53.589",
        cue_end="00:03:57.519",
        timestamp_sec=233.589,
        source=src(
            "POUT0pVs4U0",
            "Trading Friday Sellside Under 1st Presented FVG",
            "data/ict-transcripts/raw/POUT0pVs4U0.en.vtt",
        ),
    ),
]
# dedupe by occurrence_id
existing_ids = {d["occurrence_id"] for d in fpfvg["definitions"]}
for d in new_fpfvg:
    if d["occurrence_id"] not in existing_ids:
        fpfvg["definitions"].append(d)
fpfvg["status"] = "CONFLICTING_SOURCES"
fpfvg["extraction_notes"] = (
    (fpfvg.get("extraction_notes") or "")
    + " | Batch5: uC4-1SYXJFg adds official 9:31–10:00 1m FPFVG + 9:30-candle-usable criteria variant; "
    "POUT example; o38k6-twQCg CAPTION_MISSING."
)
fpfvg_path.write_text(json.dumps(fpfvg, indent=2) + "\n", encoding="utf8")
print("updated", fpfvg_path, "occurrences", len(fpfvg["definitions"]))

# --- Update CE with tbEz IFVG CE ---
ce_path = CAT / "consequent_encroachment_half_gap.json"
ce = json.loads(ce_path.read_text(encoding="utf8"))
ce_occ = occ(
    occurrence_id="ce_of_ifvg_equals_org_high__tbEzAhdv_Ak__551",
    definition_text=(
        "Consequent encroachment as half of an inversion fair value gap; in the live example "
        "that CE also equals Friday RTH opening range gap high — used as body-respect / entry weight reference."
    ),
    definition_mode="close_paraphrase",
    conditions=["IFVG present", "ORG levels also on chart"],
    invalidation=[],
    timeframe_session_context="2026 Futures Review & RTH ORG Commentary (light re-pass)",
    variations_note="IFVG-CE overlapping ORG high — keep separate from ORG-only CE geometry.",
    confidence="quoted",
    cue_start="00:09:11.310",
    cue_end="00:09:20.670",
    timestamp_sec=551.31,
    source=src(
        "tbEzAhdv_Ak",
        "ICT 2026 Futures Review & RTH ORG Commentary \\ April 29, 2026",
        "data/ict-transcripts/raw/tbEzAhdv_Ak.en.vtt",
    ),
)
if ce_occ["occurrence_id"] not in {d["occurrence_id"] for d in ce["definitions"]}:
    ce["definitions"].append(ce_occ)
ce["status"] = "CONFLICTING_SOURCES"
ce_path.write_text(json.dumps(ce, indent=2) + "\n", encoding="utf8")
print("updated", ce_path, "occurrences", len(ce["definitions"]))

# --- Update REH/REL with pool linkage ---
reh_path = CAT / "relative_equal_highs_lows.json"
reh = json.loads(reh_path.read_text(encoding="utf8"))
reh_occ = occ(
    occurrence_id="eqh_as_buyside_pool_target__Gnw54f9v6SA__733",
    definition_text=(
        "Equal highs act as the contrary liquidity pool (buy stops) after sell-side stops below "
        "an old low are accumulated — draw equal highs forward as the opposing pool target."
    ),
    definition_mode="close_paraphrase",
    conditions=["After SSL raid / long accumulation below old low"],
    invalidation=[],
    timeframe_session_context="Month 04 Liquidity Pools",
    variations_note="Pool-target use of equal highs — complements pre-market REH bias teaching.",
    confidence="quoted",
    cue_start="00:12:11.930",
    cue_end="00:12:26.090",
    timestamp_sec=731.93,
    source=src(
        "Gnw54f9v6SA",
        "ICT Mentorship Core Content - Month 04 - Liquidity Pools",
        "data/ict-transcripts/raw/Gnw54f9v6SA.en.vtt",
    ),
)
if reh_occ["occurrence_id"] not in {d["occurrence_id"] for d in reh["definitions"]}:
    reh["definitions"].append(reh_occ)
reh_path.write_text(json.dumps(reh, indent=2) + "\n", encoding="utf8")
print("updated", reh_path, "occurrences", len(reh["definitions"]))

# --- Rebuild index.jsonl ---
index_rows = []
total_occ = 0
for p in sorted(CAT.glob("*.json")):
    if p.name == "index.json":
        continue
    obj = json.loads(p.read_text(encoding="utf8"))
    n = len(obj.get("definitions") or [])
    total_occ += n
    index_rows.append(
        {
            "concept_id": obj["concept_id"],
            "file": f"catalogue/{p.name}",
            "status": obj.get("status"),
            "occurrences": n,
        }
    )
(CAT / "index.jsonl").write_text(
    "\n".join(json.dumps(r) for r in index_rows) + "\n", encoding="utf8"
)
print("index concepts", len(index_rows), "occurrences", total_occ)

# --- Update inventory statuses ---
inv_path = SRC / "inventory.json"
inv = json.loads(inv_path.read_text(encoding="utf8"))
probe = json.loads((SRC / "_caption-probe-batch5.json").read_text(encoding="utf8"))
by_id = {r["video_id"]: r for r in probe["results"]}
updated = 0
for v in inv["videos"]:
    if v["video_id"] not in by_id:
        continue
    r = by_id[v["video_id"]]
    if r["status"] == "AVAILABLE":
        v["transcript_status"] = "AVAILABLE"
        v["transcript_path"] = r["transcript_path"]
        v["processed"] = True
        v["notes"] = f"batch5_{r['priority']}"
    elif r["status"] == "CAPTION_MISSING":
        v["transcript_status"] = "CAPTION_MISSING"
        v["transcript_path"] = None
        v["processed"] = False
        v["notes"] = f"batch5_probe CAPTION_MISSING ({r['priority']})"
    updated += 1
# also mark tbEz light re-pass note
for v in inv["videos"]:
    if v["video_id"] == "tbEzAhdv_Ak":
        note = v.get("notes") or ""
        if "batch5_light_repass" not in note:
            v["notes"] = (note + " | batch5_light_repass_ifvg_ce").strip(" |")
inv_path.write_text(json.dumps(inv, indent=2), encoding="utf8")
print("inventory rows touched", updated)

# coverage stats
avail = sum(1 for v in inv["videos"] if v.get("transcript_status") == "AVAILABLE")
missing = sum(1 for v in inv["videos"] if v.get("transcript_status") == "CAPTION_MISSING")
# also count pilot/tmp that may not be in inventory
local_vtts = list(VTT.glob("*.en.vtt")) + list(Path("data/ict-transcripts/pilot").glob("*.en.vtt"))
# dedupe by stem-ish
print("inventory AVAILABLE", avail, "CAPTION_MISSING", missing, "total videos", len(inv["videos"]))
print("raw+pilot en.vtt files", len(list(VTT.glob("*.en.vtt"))), len(list(Path("data/ict-transcripts/pilot").glob("*.en.vtt"))))

# Persist stats for PROGRESS writer
stats = {
    "concepts": len(index_rows),
    "occurrences": total_occ,
    "inventory_available": avail,
    "inventory_caption_missing": missing,
    "inventory_total": len(inv["videos"]),
    "coverage_pct": round(100.0 * avail / max(1, len(inv["videos"])), 2),
    "batch5_probed": probe["videos_probed"],
    "batch5_available": probe["available"],
    "batch5_caption_missing": probe["caption_missing"],
    "new_concept_ids": list(concepts.keys()),
}
(SRC / "_batch5-stats.json").write_text(json.dumps(stats, indent=2), encoding="utf8")
print(json.dumps(stats, indent=2))

# Mirror key artefacts to TREE
TREE.mkdir(parents=True, exist_ok=True)
TREE_VTT.mkdir(parents=True, exist_ok=True)
mirror_files = [
    "PROGRESS.md",
    "END_REPORT.md",
    "karen-hypothesis-map.md",
    "catalogue/index.jsonl",
    "sources/inventory.json",
    "sources/_caption-probe-batch5.json",
    "sources/_batch5-stats.json",
    "sources/_priority-batch5.json",
    "sources/_batch5-extract-summary.json",
]
# concept files
for p in CAT.glob("*.json"):
    mirror_files.append(f"catalogue/{p.name}")
for rel in mirror_files:
    src_p = ROOT / rel
    if not src_p.exists():
        continue
    dest = TREE / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_p, dest)
# VTTs for batch5
for r in probe["results"]:
    if r.get("transcript_path"):
        vp = Path(r["transcript_path"])
        if vp.exists():
            shutil.copy2(vp, TREE_VTT / vp.name)
        # also en-orig if present
        for extra in VTT.glob(f"{r['video_id']}*"):
            shutil.copy2(extra, TREE_VTT / extra.name)
print("TREE mirror updated")
