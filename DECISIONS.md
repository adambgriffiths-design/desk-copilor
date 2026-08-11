# Desk Copilot — Decision Log

## Phase 0 — Scope Lock (completed)

### Step 1 — Product definition
Discretionary ICT voice desk partner on TradingView. Reads live market structure and gives adaptive "potential buy/sell because…" briefs. Not auto-signals, not generic rules.

### Step 2 — Instrument
**MNQ** (Micro Nasdaq futures)

### Step 3 — Session
**NY AM** (~9:30–11:00 ET)

### Step 4 — Timeframe stack
| Layer | TF | Role |
|-------|-----|------|
| Bias | Daily | Direction |
| Structure | 15m | Context |
| Structure | 5m | Setup |
| Execution | 1m | Entry / calls |

### Step 5 — Decision model
**Full holistic ICT confluence** — not fixed 2–3 setup patterns.

Every brief uses all relevant context. Known concepts (growing list):
- 50% opening range gap must be used
- 25% of ORG
- Daily PD arrays
- Macro times
- Order blocks
- 50% wick gaps
- Session / kill zones
- Liquidity, structure, FVG, breakers, etc.

### Step 6 — Outcome scoring
**No backtest engine.** Copilot informs; trader decides.

Optional post-session: brief useful? yes / no / harmful.

Level-based trade management in briefs: entry trigger, invalidation, targets at liquidity/PD arrays, potential take / reduce / add.

### Step 7 — Validation threshold
**20 live NY AM sessions** before voice/UI — gut check, not automated win rate.

### Step 8 — Non-goals (v1)
- MNQ only
- NY AM only
- No auto-execution
- No fixed RR / backtest scoring
- No other language packs
- No app store until copilot feels solid

### Step 9 — Platform
TradingView via Chrome extension + webhooks. Voice connects to backend brain, not TV directly.

### Step 10–11 — Legal
Educational decision-support, not financial advice. Disclaimer drafted.

### Step 12 — API budget
~$30–100/mo during solo dev/testing.

### Step 13 — Commitment
2 hrs/day + machine on during NY AM.

### Step 14 — Kill criterion
After 20 sessions, if briefs mostly unhelpful/wrong → fix playbook/brain, not add features.

### Step 17 — Calendar
2 hrs/day blocked.

### Step 18 — Feedback
3 ICT traders — TBD (skip for now).

### Step 19 — Paper only
No real money until 20 sessions feel solid.

### Step 20 — GATE PASSED
Scope locked: MNQ · NY AM · D/15m/5m/1m · full ICT · no backtest engine.

**Phase 0 complete — 2026-08-11**

---

## Phase 1 — ICT Playbook (in progress)

### Step 21 — ICT glossary
**User concepts (v0.1):**

Core / structure:
- MSS (market structure shift)
- FVG (fair value gap)
- IVFVG
- FPFVG
- Breaker blocks
- Order blocks
- Liquidity raid
- Relative equal highs and lows
- Volume imbalances
- Liquidity void

Gaps / openings:
- NWOG (new week opening gap) — red lines on chart
- ORG (opening range gap) — **4:15 close → 6:30 open**
- 50% ORG = **CE (consequent encroachment)** — target / key level
- 25% ORG — code marks
- NDOGs (new day opening gaps)
- 50% wick gaps

Context:
- Daily PD arrays
- Macro times
- Session / kill zones
- Premium & discount
- Liquidity (resting + swept)
- MSS (not CHoCH — swing high/low body close through structure)
- Displacement
- OTE (optimal trade entry on fib) — code marks fib levels → LLM judges confluence
- **AMD** (accumulation, manipulation, distribution) — session cycle context

### Step 22 — Objective vs subjective
| Concept | Code / LLM |
|---------|------------|
| FVG, IVFVG, FPFVG | Code |
| NWOG, NDOGs | Code |
| 50% ORG, 25% ORG, 50% wick gap | Code marks → LLM judges "used" |
| OTE (fib) | Code marks → LLM judges confluence |
| Breaker / OB | Code candidate → LLM confirms |
| MSS, BOS | Mixed — MSS = swing closed above/below |
| Liquidity raid, relative EQH/EQL | Code |
| Volume imbalances, liquidity void | Code |
| Daily PD arrays | Code levels → LLM context |
| Macro times | Code (clock) |

*Step 23 next: kill zone times.*

### Step 23 — Kill zone & macro times (EST)
| Window | Time (EST) |
|--------|------------|
| Pre-NY | 7:00–9:00 |
| NY open | 9:30 |
| Macro | 9:50 |
| Macro | 10:10 |
| NY AM session (v1 focus) | 9:30–11:00 |

