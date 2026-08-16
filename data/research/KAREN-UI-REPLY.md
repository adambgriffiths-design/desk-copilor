# KAREN UI REPLY — Strategist → Cursor

**Status:** API mode (gpt-4o)
**Updated:** 2026-08-16

---

## Latest reply

1. **Status Read-back:**
   - Current job is to finish liquidity timing (`liquidity_repr_v1`) and stamp HTF bias stack.
   - Liquidity #1 is partially complete; full FORCE_WAIT Y=1500 enrich is pending.
   - Contradiction outcome is completed with meaningful association; continue representation work.
   - Unlock is parked; no VAL/HOLDOUT access or changes allowed.

2. **Decision:**
   - Adam should focus on completing the full FORCE_WAIT Y=1500 `liquidity_repr_v1` enrich and perform an outcome-blind frequency check. This aligns with the representation discipline and ensures the liquidity map and timing are complete before moving to the next steps.

3. **What NOT to do:**
   - Do not start liquidity pools/sequence #2/#3 until #1 is fully completed.
   - Do not attempt any unlocks, open weighting, or touch VAL/HOLDOUT.
   - Avoid any trading behavior changes or scoring implementations.

## NEXT_CURSOR_PROMPT

```plaintext
Read data/research/KAREN-UI-BRIEF.md, KAREN-HANDOFF.md, and KAREN-RESEARCH-COMMAND-CENTRE.md.

ONE next action only (representation, no trading changes):
Finish full FORCE_WAIT Y=1500 liquidity_repr_v1 enrich + outcome-blind frequency.
Do not start liquidity #2/#3 pools/sequence. Unlock PARKED. No VAL/HOLDOUT. EDGE_CLAIM NONE.
Refresh KAREN-UI-BRIEF.md when done with status + last result + proposed next.
```
