# EQH/EQL importance diagnostic

Research only — production `lib/reh-rel.ts` / `lib/structure.ts` were not modified.

- **Dataset:** `data\research-fixtures\nq-week-aug05-aug12-2026-cme` (tickstream 229d1bea359bcc6777ff)
- **Bars:** 6880 × 1m, last 18:00 last=29829.25
- **Window:** 1785967200 → 1786572000
- **Question:** Can Karen distinguish meaningful liquidity from random similar highs/lows?
- **Not the question:** Did we detect more REH/EQL?

## How importance is classified

Every pool gets LOW / MEDIUM / HIGH from weighted factors. Distance, touch count, and age cannot decide the grade alone. HIGH requires strong swing quality plus equality and (visibility or structure), and cannot be awarded to swept pools.

- **swingQuality:** 18%
- **equality:** 12%
- **visibility:** 14%
- **structural:** 26%
- **marketRelevance:** 8%
- **magnet:** 6%
- **age:** 4%
- **touches:** 8%
- **session:** 4%
- **distance:** reported only (weight 0)

## 1m replay @ New York AM (2026-08-12 10:59, last=29868.00)

Best window for unswept resting liquidity. HIGH 3 · MEDIUM 16 · LOW 10 · ACTIVE 3 · SWEPT 26. PIT leak: **none**.

