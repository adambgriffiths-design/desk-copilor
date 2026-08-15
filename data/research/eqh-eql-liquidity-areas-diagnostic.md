# EQH/EQL liquidity areas diagnostic
Research only — production `lib/reh-rel.ts` / `lib/structure.ts` were not modified.
- **Dataset:** `data\research-fixtures\nq-week-aug05-aug12-2026-cme` (tickstream 229d1bea359bcc6777ff)
- **Bars:** 6880 × 1m, last 18:00 last=29829.25
- **Window:** 1785967200 → 1786572000
- **Question:** Would a trader looking at structure available at T call this obvious resting liquidity?
- **Not the question:** Did we detect more REH/EQL?
## How liquidity-first works
REH/EQL are **evidence** for a liquidity pool. Two similar prints are not automatically liquidity.
1. Confirmed 5-bar swings only (right wing closed at T).
2. Meaningful vs surrounding PA (prominence vs ATR) — tiny internals are rejected.
3. Second swing must genuinely return after leaving the area.
4. A trader would visually recognize one horizontal.
5. Clear pool vs random noise (visual class A).
6. If already swept: keep the area, mark SWEPT, keep contributing swings — do not retro-delete.
7. Part of current relevant structure (dealing range / BOS-MSS / lookback extreme / held displacement).
8. Still actionable/relevant at T.
Relative equality is **one supporting component** of "same visible shelf" (vol/structure justified).
18500 vs 18500.75 can be one area if both swings are obvious. 18500 vs 18501 does not auto-qualify because the number is small.
Nearby prints (18500 / 18500.50 / 18500.75) collapse to **one** buy-side or sell-side area; underlying swings are kept.
Visual class: **A** obvious repeated highs/lows (normally the only HIGH). **B** minor internals, **C** isolated, **D** overlapping structure — rejected, not scored into HIGH.
There is **no weighted mystery score**. HIGH/MEDIUM/LOW is the gate outcome. The numeric `score` field is only a 90/60/30 rank token from that label.
## Snapshot counts (1m @ last bar)
- Accepted areas: 39 (BUY_SIDE 19, SELL_SIDE 20)
- HIGH 3 · MEDIUM 36 · LOW 0
- ACTIVE 3 · SWEPT 36
- Rejected similar pairs: 50
- NY AM PIT leak: **none** · mid-sample PIT leak: **none**
## TOP 10 BUY-SIDE LIQUIDITY AREAS
### BUY_SIDE 29931.50–29932.00 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 14:43 (1786560180) |
| PRICE AREA | 29931.50 – 29932.00 (rep 29932.00) |
| CONTRIBUTING SWINGS | 29931.50 @ 10:46 (prom 40.50); 29932.00 @ 14:41 (prom 23.75) |
| WHY MEANINGFUL | HIGH: Buy-side liquidity area 29931.50–29932.00. A trader would mark this horizontal (2 confirmed meaningful swing highs). Still unswept. Associated with an earlier structure break at this price; held and released a 127.5 pt move — protected a significant swing. Same visible area: 0.50 pt shelf vs 113.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29924.50/29924.50 is not: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 127.5 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 40.50 / 23.75 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 113.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (235 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 127.5 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 0.50 pt shelf vs 113.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29899.00–29899.50 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 23:54 (1786334040) |
| PRICE AREA | 29899.00 – 29899.50 (rep 29899.50) |
| CONTRIBUTING SWINGS | 29899.50 @ 22:52 (prom 12.50); 29899.00 @ 23:52 (prom 17.75) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29899.00–29899.50. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Near a bearish market structure shift at 29901.50; held and released a 366.0 pt move — protected a significant swing. Same visible area: 0.50 pt shelf vs 29.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29898.00/29897.75 is not: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | near a bearish market structure shift at 29901.50; held and released a 366.0 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29901.00 at 00:17 range 29895.00–29901.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 12.50 / 17.75 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 29.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (60 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — near a bearish market structure shift at 29901.50; held and released a 366.0 pt move — protected a significant swing.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.50 pt shelf vs 29.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29923.00–29923.50 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 03:02 (1786345320) |
| PRICE AREA | 29923.00 – 29923.50 (rep 29923.50) |
| CONTRIBUTING SWINGS | 29923.50 @ 02:51 (prom 12.50); 29923.00 @ 03:00 (prom 20.50) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29923.00–29923.50. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 390.0 pt move — protected a significant swing. Same visible area: 0.50 pt shelf vs 17.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29923.50/29923.25 is not: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 390.0 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | London session · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29925.25 at 03:17 range 29920.25–29925.25 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 12.50 / 20.50 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 17.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (9 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 390.0 pt move — protected a significant swing.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.50 pt shelf vs 17.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29983.75–29984.00 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 05:13 (1786353180) |
| PRICE AREA | 29983.75 – 29984.00 (rep 29984.00) |
| CONTRIBUTING SWINGS | 29984.00 @ 03:45 (prom 29.75); 29983.75 @ 05:11 (prom 11.00) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29983.75–29984.00. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Held and released a 450.5 pt move — protected a significant swing. Same visible area: 0.25 pt shelf vs 48.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | held and released a 450.5 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29985.00 at 09:27 range 29962.25–29985.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 29.75 / 11.00 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 48.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (86 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — held and released a 450.5 pt move — protected a significant swing.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.25 pt shelf vs 48.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29817.25–29818.00 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 11:47 (1786376820) |
| PRICE AREA | 29817.25 – 29818.00 (rep 29818.00) |
| CONTRIBUTING SWINGS | 29817.25 @ 11:16 (prom 28.25); 29818.00 @ 11:45 (prom 42.50) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29817.25–29818.00. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 284.5 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.75 pt shelf vs 76.50 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is a separate shelf from 29823.25 — not the same pool. MEDIUM: Buy-side liquidity area 29823.00–29823.25. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Near a bullish market structure shift at 29823.00; held and released a 18.8 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.25 pt shelf vs 10.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 284.5 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Overnight · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29823.50 at 11:51 range 29806.50–29823.50 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 28.25 / 42.50 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 76.50 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (29 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 284.5 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 76.50 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29796.00–29796.50 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 15:20 (1786389600) |
| PRICE AREA | 29796.00 – 29796.50 (rep 29796.50) |
| CONTRIBUTING SWINGS | 29796.50 @ 13:31 (prom 12.75); 29796.00 @ 15:18 (prom 14.50); 29796.00 @ 15:26 (prom 13.25) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29796.00–29796.50. A trader would mark this horizontal (3 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 263.0 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.00 pt shelf vs 15.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| WHY THIS vs NEARBY | This area is a separate shelf from 29793.75 — not the same pool. MEDIUM: Buy-side liquidity area 29793.00–29793.75. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.75 pt shelf vs 127.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 263.0 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | New York PM · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29797.00 at 21:00 range 29782.75–29797.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 14.50 / 13.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 15.25 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (8 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 263.0 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.00 pt shelf vs 15.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29754.50–29754.75 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 16:11 (1786392660) |
| PRICE AREA | 29754.50 – 29754.75 (rep 29754.75) |
| CONTRIBUTING SWINGS | 29754.75 @ 16:00 (prom 32.25); 29754.75 @ 16:09 (prom 14.50); 29754.50 @ 16:28 (prom 8.25) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29754.50–29754.75. A trader would mark this horizontal (3 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 221.3 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.25 pt shelf vs 17.50 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 221.3 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Overnight · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29760.00 at 16:44 range 29752.75–29760.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 14.50 / 8.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 17.50 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (19 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 221.3 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.25 pt shelf vs 17.50 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29793.00–29793.75 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 20:56 (1786409760) |
| PRICE AREA | 29793.00 – 29793.75 (rep 29793.75) |
| CONTRIBUTING SWINGS | 29793.00 @ 15:39 (prom 22.75); 29793.75 @ 20:54 (prom 9.25) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29793.00–29793.75. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.75 pt shelf vs 127.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is a separate shelf from 29796.50 — not the same pool. MEDIUM: Buy-side liquidity area 29796.00–29796.50. A trader would mark this horizontal (3 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 263.0 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.00 pt shelf vs 15.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29797.00 at 21:00 range 29782.75–29797.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 22.75 / 9.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 127.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (255 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 127.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29842.50–29842.75 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 23:56 (1786420560) |
| PRICE AREA | 29842.50 – 29842.75 (rep 29842.75) |
| CONTRIBUTING SWINGS | 29842.50 @ 23:42 (prom 10.75); 29842.75 @ 23:54 (prom 9.00) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29842.50–29842.75. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Near a bearish market structure shift at 29840.75; held and released a 309.3 pt move — protected a significant swing. Same visible area: 0.25 pt shelf vs 14.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29837.00/29837.25 is not: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | near a bearish market structure shift at 29840.75; held and released a 309.3 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29846.00 at 00:10 range 29837.25–29846.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 10.75 / 9.00 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 14.25 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (12 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — near a bearish market structure shift at 29840.75; held and released a 309.3 pt move — protected a significant swing.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.25 pt shelf vs 14.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### BUY_SIDE 29886.00–29886.75 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 07:06 (1786446360) |
| PRICE AREA | 29886.00 – 29886.75 (rep 29886.75) |
| CONTRIBUTING SWINGS | 29886.00 @ 10:45 (prom 29.00); 29886.75 @ 07:04 (prom 32.00) |
| WHY MEANINGFUL | MEDIUM: Buy-side liquidity area 29886.00–29886.75. A trader would mark this horizontal (2 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 353.3 pt move — protected a significant swing. Same visible area: 0.75 pt shelf vs 220.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29887.75/29887.75 is not: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 353.3 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29932.25 at 08:29 range 29862.50–29932.25 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 29.00 / 32.00 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 220.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (1159 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 353.3 pt move — protected a significant swing.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 220.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

## TOP 10 SELL-SIDE LIQUIDITY AREAS
### SELL_SIDE 29606.25–29607.00 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 15:52 (1786477920) |
| PRICE AREA | 29606.25 – 29607.00 (rep 29606.25) |
| CONTRIBUTING SWINGS | 29606.25 @ 15:25 (prom 12.00); 29607.00 @ 15:50 (prom 27.75) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29606.25–29607.00. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Held and released a 395.5 pt move — protected a significant swing. Same visible area: 0.75 pt shelf vs 53.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | held and released a 395.5 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | New York PM · htf |
| LAST vs AREA | last=29829.25 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 12.00 / 27.75 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 53.25 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (25 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — held and released a 395.5 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 53.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29646.75–29646.75 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 22:00 (1786500000) |
| PRICE AREA | 29646.75 – 29646.75 (rep 29646.75) |
| CONTRIBUTING SWINGS | 29646.75 @ 21:35 (prom 13.50); 29646.75 @ 21:58 (prom 20.25) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29646.75–29646.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing. Same visible area: 0.00 pt shelf vs 36.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29829.25 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 13.50 / 20.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 36.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (23 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 0.00 pt shelf vs 36.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29935.75–29936.00 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 05:48 (1786355280) |
| PRICE AREA | 29935.75 – 29936.00 (rep 29935.75) |
| CONTRIBUTING SWINGS | 29935.75 @ 03:49 (prom 24.50); 29936.00 @ 05:46 (prom 10.25) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29935.75–29936.00. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 66.0 pt move — protected a significant swing. Same visible area: 0.25 pt shelf vs 47.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 66.0 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29934.50 at 06:00 range 29934.50–29949.75 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 24.50 / 10.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 47.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (117 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 66.0 pt move — protected a significant swing.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.25 pt shelf vs 47.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29741.50–29742.50 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 14:22 (1786386120) |
| PRICE AREA | 29741.50 – 29742.50 (rep 29741.50) |
| CONTRIBUTING SWINGS | 29741.75 @ 12:53 (prom 31.25); 29742.50 @ 14:20 (prom 13.25); 29741.50 @ 14:30 (prom 22.75) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29741.50–29742.50. A trader would mark this horizontal (3 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.75 pt shelf vs 68.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29740.25 at 15:51 range 29740.25–29753.75 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 31.25 / 13.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 68.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (87 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 260.3 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 68.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29755.75–29755.75 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 18:02 (1786399320) |
| PRICE AREA | 29755.75 – 29755.75 (rep 29755.75) |
| CONTRIBUTING SWINGS | 29755.75 @ 16:50 (prom 10.00); 29755.75 @ 18:00 (prom 28.50) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29755.75–29755.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 246.0 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.00 pt shelf vs 14.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29754.50/29754.75 is not: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 246.0 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29752.00 at 18:10 range 29752.00–29763.25 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 10.00 / 28.50 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 14.25 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (10 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 246.0 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.00 pt shelf vs 14.25 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29722.25–29722.50 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 18:45 (1786401900) |
| PRICE AREA | 29722.25 – 29722.50 (rep 29722.25) |
| CONTRIBUTING SWINGS | 29722.50 @ 15:59 (prom 32.25); 29722.25 @ 18:43 (prom 9.50) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29722.25–29722.50. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 279.5 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.25 pt shelf vs 66.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29718.75/29718.75 is not: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 279.5 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29720.75 at 19:01 range 29720.75–29732.75 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 32.25 / 9.50 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 66.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (104 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 279.5 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.25 pt shelf vs 66.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29814.50–29814.50 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 22:28 (1786415280) |
| PRICE AREA | 29814.50 – 29814.50 (rep 29814.50) |
| CONTRIBUTING SWINGS | 29814.50 @ 22:17 (prom 12.75); 29814.50 @ 22:26 (prom 9.25) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29814.50–29814.50. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Near a bearish market structure shift at 29812.75; held and released a 187.3 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.00 pt shelf vs 11.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29814.75/29814.50 is not: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | near a bearish market structure shift at 29812.75; held and released a 187.3 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29813.25 at 01:25 range 29813.25–29820.75 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 12.75 / 9.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 11.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (9 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — near a bearish market structure shift at 29812.75; held and released a 187.3 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.00 pt shelf vs 11.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29829.75–29830.25 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 01:08 (1786424880) |
| PRICE AREA | 29829.75 – 29830.25 (rep 29829.75) |
| CONTRIBUTING SWINGS | 29829.75 @ 23:57 (prom 11.00); 29830.25 @ 01:06 (prom 17.00) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29829.75–29830.25. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Near a bearish market structure shift at 29831.50; held and released a 172.0 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.50 pt shelf vs 31.50 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | This area is a separate shelf from 29833.75 — not the same pool. MEDIUM: Sell-side liquidity area 29833.75–29834.25. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 168.0 pt move — protected a significant swing. Same visible area: 0.50 pt shelf vs 11.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| STRUCTURAL CONTEXT | near a bearish market structure shift at 29831.50; held and released a 172.0 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29826.75 at 01:19 range 29826.75–29832.00 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 11.00 / 17.00 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 31.50 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (69 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — near a bearish market structure shift at 29831.50; held and released a 172.0 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.50 pt shelf vs 31.50 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29786.75–29787.25 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 02:02 (1786428120) |
| PRICE AREA | 29786.75 – 29787.25 (rep 29786.75) |
| CONTRIBUTING SWINGS | 29786.75 @ 01:51 (prom 18.75); 29787.25 @ 02:00 (prom 26.25) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29786.75–29787.25. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 215.0 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.50 pt shelf vs 14.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29793.00/29793.00 is not: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 215.0 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29782.50 at 02:20 range 29782.50–29794.25 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 18.75 / 26.25 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 14.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (9 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 215.0 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.50 pt shelf vs 14.75 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29732.50–29733.25 (MEDIUM)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 03:08 (1786432080) |
| PRICE AREA | 29732.50 – 29733.25 (rep 29732.50) |
| CONTRIBUTING SWINGS | 29732.50 @ 02:34 (prom 34.00); 29733.25 @ 03:06 (prom 29.50) |
| WHY MEANINGFUL | MEDIUM: Sell-side liquidity area 29732.50–29733.25. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 269.3 pt move — protected a significant swing; inside the Asia range. Same visible area: 0.75 pt shelf vs 56.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | No nearby similar high/low was rejected in this window; confidence stays conservative if contrast is thin. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 269.3 pt move — protected a significant swing; inside the Asia range. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | SWEPT (closed_through) |
| CONFIDENCE | MEDIUM (class A, 0.60) |
| SESSION / TF | London session · htf |
| LAST vs AREA | last=29829.25 (Swept — historical liquidity, not an active rest.) |
| SWEEP | 29728.00 at 03:23 range 29728.00–29737.50 |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 34.00 / 29.50 vs floor 1.50).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 56.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (32 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: FAIL — Already swept — keep the area and swings; it is not current resting liquidity.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 269.3 pt move — protected a significant swing; inside the Asia range.
- actionableAtT: FAIL — Swept — historical liquidity, not an active rest.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 56.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

## Rejected REH/EQL (the proof)
These looked like equal highs/lows (similar prices) and failed the structural test. That is the point of liquidity-first.
### Rejected 1: EQH 29830.50 / 29830.50 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29830.50 @ 20:50 (prom 22.25); 29830.50 @ 21:59 (prom 16.75)

### Rejected 2: EQL 29872.00 / 29872.00 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29872.00 @ 23:06 (prom 10.75); 29872.00 @ 07:43 (prom 27.25)

### Rejected 3: EQH 29892.25 / 29892.25 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29892.25 @ 22:07 (prom 16.75); 29892.25 @ 10:37 (prom 45.50)

### Rejected 4: EQL 29902.50 / 29902.50 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29902.50 @ 03:02 (prom 20.50); 29902.50 @ 13:00 (prom 17.00)

### Rejected 5: EQH 29892.00 / 29892.00 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29892.00 @ 23:02 (prom 14.00); 29892.00 @ 07:22 (prom 23.25)

### Rejected 6: EQL 29916.00 / 29916.00 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29916.00 @ 06:14 (prom 10.25); 29916.00 @ 09:03 (prom 17.25)

### Rejected 7: EQH 29892.00 / 29892.00 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29892.00 @ 23:02 (prom 14.00); 29892.00 @ 11:14 (prom 32.75)

### Rejected 8: EQL 29793.00 / 29793.00 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29793.00 @ 09:15 (prom 25.50); 29793.00 @ 13:11 (prom 16.00)

### Rejected 9: EQH 29887.75 / 29887.75 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29887.75 @ 00:00 (prom 14.75); 29887.75 @ 12:25 (prom 18.25)

### Rejected 10: EQL 29718.75 / 29718.75 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29718.75 @ 09:41 (prom 59.25); 29718.75 @ 05:11 (prom 21.50)

### Rejected 11: EQH 29924.50 / 29924.50 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29924.50 @ 01:25 (prom 11.00); 29924.50 @ 13:07 (prom 16.50)

### Rejected 12: EQL 29852.75 / 29852.50 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29852.75 @ 22:18 (prom 17.75); 29852.50 @ 15:34 (prom 12.50)

### Rejected 13: EQH 29952.00 / 29952.00 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29952.00 @ 03:24 (prom 21.00); 29952.00 @ 05:51 (prom 9.75)

### Rejected 14: EQL 29848.25 / 29848.50 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29848.25 @ 22:35 (prom 18.50); 29848.50 @ 10:55 (prom 47.25)

### Rejected 15: EQH 29959.00 / 29959.00 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29959.00 @ 04:27 (prom 12.50); 29959.00 @ 06:05 (prom 21.00)

### Rejected 16: EQL 29889.00 / 29889.25 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29889.00 @ 23:41 (prom 7.75); 29889.25 @ 13:16 (prom 22.50)

### Rejected 17: EQH 29972.00 / 29972.00 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29972.00 @ 04:35 (prom 26.25); 29972.00 @ 05:34 (prom 22.00)

### Rejected 18: EQL 29885.25 / 29885.00 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29885.25 @ 00:11 (prom 12.50); 29885.00 @ 14:57 (prom 24.25)

### Rejected 19: EQH 29892.00 / 29892.00 (class D)

- **WHY:** Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29892.00 @ 07:22 (prom 23.25); 29892.00 @ 11:14 (prom 32.75)

### Rejected 20: EQL 29873.75 / 29874.00 (class D)

- **WHY:** Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Failed tests:** clearPoolVsNoise
- **Contributing swings:** 29873.75 @ 00:56 (prom 17.75); 29874.00 @ 07:25 (prom 25.50)

## Accepted vs rejected example
- **Accepted:** BUY_SIDE 29931.50–29932.00 — HIGH: Buy-side liquidity area 29931.50–29932.00. A trader would mark this horizontal (2 confirmed meaningful swing highs). Still unswept. Associated with an earlier structure break at this price; held and released a 127.5 pt move — protected a significant swing. Same visible area: 0.50 pt shelf vs 113.00 pt pullback (ATR 5.91; band 0.89). Relative equality supports the area — it is not the reason it exists.
- **Rejected:** EQH 29830.50/29830.50 — Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
- **Contrast:** This area is meaningful because it is a class-A shelf. Nearby 29924.50/29924.50 is not: Rejected as EQH: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool.
## NY AM cutoff (2026-08-12 10:59, last=29868.00)
Areas 96 · HIGH 6 · rejected 50. Future bars after this T are not used.
### BUY_SIDE 29929.00–29931.50 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | BUY_SIDE |
| FORMATION | 10:48 (1786546080) |
| PRICE AREA | 29929.00 – 29931.50 (rep 29931.50) |
| CONTRIBUTING SWINGS | 29929.00 @ 10:38 (prom 50.75); 29931.50 @ 10:46 (prom 40.50) |
| WHY MEANINGFUL | HIGH: Buy-side liquidity area 29929.00–29931.50. A trader would mark this horizontal (2 confirmed meaningful swing highs). Still unswept. Near a bullish market structure shift at 29934.50; held and released a 83.0 pt move — protected a significant swing; inside the first-hour dealing range. Same visible area: 2.50 pt shelf vs 34.75 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is a separate shelf from 29925.25 — not the same pool. MEDIUM: Buy-side liquidity area 29923.00–29925.25. A trader would mark this horizontal (3 confirmed meaningful swing highs). Already swept — preserved as history, not current resting liquidity. Near a bullish market structure shift at 29918.50; held and released a 391.8 pt move — protected a significant swing; inside the first-hour dealing range. Same visible area: 0.50 pt shelf vs 17.00 pt pullback (ATR 20.70; band 2.55). Relative equality supports the area — it is not the reason it exists. Left high slightly above right (ICT priming). |
| STRUCTURAL CONTEXT | near a bullish market structure shift at 29934.50; held and released a 83.0 pt move — protected a significant swing; inside the first-hour dealing range. Current-session liquidity (New York AM). |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | New York AM · session |
| LAST vs AREA | last=29868.00 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 50.75 / 40.50 vs floor 5.17).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 34.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (8 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — near a bullish market structure shift at 29934.50; held and released a 83.0 pt move — protected a significant swing; inside the first-hour dealing range.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 2.50 pt shelf vs 34.75 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29606.25–29607.00 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 15:52 (1786477920) |
| PRICE AREA | 29606.25 – 29607.00 (rep 29606.25) |
| CONTRIBUTING SWINGS | 29606.25 @ 15:25 (prom 12.00); 29607.00 @ 15:50 (prom 27.75) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29606.25–29607.00. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 395.5 pt move — protected a significant swing. Same visible area: 0.75 pt shelf vs 53.25 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | This area is a separate shelf from 29602.00 — not the same pool. MEDIUM: Sell-side liquidity area 29602.00–29604.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 399.8 pt move — protected a significant swing. Same visible area: 2.75 pt shelf vs 36.00 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 395.5 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | New York PM · htf |
| LAST vs AREA | last=29868.00 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 12.00 / 27.75 vs floor 5.17).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 53.25 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (25 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 395.5 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 0.75 pt shelf vs 53.25 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29612.50–29614.75 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 16:12 (1786479120) |
| PRICE AREA | 29612.50 – 29614.75 (rep 29612.50) |
| CONTRIBUTING SWINGS | 29612.50 @ 15:59 (prom 39.25); 29614.75 @ 16:10 (prom 24.00) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29612.50–29614.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 389.3 pt move — protected a significant swing. Same visible area: 2.25 pt shelf vs 37.00 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | This area is a separate shelf from 29606.25 — not the same pool. HIGH: Sell-side liquidity area 29606.25–29607.00. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 395.5 pt move — protected a significant swing. Same visible area: 0.75 pt shelf vs 53.25 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 389.3 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | Multiple sessions · htf |
| LAST vs AREA | last=29868.00 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 39.25 / 24.00 vs floor 5.17).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 37.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (11 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 389.3 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 2.25 pt shelf vs 37.00 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29624.50–29626.75 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 20:10 (1786493400) |
| PRICE AREA | 29624.50 – 29626.75 (rep 29624.50) |
| CONTRIBUTING SWINGS | 29626.75 @ 18:04 (prom 30.50); 29624.50 @ 20:08 (prom 20.25) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29624.50–29626.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 377.3 pt move — protected a significant swing. Same visible area: 2.25 pt shelf vs 43.00 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is a separate shelf from 29634.00 — not the same pool. MEDIUM: Sell-side liquidity area 29634.00–29635.75. A trader would mark this horizontal (3 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 367.8 pt move — protected a significant swing. Same visible area: 1.75 pt shelf vs 18.50 pt pullback (ATR 20.70; band 2.77). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 377.3 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (touched) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29868.00 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 30.50 / 20.25 vs floor 5.17).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 43.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (124 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 377.3 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 2.25 pt shelf vs 43.00 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29646.75–29646.75 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 22:00 (1786500000) |
| PRICE AREA | 29646.75 – 29646.75 (rep 29646.75) |
| CONTRIBUTING SWINGS | 29646.75 @ 21:35 (prom 13.50); 29646.75 @ 21:58 (prom 20.25) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29646.75–29646.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing. Same visible area: 0.00 pt shelf vs 36.75 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists. |
| WHY THIS vs NEARBY | This area is a separate shelf from 29639.50 — not the same pool. MEDIUM: Sell-side liquidity area 29639.50–29640.75. A trader would mark this horizontal (2 confirmed meaningful swing lows). Already swept — preserved as history, not current resting liquidity. Associated with an earlier structure break at this price; held and released a 362.3 pt move — protected a significant swing. Same visible area: 1.25 pt shelf vs 11.50 pt pullback (ATR 20.70; band 1.72). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. |
| STATUS | ACTIVE (active) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | Asia session · htf |
| LAST vs AREA | last=29868.00 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 13.50 / 20.25 vs floor 5.17).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 36.75 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (23 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 0.00 pt shelf vs 36.75 pt pullback (ATR 20.70; band 3.10). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

### SELL_SIDE 29729.75–29731.00 (HIGH)

| Field | Value |
| --- | --- |
| TYPE | SELL_SIDE |
| FORMATION | 03:48 (1786520880) |
| PRICE AREA | 29729.75 – 29731.00 (rep 29729.75) |
| CONTRIBUTING SWINGS | 29729.75 @ 03:34 (prom 14.25); 29731.00 @ 03:46 (prom 11.75) |
| WHY MEANINGFUL | HIGH: Sell-side liquidity area 29729.75–29731.00. A trader would mark this horizontal (2 confirmed meaningful swing lows). Still unswept. Associated with an earlier structure break at this price; held and released a 272.0 pt move — protected a significant swing. Same visible area: 1.25 pt shelf vs 13.00 pt pullback (ATR 20.70; band 1.95). Relative equality supports the area — it is not the reason it exists. Left low slightly below right (ICT failure swing). |
| WHY THIS vs NEARBY | This area is meaningful because it is a class-A shelf. Nearby 29731.75/29731.00 is not: Rejected as EQL: clearPoolVsNoise. Overlapping structure between the swings — not one clean horizontal pool. |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 272.0 pt move — protected a significant swing. Intraday liquidity from London session, not the active session (New York AM). |
| STATUS | ACTIVE (touched) |
| CONFIDENCE | HIGH (class A, 0.85) |
| SESSION / TF | London session · intraday |
| LAST vs AREA | last=29868.00 (Still actionable/relevant at T as resting liquidity.) |
| SWEEP | unswept |

Gates:

- confirmedSwing: PASS — Both swings confirmed after the right-wing bar closed.
- meaningfulVsPa: PASS — Both swings are meaningful vs surrounding PA (prominence 14.25 / 11.75 vs floor 5.17).
- genuineReturn: PASS — Second swing genuinely returned to the area after a 13.00 pt move away.
- visualRecognition: PASS — Visible separation in time/structure (12 bars between swings).
- clearPoolVsNoise: PASS — Clear pool vs random noise — visual class A.
- alreadySwept: PASS — Still unswept at T.
- relevantStructure: PASS — associated with an earlier structure break at this price; held and released a 272.0 pt move — protected a significant swing.
- actionableAtT: PASS — Still actionable/relevant at T as resting liquidity.
- relativeEquality: PASS — Same visible area: 1.25 pt shelf vs 13.00 pt pullback (ATR 20.70; band 1.95). Relative equality supports the area — it is not the reason it exists.
- visualClass: PASS — Visual class A — obvious repeated highs/lows a trader would mark.

## Noise check
- HIGH areas at last bar: 3
- HIGH that fail visual/meaning gates: **0**
- All HIGH areas are class A with explainable gates.
- Rejected set exists: **yes**
## Remaining gaps
- HTF context is inferred from swing span / session mix on 1m, not a separate 15m/1h structure engine.
- Visual class D (overlapping PD arrays / session highs) is conservative; some messy-but-real shelves may be rejected.
- Overlay still draws one representative line per area (backward compatible). The area band is on the research payload.
Last-bar as-of index 6879; NY AM as-of index 6518.