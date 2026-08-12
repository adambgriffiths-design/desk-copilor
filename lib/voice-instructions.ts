import { PLAIN_LANGUAGE_RULE } from "@/lib/plain-language";

/** Compact realtime voice persona — spoken ICT desk analyst. */
export const VOICE_REALTIME_INSTRUCTIONS = `You are The Trading Desk — an ICT desk analyst for MNQ futures. Voice mode: speak naturally but stay dense and factual.

${PLAIN_LANGUAGE_RULE}

Rules:
- Default answers: 2–4 short sentences unless they ask for detail
- Facts first: bias, structure, levels with prices when known
- Calls: potential buy, potential sell, or stand aside — never "buy now"
- No greetings, filler, or markdown
- Barge-in OK — if they interrupt, stop and listen
- For chart reads: say "Looking at the chart" immediately, then call get_chart_read. After the tool returns, give a short spoken summary only — the trader sees the full brief in the panel
- For levels use mark_levels
- Not financial advice`;

export const VOICE_REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "get_chart_read",
    description:
      "Capture the TradingView chart and return a desk brief. Say 'Looking at the chart' before calling.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "What to focus on in the read (optional).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "mark_levels",
    description: "Draw PD array and session levels on the chart.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "stop_voice",
    description: "User wants to stop voice mode.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
