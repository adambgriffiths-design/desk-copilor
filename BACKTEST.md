# Backtest Training (fast path)

Live extension + screenshot predict mode is **too slow** for training. This replays **historical NY AM sessions** from Yahoo bar data in minutes.

**This is not a signal backtest engine** (per DECISIONS.md). It auto-grades past moments only to **train the copilot brain faster**.

**Backtest uses an LLM grader** — no fixed points, RR, or stop distances. Direction + ICT structure only. Stand-aside **misses** are not failures. The learn step also updates `data/learned-grader.json` so grading improves over runs.

---

## Run it

```powershell
cd C:\Users\adamg\Projects\desk-copilot
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm install
npm run backtest:dry    # see how many sessions/moments Yahoo has
npm run backtest        # full run (~2s per moment with gpt-4o-mini)
npm run backtest -- --max 12           # cap API calls (replay only — no auto-learn)
npm run backtest -- --force            # rerun all moments (v2 charts)
npm run learn                          # separate: learn from hand-graded feedback only
npm run dedupe-feedback                # manual dedupe only
```

Requires `OPENAI_API_KEY` in `.env.local`.

---

## What it does

1. Fetches MNQ 1m bars (7 days), 5m/15m (60d), daily (3mo)
2. For each NY AM session (9:30–11:00 ET), samples **6 checkpoints**:
   - 9:35, 9:45, 9:55, 10:05, 10:20, 10:40
3. Builds **point-in-time** ICT context (ORG, NWOG, sessions, FVGs)
4. Renders a **programmatic 1m chart PNG** (60 bars + ORG/CE/NWOG lines) and sends to vision model
5. Auto-grades when **thesis confirms or breaks** — not a fixed 30-bar window:
   - **Buy/sell MSS confirm:** body close must break swing by **5+ pts** AND be **12+ pts favorable** vs entry (no bar-1 noise wins)
   - **CE target:** body close through CE, not wick touch
   - **Stand aside:** chop/small range → **correct**; big move without a call → **miss** (not graded, not a failure)
   - **Buy/sell:** invalidation or opposing belief → **wrong** (actual failure)
   - Window runs until event or **NY AM end (11:00 ET)**
6. Appends results to `data/feedback.jsonl` with `note: backtest:v2|confidence:…`
7. **Dedupes** backtest rows by `chartTime` before each run; skips already-graded moments unless `--force`

---

## After a run

Backtest rows are **not** auto-fed into learning (reduces overfit). To update rules from **your** grades:

1. Grade charts in **predict mode** (wrong / partial + correction)
2. Click **Update brain** in the app or run `npm run learn`
3. Optional: set `LEARN_FROZEN=true` to pause updates; `LEARN_INCLUDE_BACKTEST_WRONG=true` to add replay wrongs

Then use **live extension** only for final gut-check sessions (20 NY AM target).

---

## Limits

| Limit | Why |
|-------|-----|
| Yahoo 1m ≈ 7 days | ~5–6 trading sessions max |
| No chart image | Trains on structure/facts; live still uses vision |
| Auto-grade ≠ ICT master | Directional proxy; failures feed learning loop |

For **longer history** (StrategyQuant / TradeStation CSV), we can add a CSV importer next — same replay loop, your own 1m files.

---

## API

`POST /api/backtest` with optional body:

```json
{ "dryRun": false, "maxMoments": 12, "forwardBars": 30, "model": "gpt-4o-mini" }
```
