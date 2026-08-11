# Deploy (Next.js backend)

Desk Copilot’s Chrome extension talks to the Next.js API. Local dev uses `npm run dev`; production uses a hosted URL configured in the extension options page.

## Vercel

1. Push this repo to GitHub and import the project in [Vercel](https://vercel.com).
2. Set environment variable:
   - `OPENAI_API_KEY` — required for verdicts, chat, and transcription
3. Deploy. Note the production URL (e.g. `https://desk-copilot.vercel.app`).
4. In Chrome: **Desk Copilot extension → right-click icon → Options** → paste the URL (no trailing slash) → Save.
5. Reload TradingView tabs.

API routes already send `Access-Control-Allow-Origin: *` for extension fetches.

## Local development

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY
npm run dev
```

Leave extension API URL blank to probe `localhost:3001` and `localhost:3000`.

## Extension load

1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select the `extension/` folder.
2. After deploy or code changes, click **Reload** on the extension card.

## Notes

- Session logging (`data/session-log.jsonl`) writes to the server filesystem — ephemeral on Vercel unless you add external storage later.
- `LEARN_FROZEN=true` disables rule learning updates in production if desired.
