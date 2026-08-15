# Desk Copilot v1.4.51 — Stabilization Smoke Test (~5 min)

Use this after reloading the TradingView extension (manifest **1.4.51**) with backend running.

**v1.4.51 change:** Casual conversation defaults to streaming LLM with memory — not phrase-matched canned replies. Only pure greetings, farewells, and explicit live-data lookups (weather, stock prices) bypass the stream.

## Setup (30 sec)

1. Open TradingView chart (MNQ or NQ futures).
2. Open Karen panel → confirm **Karen online**.
3. Enable voice if testing mic (Hearing panel visible).

---

## Casual LLM — must NOT say "Couldn't pull live data"

| # | Say or type | Expect |
|---|-------------|--------|
| 1 | **Tell me about yourself** | Karen persona intro (desk co-pilot). Streams — not canned. No web-search ack. |
| 2 | **What is your favorite food?** | Specific food opinion from Karen. Not pizza pivot, not live-data error. |
| 2b | **Hi, what is your favourite food?** | Answers food preference — **not** canned greeting-only reply. |
| 2c | **Hi, what is your favourite city?** | Answers with a city opinion — **not** "How's yours?" only. |
| 2d | **Do you like KFC?** | Specific KFC opinion (original recipe, etc.). |
| 3 | **Hi, my name's Adam** | Karen remembers name; warm greeting with "Adam". |
| 4 | **What's the market doing right now?** | Live **market snapshot** (price, bias, levels). Not food/pizza. |
| 5 | **What is the chart doing right now?** | Chart **status snapshot** (price + bias). Not full screenshot read. |

---

## Live data (weather only when explicit)

| # | Say or type | Expect |
|---|-------------|--------|
| 6 | **Hey, what's the weather in London?** | Live weather lookup — **not** greeting-only reply. |
| 7 | **weather in Telford Shropshire** | Web lookup (temp/conditions). **Not** "which region?" |
| 8 | **weather in Telford** (bare) | Asks which city/region **or** uses memory if you live in Telford. |
| 9 | Ask #7 again, then **weather in Birmingham** | Second query works (no stuck live-data error). |
| 10 | Repeat #6 via **voice** | Spoken reply matches chat bubble (same facts). |

---

## General knowledge (LLM, not web)

| # | Say or type | Expect |
|---|-------------|--------|
| 11 | **What is the capital of France?** | Helpful answer from LLM. **Not** "Couldn't pull live data". |
| 12 | **Tell me about the Roman Empire** | Brief informative answer. No live-data error. |

---

## Voice quality

| # | Test | Expect |
|---|------|--------|
| 13 | **Tell me a joke** twice in a row | Second joke plays (not skipped as duplicate). |
| 14 | **Hi** (voice, alone) | Short greeting instant or stream. |
| 15 | Say **yes** right after Karen speaks | Quick ack; mic stays live. |

---

## Quick pass / fail

- [ ] Persona/opinion questions stream — no live-data fallback
- [ ] Hi + question gets real answer (not greeting-only)
- [ ] KFC / favorite food get opinions
- [ ] Telford + Shropshire weather searches work
- [ ] General knowledge (capital of France) — no live-data error
- [ ] Market/chart status still use snapshot paths
- [ ] Voice = chat for weather and casual

**Pass:** All checked. **Fail:** Note exact phrase + reply; run `npm run test:regression`.

---

## Automated checks (dev)

```bash
npm run test:routing
npm run test:scoped
npm run test:voice
npm run test:regression
```

## Routing debug (optional)

1. Extension options → enable **Show routing debug in panel**
2. Reload TradingView — context strip shows `route: casual · stream` (etc.) on each message
3. Add new phrases to `data/routing-golden.csv` when you find a misroute

All three should exit 0 before shipping.
