# ICT knowledge extraction — PROGRESS

**Updated:** 2026-08-15 (Batch 5 — throttled caption probe: dealing-range-adjacent / FVG / IFVG / FPFVG / liquidity)  
**MODE:** research / knowledge extraction only  
**BASELINE_V2:** UNCHANGED  
**PRODUCTION_LOGIC_CHANGED:** NO

## Batch 0 — local seed (DONE)

| video_id | title | transcript | processed | concepts touched |
|---|---|---|---|---|
| `6DuByzKLDsc` | ICT 1st Hour Dealing Range | AVAILABLE `data/ict-transcripts/pilot/dealing-range.en.vtt` | YES | FHDR, OR contrast, CE 9:31–10:00, post-FHDR FPFVG |
| `2K1IcVvq9z8` | ICT Gems — Pre-Market Range | AVAILABLE `data/ict-transcripts/pilot/premarket-range.en.vtt` | YES | pre-market range, NY OR, hourly OR model (conflict), REH/REL |
| `uwFJ0t7SAOU` | ICT Gems — Opening Range Gaps | AVAILABLE `tmp/ict-transcripts/org-gaps.uwFJ0t7SAOU.en.vtt` | YES | NY OR 30m, discount-gap willingness, open-bell patience |
| `eft9_3ekDCY` | ICT 2026 Entries & Drills Part 2 | AVAILABLE `tmp/ict-transcripts/entries-drills.eft9_3ekDCY.en.vtt` | YES | ORG, CE/half-gap 70%, premium short lean, FPFVG wait-to-10:00, OR≠ORB |

## Batch 1 — caption fetch + channel flat inventory (DONE)

| video_id | title | channel | transcript | processed | notes |
|---|---|---|---|---|---|
| `-DMKLrUJvfg` | ICT's First Presented FVG Model - Explained | **DanDowdTrading** (third-party) | AVAILABLE `data/ict-transcripts/raw/-DMKLrUJvfg.en.vtt` | YES | Auto-captions; **not** official ICT. 9:31 middle-candle rule (third-party). |

Official channel flat inventory: videos=722 streams=165 shorts=6 → **893** unique ids → `sources/inventory.json` (file now 896 rows incl. extras).

## Batch 2 — priority official caption probe (DONE)

Resource-gated: 12 official priority titles; ~8s sleep between fetches; captions-only.

(See prior rows: Zm9, s-iq, pM8, uIvl, Sf_, V5, UPKU, tbEz, ORbt, CGbS, Z0VY, ib9sa CAPTION_MISSING.)

## Batch 3 — ORG citation deep-dive (DONE)

Zero new downloads. Mined uIvl / Sf / V5 (+ light tbEz).

## Batch 4 — OR clocks / midnight / bonds-vs-index (DONE)

Zero new downloads. Local OR mine **EXHAUSTED**.

## Batch 5 — DR / FVG / liquidity caption probe (DONE this pass)

**Constraint:** research only; throttled captions (`ICT_CAPTION_SLEEP_MS=10000`); no production wiring; never invent missing captions.

Curated **12** official titles (Month-core FVG/liquidity + FPFVG/IFVG + Month1 equilibrium). No remaining unprobed title literally named “Dealing Ranges” — used Month1 equilibrium vs premium/discount as dealing-range-adjacent.

| video_id | title | priority | transcript | processed | notes |
|---|---|---|---|---|---|
| `FgacYSN9QEo` | Month 04 — ICT Fair Value Gaps FVG | fvg_core | AVAILABLE | YES | Official FVG definition + fill-after-SSL + overlap note |
| `uC4-1SYXJFg` | When 9:30am ET Is 1st Presented FVG | fpfvg_official | AVAILABLE | YES | **9:31–10:00 1m FPFVG** + 9:30-candle-usable criteria variant + REH-raid qualify + IFVG pair |
| `o38k6-twQCg` | Advanced 1st Presented FVG Trade | fpfvg_official | **CAPTION_MISSING** | NO | yt-dlp wrote no en VTT — honest |
| `-tuXoqSjO78` | … IFVG Reentry … | ifvg | **CAPTION_MISSING** | NO | No en captions — IFVG remains thinly sourced |
| `POUT0pVs4U0` | Friday Sellside Under 1st Presented FVG | fpfvg_liquidity | AVAILABLE | YES (example) | Example-only FPFVG/sellside |
| `qC0LogyIk2I` | Month 1 — Equilibrium Vs. Discount | dealing_range_adjacent | AVAILABLE | YES | Eq = Fib 50; discount below |
| `YuefjnUKQdM` | Month 1 — Equilibrium Vs. Premium | dealing_range_adjacent | AVAILABLE | YES | Above halfway = premium |
| `22XkhpJR5eA` | Month 1 — Liquidity Runs | liquidity | AVAILABLE | YES | BSL/SSL foundations + **HRLR** |
| `Gnw54f9v6SA` | Month 04 — Liquidity Pools | liquidity | AVAILABLE | YES | Pool def + SSL pool + EQH contrary pool |
| `vqtA1S9JH34` | Month 05 — Open Float Liquidity Pools | liquidity | AVAILABLE | YES | ~3m open-float selection window |
| `HTQgH11W37o` | Month 04 — Liquidity Voids | liquidity | AVAILABLE | YES | Void = wide one-sided delivery |
| `O69iFqP1j7o` | Month 07 — Low Resistance Liquidity Runs | liquidity | AVAILABLE | PARTIAL | Application/framing; thin geometric def |

