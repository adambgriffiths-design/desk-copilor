# KAREN — Weekend E2E historical UI analysis

**Date:** 2026-08-14T22:50:14.286Z
**Path:** extension → `historicalFixture` → `/api/chat/stream` → `answerHistoricalFixtureTurn` / `buildKarenReplayResponse`
**Mode:** HISTORICAL / FIXTURE — NOT LIVE
**Verdict:** **PASS**

## FIXTURE
- id: `synthetic-ny-am`
- barIndex: `50`
- asOf: `2026-08-12T14:20:00.000Z`
- UI label: `HISTORICAL / FIXTURE — NOT LIVE MARKET DATA`
- Enable in panel Dev tools: **Enable HISTORICAL / FIXTURE mode** (fixture + bar index)

## DECISION
```json
{
  "stance": "flat",
  "verdict": "WAIT",
  "thesis": {
    "what": "bearish structure continuation",
    "whyNow": "This resembles bearish structure continuation because No impulsive displacement detected in lookback. No unfilled FVG in lookback. Previous day high 25100.00 (UNTOUCHED — not confirmed swept), previous day low 24900.00. ",
    "timeframe": "1-minute",
    "toward": "24850.00",
    "fromWhere": "25009.00–25035.00",
    "invalidates": "This resembles bearish structure continuation because No impulsive displacement detected in lookback. No unfilled FVG in lookback. Previous day high 25100.00 (UNTOUCHED — not confirmed swept), previous day low 24900.00. I would consider SHORT because HTF bias bearish (bias_stack.",
    "complete": true
  },
  "conflicts": {
    "htfHorizon": "daily",
    "htfLean": "bearish",
    "tacticalHorizon": "1-minute",
    "tacticalLean": "bearish",
    "disagree": false,
    "ltfAgainstHtfAllowed": null,
    "why": "No conflict — higher-timeframe bearish agrees with primary-horizon bearish; stance is flat.",
    "target": "24850.00",
    "invalidation": "This resembles bearish structure continuation because No impulsive displacement detected in lookback. No unfilled FVG in lookback. Previous day high 25100.00 (UNTOUCHED — not confirmed swept), previous day low 24900.00. I would consider SHORT because HTF bias bearish (bias_stack."
  },
  "invalidation": {
    "price": "unknown",
    "condition": "This resembles bearish structure continuation because No impulsive displacement detected in lookback. No unfilled FVG in lookback. Previous day high 25100.00 (UNTOUCHED — not confirmed swept), previous day low 24900.00. I would consider SHORT because HTF bias bearish (bias_stack."
  },
  "evidenceFacts": "No impulsive displacement detected in lookback. No unfilled FVG in lookback. Previous day high 25100.00 (UNTOUCHED — not confirmed swept), previous day low 24900.00.",
  "interpretation": "This resembles bearish structure continuation because No impulsive displacement detected in lookback. No unfilled FVG in lookback. Previous day high 25100.00 (UNTOUCHED — not confirmed swept), previous day low 24900.00. I would consider SHORT because HTF bias bearish (bias_stack.tradeable_bias=bearish); Observed market structure is bearish. I rejected LONG because insufficient bullish confluence.",
  "decisionKey": "synthetic-ny-am@50|flat|WAIT|2026-08-12T14:20:00.000Z"
}
```

Primary reply preview:
```
HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
TRADE DECISION: FLAT — no trade justified on the 1-minute; execution no order — stay flat. MENTOR VIEW: HTF context is daily bearish; current structure on the 1-minute is bearish; conflict no.
```

## MENTOR CONSISTENCY
- Envelope stance used for spoken mentor line: `flat`
- Source: pipeline DecisionEnvelope (not `buildDeterministicKarenResponse`)

## FOLLOW-UP CONSISTENCY
| Question | Same decisionKey | HISTORICAL label | PREVIOUS DECISION |
|----------|------------------|------------------|-------------------|
| Why? | yes | yes | yes |
| Why not long? | yes | yes | yes |
| Why not short? | yes | yes | yes |
| What are you waiting for? | yes | yes | yes |

## LIVE/DATA ISOLATION
- Live intel cache unchanged: **yes**
- Live lastPipeline unchanged: **yes**
- Yahoo/Tickstream requested: **no** (fixture path)
- TradingView state: **not modified** (API path does not touch TV; extension historical mode omits chartLastPrice / chartSnapshot extras)
- General questions bypass market pipeline: what's the capital of germany?→bypass; tell me a joke→bypass; what is 2+2?→bypass

## TIME TO FIRST VISIBLE RESPONSE
- 2300 ms (fixture path / in-process; LIVE_LATENCY_TRACE dataMode=HISTORICAL_FIXTURE)

## TIME TO FINAL RESPONSE
- 2300 ms

## ERRORS
- none

## PASS/FAIL
**PASS**

### Follow-up previews
#### Why?
```
HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.
WAITING FOR: 
LONG CONDITION: not supported — no structured evidence
SHORT CONDITION: HTF bias bearish (bias_stack.tradeable_bias=bearish); Observed market structu
```

#### Why not long?
```
HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.
WHY NOT LONG: SHORT not forced — waiting for retrace/confirmation per entry model
CURRENT STANCE: FLAT — 1-minute bearish / daily bearish
WAITING FOR: 
LONG-SIDE E
```

#### Why not short?
```
HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.
WHY NOT SHORT: SHORT not forced — waiting for retrace/confirmation per entry model
CURRENT STANCE: FLAT — 1-minute bearish / daily bearish
WAITING FOR: 
SHORT-SIDE
```

#### What are you waiting for?
```
HISTORICAL / FIXTURE — NOT LIVE MARKET DATA
PREVIOUS DECISION — explaining the last spoken call, not a new snapshot.
WAITING FOR: 
LONG CONDITION: not supported — no structured evidence
SHORT CONDITION: HTF bias bearish (bias_stack.tradeable_bias=bearish); Observed market structu
```
