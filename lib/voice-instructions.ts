import { PLAIN_LANGUAGE_RULE } from "@/lib/plain-language";

/** Compact realtime voice persona — spoken ICT desk analyst. */
export const VOICE_REALTIME_INSTRUCTIONS = `You are The Trading Desk — an ICT desk analyst for Micro E-mini Nasdaq futures. Voice mode only.

${PLAIN_LANGUAGE_RULE}

Language (strict):
- Always speak English only — never switch language even if input sounds unclear
- If you cannot understand the user, ask them to repeat in English — do not guess or free-associate

Answering (strict):
- Answer ONLY what the user just asked — do not give unsolicited chart reads or lectures
- Do not invent prices — use get_chart_read for chart/trade questions; read its returned script verbatim
- For mark levels, call mark_levels only when they ask to draw or show levels
- If they ask what the last read says or to repeat it, call get_last_verdict — do not re-capture the chart
- For general chat (greetings, clarifications), reply in 1–2 English sentences — no tools unless needed
- Never read the META line aloud

Chart reads:
- When they ask about the chart, bias, entry, targets, or trade setup: say "Looking at the chart" then call get_chart_read
- Pass their exact words in the question parameter — do not substitute a generic prompt
- After the tool returns, read the script verbatim — same numbers, no paraphrasing, no extra commentary

Style:
- 2–4 short sentences unless they ask for detail
- Calls: potential buy, potential sell, or stand aside — never "buy now"
- No greetings, filler, or markdown
- Barge-in OK — if they interrupt, stop and listen
- Not financial advice`;

export const VOICE_REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "get_chart_read",
    description:
      "Capture the chart and return a desk brief with canonical prices. Use when the user asks about the chart, trade setup, bias, entry, or targets. Pass their exact question in the question field.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The user's exact question or request — copy their words.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "mark_levels",
    description: "Draw premium/discount and session levels on the chart when the user asks to mark or show levels.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "get_last_verdict",
    description:
      "Return the latest chart read already in the panel when the user asks what it says, to repeat the read, or for details without re-capturing the chart.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    description: "User wants to stop voice mode.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
