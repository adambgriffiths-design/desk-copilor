# Karen ↔ ChatGPT (Chrome) — simple workflow

**Use Chrome ChatGPT for decisions. Use Cursor to do the work.**

---

## What you do (every loop)

### 1) Cursor finishes a research chunk
Cursor updates this file:

`data/research/KAREN-UI-BRIEF.md`

### 2) Open your Greeting exchange ChatGPT chat
In the repo terminal:

```bash
npm run karen:ui:chrome
```

That copies the brief and opens **your pinned Greeting exchange chat** (once configured).

**One-time setup:** open that chat in Chrome, copy the address bar URL (`https://chatgpt.com/c/...`), put it in:

`config/cloud/chatgpt-chrome.local.env`

```
KAREN_CHATGPT_CHAT_URL=https://chatgpt.com/c/YOUR-CHAT-ID
```

### 3) In that ChatGPT chat
1. Click the message box  
2. **Ctrl+V**  
3. Enter  

### 4) Back in Cursor
Copy ChatGPT’s **one next Cursor prompt** into this chat (or save it into `data/research/KAREN-UI-REPLY.md`).

Cursor runs that step.

### 5) Repeat

---

## Files (only these matter)

| File | What it is |
|------|------------|
| [KAREN-UI-BRIEF.md](./KAREN-UI-BRIEF.md) | What Cursor tells ChatGPT |
| [KAREN-UI-REPLY.md](./KAREN-UI-REPLY.md) | Optional place to save ChatGPT’s reply |
| [KAREN-OPEN-ME.md](./KAREN-OPEN-ME.md) | Clickable index of research docs |

Ignore API / “strategist” modes unless you ask for them later.

---

## Rules ChatGPT should keep

- Representation before unlock  
- Unlock PARKED  
- No VAL / HOLDOUT  
- One next Cursor prompt only  
