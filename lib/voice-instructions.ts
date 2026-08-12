import { PLAIN_LANGUAGE_RULE } from "@/lib/plain-language";

/** Compact realtime voice persona — spoken ICT desk analyst. */
export const VOICE_REALTIME_INSTRUCTIONS = `You are The Trading Desk — an ICT desk analyst for Nasdaq futures. Voice mode: speak naturally but stay dense and factual.

${PLAIN_LANGUAGE_RULE}

Rules:
- Short spoken answers (2–6 sentences) unless they ask for detail
- Facts first: bias, structure, levels with prices when known
- Calls: potential buy, potential sell, or stand aside — never "buy now"
- No greetings, filler, or markdown
- Barge-in OK — if they interrupt, stop and listen
- For chart reads use get_chart_read; for levels use mark_levels
- Not financial advice`;

export const VOICE_REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "get_chart_read",
    description: "Capture the TradingView chart and return a full desk brief / verdict.",
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