### EQL 29646.75 — HIGH (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29646.75 |
| TYPE | EQL |
| IMPORTANCE | HIGH (score 80.7, confidence 0.74) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity. |
| CONTRIBUTING SWINGS | 29646.75 @ 21:35 (prom 13.50); 29646.75 @ 21:58 (prom 20.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing. |
| DISTANCE | 221.25 pts from last 29868.00 (221.25 pts away (10.69 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | Asia session · htf |
| FORMATION TIME | 22:00 (1786500000) |
| CONFIRMATION TIME | 22:00 (1786500000) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 16.88 vs ATR 20.70).
- equality: 100 (weight 12%) — Exact equals after tick snap.
- visibility: 88 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing.
- marketRelevance: 65 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 221.25 pts away (10.69 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant sell-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 221.25 pts away (10.69 ATR) — distant, not a near-term interaction.
- age: 55 (weight 4%) — Older unswept liquidity (13.0 h) — age does not invalidate it.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 221.25 pts away (10.69 ATR) — distant, not a near-term interaction.

### EQL 29606.25 — HIGH (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29606.25 |
| TYPE | EQL |
| IMPORTANCE | HIGH (score 75.2, confidence 0.66) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing lows, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity. Left low slightly below right (ICT failure swing). |
| CONTRIBUTING SWINGS | 29606.25 @ 15:25 (prom 12.00); 29607.00 @ 15:50 (prom 27.75) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 395.5 pt move — protected a significant swing. |
| DISTANCE | 261.75 pts from last 29868.00 (261.75 pts away (12.65 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | New York PM · htf |
| FORMATION TIME | 15:52 (1786477920) |
| CONFIRMATION TIME | 15:52 (1786477920) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 19.88 vs ATR 20.70).
- equality: 63 (weight 12%) — Nearly the same price (3 of 8 ticks).
- visibility: 81 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 395.5 pt move — protected a significant swing.
- marketRelevance: 65 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 261.75 pts away (12.65 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant sell-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 261.75 pts away (12.65 ATR) — distant, not a near-term interaction.
- age: 55 (weight 4%) — Older unswept liquidity (19.1 h) — age does not invalidate it.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 261.75 pts away (12.65 ATR) — distant, not a near-term interaction.

### EQL 29729.75 — HIGH (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29729.75 |
| TYPE | EQL |
| IMPORTANCE | HIGH (score 67.2, confidence 0.66) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing lows, meaningful structural relevance, still unswept. Left low slightly below right (ICT failure swing). |
| CONTRIBUTING SWINGS | 29729.75 @ 03:34 (prom 14.25); 29731.00 @ 03:46 (prom 11.75) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 272.0 pt move — protected a significant swing. |
| DISTANCE | 138.25 pts from last 29868.00 (138.25 pts away (6.68 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (touched) |
| SESSION / TF | London session · intraday |
| FORMATION TIME | 03:48 (1786520880) |
| CONFIRMATION TIME | 03:48 (1786520880) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 86 (weight 18%) — Confirmed significant swing lows (avg prominence 13.00 vs ATR 20.70).
- equality: 38 (weight 12%) — Loose relative equality (5 of 8 ticks) — similar, not tight.
- visibility: 65 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 272.0 pt move — protected a significant swing.
- marketRelevance: 59 (weight 8%) — still active (tagged, not swept). Intraday liquidity from London session, not the active session (New York AM). 138.25 pts away (6.68 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant sell-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 138.25 pts away (6.68 ATR) — distant, not a near-term interaction.
- age: 62 (weight 4%) — Same-session age (7.2 h) — still in play.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Intraday liquidity from London session, not the active session (New York AM).
- distance: 20 (reported, not weighted) — 138.25 pts away (6.68 ATR) — distant, not a near-term interaction.

### EQH 29654.25 — MEDIUM (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29654.25 |
| TYPE | EQH |
| IMPORTANCE | MEDIUM (score 73.7, confidence 0.75) |
| WHY IT MATTERS | MEDIUM: 3 confirmed significant swing highs, at nearly the same price, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity, multiple meaningful reactions. |
| CONTRIBUTING SWINGS | 29653.75 @ 18:40 (prom 15.00); 29654.25 @ 19:01 (prom 8.50); 29654.25 @ 19:29 (prom 16.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 29.8 pt move — protected a significant swing. |
| DISTANCE | -213.75 pts from last 29868.00 (213.75 pts away (10.33 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Asia session · htf |
| FORMATION TIME | 19:03 (1786489380) |
| CONFIRMATION TIME | 19:31 (1786491060) |
| SWEEP | 29661.50 at 19:50 |
| SWEEP REACTION | yes — Sweep then closed back through 29654.25 (28.25 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 87 (weight 18%) — Confirmed significant swing highs (avg prominence 13.25 vs ATR 20.70).
- equality: 75 (weight 12%) — Nearly the same price (2 of 8 ticks).
- visibility: 94 (weight 14%) — Visible liquidity cluster — 3 meaningful reactions, clean swing separation.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 29.8 pt move — protected a significant swing.
- marketRelevance: 15 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 213.75 pts away (10.33 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting buy-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 15.5 h before T — sweep does not erase that it was real liquidity.
- touches: 85 (weight 8%) — 3 meaningful reactions at the cluster — strengthens visibility.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 213.75 pts away (10.33 ATR) — distant, not a near-term interaction.

### EQH 29676.50 — MEDIUM (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29676.50 |
| TYPE | EQH |
| IMPORTANCE | MEDIUM (score 72.1, confidence 0.66) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing highs, at nearly the same price, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left high slightly above right (ICT priming). |
| CONTRIBUTING SWINGS | 29676.50 @ 16:29 (prom 11.50); 29676.00 @ 20:24 (prom 17.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 37.0 pt move — protected a significant swing. |
| DISTANCE | -191.50 pts from last 29868.00 (191.50 pts away (9.25 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 20:26 (1786494360) |
| CONFIRMATION TIME | 20:26 (1786494360) |
| SWEEP | 29680.00 at 20:35 |
| SWEEP REACTION | yes — Sweep then closed back through 29676.50 (24.50 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 91 (weight 18%) — Confirmed significant swing highs (avg prominence 14.38 vs ATR 20.70).
- equality: 75 (weight 12%) — Nearly the same price (2 of 8 ticks).
- visibility: 83 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 37.0 pt move — protected a significant swing.
- marketRelevance: 23 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 191.50 pts away (9.25 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting buy-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 14.6 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 191.50 pts away (9.25 ATR) — distant, not a near-term interaction.

### EQH 29614.75 — MEDIUM (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29614.75 |
| TYPE | EQH |
| IMPORTANCE | MEDIUM (score 72.0, confidence 0.65) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing highs, at nearly the same price, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left high slightly above right (ICT priming). |
| CONTRIBUTING SWINGS | 29614.75 @ 14:13 (prom 10.25); 29614.50 @ 15:14 (prom 23.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 12.5 pt move — protected a significant swing. |
| DISTANCE | -253.25 pts from last 29868.00 (253.25 pts away (12.24 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | New York PM · htf |
| FORMATION TIME | 15:16 (1786475760) |
| CONFIRMATION TIME | 15:16 (1786475760) |
| SWEEP | 29615.75 at 15:19 |
| SWEEP REACTION | yes — Sweep then closed back through 29614.75 (12.50 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing highs (avg prominence 16.75 vs ATR 20.70).
- equality: 88 (weight 12%) — Nearly the same price (1 of 8 ticks).
- visibility: 86 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 80 (weight 26%) — associated with an earlier structure break at this price; held and released a 12.5 pt move — protected a significant swing.
- marketRelevance: 15 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 253.25 pts away (12.24 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting buy-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 19.7 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 253.25 pts away (12.24 ATR) — distant, not a near-term interaction.

### EQH 29792.50 — MEDIUM (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29792.50 |
| TYPE | EQH |
| IMPORTANCE | MEDIUM (score 70.8, confidence 0.66) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing highs, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left high slightly above right (ICT priming). |
| CONTRIBUTING SWINGS | 29792.50 @ 10:08 (prom 27.50); 29791.75 @ 10:16 (prom 51.75) |
| STRUCTURAL CONTEXT | near a bullish market structure shift at 29799.50; held and released a 259.0 pt move — protected a significant swing. |
| DISTANCE | -75.50 pts from last 29868.00 (75.50 pts away (3.65 ATR) — still in play as a range objective.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | New York AM · htf |
| FORMATION TIME | 10:18 (1786457880) |
| CONFIRMATION TIME | 10:18 (1786457880) |
| SWEEP | 29793.00 at 10:51 |
| SWEEP REACTION | yes — Sweep then closed back through 29792.50 (27.25 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing highs (avg prominence 39.63 vs ATR 20.70).
- equality: 63 (weight 12%) — Nearly the same price (3 of 8 ticks).
- visibility: 81 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — near a bullish market structure shift at 29799.50; held and released a 259.0 pt move — protected a significant swing.
- marketRelevance: 20 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 75.50 pts away (3.65 ATR) — still in play as a range objective.
- magnet: 18 (weight 6%) — Already swept — no longer resting buy-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 24.7 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 40 (reported, not weighted) — 75.50 pts away (3.65 ATR) — still in play as a range objective.

### EQH 29695.50 — MEDIUM (1m @ NY AM)

| Field | Value |
| --- | --- |
| PRICE | 29695.50 |
| TYPE | EQH |
| IMPORTANCE | MEDIUM (score 70.0, confidence 0.66) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing highs, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left high slightly above right (ICT priming). |
| CONTRIBUTING SWINGS | 29695.50 @ 11:44 (prom 25.75); 29694.50 @ 22:41 (prom 8.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 27.3 pt move — protected a significant swing. |
| DISTANCE | -172.50 pts from last 29868.00 (172.50 pts away (8.33 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 22:43 (1786502580) |
| CONFIRMATION TIME | 22:43 (1786502580) |
| SWEEP | 29695.75 at 22:47 |
| SWEEP REACTION | yes — Sweep then closed back through 29695.50 (6.50 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing highs (avg prominence 17.00 vs ATR 20.70).
- equality: 50 (weight 12%) — Loose relative equality (4 of 8 ticks) — similar, not tight.
- visibility: 78 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 27.3 pt move — protected a significant swing.
- marketRelevance: 23 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 172.50 pts away (8.33 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting buy-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 12.3 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 172.50 pts away (8.33 ATR) — distant, not a near-term interaction.


## 1m replay @ last bar (18:00)

End of sample — most equal highs/lows in the lookback have already been taken. HIGH 2 · MEDIUM 11 · LOW 2 · ACTIVE 2 · SWEPT 13

### EQL 29646.75 — HIGH (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29646.75 |
| TYPE | EQL |
| IMPORTANCE | HIGH (score 80.7, confidence 0.74) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity. |
| CONTRIBUTING SWINGS | 29646.75 @ 21:35 (prom 13.50); 29646.75 @ 21:58 (prom 20.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing. |
| DISTANCE | 182.50 pts from last 29829.25 (182.50 pts away (30.88 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | Asia session · htf |
| FORMATION TIME | 22:00 (1786500000) |
| CONFIRMATION TIME | 22:00 (1786500000) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 16.88 vs ATR 5.91).
- equality: 100 (weight 12%) — Exact equals after tick snap.
- visibility: 88 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 355.0 pt move — protected a significant swing.
- marketRelevance: 65 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 182.50 pts away (30.88 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant sell-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 182.50 pts away (30.88 ATR) — distant, not a near-term interaction.
- age: 55 (weight 4%) — Older unswept liquidity (20.0 h) — age does not invalidate it.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 182.50 pts away (30.88 ATR) — distant, not a near-term interaction.

### EQH 29932.00 — HIGH (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29932.00 |
| TYPE | EQH |
| IMPORTANCE | HIGH (score 72.6, confidence 0.66) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing highs, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity. |
| CONTRIBUTING SWINGS | 29931.50 @ 10:46 (prom 40.50); 29932.00 @ 14:41 (prom 23.75) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 127.5 pt move — protected a significant swing. |
| DISTANCE | 102.75 pts from last 29829.25 (102.75 pts away (17.38 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 14:43 (1786560180) |
| CONFIRMATION TIME | 14:43 (1786560180) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing highs (avg prominence 32.13 vs ATR 5.91).
- equality: 33 (weight 12%) — Loose relative equality (2 of 3 ticks) — similar, not tight.
- visibility: 75 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 127.5 pt move — protected a significant swing.
- marketRelevance: 73 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 102.75 pts away (17.38 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant buy-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 102.75 pts away (17.38 ATR) — distant, not a near-term interaction.
- age: 62 (weight 4%) — Same-session age (3.3 h) — still in play.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 102.75 pts away (17.38 ATR) — distant, not a near-term interaction.

### EQL 29879.00 — MEDIUM (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29879.00 |
| TYPE | EQL |
| IMPORTANCE | MEDIUM (score 77.4, confidence 0.73) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. |
| CONTRIBUTING SWINGS | 29879.00 @ 12:46 (prom 17.75); 29879.00 @ 15:14 (prom 15.75) |
| STRUCTURAL CONTEXT | near a bullish market structure shift at 29880.75; held and released a 27.0 pt move — protected a significant swing. |
| DISTANCE | -49.75 pts from last 29829.25 (49.75 pts away (8.42 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 15:16 (1786562160) |
| CONFIRMATION TIME | 15:16 (1786562160) |
| SWEEP | 29875.75 at 15:20 |
| SWEEP REACTION | yes — Sweep produced 11.25 pts of displacement after the take. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 16.75 vs ATR 5.91).
- equality: 100 (weight 12%) — Exact equals after tick snap.
- visibility: 88 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — near a bullish market structure shift at 29880.75; held and released a 27.0 pt move — protected a significant swing.
- marketRelevance: 23 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 49.75 pts away (8.42 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting sell-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 2.7 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 49.75 pts away (8.42 ATR) — distant, not a near-term interaction.

### EQL 29695.25 — MEDIUM (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29695.25 |
| TYPE | EQL |
| IMPORTANCE | MEDIUM (score 76.6, confidence 0.73) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. |
| CONTRIBUTING SWINGS | 29695.25 @ 23:08 (prom 11.25); 29695.25 @ 23:24 (prom 7.50) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 306.5 pt move — protected a significant swing; inside the Asia range. |
| DISTANCE | 134.00 pts from last 29829.25 (134.00 pts away (22.67 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Asia session · htf |
| FORMATION TIME | 23:26 (1786505160) |
| CONFIRMATION TIME | 23:26 (1786505160) |
| SWEEP | 29694.50 at 23:38 |
| SWEEP REACTION | yes — Sweep then closed back through 29695.25 (6.00 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 9.38 vs ATR 5.91).
- equality: 100 (weight 12%) — Exact equals after tick snap.
- visibility: 88 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 306.5 pt move — protected a significant swing; inside the Asia range.
- marketRelevance: 23 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 134.00 pts away (22.67 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting sell-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 18.6 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 134.00 pts away (22.67 ATR) — distant, not a near-term interaction.

### EQL 29762.75 — MEDIUM (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29762.75 |
| TYPE | EQL |
| IMPORTANCE | MEDIUM (score 76.6, confidence 0.73) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. |
| CONTRIBUTING SWINGS | 29762.75 @ 04:06 (prom 14.50); 29762.75 @ 04:34 (prom 13.75) |
| STRUCTURAL CONTEXT | held and released a 239.0 pt move — protected a significant swing; inside the Asia range. |
| DISTANCE | 66.50 pts from last 29829.25 (66.50 pts away (11.25 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (swept) |
| SESSION / TF | London session · intraday |
| FORMATION TIME | 04:36 (1786523760) |
| CONFIRMATION TIME | 04:36 (1786523760) |
| SWEEP | 29750.25 at 08:30 |
| SWEEP REACTION | yes — Sweep then closed back through 29762.75 (197.25 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 14.13 vs ATR 5.91).
- equality: 100 (weight 12%) — Exact equals after tick snap.
- visibility: 88 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — held and released a 239.0 pt move — protected a significant swing; inside the Asia range.
- marketRelevance: 23 (weight 8%) — already swept — less relevant as resting liquidity. Intraday liquidity from London session, not the active session (Asia session). 66.50 pts away (11.25 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting sell-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 13.4 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Intraday liquidity from London session, not the active session (Asia session).
- distance: 20 (reported, not weighted) — 66.50 pts away (11.25 ATR) — distant, not a near-term interaction.

### EQH 29823.25 — MEDIUM (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29823.25 |
| TYPE | EQH |
| IMPORTANCE | MEDIUM (score 72.0, confidence 0.66) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing highs, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left high slightly above right (ICT priming). |
| CONTRIBUTING SWINGS | 29823.25 @ 16:37 (prom 9.75); 29823.00 @ 16:52 (prom 10.00) |
| STRUCTURAL CONTEXT | near a bullish market structure shift at 29823.00; held and released a 18.8 pt move — protected a significant swing; inside the Asia range. |
| DISTANCE | -6.00 pts from last 29829.25 (6.00 pts away (1.02 ATR).) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Overnight · intraday |
| FORMATION TIME | 16:54 (1786568040) |
| CONFIRMATION TIME | 16:54 (1786568040) |
| SWEEP | 29830.75 at 18:00 |
| SWEEP REACTION | no — Sweep printed but no meaningful displacement or close-back yet (as of T). |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing highs (avg prominence 9.88 vs ATR 5.91).
- equality: 67 (weight 12%) — Nearly the same price (1 of 3 ticks).
- visibility: 82 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — near a bullish market structure shift at 29823.00; held and released a 18.8 pt move — protected a significant swing; inside the Asia range.
- marketRelevance: 28 (weight 8%) — already swept — less relevant as resting liquidity. Intraday liquidity from Overnight, not the active session (Asia session). 6.00 pts away (1.02 ATR).
- magnet: 18 (weight 6%) — Already swept — no longer resting buy-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 1.1 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 50 (weight 4%) — Intraday liquidity from Overnight, not the active session (Asia session).
- distance: 65 (reported, not weighted) — 6.00 pts away (1.02 ATR).

### EQL 29634.00 — MEDIUM (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29634.00 |
| TYPE | EQL |
| IMPORTANCE | MEDIUM (score 71.0, confidence 0.66) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing lows, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left low slightly below right (ICT failure swing). |
| CONTRIBUTING SWINGS | 29634.00 @ 18:46 (prom 13.75); 29634.25 @ 19:48 (prom 27.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 367.8 pt move — protected a significant swing. |
| DISTANCE | 195.25 pts from last 29829.25 (195.25 pts away (33.03 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | Asia session · htf |
| FORMATION TIME | 19:50 (1786492200) |
| CONFIRMATION TIME | 19:50 (1786492200) |
| SWEEP | 29626.00 at 20:01 |
| SWEEP REACTION | yes — Sweep then closed back through 29634.00 (24.25 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 20.50 vs ATR 5.91).
- equality: 67 (weight 12%) — Nearly the same price (1 of 3 ticks).
- visibility: 82 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 367.8 pt move — protected a significant swing.
- marketRelevance: 15 (weight 8%) — already swept — less relevant as resting liquidity. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 195.25 pts away (33.03 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting sell-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 22.2 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 195.25 pts away (33.03 ATR) — distant, not a near-term interaction.

### EQL 29901.25 — MEDIUM (1m @ last)

| Field | Value |
| --- | --- |
| PRICE | 29901.25 |
| TYPE | EQL |
| IMPORTANCE | MEDIUM (score 71.0, confidence 0.66) |
| WHY IT MATTERS | MEDIUM: Two confirmed significant swing lows, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, already swept — preserved as history, less relevant as resting liquidity. Left low slightly below right (ICT failure swing). |
| CONTRIBUTING SWINGS | 29901.25 @ 13:30 (prom 14.75); 29901.50 @ 13:55 (prom 20.25) |
| STRUCTURAL CONTEXT | near a bearish market structure shift at 29901.50; held and released a 30.8 pt move — protected a significant swing. |
| DISTANCE | -72.00 pts from last 29829.25 (72.00 pts away (12.18 ATR) — distant, not a near-term interaction.) |
| STATUS | SWEPT (closed_through) |
| SESSION / TF | New York PM · intraday |
| FORMATION TIME | 13:57 (1786557420) |
| CONFIRMATION TIME | 13:57 (1786557420) |
| SWEEP | 29899.50 at 14:03 |
| SWEEP REACTION | yes — Sweep then closed back through 29901.25 (17.25 pts) — reaction, not a blank run. |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 17.50 vs ATR 5.91).
- equality: 67 (weight 12%) — Nearly the same price (1 of 3 ticks).
- visibility: 82 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — near a bearish market structure shift at 29901.50; held and released a 30.8 pt move — protected a significant swing.
- marketRelevance: 15 (weight 8%) — already swept — less relevant as resting liquidity. Intraday liquidity from New York PM, not the active session (Asia session). 72.00 pts away (12.18 ATR) — distant, not a near-term interaction.
- magnet: 18 (weight 6%) — Already swept — no longer resting sell-side liquidity. Not a current magnet.
- age: 50 (weight 4%) — Formed 4.0 h before T — sweep does not erase that it was real liquidity.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 50 (weight 4%) — Intraday liquidity from New York PM, not the active session (Asia session).
- distance: 20 (reported, not weighted) — 72.00 pts away (12.18 ATR) — distant, not a near-term interaction.


## 15m higher-timeframe replay

HIGH 1 · MEDIUM 0 · LOW 0 · ACTIVE 1 · SWEPT 0

### EQL 29533.00 — HIGH (15m)

| Field | Value |
| --- | --- |
| PRICE | 29533.00 |
| TYPE | EQL |
| IMPORTANCE | HIGH (score 78.5, confidence 0.66) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing lows, at nearly the same price, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity. Left low slightly below right (ICT failure swing). |
| CONTRIBUTING SWINGS | 29533.00 @ 03:00 (prom 59.50); 29533.50 @ 14:15 (prom 107.25) |
| STRUCTURAL CONTEXT | associated with an earlier structure break at this price; held and released a 468.8 pt move — protected a significant swing. |
| DISTANCE | 296.25 pts from last 29829.25 (296.25 pts away (8.86 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 14:45 (1786473900) |
| CONFIRMATION TIME | 14:45 (1786473900) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 83.38 vs ATR 33.43).
- equality: 75 (weight 12%) — Nearly the same price (2 of 8 ticks).
- visibility: 83 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — associated with an earlier structure break at this price; held and released a 468.8 pt move — protected a significant swing.
- marketRelevance: 73 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 296.25 pts away (8.86 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant sell-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 296.25 pts away (8.86 ATR) — distant, not a near-term interaction.
- age: 55 (weight 4%) — Older unswept liquidity (27.3 h) — age does not invalidate it.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 296.25 pts away (8.86 ATR) — distant, not a near-term interaction.


## Point-in-time mid-sample

Cutoff bar 3784 (11:25, last=29764.25).
Pools: HIGH 2 · MEDIUM 12 · LOW 14 · ACTIVE 2 · SWEPT 26. Future bars after this T are not used. Confirmation timestamps after cutoff: **none**.

### EQH 29984.00 — HIGH (1m @ mid T)

| Field | Value |
| --- | --- |
| PRICE | 29984.00 |
| TYPE | EQH |
| IMPORTANCE | HIGH (score 83.7, confidence 0.66) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing highs, at nearly the same price, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity, plausible buy-side liquidity (not a guaranteed target). Left high slightly above right (ICT priming). |
| CONTRIBUTING SWINGS | 29984.00 @ 03:45 (prom 29.75); 29983.75 @ 05:11 (prom 11.00) |
| STRUCTURAL CONTEXT | sits at the lookback swing high (structural buy-side); associated with an earlier structure break at this price; held and released a 265.3 pt move — protected a significant swing. |
| DISTANCE | 219.75 pts from last 29764.25 (219.75 pts away (12.18 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 05:13 (1786353180) |
| CONFIRMATION TIME | 05:13 (1786353180) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing highs (avg prominence 20.38 vs ATR 18.04).
- equality: 88 (weight 12%) — Nearly the same price (1 of 8 ticks).
- visibility: 86 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 92 (weight 26%) — sits at the lookback swing high (structural buy-side); associated with an earlier structure break at this price; held and released a 265.3 pt move — protected a significant swing.
- marketRelevance: 73 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 219.75 pts away (12.18 ATR) — distant, not a near-term interaction.
- magnet: 62 (weight 6%) — Resting buy-side liquidity at the lookback extreme — plausible higher-timeframe objective, not a guaranteed target.
- age: 62 (weight 4%) — Same-session age (6.2 h) — still in play.
- touches: 55 (weight 8%) — 2 meaningful swing highs in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 219.75 pts away (12.18 ATR) — distant, not a near-term interaction.

### EQL 29667.75 — HIGH (1m @ mid T)

| Field | Value |
| --- | --- |
| PRICE | 29667.75 |
| TYPE | EQL |
| IMPORTANCE | HIGH (score 75.0, confidence 0.66) |
| WHY IT MATTERS | HIGH: Two confirmed significant swing lows, within a relative-equality band, visible liquidity cluster, meaningful structural relevance, still unswept higher-timeframe liquidity. Left low slightly below right (ICT failure swing). |
| CONTRIBUTING SWINGS | 29667.75 @ 10:52 (prom 59.00); 29668.75 @ 12:31 (prom 52.25) |
| STRUCTURAL CONTEXT | held and released a 316.3 pt move — protected a significant swing. |
| DISTANCE | 96.50 pts from last 29764.25 (96.50 pts away (5.35 ATR) — distant, not a near-term interaction.) |
| STATUS | ACTIVE (active) |
| SESSION / TF | Multiple sessions · htf |
| FORMATION TIME | 12:33 (1786120380) |
| CONFIRMATION TIME | 12:33 (1786120380) |
| SWEEP | unswept |
| SWEEP REACTION | n/a |

Factor breakdown:

- swingQuality: 100 (weight 18%) — Confirmed significant swing lows (avg prominence 55.63 vs ATR 18.04).
- equality: 50 (weight 12%) — Loose relative equality (4 of 8 ticks) — similar, not tight.
- visibility: 78 (weight 14%) — Two (or more) obvious swing reactions with a real pullback between them.
- structural: 88 (weight 26%) — held and released a 316.3 pt move — protected a significant swing.
- marketRelevance: 78 (weight 8%) — still unswept. Higher-timeframe / multi-session liquidity — listed separately from current-session noise. 96.50 pts away (5.35 ATR) — distant, not a near-term interaction.
- magnet: 28 (weight 6%) — Distant sell-side liquidity; relevant as higher-timeframe context, not a near-term magnet. 96.50 pts away (5.35 ATR) — distant, not a near-term interaction.
- age: 50 (weight 4%) — Multi-session unswept liquidity (70.9 h) — treated as higher-timeframe rest, not discarded.
- touches: 55 (weight 8%) — 2 meaningful swing lows in the cluster.
- session: 70 (weight 4%) — Higher-timeframe / multi-session liquidity — listed separately from current-session noise.
- distance: 20 (reported, not weighted) — 96.50 pts away (5.35 ATR) — distant, not a near-term interaction.


## Noise check

- HIGH pools across NY AM / last / mid / 15m: 8
- HIGH pools that look like noise (weak swings / noisy why): **0**
- All HIGH pools have explainable swing quality and a human-readable why.

## Verdict

HIGH pools are explainable. Ranking is not "more equals"; it is "why this liquidity matters." Swept history stays marked SWEPT instead of being deleted.

Last-bar as-of index 6879; NY AM as-of index 6518.
