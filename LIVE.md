# Live v1 — TradingView session

## Setup (5 min)

### 1. Start backend
```powershell
cd C:\Users\adamg\Projects\desk-copilot
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npm run dev
```

### 2. Load extension
1. Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select folder:
   `C:\Users\adamg\Projects\desk-copilot\extension`

### 3. Trade
1. Open **TradingView** → MNQ → **1m** chart
2. Panel appears bottom-right: **Desk Copilot**
3. **Get verdict** → captures chart, then analyzes (15–60 sec — wait for brief)
4. **👍 Good** or **👎 Wrong** (2 sec — this trains it)
5. Repeat during NY AM
6. **End session → update brain** when done

## Voice (Chrome extension v0.3)

1. Click **🎤 Voice off** → turns on mic listening
2. Say **"copilot"** or **"get verdict"** — captures chart + speaks brief (if Read aloud on)
3. Say **"good"** / **"wrong"** — rates last verdict hands-free
4. Say **"read brief"** — repeats Tradeable Bias + Verdict + Confidence aloud
5. Say **"stop listening"** — turns mic off

**Get verdict button:** opens the extension popup briefly (Chrome screenshot permission). If that fails, click the puzzle-piece icon → **Desk Copilot** once, then try again.

After updating extension files: `chrome://extensions` → **Reload** on Desk Copilot, then **refresh TradingView** (`Ctrl+Shift+R`). Skipping the refresh causes "Extension context invalidated".

## Live training loop

```
Get verdict → 👍/👎 → repeat
                    ↓
         👎 auto-saves to training
                    ↓
         End session → brain updates
```

No screenshots. No upload. No predict/reveal.

## Session log

`data/session-log.jsonl` — every live verdict + your ratings

## Tips

- Rate **every** verdict during session — that's your training data
- 👎 is enough; brain learns from down votes
- Run during **NY AM** for best MNQ context
- Keep `npm run dev` running in background
