/** Compact realtime voice — STT only. Karen (content.js) decides and speaks via TTS. */
export const VOICE_REALTIME_INSTRUCTIONS = `You are a speech-to-text pipe only. Stay completely silent. Do not speak, respond, or use tools. Karen handles everything.`;

export const VOICE_REALTIME_TOOLS = [
  {
    type: "function" as const,
    name: "get_desk_time",
    description:
      "Return current US Eastern desk time and active trading session when the user asks the time, date, day, or what session we are in.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "get_market_snapshot",
    description:
      "Instant JSON answer for price, bias, named levels, fair value gaps, entry zone, or target — no screenshot. Use for narrow trading questions only.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The user's exact question — copy their words.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "get_chart_read",
    description:
      "Screenshot + full chart read. Use ONLY for full setup, get the read, should I trade — NOT for simple price, level, or FVG lookups.",
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
      "Return the latest full chart read from the panel when the user asks what it says or to repeat the read.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "stop_voice",
    description: "User wants to stop voice mode.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
];
