import type { SupervisorStatus } from "./types";

export interface ParsedTranscriptLine {
  raw: string;
  kind: "message" | "turn_ended" | "malformed" | "empty";
  role?: string;
  textParts: string[];
  hasToolUse: boolean;
  turnStatus?: string;
  turnError?: string;
}

export function parseTranscriptLine(raw: string): ParsedTranscriptLine {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, kind: "empty", textParts: [], hasToolUse: false };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw, kind: "malformed", textParts: [], hasToolUse: false };
  }

  if (parsed.type === "turn_ended") {
    return {
      raw,
      kind: "turn_ended",
      textParts: [],
      hasToolUse: false,
      turnStatus: typeof parsed.status === "string" ? parsed.status : undefined,
      turnError: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  }

  const role = typeof parsed.role === "string" ? parsed.role : undefined;
  const message = parsed.message as { content?: unknown[] } | undefined;
  const content = Array.isArray(message?.content) ? message.content : [];
  const textParts: string[] = [];
  let hasToolUse = false;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; text?: string };
    if (b.type === "text" && typeof b.text === "string") {
      textParts.push(b.text);
    }
    if (b.type === "tool_use") {
      hasToolUse = true;
    }
  }

  return {
    raw,
    kind: "message",
    role,
    textParts,
    hasToolUse,
  };
}

export function extractUserTask(textParts: string[]): string {
  for (const text of textParts) {
    const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
    if (match?.[1]) return match[1].trim();
  }
  return textParts.join("\n").trim();
}

export function extractReportText(textParts: string[]): string {
  const joined = textParts
    .map((t) => t.replace(/\[REDACTED\]/g, "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return joined;
}

export function mapTurnStatus(turnStatus?: string, turnError?: string): SupervisorStatus {
  if (turnStatus === "success") return "COMPLETE";
  if (turnStatus === "error") return "ERROR";
  if (turnError) return "ERROR";
  if (turnStatus === "cancelled" || turnStatus === "canceled") return "ERROR";
  return "UNKNOWN";
}

export function classifyInProgress(lastMessage: ParsedTranscriptLine | undefined): SupervisorStatus {
  if (!lastMessage || lastMessage.kind !== "message") return "UNKNOWN";
  if (lastMessage.role === "assistant" && lastMessage.hasToolUse) return "WAITING";
  if (lastMessage.role === "assistant") return "WAITING";
  if (lastMessage.role === "user") return "WAITING";
  return "UNKNOWN";
}