**Optional light re-pass:** `tbEzAhdv_Ak` (already local) — IFVG half/CE overlapping Friday ORG high; ORG CE live commentary.

### Coverage after Batch 5

| Metric | Value |
|---|---|
| Metadata rows inventoried | 896 |
| Local transcripts AVAILABLE (inventory) | **26** (was 16) |
| CAPTION_MISSING (probed) | **3** (`ib9sa6ldwA4`, `o38k6-twQCg`, `-tuXoqSjO78`) |
| CAPTION_STATUS_UNPROBED | **~867** |
| Claim complete caption coverage | **NO** |
| Approx. caption coverage of inventoried ids | **~2.9%** (26/896) |
| This batch probed | **12** |
| New transcripts this batch | **10** |
| Citations / definition occurrences (catalogue total) | **88** (was 67) |
| Concept files | **21** (was 13; +8) |

### Batch 5 conflicts / separations kept

1. **FPFVG 9:31-default vs 9:30-candle-usable:** `uC4-1SYXJFg` states default first usable FVG is **9:31–10:00 1m**, *and* criteria when the **9:30** 1m FVG may be used — separate occurrences; do not merge.
2. **FVG vs liquidity void:** Month04 FVG + Void lectures overlap thematically; concepts kept in separate files.
3. **HRLR vs LRLR:** HRLR defined in Month1 Liquidity Runs; LRLR Month07 is application-thin — separate concept files.
4. **Equilibrium/premium/discount ≠ dealing_range ≠ FHDR:** Month1 50% grading kept as `equilibrium_premium_discount`.
5. **IFVG definitional gap:** titled IFVG video CAPTION_MISSING; only usage mentions (`uC4`, `tbEz`) catalogued.
6. **Prior Batch 3–4 OR/ORG/OR-clock conflicts** unchanged.

## Catalogue status

| concept_id | status |
|---|---|
| opening_range_ny_30m | CONFLICTING_SOURCES |
| opening_range_hourly_model | CONFLICTING_SOURCES |
| opening_range_index_futures_1h | CONFLICTING_SOURCES |
| opening_range_bonds_1h | CATALOGUED |
| midnight_opening_range | CATALOGUED |
| pre_market_range | CATALOGUED |
| first_hour_dealing_range | CONFLICTING_SOURCES |
| dealing_range | CATALOGUED |
| opening_range_gap_org | CONFLICTING_SOURCES |
| consequent_encroachment_half_gap | CONFLICTING_SOURCES (+ tbEz IFVG-CE) |
| first_presented_fvg | CONFLICTING_SOURCES (+ uC4 9:31 / 9:30 criteria) |
| relative_equal_highs_lows | CATALOGUED (+ EQH pool target) |
| open_bell_patience | CATALOGUED |
| fair_value_gap | **NEW** CATALOGUED |
| inverted_fair_value_gap | **NEW** CATALOGUED (thin) |
| equilibrium_premium_discount | **NEW** CATALOGUED |
| liquidity_run | **NEW** CATALOGUED |
| liquidity_pool | **NEW** CATALOGUED |
| open_float_liquidity | **NEW** CATALOGUED |
| liquidity_void | **NEW** CATALOGUED |
| low_resistance_liquidity_run | **NEW** CATALOGUED (partial) |

## Remaining (priority order)

1. Optional deeper mine of already-local Batch5 VTTs (especially `FgacYSN9QEo` three-candle geometry; `qC0LogyIk2I` full discount ladder).
2. Throttled probe of remaining FPFVG/liquidity titles still UNPROBED (e.g. `svYZKOrWPRo` winning FVGs; `npL3ZXJ5zOU` reinforcing liquidity) — or stop with ~2.9% coverage note.
3. Re-try CAPTION_MISSING later: `o38k6-twQCg`, `-tuXoqSjO78`, `ib9sa6ldwA4` (do not invent).
4. Optional hygiene: mirror `tmp/ict-transcripts/*.vtt` → `data/ict-transcripts/`.

## Durable artifacts

- `README.md`, `schema.json`, `PROGRESS.md`, `END_REPORT.md`
- `sources/inventory.json`, `_caption-probe-batch5.json`, `_priority-batch5.json`
- `sources/_batch5-extract-summary.json`, `_batch5-precise-windows.json`, `_batch5-signal.md`, `_batch5-stats.json`
- `catalogue/*.json` (21 concepts; 88 definition occurrences)
- `karen-hypothesis-map.md`
- `scripts/probe-captions-batch5.mjs`, `_batch5-*.{mjs,py}`
- VTTs under `data/ict-transcripts/raw/`
- TREE mirror: `.tmp/karen-final-integration/data/research/ict-knowledge/`
