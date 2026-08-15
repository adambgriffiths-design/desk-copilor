# Decision Tracker — Event-Driven, Candle-Close Confirmed

**Objective:** No intrabar *official* verdict changes. Karen observes continuously but updates confirmed market state only on candle close or defined event triggers. Execution signals (e.g. FVG wick entry) may fire intrabar without changing the stable thesis.

## Principles

1. **Candle close or it didn't happen** — for structure, liquidity sweeps, MSS, displacement, bias shifts.
2. **Per-concept confirmation policy** — not one global rule (see `lib/confirmation-policy.ts`).
3. **Two layers:**
   - **Market state (slow):** confirmed observations → interpretation → verdict. Updates on bar close.
   - **Execution layer (fast):** intrabar wick/touch for entry criteria only. Never flips HTF bias or MSS without close.
4. **Event-driven, not tick-driven** — state machine moves on transitions, not every price print.
5. **Explain transitions** — AI narrates what changed (or "nothing changed"), not full re-analysis every bar.
6. **Voice:** echo state transitions only — calm, disciplined.

## Workflow

```
Market data (TV export + live print)
    ↓
Observation engine (continuous read)
    ↓
Pending events (intrabar hints — amber)
    ↓  [candle close OR policy-specific confirm]
Confirmed observations (green/red)
    ↓
Interpretation (meaning — unchanged rules)
    ↓
Decision engine (verdict — stable until confirm)
    ↓
State machine + timeline entry
```

## Confirmation policies

| Concept | Policy | Notes |
|---------|--------|-------|
| MSS | `candle_close` | Body close beyond swing |
| Liquidity sweep | `candle_close` | Wick through level; confirm on close beyond/ rejection per rules |
| Displacement | `candle_close` | Impulsive leg completes on close |
| FVG formation | `candle_close` | Gap confirmed when third candle closes |
| HTF bias / session | `candle_close` | Slow context |
| FVG entry (wick) | `intrabar_wick` | Touch FVG zone on wick — **execution only** |
| FVG entry (close) | `hybrid` | Prefer wick for entry alert; confirm fill on close |
| Invalidation | `candle_close` | MSS/FVG thesis break on body close |

## State machine

```
waiting
  → watching_liquidity (notable level approach)
  → liquidity_swept_pending (wick through — unconfirmed)
  → liquidity_swept_confirmed (close confirms)
  → mss_pending / mss_confirmed
  → waiting_for_retrace
  → entry_watching (intrabar — FVG zone touch)
  → entry_active (criteria met — execution layer)
  → invalidated (close through invalidation)
  → waiting (reset)
```

## UI — chart edge rail (not on-candle dot)

- **Slim rail** anchored to chart pane edge (price scale side) — does not cover candles.
- **Status strip:** green = stable / nothing changed; amber = pending or watching; red = setup triggered or invalidated.
- **Click rail** → expand **decision card** frozen at that timestamp + price + `state_hash`.
- **Card shows:** confirmed phase, HTF bias, last close time, official verdict, pending watches (clearly labeled *unconfirmed*).
- **Timeline scrubber** below card — replay "what did Karen think here?" from `decision-timeline` entries.

## API

`POST /api/desk-tracker`

- `chartSnapshot` — TV export (required for close confirm)
- `chartLastPrice` — live print (intrabar execution only)
- `candleClosed` — true when `lastBarTime` advanced
- `lastBarTime` — unix sec of last closed bar
- `freeze` — optional; user clicked rail to snapshot current card

Response: `{ phase, status_color, confirmed, pending, verdict, transition_brief, timeline_id, ... }`

## Voice

- Speak only on **phase transition** (not every poll).
- Pending events: optional quiet panel line, no TTS.
- Confirmed transition: one sentence — "Liquidity sweep confirmed at PDH. Waiting for retrace to FVG."

## Extension

- `extension/desk-tracker.js` — rail UI + bar-close watcher (poll `lastBarTime`, not price ticks).
- Persists timeline in `sessionStorage` (`dc-decision-timeline`).

## Tests

`npm run test:desk-tracker` — confirmation policies, state transitions, pending→confirmed on close.
