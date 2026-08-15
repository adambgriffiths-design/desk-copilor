# Karen ↔ ICT catalogue hypothesis map

**BASELINE_V2: UNCHANGED**  
**All entries: NOT_IN_PRODUCTION — do not wire.**  
Source of catalogue rows: `data/research/ict-knowledge/catalogue/*.json`

| hypothesis_id | concept_id | status | related Karen surface (read-only) | suggested later DEV single-change (offline) |
|---|---|---|---|---|
| H_ICT_OR_NY_30M_OBS | opening_range_ny_30m | CANDIDATE_FOR_DEV_LATER | session/time; prompt OR rules | Observation-only 9:30–10:00 OR high/low lock — no weigher. Reinforced by Z0VY 30m-only. Conflicts: Month10 1h index OR; hourly model; Judas≠ORG. |
| H_ICT_OR_HOURLY_MODEL | opening_range_hourly_model | CATALOGUED | none | Disambiguation doc only until Adam chooses NY-OR vs hourly-OR |
| H_ICT_OR_INDEX_1H_MONTH10 | opening_range_index_futures_1h | CONFLICTING_SOURCES | overlaps FHDR clock only | Do **not** rename FHDR to OR. Catalogue-only era conflict (1h vs 30m). |
| H_ICT_OR_BONDS_1H_MONTH10 | opening_range_bonds_1h | CATALOGUED | none (index desk) | Contrast proof only — bond 8:00–9:00 OR not for index Karen |
| H_ICT_MIDNIGHT_OR | midnight_opening_range | CANDIDATE_FOR_DEV_LATER | none | Optional overnight OR open/hi/lo/CE observation — no weigher; ≠ RTH OR/ORG |
| H_ICT_PREMARKET_RANGE | pre_market_range | CANDIDATE_FOR_DEV_LATER | REH/REL pools; ny_pre hints | Tag pre-market windows 7/8/9 × :00–:30 on observation |
| H_ICT_FHDR_BREAK_SEMANTICS | first_hour_dealing_range | CONFLICTING_SOURCES | `structureFacts.fhdr`, postFhdr FPFVG | Audit test-vs-break; also naming collision vs Month10 1h OR label — do not merge |
| H_ICT_DEALING_RANGE_GENERAL | dealing_range | CANDIDATE_FOR_DEV_LATER | none wired | Do not conflate with FHDR; catalogue-only until mapping clarified |
| H_ICT_EQ_PREMIUM_DISCOUNT | equilibrium_premium_discount | CANDIDATE_FOR_DEV_LATER | premium/discount framing | Offline: which range supplies Fib 50 before any gate — **not** dealing_range / FHDR |
| H_ICT_ORG_GEOMETRY | opening_range_gap_org | CONFLICTING_SOURCES | ICT_STAT_RULES org-* prompts | Offline: ORG high/low/CE/quadrant/octant as observation facts using **4:14→9:30 RTH** geometry. Factor large-gap (≥~120h) unfilled vs fill. Do **not** merge discount continue-lower vs willingness-up leans. |
| H_ICT_ORG_CE_70_WINDOW | consequent_encroachment_half_gap | CONFLICTING_SOURCES | prompt ~70% CE | Offline hit-rate study; factors: 9:30 vs 9:31; large-gap may-not-fill; IFVG-CE vs ORG-CE overlap (tbEz) — **no edge claim**. |
| H4 | first_presented_fvg | CANDIDATE_FOR_DEV_LATER | `firstPresentedFvg` detectors; backlog H4 | Privilege first-presented vs any FVG (experiment profile). **Official 9:31–10:00 1m FPFVG reinforced (`uC4-1SYXJFg`)** + separate 9:30-usable criteria variant — still NOT_IN_PRODUCTION. Keep post-FHDR / silver-bullet-after-10 / London 1:30 / midnight-OR / REH-raid variants separate. |
| H_ICT_FVG_GENERAL | fair_value_gap | CANDIDATE_FOR_DEV_LATER | FVG/imbalance detectors | Observation-only general FVG ≠ FPFVG; do not merge with void |
| H_ICT_IFVG | inverted_fair_value_gap | CANDIDATE_FOR_DEV_LATER | none confirmed | Wait for definitional captions (`-tuXoqSjO78` CAPTION_MISSING); usage-only so far |
| H_ICT_LIQUIDITY_RUN | liquidity_run | CANDIDATE_FOR_DEV_LATER | BSL/SSL / sweep language | Catalogue HRLR contrast only — no weigher |
| H_ICT_LIQUIDITY_POOL | liquidity_pool | CANDIDATE_FOR_DEV_LATER | relativeEqualPools | Raid/pool observation tags only |
| H_ICT_OPEN_FLOAT_LQ | open_float_liquidity | CANDIDATE_FOR_DEV_LATER | none | HTF quarterly — likely out of scope for intraday Karen |
| H_ICT_LIQUIDITY_VOID | liquidity_void | CANDIDATE_FOR_DEV_LATER | imbalance naming | Disambiguate void vs FVG before any experiment |
| H_ICT_LRLR | low_resistance_liquidity_run | CANDIDATE_FOR_DEV_LATER | none | Needs clearer definitional citation than Month07 application extract |
| H_ICT_REH_REL_FIRST_DISRUPT_BIAS | relative_equal_highs_lows | CANDIDATE_FOR_DEV_LATER | `relativeEqualPools` | Log first-disrupted-side bias; EQH as contrary pool after SSL (Gnw) |
| H_ICT_OPEN_BELL_PATIENCE | open_bell_patience | CATALOGUED | prompt patience hint | Optional UX/logging only |

## Explicit non-goals

- Do **not** change baseline-v2 weights, gates, or ALS from this map.
- Do **not** treat ICT frequency claims (~70% CE) as validated edge.
- Do **not** merge conflicting OR / ORG / FPFVG definitions before a DEV experiment specifies which clock/model.
- Do **not** treat Batch2/Batch5 official 9:31 corroboration as a license to wire H4.
- Do **not** treat Batch3 ORG geometry catalogue as a license to wire H_ICT_ORG_GEOMETRY.
- Do **not** treat Batch4 Month10 1h OR or midnight OR as a license to rename FHDR or add overnight OR to production.
- Do **not** treat Batch5 FVG/liquidity/IFVG catalogue as a license to wire detectors or weigher changes.

## Linked prior research (not re-implemented here)

- `data/research/karen-trading-brain-hypothesis-backlog.md` §H (ICT concepts)
- `lib/ict-knowledge.ts` (prompt-sourced rules — production prompt layer; catalogue treats as *prior citations*, not new wiring)
- `docs/ICT_DECISION_SPEC.md` (architecture; observation ≠ lore)

## Counts (Batch 5)

- Catalogue concept files: **21** (was 13; +8)
- Definition occurrences: **88** (was 67)
- Karen map entries: **21**
- Official channel rows inventoried: 896
- Local transcripts available (inventory): **26**
- CAPTION_MISSING (probed): **3**
- CAPTION_STATUS_UNPROBED: **~867**
- Batch5 probed / new transcripts: **12 / 10**
- Coverage: **~2.9%** (26/896)
- FPFVG_9_31_OFFICIAL_CORROBORATION: **YES** (`pM8oWrcIJqU`, reinforced `uC4-1SYXJFg`)
- IFVG_DEFINITIONAL_CAPTIONS: **NO** this batch (`-tuXoqSjO78` CAPTION_MISSING)
- LOCAL_OR_MINE_EXHAUSTED: **YES** (unchanged)