*Step 24 next: session levels (Asia/London/NY H/L).*

### Step 24 — Session levels
Track all:
- Asia H/L
- London H/L
- NY pre-market H/L
- Previous day H/L
- NWOG / NDOG levels

*Step 26 next: premium/discount definition.*

### Step 26 — Premium / discount
**Both — context dependent:**
- 50% of dealing range, and/or
- Relative to specific PD array / NWOG

LLM weighs which applies per brief.

*Step 27 next: liquidity sweep criteria.*

### Step 27 — Liquidity sweep
**Body close beyond level** (below for sell-side liquidity / above for buy-side).

*Step 28 next: valid FVG rules.*

### Step 28 — Valid FVG
Must be **unfilled**.

*Step 29 next: order block rules.*

### Step 29 — Order block
Last **down close before up move**, or last **up close before down move** (inverse for bearish).

*Step 30 next: BOS vs CHoCH on execution TF.*

### Step 30 — Structure (1m)
**No CHoCH.** Uses **MSS** only:
- Bullish MSS: swing high **body close above**
- Bearish MSS: swing low **body close below**

*Step 32 next: brief output template.*

### Step 32 — Brief output template
1. Bias (daily + 15m + 5m)
2. Context (PD, session levels, macro)
3. Setup (liquidity, MSS, FVG, OB, gaps, OTE)
4. Potential buy/sell because…
5. Trigger (if / wait for)
6. Invalidation
7. Targets (liquidity / PD arrays)
8. Management (take / reduce / add)
9. Confidence (low / med / high)

*Step 33 next: no-trade conditions.*

### Step 33 — No-trade conditions
- **Low confidence** → stand aside
- **Consolidation** → avoid (no verdict / wait)

### Step 34 — Example #1 (1m MNQ)
- NWOG (red lines) = resistance / raid
- ORG = 4:15 close → 6:30 open
- Relative equal lows (green) = liquidity
- Verdict: *potential buy* after sell-off, target **CE (50% ORG)**
- **User decides entry** — copilot gives verdicts at moments

### Step 35 — Example #2 (1m MNQ, ~9:30–10:45)
- ORG (blue box) — opened inside, dropped away
- **AMD:** manipulation (9:30–9:50 drop) → distribution (rally to ORG CE)
- Yellow **FVG** = potential buy zone (user entry area)
- Target: **CE of ORG** (blue midline)
- **Now:** consolidation at CE → **avoid / stand aside**

*Step 36: define AMD rules (user input).*

### Step 36 — AMD rules
- **A:** 7:00–9:00 pre-NY range
- **M:** ~9:30 Judas / sweep away from ORG
- **D:** 9:50–10:10 move to CE / target

---

## v0 Verdict Machine (built)

Location: `C:\Users\adamg\Projects\desk-copilot`

- `lib/playbook.ts` — ICT system prompt
- `app/page.tsx` — chart upload UI
- `app/api/verdict/route.ts` — GPT-4o vision API

Run: `npm install && npm run dev` (requires Node.js + OPENAI_API_KEY in `.env.local`)

### Step 36 — AMD rules
- **A:** 7:00–9:00 pre-NY range
- **M:** ~9:30 Judas / sweep away from ORG
- **D:** 9:50–10:10 move to CE / target

---

## v0 Verdict Machine (built)

Location: `C:\Users\adamg\Projects\desk-copilot`

- `lib/playbook.ts` — ICT system prompt
- `app/page.tsx` — chart upload UI
- `app/api/verdict/route.ts` — GPT-4o vision API

Run: `npm install && npm run dev` (requires Node.js + OPENAI_API_KEY in `.env.local`)

### Step 31 — Confluence checklist (every brief)
1. Daily bias + key levels
2. **15m confluence**
3. **5m confluence**
4. Premium/discount
5. Session levels (Asia/London/NY/prev day/NWOG)
6. Macro time (9:50 / 10:10)
7. Liquidity raid / EQH-EQL
8. MSS (1m)
9. FVG / IVFVG / FPFVG (unfilled)
10. OB / breaker
11. ORG 50% / 25%
12. Wick gaps
13. OTE fib
14. Volume imbalance / liquidity void

*Step 32 next: brief output template.*

### Step 25 — Daily bias
Determined by **key levels on the daily chart** (PD arrays, NWOG/NDOG, prev day H/L, etc.).

*Step 26 next: premium/discount definition.*
