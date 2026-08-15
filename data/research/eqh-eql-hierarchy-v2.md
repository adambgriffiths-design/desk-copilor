# EQH/EQL hierarchy v2

Research overlay only. Production `lib/reh-rel.ts` / `lib/structure.ts` were not modified. Equality tolerance was not changed. Named session/PD levels are EXTERNAL and stay on the drawing-levels path.

Primary regression: MNQU2026 four-magenta-REL cluster (near-price consolidation after London High). Synthetic fixture matches that **structure** (rally → session high → chop with a structural low plus higher internal lows). Detector does not hard-code screenshot prices or timestamps.

## Layers (do not mix)

| Layer | Meaning | This detector |
| --- | --- | --- |
| EXTERNAL | PDH/PDL, Asia/London/NY H/L, NDOG, equilibrium | Never emitted here |
| RELATIVE | Meaningful EQH/EQL liquidity areas | PRIMARY / SECONDARY |
| INTERNAL | Minor clusters inside a recognizable area | Preserved for Karen, hidden from main chart |
| NOISE | Insignificant / no structure | `rejected[]` (REJECTED) |

Process at T: **confirmed swing → structural significance → relationship (same recognizable area) → one liquidity area**. Not price-match → REL.

Display ranks: PRIMARY (strongest, drawn) · SECONDARY (distinct lesser shelf, drawn) · INTERNAL (not drawn as a major line) · REJECTED (not presented as liquidity). PRIMARY is not forced: a class-A pair that would not be noticed without a label stays SECONDARY.

## BEFORE / AFTER — 4 REL cluster

Displayed overlay REL in the consolidation band:

| | Count | Levels |
| --- | --- | --- |
| **BEFORE** (pairing only) | **4** | 30218.00, 30221.00, 30224.00, 30227.00 |
| **AFTER** (hierarchy) | **1** | 30218.00 |

EQH equivalent: BEFORE 4 REH → AFTER 1 REH at 30180.50.

## PRIMARY

- **Layer:** RELATIVE · **Role:** PRIMARY · **Kind:** EQL / sell-side
- **Area:** 30218.00–30227.25 (representative **30218.00**)
- **Contributing swings (8, preserved):** 30218.00, 30218.50, 30221.00, 30221.50, 30224.00, 30224.50, 30227.00, 30227.25
- **Why this is the one line to display:** 8 confirmed swing lows form one obvious sell-side horizontal a trader would mark without a label. Held and released a 42.0 pt move — protected a significant swing. Still unswept at T — not chosen with a future sweep.
- **Why not internals:** the structural low of the consolidation is the rest. Higher taps that failed to break lower are the same pool, not new REL lines.
- **Why not London High / Asia High / PDH:** those are EXTERNAL named session/PD levels on a separate path. This detector never merges them into REL and never hides them as noise RELs.

## SECONDARY

None in this cluster. A distinct EQL shelf with a real intervening leave (e.g. 20920 vs 20986) stays a separate SECONDARY/PRIMARY pair — not merged.

## INTERNAL (hidden from main chart)

| Old REL line | Swings | Why INTERNAL |
| --- | --- | --- |
| 30221.00 | 30221.00 / 30221.50 | Higher lows inside the same consolidation; did not break the structural extreme |
| 30224.00 | 30224.00 / 30224.50 | Same recognizable sell-side area as 30218 |
| 30227.00 | 30227.00 / 30227.25 | Topmost near-price taps (where last sat) — internal, not a second pool |

These remain on the parent as contributing swings and in `eqhEql.internal` for Karen. Overlay payload does not draw them.

## MERGED

Four class-A pairs → **one** RELATIVE sell-side area at 30218. Pairing/tolerance unchanged; merge is a visual-area relationship after the structural gate.

## REJECTED (NOISE)

9 rejected similar prints in this window (failed structural gates: not meaningful, no genuine return, overlapping structure, etc.). Not presented as liquidity. Distinct from INTERNAL.

## RAW → CANDIDATES → CLASSIFIED → DISPLAYED

- RAW SWINGS: 9 confirmed lows in the fixture window (structure kept).
- CANDIDATES: class-A pairs (the old 4 REL lines).
- CLASSIFIED: 1 RELATIVE PRIMARY + 3 INTERNAL.
- DISPLAYED: 1 overlay REL.

Filtering display does not delete swings.

## EQH equivalent

Same hierarchy on the buy side: four overlapping REH from internal highs that failed to break the structural high → one PRIMARY buy-side area at 30180.50; internals preserved, not drawn.

## Tests

- `test:eqh-eql-liquidity` 31 ok (includes 4-REL / 4-REH / distinct shelves / PIT)
- `test:eqh-eql-importance` 19 ok
- `test:reh-rel` 10 ok (production detector untouched)
- `test:session-liquidity` ok
- `test:research-replay` 26 ok
- `test:incremental-market` ok (rebuild/reuse still identical algorithm)
- `npm run build` — run after this note

`test:replay` (labeled setup fixtures) is unrelated: it fails when the labeling corpus is empty (`expected 5+ labeled fixtures, got 0`).
