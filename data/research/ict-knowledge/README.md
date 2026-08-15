# ICT Knowledge Catalogue (research only)

**PROJECT_TYPE:** `research_knowledge_extraction`  
**BASELINE_V2:** **UNCHANGED** — do not modify weights, gates, ALS, or production decision paths.  
**WIRING:** **NOT_IN_PRODUCTION** — catalogue entries are hypotheses for later single-change DEV tests, not rules to ship.

## Purpose

Build a durable catalogue of **ICT concepts** as stated across publicly available YouTube transcripts:

- definitions (quoted or close paraphrase with cue timestamps)
- conditions / setup requirements
- invalidation / failure conditions
- timeframe / session context
- **variations kept separate** across videos (never compressed into one canonical rule)
- optional Karen mapping as **hypotheses to test later in DEV**

## What this is not

- Not a trading-logic project
- Not implementation into Karen production decisioning
- Not a claim that ICT statements are true or that they improve edge
- Not a license to invent definitions when transcripts are missing (`MISSING_TRANSCRIPT`)

## Layout

| Path | Role |
|------|------|
| `schema.json` | JSON Schema for concept + source records |
| `catalogue/` | One JSON file per concept (or JSONL batches) |
| `sources/` | Video inventory + transcript status + extraction worknotes |
| `scripts/` | Resource-light VTT normalize/search (no trading-brain imports) |
| `karen-hypothesis-map.md` | Hypothesis index → later DEV single-change tests |
| `PROGRESS.md` | Resume file: processed / missing / remaining |

## Extraction rules (quality over fake coverage)

1. Prefer **existing local transcripts** first.
2. One **occurrence row** per video statement; if two videos disagree, keep both.
3. Confidence: `quoted` | `paraphrased` | `incomplete_transcript` | `missing_transcript`.
4. Do not invent quotes. Mark `MISSING_TRANSCRIPT` with video id/title/url when known.
5. Karen fields are optional and must say `NOT_IN_PRODUCTION`.

## Safety / ops

- Public captions only; respect availability.
- No VAL/HOLDOUT work from this project.
- No commit/push unless Adam asks.
- Stay CPU/IO light; do not interrupt DEV/c4/cloud jobs.
- If YouTube channel listing/caption fetch is blocked: document exact next step for Adam and continue offline.

## Resume

See `PROGRESS.md`. Re-run:

```bash
node data/research/ict-knowledge/scripts/vtt-tools.mjs inventory
node data/research/ict-knowledge/scripts/batch-extract.mjs
```
