# KAREN — Historical verdict + original why

**Date:** 2026-08-15  
**Mode:** smallest safe fix — recorded ring only; no recalculate / LLM rewrite / continuous logger / trading-ICT change; no commit/push/deploy  

Builds on `karen-recorded-vs-pit-fix.md` (HISTORICAL `at_time` = ring-only).

## Requirement

For any historical decision query: return the **originally recorded** verdict/status **plus** the **original reasoning** from that envelope. Do not recalculate with later data. If none recorded → say no decision recorded.

## Before / after

| | Before | After |
|--|--------|-------|
| Status / verdict | Already from ring (`Status:`, `VERDICT:`) via `entryToSnapshot` | Unchanged — recorded ring status |
| Thesis `what` | `Reason/thesis:` + `THESIS: what=` | Unchanged |
| Original **why** (`thesis.whyNow`) | **Missing** from reply text (only `what` + spoken mentor lines) | **`Why: {recorded whyNow}`** and `THESIS: … \| whyNow=…` from frozen envelope |
| Recalculate / PIT on NL at_time | Already refused (recorded-vs-PIT fix) | Still refused |
| Miss (e.g. 09:30, no ring row) | `No decision was recorded at 09:30.` | Unchanged |

## Behavior confirmed

1. **Hit** → recorded `status` / stance / envelope from HISTORICAL ring (`fromStore: true`).
2. **Hit** → original `thesis.what` + `thesis.whyNow` in reply (not a fresh LLM rewrite or PIT rebuild).
3. **Miss** → `No decision was recorded at HH:MM.` (or detail starting with that phrase).

## Code

- `lib/decision-time-travel.ts` — `formatAtTimeReply`: add `Why:` line + `whyNow=` on THESIS line from `snap.envelope.thesis` only.
- `scripts/test-decision-history-time-travel.ts` — §8 asserts reply Status / Reason/thesis / Why match recorded 09:31 envelope.

## TESTS

`npm run test:decision-history-time-travel` → **92 passed, 0 failed** (was 88; +4 verdict+why reply asserts).

## Return card

| Field | Value |
|-------|--------|
| **VERDICT+WHY PRESENT** | **YES** |
| **MISS BEHAVIOR** | `No decision was recorded at HH:MM.` |
| **TESTS** | 92 passed / 0 failed |
| **Files** | `lib/decision-time-travel.ts`, `scripts/test-decision-history-time-travel.ts`, `data/research/karen-historical-verdict-plus-why.md` |
