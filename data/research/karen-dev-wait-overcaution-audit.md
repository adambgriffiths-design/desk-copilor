# DEV WAIT overcaution audit

**EDGE_CLAIM:** NONE
**HOLDOUT:** PROTECTED — not accessed
**LOGIC ALTERED:** No (no weights/thresholds/baseline edits)
**TIME:** 2026-08-15T18:06:38.954Z
**Window:** archive-carve-v1 DEVELOPMENT 2023-10-02 → 2025-05-31
**Method:** frozen baseline-v2 · even sample · cadence 10 · Y≈1500 · horizon 30m · 4 sub-windows

## Counts

| TOTAL_STATES | WAIT | NO_TRADE | ACTIONABLE | LONG | SHORT | PIT |
|------------:|-----:|---------:|-----------:|-----:|------:|----:|
| 1500 | **1188** | 239 | 71 | 39 | 32 | 0 |

WAIT share of evals: **79.2%**.
QG-blocked WAITs (canDeliver=false): **0** · Engine-restraint WAITs (canDeliver=true): **1188**.

## GOOD_WAIT vs MISSED_OPPORTUNITY (heuristic)

Labels from `outcome.ts` / `classifyWait` (diagnostic scaffolding — not edge):
- **GOOD_WAIT:** both immediate LONG and SHORT look poor (MAE≥MFE and capped MFE)
- **MISSED_OPPORTUNITY:** exactly one side shows clean follow-through (MFE≥8 and MFE≥1.5×MAE)
- **INCONCLUSIVE:** otherwise

| Class | n | rate |
|-------|--:|-----:|
| GOOD_WAIT | 3 | 0.3% |
| MISSED_OPPORTUNITY | 899 | 75.7% |
| INCONCLUSIVE | 286 | 24.1% |

## TOP_WAIT_DRIVERS (ranked by impact = frequency × (1 + miss share))

| Rank | Driver | freq | % of WAITs | missed|good|inconc | miss rate |
|-----:|--------|-----:|-----------:|------:|---------:|----------:|
| 1 | ENGINE: canDeliver=true but WAIT (selective restraint) | 1188 | 100.0% | 899/3/286 | 75.7% |
| 2 | EVIDENCE: fvg=present | 1021 | 85.9% | 807/3/211 | 79.0% |
| 3 | EVIDENCE: displacement=present | 871 | 73.3% | 661/3/207 | 75.9% |
| 4 | EVIDENCE: contradictions_n=1 | 441 | 37.1% | 334/0/107 | 75.7% |
| 5 | EVIDENCE: displacement=absent | 317 | 26.7% | 238/0/79 | 75.1% |
| 6 | EVIDENCE: fvg=absent | 167 | 14.1% | 92/0/75 | 55.1% |
| 7 | EVIDENCE: both_sides_supported | 113 | 9.5% | 84/0/29 | 74.3% |
| 8 | EVIDENCE: contradictions_n=2 | 19 | 1.6% | 17/0/2 | 89.5% |

## POST_WAIT MFE/MAE summary

Note: WAIT outcome stores LONG-direction excursion as mfe/mae; class label encodes both-side heuristic.

| Slice | n | median MFE | median MAE |
|-------|--:|-----------:|-----------:|
| All WAIT | 1188 | 11.500 | 11.500 |
| GOOD_WAIT | 3 | 9.500 | 9.500 |
| MISSED_OPPORTUNITY | 899 | 13.250 | 12.750 |
| INCONCLUSIVE | 286 | 7.750 | 8.000 |

## SESSION / TIME segments

### Session (WAIT count + missed rate)

| Session | WAIT n | missed n | missed rate |
|---------|-------:|---------:|------------:|
| OTHER | 857 | 623 | 72.7% |
| NY_LUNCH | 118 | 97 | 82.2% |
| NY_PM | 109 | 96 | 88.1% |
| NY_AM | 104 | 83 | 79.8% |

### Time bucket ET (WAIT counts)

| Time bucket ET | WAIT n |
|---------------|-------:|
| other | 857 |
| 1130-1330_lunch | 118 |
| 1330-1600_afternoon | 109 |
| 1000-1130 | 84 |
| 0930-1000 | 20 |

## VERDICT

**structurally_overcautious**

High MISSED_OPPORTUNITY share among WAITs with low GOOD_WAIT share (heuristic). Suggests restraint often coincides with clean post-WAIT directional follow-through — candidate for later DEV threshold experiments, not an edge claim.

This is a process diagnosis on DEVELOPMENT only — **not** an edge claim and **not** permission to unlock holdout.

## EDGE_CLAIM

NONE

JSON: `acquisition/reports/nq-history-archive-dev-dual-audit-latest.json`