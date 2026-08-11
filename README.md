# Desk Copilot

ICT desk partner for **MNQ** on TradingView — live levels, voice chat, chart reads.

## Quick start

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY
npm run dev
```

1. Chrome → `chrome://extensions` → Load unpacked → `extension/`
2. Open MNQ chart on TradingView
3. **Draw levels** · **Voice on** · ask *what do you see on the chart*

Health check: `npm run health`

Hosted backend: see [DEPLOY.md](DEPLOY.md). Set API URL in extension **Options**.

Full checklist: [CHECKLIST.md](CHECKLIST.md)

## Stack

- **Extension** — panel, voice (Whisper), level overlay, verdict screenshot
- **Next.js API** — market context, GPT briefs, transcribe, session log
- **Pine** — optional stable lines: `pine/desk-copilot-levels.pine`

Playbook & scope: `lib/playbook.ts`, `DECISIONS.md`
