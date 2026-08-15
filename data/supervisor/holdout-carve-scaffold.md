# Holdout / VALIDATION carve — EXECUTED

**EDGE_CLAIM:** NONE  
**TREE:** `.tmp/karen-final-integration/`  
**TIME:** 2026-08-15T14:35:00Z  
**CONFIG:** `archive-carve-v1`

## Source
`nq-history-archive-1m` — 950,405 bars · **750** trading-day dirs · **2023-10-02 → 2026-08-14**

## Carve (chronological — frozen for this measurement package)

| Split | Window | Purpose | Sealed |
|-------|--------|---------|--------|
| **DEVELOPMENT** | 2023-10-02 → 2025-05-31 | Fixture building / candidate exploration | No |
| **VALIDATION** | 2025-06-01 → 2025-12-31 | Gate metrics before freeze discussion | No |
| **UNTOUCHED_HOLDOUT** | 2026-01-01 → 2026-08-14 | Locked measurement only | **Yes** |

Manifest: `data/karen-decision-validation/acquisition/normalized/nq-history-archive-1m/splits/carve-manifest-v1.json`  
Copy: `data/karen-decision-validation/acquisition/reports/archive-carve-manifest-v1.json`

## Rules
1. Holdout asOfs never enter candidate comparison / selection loops until Adam unlocks.
2. Same cadence (15m) + baseline-v2 + **even** sampling across splits.
3. No PnL weight tuning. No ICT lore dump.
4. Holdout X/Y/Z may be **reported** as measurement disclosure — not used for tuning.

## Method (chunked even-span)
- Script: `scripts/karen-dv-archive-carve-even-span.ts`
- Large splits auto-sub-chunked (~130 trading days) with 60d bar lookback
- Full-archive coverage: 6 equal trading-day chunks, even asOfs per chunk, aggregate Y/Z
- Supersedes prefix-sampling fullspan (Z=0 artifact) and monolithic even@2000 OOM attempt

## Status
**EXECUTED** — carve manifests written; chunked even-span DV complete (see FINAL Append A + `nq-history-archive-carve-even-span-latest.json`).
