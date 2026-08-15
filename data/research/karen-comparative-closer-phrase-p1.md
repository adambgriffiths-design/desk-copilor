# Comparative proximity-intent family — freeze P1

**Date:** 2026-08-15  
**Class fix:** structural detector + routing precedence — not phrase patches  

## ROOT (shared hop)
1. `isComparativeDistancePhrase` was a pile of narrow regexes → missed `what level are we nearest to`, `what are we closest to`, etc.
2. Even when comparative matched, `classifyChartQuestion` returned **price** first via `current_price` concept / `what level are we` patterns → LIVE-unavailable dump.

## FIX
- Structural proximity: closer|closest|nearest|nearer|nearby|how near + desk referent (price/level/we/us/…)
- Comparative intent returns **level** *before* current_price / price patterns
- `isClearlyTrading` treats all comparative-distance phrases as desk-owned
- Extension mirror updated

## VERIFY
`test-karen-comparative-level-followups.ts` — ALL PASS  
Fuzz family includes both Chrome repros + nearest/closest/nearby/how near variants.

Weekend: Friday’s close labelled; never “Live market data is unavailable” when close exists.
