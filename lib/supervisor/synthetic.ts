import type { SyntheticTranscriptFixture } from "./types";

function line(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

export const SYNTHETIC_COMPLETE: SyntheticTranscriptFixture = {
  name: "complete",
  lines: [
    line({
      role: "user",
      message: {
        content: [{ type: "text", text: "<user_query>\nRun baseline backtest\n</user_query>" }],
      },
    }),
    line({
      role: "assistant",
      message: {
        content: [
          {
            type: "text",
            text: "## Report\n\nBaseline complete. 42 trades, win rate 58%.",
          },
        ],
      },
    }),
    line({ type: "turn_ended", status: "success" }),
  ],
};

export const SYNTHETIC_ERROR: SyntheticTranscriptFixture = {
  name: "error",
  lines: [
    line({
      role: "user",
      message: {
        content: [{ type: "text", text: "<user_query>\nDeploy to production\n</user_query>" }],
      },
    }),
    line({
      role: "assistant",
      message: {
        content: [{ type: "text", text: "Build failed — type errors in route.ts" }],
      },
    }),
    line({
      type: "turn_ended",
      status: "error",
      error: "Build failed with exit code 1",
    }),
  ],
};

export const SYNTHETIC_WAITING: SyntheticTranscriptFixture = {
  name: "waiting",
  lines: [
    line({
      role: "user",
      message: {
        content: [{ type: "text", text: "<user_query>\nInvestigate replay mismatch\n</user_query>" }],
      },
    }),
    line({
      role: "assistant",
      message: {
        content: [
          { type: "text", text: "Reading karen.ts and replay tests." },
          { type: "tool_use", name: "Read", input: { path: "lib/research/replay/karen.ts" } },
        ],
      },
    }),
  ],
};

export const SYNTHETIC_UNKNOWN: SyntheticTranscriptFixture = {
  name: "unknown",
  lines: ["not valid json {{{", "{}"],
};

export const SYNTHETIC_EMPTY: SyntheticTranscriptFixture = {
  name: "empty",
  lines: ["", "  ", ""],
};

export const SYNTHETIC_MALFORMED_REPORT: SyntheticTranscriptFixture = {
  name: "malformed-report",
  lines: [
    line({
      role: "user",
      message: { content: [{ type: "text", text: "<user_query>\nEmpty task\n</user_query>" }] },
    }),
    line({
      role: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Shell", input: { command: "npm test" } }],
      },
    }),
    line({ type: "turn_ended", status: "success" }),
  ],
};

export const ALL_SYNTHETIC_FIXTURES: SyntheticTranscriptFixture[] = [
  SYNTHETIC_COMPLETE,
  SYNTHETIC_ERROR,
  SYNTHETIC_WAITING,
  SYNTHETIC_UNKNOWN,
  SYNTHETIC_EMPTY,
  SYNTHETIC_MALFORMED_REPORT,
];

export function syntheticFixtureByName(name: string): SyntheticTranscriptFixture | undefined {
  return ALL_SYNTHETIC_FIXTURES.find((f) => f.name === name);
}
